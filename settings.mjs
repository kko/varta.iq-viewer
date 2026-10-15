import { readFile, writeFile, rename } from 'node:fs/promises';
import { isIP } from 'node:net';

export function validateIp(value) {
  if (typeof value !== 'string' || isIP(value.trim()) !== 4) {
    throw new Error('Bitte eine gültige IPv4-Adresse eingeben, z. B. 192.168.4.119.');
  }
  return value.trim();
}

export function validateApiKey(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > 512 || /[^\x21-\x7e]/.test(value.trim())) {
    throw new Error('API-Key muss aus maximal 512 sichtbaren ASCII-Zeichen bestehen.');
  }
  return value.trim();
}

export async function loadSettings(file) {
  try {
    const settings = JSON.parse(await readFile(file, 'utf8'));
    return { gatewayIp: validateIp(settings.gatewayIp), gatewayApiKey: validateApiKey(settings.gatewayApiKey) };
  } catch (error) {
    if (error.code === 'ENOENT') return { gatewayIp: '192.168.4.119', gatewayApiKey: '' };
    throw error;
  }
}

export async function saveSettings(file, ip, apiKey = '') {
  const settings = { gatewayIp: validateIp(ip), gatewayApiKey: validateApiKey(apiKey) };
  const temporary = new URL(file.href + '.tmp');
  await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file);
  return settings;
}
