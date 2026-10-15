import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Spool, ErrorLog } from '../collector/state.mjs';
import { Collector, sendAzure } from '../collector/engine.mjs';
import { validateConfig, publicConfig } from '../collector/config.mjs';
import { Sessions, passwordHash } from '../collector/auth.mjs';
import { DAY } from '../shared/model.mjs';
import { packet } from './helpers.mjs';
test('durable spool survives restart, prefers current data and expires after 30 days', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'varta-spool-'));
  try {
    const spool = new Spool(dir); await spool.init(); const now = Date.now();
    await spool.add(packet(now - 31 * DAY)); const first = packet(now - DAY), latest = packet(now); await spool.add(first); await spool.add(latest);
    const reloaded = new Spool(dir); await reloaded.init(); assert.equal(reloaded.status().count, 2); assert.equal(reloaded.status().dropped, 1);
    const names = reloaded.batch(); assert.equal((await reloaded.get(names[0])).id, latest.id); await reloaded.ack([names[0]]);
    const again = new Spool(dir); await again.init(); assert.equal(again.status().count, 1); assert.equal(again.dropped, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('error ring persists the last ten messages and redacts secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'varta-errors-'));
  try {
    const errors = new ErrorLog(join(dir, 'errors.json'), () => ['secret']); await errors.init();
    await Promise.all(Array.from({ length: 12 }, (_, i) => errors.add('azure', `${i}: secret https://example.test/?secret`)));
    const reloaded = new ErrorLog(errors.file); await reloaded.init(); assert.equal(reloaded.items.length, 10); assert.ok(reloaded.items[0].message.startsWith('11:')); assert.ok(!JSON.stringify(reloaded.items).includes('secret'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('partial gateway failure preserves measurements; upload retries reuse IDs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'varta-engine-'));
  try {
    const spool = new Spool(join(dir, 'spool')); await spool.init(); const errors = new ErrorLog(join(dir, 'errors.json')); await errors.init(); let offline = true; const delivered = [];
    const engine = new Collector({ config: { gatewayIp: '127.0.0.1', collectorId: 'varta-home', enabled: true }, spool, errors,
      gatewayFetch: async url => url.endsWith('devices') ? { ok: false, status: 401 } : { ok: true, status: 200, json: async () => packet().point.data },
      upload: async (_, packets) => { delivered.push(packets.map(p => p.id)); if (offline) throw new Error('Timeout'); return { accepted: packets.map(p => p.id) }; } });
    await engine.poll(); assert.equal(spool.status().count, 1); assert.match(errors.items.at(-1).message, /401/);
    const id = (await spool.get(spool.batch()[0])).id; offline = false; engine.retryAt = 0; await engine.flush();
    assert.equal(delivered[1][0], id); assert.equal(spool.status().count, 0); assert.ok(engine.status.upload.lastCurrentSuccessAt); assert.ok(engine.snapshot(Date.now() + 31000).upload.stale);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Azure transport forbids redirects and requires a storage confirmation', async () => {
  const result = await sendAzure({ uploadUrl: 'https://test.azurestaticapps.net/api/ingest', uploadKey: 'private' }, [packet()], false, async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.headers['X-Upload-Key'], 'private'); assert.ok(options.signal); return { ok: true, json: async () => ({ accepted: ['confirmed'] }) };
  });
  assert.deepEqual(result.accepted, ['confirmed']); await assert.rejects(sendAzure({}, [], false, async () => ({ ok: false, status: 503 })), /503/);
});
test('target changes clear unrelated secrets; public config exposes flags only', () => {
  const original = validateConfig({ gatewayIp: '192.168.1.2', gatewayApiKey: 'varta-key', collectorId: 'varta-home', uploadUrl: 'https://test.azurestaticapps.net/api/ingest', uploadKey: 'azure-key', enabled: true });
  assert.equal(validateConfig({}, original).gatewayApiKey, 'varta-key'); assert.equal(validateConfig({ gatewayIp: '192.168.1.3' }, original).gatewayApiKey, '');
  assert.equal(validateConfig({ uploadUrl: 'https://other.test/api/ingest', enabled: false }, original).uploadKey, ''); assert.ok(!JSON.stringify(publicConfig(original)).includes('azure-key'));
  assert.throws(() => validateConfig({ uploadUrl: 'http://example.test/api/ingest' }, original)); assert.throws(() => validateConfig({ uploadUrl: 'https://example.test/api/ingest?key=bad' }, original));
});
test('hashed passwords, expiring sessions and per-address login throttling', () => {
  const auth = new Sessions(passwordHash('long-private-password'));
  for (let i = 0; i < 5; i++) assert.equal(auth.login('bad-client', 'wrong', 0).status, 401);
  assert.equal(auth.login('bad-client', 'long-private-password', 1).status, 429);
  const result = auth.login('good-client', 'long-private-password', 1); assert.equal(result.status, 200); assert.equal(auth.get(`__Host-varta=${result.token}`, 2).csrf, result.csrf);
  assert.equal(auth.get(`__Host-varta=${result.token}`, 9 * 3600000), null); assert.equal(auth.login('bad-client', 'long-private-password', 900001).status, 200);
});
