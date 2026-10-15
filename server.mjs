import http from 'node:http';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { readHistory } from './history.mjs';
import { loadSettings, saveSettings, validateIp } from './settings.mjs';

const configDir = process.env.CONFIG_DIR
  ? pathToFileURL(resolve(process.env.CONFIG_DIR) + sep)
  : new URL('./', import.meta.url);
await mkdir(configDir, { recursive: true });
const settingsFile = new URL('config.json', configDir);
let settings = await loadSettings(settingsFile);
let gateway = `http://${settings.gatewayIp}`;
let updatingSettings = false;
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const allowedHosts = new Set([
  `127.0.0.1:${port}`, `localhost:${port}`,
  ...(process.env.ALLOWED_HOSTS || '').split(',').map(value => value.trim()).filter(Boolean),
]);
const dataDir = process.env.DATA_DIR
  ? pathToFileURL(resolve(process.env.DATA_DIR) + sep)
  : new URL('./data/', import.meta.url);
await mkdir(dataDir, { recursive: true });
let recording = { intervalSeconds: 10, lastSavedAt: null, lastMeasurementAt: null, error: null, directory: 'data/' };
let lastPointTime;
let lastDevices;
let recordingBusy = false;
const latest = new Map();
const pollErrors = new Map();

async function record() {
  if (recordingBusy || updatingSettings) return;
  recordingBusy = true;
  try {
    // Save independently so a device-list failure cannot interrupt measurement recording.
    const results = await Promise.allSettled(['point', 'devices'].map(async name => {
      try {
      const response = await fetch(`${gateway}/v2/${name}`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const data = await response.json();
      if (name === 'point' && (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isFinite(Date.parse(data.t)))) throw new Error('point: Ungültiges Messdatenformat');
      if (name === 'devices' && !Array.isArray(data)) throw new Error('devices: Ungültiges Geräteformat');
      latest.set(name, { url: `${gateway}/v2/${name}`, status: response.status, receivedAt: new Date().toISOString(), data });
      pollErrors.delete(name);
      const serialized = JSON.stringify(data);
      if (name === 'point' ? data.t === lastPointTime : serialized === lastDevices) return;
      const receivedAt = new Date().toISOString();
      const file = `${name}-${receivedAt.slice(0, 10)}.jsonl`;
      await appendFile(new URL(file, dataDir), JSON.stringify({ receivedAt, url: `${gateway}/v2/${name}`, data }) + '\n', 'utf8');
      if (name === 'point') {
        lastPointTime = data.t;
        recording.lastSavedAt = receivedAt;
        recording.lastMeasurementAt = data.t;
      } else lastDevices = serialized;
      } catch (error) { pollErrors.set(name, error.message); throw error; }
    }));
    const failures = results.filter(result => result.status === 'rejected');
    recording.error = failures.length ? failures.map(result => result.reason.message).join('; ') : null;
  } catch (error) { recording.error = error.message; }
  finally { recordingBusy = false; }
}
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/history.js', ['history.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

const server = http.createServer(async (req, res) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const requestUrl = new URL(req.url, 'http://localhost');
  const path = requestUrl.pathname;
  if (path === '/api/settings' && req.method === 'PUT') {
    const json = (status, data) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    if (!allowedHosts.has(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) return json(403, { error: 'Nur Zugriffe von dieser lokalen Website sind erlaubt.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON erwartet.' });
    if (updatingSettings) return json(409, { error: 'Einstellungen werden gerade gespeichert. Bitte erneut versuchen.' });
    updatingSettings = true;
    let phase = 'input';
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024) { json(413, { error: 'Anfrage zu groß.' }); return; }
      }
      const ip = validateIp(JSON.parse(body).gatewayIp);
      // Finish in-flight writes before replacing the gateway and its live cache.
      while (recordingBusy) await new Promise(resolve => setTimeout(resolve, 25));
      phase = 'save';
      settings = await saveSettings(settingsFile, ip);
      gateway = `http://${settings.gatewayIp}`;
      latest.clear(); pollErrors.clear();
      lastPointTime = undefined; lastDevices = undefined;
      recording.lastSavedAt = null; recording.lastMeasurementAt = null; recording.error = null;
      json(200, settings);
    } catch (error) {
      json(phase === 'input' ? 400 : 500, { error: phase === 'input' ? (error instanceof SyntaxError ? 'Ungültiges JSON.' : error.message) : 'Einstellung konnte nicht gespeichert werden. Die bisherige Adresse bleibt aktiv.' });
    } finally { updatingSettings = false; record(); }
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { ...headers, Allow: 'GET' });
    return res.end('Nur GET erlaubt.');
  }
  if (path === '/api/settings') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(settings));
  }
  if (path === '/api/history') {
    const hours = Number(requestUrl.searchParams.get('hours') || 24);
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      res.writeHead(400, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'hours muss zwischen 1 und 168 liegen.' }));
    }
    try {
      const history = await readHistory(dataDir, hours);
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(history));
    } catch (error) {
      res.writeHead(500, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Verlauf konnte nicht gelesen werden.', detail: error.message }));
    }
  }
  if (path === '/api/recording') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(recording));
  }
  if (path === '/api/point' || path === '/api/devices') {
    const name = path.split('/').pop();
    const cached = latest.get(name);
    const error = pollErrors.get(name) || (!cached ? 'Der erste Gateway-Abruf läuft noch.' : null);
    res.writeHead(error ? 503 : 200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ...cached, ...(error ? { error } : {}) }));
  }
  const file = files.get(path);
  if (!file) { res.writeHead(404, headers); return res.end('Nicht gefunden.'); }
  try {
    const content = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
    res.writeHead(200, { ...headers, 'Content-Type': file[1] });
    res.end(content);
  } catch {
    res.writeHead(500, headers); res.end('Datei konnte nicht geladen werden.');
  }
});
server.listen(port, host, () => {
  console.log(`VARTA lokal: http://${host}:${port}`);
  console.log(`Datenquelle: ${gateway} (nur lesende GET-Aufrufe)`);
  console.log('Aufzeichnung: alle 10 Sekunden nach data/ (JSONL, Dateinamen nach UTC-Datum)');
  record();
  setInterval(record, 10000);
});
