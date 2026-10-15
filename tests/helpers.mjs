import { randomUUID } from 'node:crypto';
export class MemoryStore {
  constructor() { this.rows = new Map(); this.revision = 0; this.queries = []; this.failNext = false; }
  key(table, partition, row) { return `${table}|${partition}|${row}`; }
  async get(table, partition, row) { return structuredClone(this.rows.get(this.key(table, partition, row)) || null); }
  async transaction(table, actions) {
    if (this.failNext) { this.failNext = false; throw Object.assign(new Error('Storage unavailable'), { statusCode: 503 }); }
    const pending = [];
    for (const [action, entity, , options] of actions) {
      const key = this.key(table, entity.partitionKey, entity.rowKey), previous = this.rows.get(key);
      if (action === 'create' && previous) throw Object.assign(new Error('Duplicate'), { statusCode: 409 });
      if (action === 'update' && (!previous || previous.etag !== options.etag)) throw Object.assign(new Error('Conflict'), { statusCode: 412 });
      pending.push([key, { ...structuredClone(entity), etag: String(++this.revision) }]);
    }
    for (const [key, entity] of pending) this.rows.set(key, entity);
  }
  async query(table, partition, from, to) {
    this.queries.push({ table, from, to });
    return [...this.rows].filter(([key, e]) => key.startsWith(`${table}|${partition}|`) && e.rowKey >= from && e.rowKey < to).map(([, entity]) => structuredClone(entity));
  }
}
export function packet(time = Date.now(), overrides = {}) {
  const at = new Date(time).toISOString();
  return { version: 1, id: randomUUID(), collectorId: 'varta-home', createdAt: at, point: { attemptAt: at, receivedAt: at, status: 200, data: { t: at, pW: 200, cW: 100, soc: 55, devices: [{ _id: 'battery', power: -50, soc: 60 }] } }, devices: { attemptAt: at, receivedAt: at, status: 200, data: [{ deviceId: 'battery', name: 'Batterie' }] }, ...overrides };
}
