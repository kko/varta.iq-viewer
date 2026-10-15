import { mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { passwordHash } from './auth.mjs';
import { atomicJson } from './state.mjs';

const directory = process.env.CONFIG_DIR || './collector-config';
await mkdir(directory, { recursive: true, mode: 0o700 });
const exists = async name => { try { await access(join(directory, name)); return true; } catch { return false; } };
if (!(await exists('admin.json'))) {
  const password = randomBytes(24).toString('base64url');
  await atomicJson(join(directory, 'admin.json'), passwordHash(password));
  // Only the explicit setup command prints the initial administrator password.
  console.log(`Administratorpasswort (jetzt sicher aufbewahren): ${password}`);
} else console.log('Administratorpasswort bereits eingerichtet.');
if (!(await exists('tls.key')) || !(await exists('tls.crt'))) {
  const hosts = (process.env.COLLECTOR_TLS_HOSTS || 'localhost,127.0.0.1').split(',').map(s => s.trim());
  if (hosts.some(h => !/^[a-zA-Z0-9._-]+$/.test(h))) throw new Error('Ungültiger TLS-Hostname.');
  const alt = hosts.map(h => `${/^\d+\.\d+\.\d+\.\d+$/.test(h) ? 'IP' : 'DNS'}:${h}`).join(',');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825', '-keyout', join(directory, 'tls.key'), '-out', join(directory, 'tls.crt'), '-subj', '/CN=VARTA Collector', '-addext', `subjectAltName=${alt}`], { stdio: 'pipe' });
  const { chmod } = await import('node:fs/promises');
  await chmod(join(directory, 'tls.key'), 0o600);
  console.log('Lokales HTTPS-Zertifikat erstellt. Zertifikat auf zugreifenden Geräten vertrauen.');
}
