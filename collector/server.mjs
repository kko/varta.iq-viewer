import https from 'node:https';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Spool, ErrorLog, readJson } from './state.mjs';
import { loadConfig, saveConfig, publicConfig } from './config.mjs';
import { Sessions } from './auth.mjs';
import { Collector, sendAzure } from './engine.mjs';

const directory = resolve(process.env.CONFIG_DIR || './collector-config');
const data = resolve(process.env.DATA_DIR || './collector-data');
await mkdir(directory, { recursive: true }); await mkdir(data, { recursive: true });
const configFile = join(directory, 'settings.json');
const config = await loadConfig(configFile);
const password = await readJson(join(directory, 'admin.json'));
if (!password) throw new Error('Zuerst den Collector-Einrichtungsbefehl ausführen.');
const sessions = new Sessions(password);
const spool = new Spool(join(data, 'spool')); await spool.init();
const errors = new ErrorLog(join(data, 'errors.json'), () => [engine.config.gatewayApiKey, engine.config.uploadKey]); await errors.init();
const certificates = pathToFileURL(resolve(process.env.GATEWAY_CERT_DIR || './certificates') + sep);
const engine = new Collector({ config, spool, errors, certificates });
const port = Number(process.env.PORT || 8788);
const allowed = new Set([`localhost:${port}`, `127.0.0.1:${port}`, ...(process.env.ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);
const assets = new Map([['/', ['collector/public/index.html', 'text/html']], ['/app.js', ['collector/public/app.js', 'text/javascript']], ['/style.css', ['public/style.css', 'text/css']]]);
async function body(req) {
  let value = '';
  for await (const chunk of req) { value += chunk; if (value.length > 8192) throw Object.assign(new Error('Anfrage zu groß.'), { status: 413 }); }
  try { return JSON.parse(value); } catch { throw Object.assign(new Error('Ungültiges JSON.'), { status: 400 }); }
}
let testing = false, saving = false;
const server = https.createServer({ key: await readFile(join(directory, 'tls.key')), cert: await readFile(join(directory, 'tls.crt')), minVersion: 'TLSv1.2' }, async (req, res) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Referrer-Policy': 'no-referrer' };
  const json = (status, result, extra = {}) => { res.writeHead(status, { ...headers, ...extra, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(result)); };
  try {
    if (!allowed.has(req.headers.host)) return json(403, { error: 'Host nicht freigegeben.' });
    const path = new URL(req.url, 'https://localhost').pathname;
    if (req.method === 'GET' && path === '/healthz') return json(200, { ok: true });
    if (!['GET', 'POST', 'PUT'].includes(req.method)) return json(405, { error: 'Methode nicht erlaubt.' });
    if (req.method !== 'GET') {
      if (req.headers.origin !== `https://${req.headers.host}`) return json(403, { error: 'Ungültiger Ursprung.' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON erforderlich.' });
    }
    if (req.method === 'POST' && path === '/api/login') {
      const result = sessions.login(req.socket.remoteAddress, (await body(req)).password);
      return json(result.status, result.status === 200 ? { csrf: result.csrf } : { error: result.status === 429 ? 'Zu viele Versuche. In 15 Minuten erneut versuchen.' : 'Anmeldung fehlgeschlagen.' }, result.token ? { 'Set-Cookie': `__Host-varta=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` } : {});
    }
    if (path.startsWith('/api/')) {
      const session = sessions.get(req.headers.cookie);
      if (!session) return json(401, { error: 'Anmeldung erforderlich.' });
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) return json(403, { error: 'Sitzung ungültig.' });
      if (req.method === 'GET' && path === '/api/session') return json(200, { csrf: session.csrf });
      if (req.method === 'POST' && path === '/api/logout') { sessions.sessions.delete(session.token); return json(200, { ok: true }, { 'Set-Cookie': '__Host-varta=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0' }); }
      if (req.method === 'GET' && path === '/api/settings') return json(200, publicConfig(engine.config));
      if (req.method === 'GET' && path === '/api/status') return json(200, engine.snapshot());
      if (req.method === 'PUT' && path === '/api/settings') {
        if (saving || testing) return json(409, { error: 'Einstellungen oder Verbindungstest laufen bereits.' });
        const input = await body(req);
        if (spool.entries.size && ((input.collectorId !== undefined && input.collectorId !== engine.config.collectorId) || (input.uploadUrl !== undefined && input.uploadUrl !== engine.config.uploadUrl && engine.config.uploadUrl))) return json(409, { error: 'Ziel/Collector-ID erst ändern, wenn der Puffer geleert ist.' });
        saving = true;
        try {
          while (engine.polling || engine.sending) await new Promise(resolve => setTimeout(resolve, 25));
          engine.config = await saveConfig(configFile, input, engine.config);
          engine.status = { point: {}, devices: {}, upload: {}, latestMeasurementAt: null };
          engine.retryAt = 0;
          return json(200, publicConfig(engine.config));
        } finally { saving = false; }
      }
      if (req.method === 'POST' && ['/api/test/varta', '/api/test/azure'].includes(path)) {
        if (testing || saving) return json(409, { error: 'Ein anderer Test läuft bereits.' });
        testing = true;
        try {
          const config = structuredClone(engine.config);
          if (path.endsWith('varta')) {
            const results = await Promise.all(['point', 'devices'].map(name => engine.endpoint(name, config)));
            return json(200, { ok: results.every(r => !r.error), point: results[0].error || 'OK', devices: results[1].error || 'OK' });
          }
          if (!config.uploadUrl || !config.uploadKey) return json(400, { error: 'Azure-Einstellungen zuerst speichern.' });
          try { await sendAzure(config, [], true); return json(200, { ok: true }); }
          catch (error) { await errors.add('azure.test', error); return json(502, { error: 'Azure-Verbindungstest fehlgeschlagen. Siehe Fehlerliste.' }); }
        } finally { testing = false; }
      }
      return json(404, { error: 'Nicht gefunden.' });
    }
    const asset = req.method === 'GET' && assets.get(path);
    if (!asset) return json(404, { error: 'Nicht gefunden.' });
    res.writeHead(200, { ...headers, 'Content-Type': `${asset[1]}; charset=utf-8` });
    res.end(await readFile(new URL(`../${asset[0]}`, import.meta.url)));
  } catch (error) { if (!res.headersSent) json(error.status || (error.code ? 500 : 400), { error: error.code ? 'Lokaler Vorgang fehlgeschlagen.' : error.message }); else res.end(); }
});
server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`VARTA Collector: https://localhost:${port}`));
const run = action => { if (!saving) action().catch(error => console.error('Collector-Vorgang fehlgeschlagen:', error.code || error.name)); };
run(() => engine.poll());
const pollTimer = setInterval(() => run(() => engine.poll()), 10000);
const uploadTimer = setInterval(() => run(() => engine.flush()), 1000);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { clearInterval(pollTimer); clearInterval(uploadTimer); server.close(); setTimeout(() => process.exit(0), 22000).unref(); });
