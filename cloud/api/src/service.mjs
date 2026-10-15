import { createHash, timingSafeEqual } from 'node:crypto';
import { DAY, dayOf, tableName, oldestDay, valuesOf, seriesOf, historyRange, validatePacket } from './model.mjs';
const META = 'VartaMeta';
const stamp = time => new Date(time).toISOString();
const conflict = error => [409, 412].includes(error.statusCode);
const hash = value => createHash('sha256').update(value).digest();
export const keyMatches = (provided, expected) => Boolean(expected && typeof provided === 'string' && provided.length <= 512 && timingSafeEqual(hash(provided), hash(expected)));
export function viewer(principal) {
  try { return JSON.parse(Buffer.from(principal || '', 'base64').toString('utf8')).userRoles?.includes('viewer') === true; } catch { return false; }
}
function numericAggregate(point) {
  const sums = valuesOf(point), counts = Object.fromEntries(Object.keys(sums).map(key => [key, 1]));
  return { sums, counts, sampleCount: 1, first: Date.parse(point.t), last: Date.parse(point.t) };
}
function mergeAggregate(previous, addition) {
  const next = previous ? structuredClone(previous) : { sums: {}, counts: {}, sampleCount: 0, first: addition.first, last: addition.last };
  for (const key of Object.keys(addition.sums)) { next.sums[key] = (next.sums[key] || 0) + addition.sums[key]; next.counts[key] = (next.counts[key] || 0) + addition.counts[key]; }
  next.sampleCount += addition.sampleCount; next.first = Math.min(next.first, addition.first); next.last = Math.max(next.last, addition.last);
  return next;
}
export class CloudService {
  constructor(store, collectorId) { this.store = store; this.collectorId = collectorId; }
  async putLatest(rowKey, time, value) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const existing = await this.store.get(META, this.collectorId, rowKey);
      if (existing && existing.time >= time) return;
      const entity = { partitionKey: this.collectorId, rowKey, time, payload: JSON.stringify(value) };
      try { await this.store.transaction(META, [existing ? ['update', entity, 'Replace', { etag: existing.etag }] : ['create', entity]]); return; }
      catch (error) { if (!conflict(error)) throw error; }
    }
    throw new Error('Zu viele parallele Statusaktualisierungen.');
  }
  async measurement(point) {
    const time = Date.parse(point.t), table = tableName(dayOf(time)), partitionKey = this.collectorId, rowKey = `m:${stamp(time)}`;
    const addition = numericAggregate(point);
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await this.store.get(table, partitionKey, rowKey)) return;
      const keys = [300, 3600, 86400].map(seconds => `a${seconds}:${stamp(Math.floor(time / (seconds * 1000)) * seconds * 1000)}`);
      const old = await Promise.all(keys.map(key => this.store.get(table, partitionKey, key)));
      const actions = [['create', { partitionKey, rowKey, payload: JSON.stringify(point) }], ...keys.map((key, i) => {
        const entity = { partitionKey, rowKey: key, payload: JSON.stringify(mergeAggregate(old[i] ? JSON.parse(old[i].payload) : null, addition)) };
        return old[i] ? ['update', entity, 'Replace', { etag: old[i].etag }] : ['create', entity];
      })];
      try { await this.store.transaction(table, actions); return; } catch (error) { if (!conflict(error)) throw error; }
    }
    throw new Error('Zu viele parallele Messwertaktualisierungen.');
  }
  async ingest(packet, now = Date.now()) {
    validatePacket(packet, this.collectorId, now);
    const table = tableName(dayOf(packet.createdAt)), rowKey = `p:${packet.createdAt}:${packet.id}`;
    // All dependent writes precede the packet marker. Replays repair interrupted writes.
    if (packet.point.data) await this.measurement(packet.point.data);
    for (const name of ['point', 'devices']) if (packet[name].data !== undefined) await this.putLatest(name, packet[name].receivedAt, { data: packet[name].data, receivedAt: packet[name].receivedAt, status: packet[name].status, url: 'Azure / hochgeladene Originaldaten' });
    await this.putLatest('status', packet.createdAt, { createdAt: packet.createdAt, packetId: packet.id, point: { attemptAt: packet.point.attemptAt, error: packet.point.error || null }, devices: { attemptAt: packet.devices.attemptAt, error: packet.devices.error || null }, storedAt: new Date(now).toISOString() });
    try { await this.store.transaction(table, [['create', { partitionKey: this.collectorId, rowKey, payload: JSON.stringify(packet) }]]); }
    catch (error) { if (error.statusCode !== 409) throw error; }
    return packet.id;
  }
  async latest(name) { const entity = await this.store.get(META, this.collectorId, name); return entity && entity.time.slice(0, 10) >= oldestDay() ? JSON.parse(entity.payload) : null; }
  async status(now = Date.now()) {
    const [status, point, devices, cleanup] = await Promise.all([this.latest('status'), this.latest('point'), this.latest('devices'), this.store.get(META, 'system', 'cleanup')]);
    return { ...status, stale: !status || now - Date.parse(status.createdAt) > 30000, measurementAt: point?.data.t || null, measurementStale: !point || now - Date.parse(point.data.t) > 30000, pointSuccessAt: point?.receivedAt || null, devicesSuccessAt: devices?.receivedAt || null, cleanup: cleanup ? JSON.parse(cleanup.payload) : null };
  }
  async history(params, now = Date.now()) {
    const { from, to, intervalSeconds } = historyRange(params, now);
    const buckets = new Map();
    const add = (time, aggregate) => { const bucket = Math.floor(time / (intervalSeconds * 1000)) * intervalSeconds * 1000; buckets.set(bucket, mergeAggregate(buckets.get(bucket), aggregate)); };
    const sourceSeconds = intervalSeconds >= 300 ? intervalSeconds : 0;
    const days = [];
    for (let day = Math.floor(from / DAY) * DAY; day <= to; day += DAY) days.push(day);
    for (let offset = 0; offset < days.length; offset += 8) await Promise.all(days.slice(offset, offset + 8).map(async day => {
      const start = Math.max(from, day), end = Math.min(to, day + DAY);
      if (start >= end) return;
      const table = tableName(dayOf(day));
      if (!sourceSeconds) {
        for (const row of await this.store.query(table, this.collectorId, `m:${stamp(start)}`, `m:${stamp(end)}`)) { const point = JSON.parse(row.payload); add(Date.parse(point.t), numericAggregate(point)); }
      } else {
        const size = sourceSeconds * 1000;
        const fullStart = Math.ceil(start / size) * size, fullEnd = Math.floor(end / size) * size;
        if (fullStart < fullEnd) for (const row of await this.store.query(table, this.collectorId, `a${sourceSeconds}:${stamp(fullStart)}`, `a${sourceSeconds}:${stamp(fullEnd)}`)) add(Date.parse(row.rowKey.split(':').slice(1).join(':')), JSON.parse(row.payload));
        // Partial boundary buckets use raw measurements, so custom ranges stay exact.
        const edges = fullStart >= fullEnd ? [[start, end]] : [[start, fullStart], [fullEnd, end]];
        for (const [left, right] of edges) if (left < right) for (const row of await this.store.query(table, this.collectorId, `m:${stamp(left)}`, `m:${stamp(right)}`)) { const point = JSON.parse(row.payload); add(Date.parse(point.t), numericAggregate(point)); }
      }
    }));
    const entries = [...buckets].sort((a, b) => a[0] - b[0]);
    const points = entries.map(([time, aggregate]) => ({ time, values: Object.fromEntries(Object.entries(aggregate.sums).map(([key, value]) => [key, value / aggregate.counts[key]])) }));
    const devices = (await this.latest('devices'))?.data || [];
    return { from, to, intervalSeconds, points, series: seriesOf(new Set(points.flatMap(point => Object.keys(point.values))), devices), sampleCount: entries.reduce((sum, [, a]) => sum + a.sampleCount, 0), firstSample: entries.length ? Math.min(...entries.map(([, a]) => a.first)) : null, lastSample: entries.length ? Math.max(...entries.map(([, a]) => a.last)) : null, skippedLines: 0 };
  }
}
