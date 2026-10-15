import { app } from '@azure/functions';
import { AzureStore } from './storage.mjs';
import { CloudService, keyMatches, viewer } from './service.mjs';

let service;
const getService = () => service ||= new CloudService(new AzureStore(process.env.VARTA_STORAGE_CONNECTION), process.env.VARTA_COLLECTOR_ID || 'varta-home');
const result = (status, jsonBody) => ({ status, jsonBody, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function ingestHandler(request, context) {
  if (!keyMatches(request.headers.get('x-upload-key'), process.env.VARTA_UPLOAD_KEY)) return result(401, { error: 'Upload nicht autorisiert.' });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 1024 * 1024) return result(413, { error: 'Batch zu groß.' });
    let body; try { body = JSON.parse(text); } catch { return result(400, { error: 'Ungültiges JSON.' }); }
    if (body.test === true) {
      if (body.collectorId !== getService().collectorId) return result(400, { error: 'Collector-ID stimmt nicht überein.' });
      await getService().putLatest('connectionTest', new Date().toISOString(), { at: new Date().toISOString() });
      return result(200, { ok: true });
    }
    const packets = body.packets || [body];
    if (!Array.isArray(packets) || !packets.length || packets.length > 20) return result(400, { error: '1–20 Pakete erforderlich.' });
    const accepted = [], rejected = [];
    for (const packet of packets) {
      try { accepted.push(await getService().ingest(packet)); }
      catch (error) {
        if (error.statusCode || /parallel/.test(error.message)) throw error;
        rejected.push({ id: packet?.id, error: error.message });
      }
    }
    return result(200, { accepted, rejected });
  } catch (error) { context.error('Speichervorgang fehlgeschlagen', error.code || error.name); return result(503, { error: 'Speicherung derzeit nicht möglich.' }); }
}
export async function readHandler(request, context) {
  if (!viewer(request.headers.get('x-ms-client-principal'))) return result(403, { error: 'Einladung mit viewer-Rolle erforderlich.' });
  try {
    const name = request.params.name;
    if (name === 'status') return result(200, await getService().status());
    if (name === 'history') { try { return result(200, await getService().history(new URL(request.url).searchParams)); } catch (error) { if (!error.statusCode && /Zeitraum/.test(error.message)) return result(400, { error: error.message }); throw error; } }
    if (!['point', 'devices'].includes(name)) return result(404, { error: 'Nicht gefunden.' });
    const data = await getService().latest(name);
    return data ? result(200, data) : result(503, { error: 'Noch keine Daten hochgeladen.' });
  } catch (error) { context.error('Lesevorgang fehlgeschlagen', error.code || error.name); return result(503, { error: 'Daten derzeit nicht verfügbar.' }); }
}
app.http('ingest', { methods: ['POST'], authLevel: 'anonymous', route: 'ingest', handler: ingestHandler });
app.http('read', { methods: ['GET'], authLevel: 'anonymous', route: '{name}', handler: readHandler });
