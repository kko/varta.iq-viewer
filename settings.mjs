import { readFile, writeFile, rename } from 'node:fs/promises';
import { isIP } from 'node:net';

export function validateIp(value) {
  if (typeof value !== 'string' || isIP(value.trim()) !== 4) {
    throw new Error('Bitte eine gültige IPv4-Adresse eingeben, z. B. 192.168.4.119.');
  }
  return value.trim();
}

export async function loadSettings(file) {
  try {
    const settings = JSON.parse(await readFile(file, 'utf8'));
    return { gatewayIp: validateIp(settings.gatewayIp) };
  } catch (error) {
    if (error.code === 'ENOENT') return { gatewayIp: '192.168.4.119' };
    throw error;
  }
}

export async function saveSettings(file, ip) {
  const settings = { gatewayIp: validateIp(ip) };
  const temporary = new URL(file.href + '.tmp');
  await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  await rename(temporary, file);
  return settings;
}
