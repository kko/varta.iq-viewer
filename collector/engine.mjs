import { randomUUID } from 'node:crypto';
import { fetchGateway } from '../gateway-https.mjs';

export async function sendAzure(config, payload, test = false, fetcher = fetch) {
  const response = await fetcher(config.uploadUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', 'X-Upload-Key': config.uploadKey }, body: JSON.stringify(test ? { test: true, collectorId: config.collectorId } : { packets: payload }) });
  if (!response.ok) throw new Error(`Azure: HTTP ${response.status}${[401, 403].includes(response.status) ? ' – Upload-Schlüssel prüfen.' : ''}`);
  const body = await response.json();
  if (test ? body.ok !== true : !Array.isArray(body.accepted)) throw new Error('Azure: ungültige Speicherbestätigung.');
  return body;
}
export class Collector {
  constructor({ config, spool, errors, certificates, gatewayFetch = fetchGateway, upload = sendAzure }) {
    Object.assign(this, { config, spool, errors, certificates, gatewayFetch, upload });
    this.status = { point: {}, devices: {}, upload: {}, latestMeasurementAt: null };
    this.polling = false; this.sending = false; this.failures = 0; this.retryAt = 0; this.latestPacketId = null;
  }
  async endpoint(name, config) {
    const attemptAt = new Date().toISOString();
    try {
      const response = await this.gatewayFetch(`https://${config.gatewayIp}/v2/${name}`, this.certificates, config.gatewayApiKey);
      if (!response.ok) throw new Error(`HTTP ${response.status}${[401, 403].includes(response.status) ? ' – API-Key und lokale API prüfen.' : ''}`);
      const data = await response.json();
      if (name === 'point' && (!data || Array.isArray(data) || !Number.isFinite(Date.parse(data.t)) || (data.devices !== undefined && !Array.isArray(data.devices)))) throw new Error('Ungültiges Messdatenformat.');
      if (name === 'devices' && !Array.isArray(data)) throw new Error('Ungültiges Geräteformat.');
      return { attemptAt, receivedAt: new Date().toISOString(), status: response.status, data };
    } catch (error) {
      const message = `${name}: ${error.cause?.code || error.code || error.message}`;
      await this.errors.add(`varta.${name}`, message);
      return { attemptAt, error: message };
    }
  }
  async poll() {
    if (this.polling) return;
    this.polling = true;
    const config = structuredClone(this.config);
    try {
      const [point, devices] = await Promise.all(['point', 'devices'].map(name => this.endpoint(name, config)));
      for (const [name, result] of Object.entries({ point, devices })) this.status[name] = { ...this.status[name], attemptAt: result.attemptAt, ...(result.receivedAt ? { lastSuccessAt: result.receivedAt } : {}), error: result.error || null };
      if (point.data) this.status.latestMeasurementAt = point.data.t;
      const packet = { version: 1, id: randomUUID(), collectorId: config.collectorId, sourceGatewayIp: config.gatewayIp, createdAt: new Date().toISOString(), point, devices };
      await this.spool.add(packet);
      this.latestPacketId = packet.id;
      if (await this.spool.expire()) await this.errors.add('puffer', 'Pakete nach 30 Tagen verworfen.');
    } catch (error) { await this.errors.add('puffer', error); }
    finally { this.polling = false; }
    await this.flush();
  }
  async flush() {
    if (this.sending || !this.config.enabled || Date.now() < this.retryAt) return;
    this.sending = true;
    const config = structuredClone(this.config);
    try {
      const names = this.spool.batch();
      if (!names.length) return;
      const packets = await Promise.all(names.map(name => this.spool.get(name)));
      // Configuration changes must never relabel buffered data from another collector.
      if (packets.some(packet => packet.collectorId !== config.collectorId)) throw new Error('Puffer enthält eine andere Collector-ID. Ursprüngliche ID wiederherstellen.');
      this.status.upload.lastAttemptAt = new Date().toISOString();
      const result = await this.upload(config, packets);
      const ids = new Set(result.accepted);
      const acknowledged = names.filter((_, i) => ids.has(packets[i].id));
      await this.spool.ack(acknowledged);
      this.status.upload.lastSuccessAt = new Date().toISOString();
      if (packets.some(p => ids.has(p.id) && p.id === this.latestPacketId && Date.now() - Date.parse(p.createdAt) < 30000)) this.status.upload.lastCurrentSuccessAt = this.status.upload.lastSuccessAt;
      if (acknowledged.length !== names.length) throw new Error(`Azure hat nur einen Teil der Pakete bestätigt.${result.rejected?.[0]?.error ? ' ' + result.rejected[0].error : ''}`);
      this.status.upload.error = null; this.failures = 0; this.retryAt = 0;
    } catch (error) {
      this.failures++;
      this.retryAt = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(this.failures, 6));
      this.status.upload.error = 'Azure-Upload fehlgeschlagen; siehe Fehlerliste.';
      await this.errors.add('azure', error);
    } finally { this.sending = false; }
  }
  snapshot(now = Date.now()) {
    const stale = at => !at || now - Date.parse(at) > 30000;
    return { ...this.status, point: { ...this.status.point, stale: stale(this.status.point.lastSuccessAt) }, devices: { ...this.status.devices, stale: stale(this.status.devices.lastSuccessAt) }, upload: { ...this.status.upload, enabled: this.config.enabled, stale: stale(this.status.upload.lastCurrentSuccessAt), retryAt: this.retryAt ? new Date(this.retryAt).toISOString() : null }, measurementStale: stale(this.status.latestMeasurementAt), buffer: this.spool.status(), errors: this.errors.items };
  }
}
