import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, copyFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchGateway } from './gateway-https.mjs';

async function openssl() {
  if (process.env.OPENSSL_BIN) return process.env.OPENSSL_BIN;
  if (process.platform === 'win32') { const candidate = 'C:/Program Files/Git/usr/bin/openssl.exe'; try { await access(candidate); return candidate; } catch {} }
  return 'openssl';
}
async function certificate(directory, name) {
  execFileSync(await openssl(), ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', join(directory, `${name}.key`), '-out', join(directory, `${name}.crt`), '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'pipe' });
}
test('gateway HTTPS pins the certificate and forwards the API key; changed certificates fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'varta-tls-')); let server;
  try {
    await certificate(dir, 'gateway'); await certificate(dir, 'different');
    await copyFile(join(dir, 'gateway.crt'), join(dir, 'gateway-127.0.0.1.pem'));
    server = https.createServer({ key: await readFile(join(dir, 'gateway.key')), cert: await readFile(join(dir, 'gateway.crt')) }, (req, res) => { res.writeHead(req.headers['x-api-key'] === 'local-secret' ? 200 : 401, { 'Content-Type': 'application/json' }); res.end('{}'); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `https://127.0.0.1:${server.address().port}/v2/point`, certificates = pathToFileURL(dir + sep);
    assert.equal((await fetchGateway(base, certificates, 'local-secret')).status, 200);
    assert.equal((await fetchGateway(base, certificates, 'wrong')).status, 401);
    await copyFile(join(dir, 'different.crt'), join(dir, 'gateway-127.0.0.1.pem'));
    await assert.rejects(fetchGateway(base, certificates, 'local-secret'));
    await assert.rejects(fetchGateway(base.replace('https:', 'http:'), certificates), /HTTPS/);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

