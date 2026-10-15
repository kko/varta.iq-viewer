import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('container networking, settings protection and persistent directories', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'varta-server-'));
  const config = join(root, 'config');
  await mkdir(config);
  await writeFile(join(config, 'config.json'), JSON.stringify({ gatewayIp: '127.0.0.1' }));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  let child;
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  };
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: new URL('.', import.meta.url),
      env: { ...process.env, HOST: '0.0.0.0', PORT: String(port), CONFIG_DIR: config,
        DATA_DIR: join(root, 'records'), ALLOWED_HOSTS: `varta.test:${port}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited ${code}: ${errors}`)));
      child.stdout.on('data', chunk => { if (chunk.toString().includes('VARTA lokal:')) resolve(); });
    });
  };
  const base = `http://127.0.0.1:${port}`;
  const update = (host, origin, ip = '127.0.0.2', apiKey) => new Promise((resolve, reject) => {
    const req = request(`${base}/api/settings`, {
      method: 'PUT', headers: { Host: host, Origin: origin, 'Content-Type': 'application/json' },
    }, res => {
      res.resume();
      res.once('end', () => resolve({ status: res.statusCode }));
    });
    req.once('error', reject);
    req.end(JSON.stringify({ gatewayIp: ip, ...(apiKey === undefined ? {} : { gatewayApiKey: apiKey }) }));
  });
  try {
    await start();
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(`${base}/api/history?hours=1`)).status, 200);
    assert.equal((await update(`evil.test:${port}`, `http://evil.test:${port}`)).status, 403);
    assert.equal((await update(`varta.test:${port}`, 'http://evil.test')).status, 403);
    assert.equal((await update(`varta.test:${port}`, `http://varta.test:${port}`, 'invalid')).status, 400);
    assert.equal((await update(`varta.test:${port}`, `http://varta.test:${port}`)).status, 200);
    assert.equal(JSON.parse(await readFile(join(config, 'config.json'), 'utf8')).gatewayIp, '127.0.0.2');
    const localHost = `varta.test:${port}`;
    const localOrigin = `http://${localHost}`;
    assert.equal((await update(localHost, localOrigin, '127.0.0.2', 'test-local-key')).status, 200);
    const publicSettings = await (await fetch(`${base}/api/settings`)).json();
    assert.equal(publicSettings.hasApiKey, true);
    assert.equal('gatewayApiKey' in publicSettings, false);
    assert.equal((await update(localHost, localOrigin)).status, 200);
    assert.equal(JSON.parse(await readFile(join(config, 'config.json'), 'utf8')).gatewayApiKey, 'test-local-key');
    assert.equal((await update(localHost, localOrigin, '127.0.0.2', 'invalid\nheader')).status, 400);
    await stop();
    await start();
    assert.equal((await (await fetch(`${base}/api/settings`)).json()).gatewayIp, '127.0.0.2');
    assert.equal((await (await fetch(`${base}/api/settings`)).json()).hasApiKey, true);
    assert.equal((await update(localHost, localOrigin, '127.0.0.2', '')).status, 200);
    assert.equal((await (await fetch(`${base}/api/settings`)).json()).hasApiKey, false);
  } finally {
    await stop();
    await rm(root, { recursive: true, force: true });
  }
});
