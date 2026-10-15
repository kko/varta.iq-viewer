import { validateIp, validateApiKey } from '../settings.mjs';
import { atomicJson, readJson } from './state.mjs';

export function azureUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/ingest') throw new Error('HTTPS-Adresse mit Pfad /api/ingest erforderlich.');
  return url.href;
}
export function validateConfig(input, previous = {}) {
  const gatewayIp = validateIp(input.gatewayIp ?? previous.gatewayIp ?? '192.168.4.119');
  const uploadUrl = azureUrl(input.uploadUrl ?? previous.uploadUrl ?? '');
  const collectorId = input.collectorId ?? previous.collectorId ?? 'varta-home';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(collectorId)) throw new Error('Collector-ID: 1–64 Buchstaben, Ziffern, _ oder -.');
  const secret = (key, sameTarget) => input[key] === undefined ? (sameTarget ? previous[key] || '' : '') : validateApiKey(input[key]);
  const gatewayApiKey = secret('gatewayApiKey', gatewayIp === previous.gatewayIp);
  const uploadKey = secret('uploadKey', uploadUrl === previous.uploadUrl && collectorId === previous.collectorId);
  const enabled = input.enabled ?? previous.enabled ?? false;
  if (typeof enabled !== 'boolean') throw new Error('Upload-Schalter ungültig.');
  if (enabled && (!uploadUrl || !uploadKey)) throw new Error('Upload-Adresse und Schlüssel erforderlich.');
  return { gatewayIp, gatewayApiKey, uploadUrl, uploadKey, collectorId, enabled };
}
export const publicConfig = config => ({ gatewayIp: config.gatewayIp, uploadUrl: config.uploadUrl, collectorId: config.collectorId, enabled: config.enabled, hasGatewayApiKey: Boolean(config.gatewayApiKey), hasUploadKey: Boolean(config.uploadKey) });
export async function loadConfig(file) { return validateConfig(await readJson(file, {})); }
export async function saveConfig(file, input, previous) { const next = validateConfig(input, previous); await atomicJson(file, next); return next; }
