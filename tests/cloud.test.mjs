import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudService, keyMatches, viewer } from '../cloud/api/src/service.mjs';
import { validatePacket, oldestDay, DAY, tableName, dayOf } from '../shared/model.mjs';
import { MemoryStore, packet } from './helpers.mjs';
test('only viewer roles and matching nonempty upload secrets pass', () => {
  const principal = userRoles => Buffer.from(JSON.stringify({ userRoles })).toString('base64');
  assert.equal(viewer(principal(['authenticated'])), false); assert.equal(viewer(principal(['viewer'])), true); assert.equal(viewer('bad'), false);
  assert.equal(keyMatches('key', 'key'), true); assert.equal(keyMatches('wrong', 'key'), false); assert.equal(keyMatches('', ''), false);
});
test('duplicate packets and concurrent arrivals count measurements exactly once', async () => {
  const store = new MemoryStore(), service = new CloudService(store, 'varta-home'), now = Date.now();
  const packets = Array.from({ length: 8 }, (_, i) => packet(now - 100000 + i * 10000));
  await Promise.all(packets.map(p => service.ingest(p, now)));
  await service.ingest(packets[0], now); await service.ingest(packet(now, { point: packets[0].point }), now);
  const history = await service.history(new URLSearchParams({ hours: '1' }), now + 1);
  assert.equal(history.sampleCount, 8); assert.equal(history.points.length, 8); assert.ok(history.points.every(p => p.values.pW === 200));
  assert.equal((await service.latest('point')).data.t, packets.at(-1).point.data.t);
  assert.equal([...store.rows.values()].filter(r => r.rowKey.startsWith('a300:')).reduce((sum, r) => sum + JSON.parse(r.payload).sampleCount, 0), 8);
});
test('failed transactions are not acknowledged; replays complete storage', async () => {
  const store = new MemoryStore(), service = new CloudService(store, 'varta-home'), p = packet();
  store.failNext = true; await assert.rejects(service.ingest(p), /unavailable/); assert.equal(store.rows.size, 0); assert.equal(await service.ingest(p), p.id);
});
test('late packets cannot replace fresh status; gaps have no synthetic zeroes', async () => {
  const store = new MemoryStore(), service = new CloudService(store, 'varta-home'), now = Date.now();
  await service.ingest(packet(now)); await service.ingest(packet(now - 3600000));
  assert.equal((await service.status(now)).stale, false); assert.equal((await service.status(now + 31000)).stale, true);
  const history = await service.history(new URLSearchParams({ hours: '6' }), now + 1);
  assert.equal(history.sampleCount, 2); assert.equal(history.points.length, 2);
});
test('year uses daily aggregates; custom boundaries exclude surrounding samples', async () => {
  const store = new MemoryStore(), service = new CloudService(store, 'varta-home'), now = Date.now(), day = Math.floor((now - 10 * DAY) / DAY) * DAY;
  for (const seconds of [1, 10, 20, 30]) await service.ingest(packet(day + seconds * 1000), now);
  const history = await service.history(new URLSearchParams({ from: new Date(day + 15000).toISOString(), to: new Date(now).toISOString() }), now);
  assert.equal(history.sampleCount, 2); store.queries = [];
  const year = await service.history(new URLSearchParams({ from: oldestDay(now), to: new Date(now).toISOString() }), now);
  assert.equal(year.intervalSeconds, 86400); assert.equal(year.sampleCount, 4); assert.ok(store.queries.some(q => q.from.startsWith('a86400:')));
  assert.ok(store.queries.filter(q => q.from.startsWith('m:')).every(q => q.table === tableName(dayOf(now))));
});
test('retention rejects expired, future and malformed packets', () => {
  const now = Date.now();
  assert.throws(() => validatePacket(packet(now - 366 * DAY), 'varta-home', now), /Aufbewahrungszeit/);
  assert.throws(() => validatePacket(packet(now + 120000), 'varta-home', now), /Aufbewahrungszeit/);
  assert.throws(() => validatePacket(packet(now), 'different', now), /Ungültiges/);
  const p = packet(now); p.point.data.devices = [null]; assert.throws(() => validatePacket(p, 'varta-home', now));
  assert.throws(() => validatePacket(packet(now, { version: 2 }), 'varta-home', now));
});
