import { mkdir, readFile, writeFile, rename, readdir, unlink, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DAY } from '../shared/model.mjs';

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
}
export class Spool {
  constructor(directory) { this.directory = directory; this.entries = new Map(); this.dropped = 0; }
  async init() {
    await mkdir(this.directory, { recursive: true });
    const metadata = await readJson(join(this.directory, 'metadata.json'), { dropped: 0 });
    this.dropped = metadata.dropped;
    for (const name of await readdir(this.directory)) {
      if (!/^\d{13}-[a-f0-9-]{36}\.json$/.test(name)) continue;
      this.entries.set(name, Number(name.slice(0, 13)));
    }
    await this.expire();
  }
  async add(packet) {
    const name = `${Date.parse(packet.createdAt)}-${packet.id}.json`;
    await atomicJson(join(this.directory, name), packet);
    this.entries.set(name, Date.parse(packet.createdAt));
  }
  async get(name) { return readJson(join(this.directory, name)); }
  async ack(names) { for (const name of names) { await unlink(join(this.directory, name)); this.entries.delete(name); } }
  async expire(now = Date.now()) {
    const expired = [...this.entries].filter(([, time]) => time < now - 30 * DAY).map(([name]) => name);
    if (expired.length) {
      await this.ack(expired); this.dropped += expired.length;
      await atomicJson(join(this.directory, 'metadata.json'), { dropped: this.dropped });
    }
    return expired.length;
  }
  batch(limit = 20) {
    let newest;
    const oldest = [];
    for (const entry of this.entries) {
      if (!newest || entry[1] > newest[1]) newest = entry;
      if (oldest.length < limit - 1 || entry[1] < oldest.at(-1)[1]) { oldest.push(entry); oldest.sort((a, b) => a[1] - b[1]); if (oldest.length >= limit) oldest.pop(); }
    }
    // Reserve room for the newest packet; fill remaining slots oldest first.
    return newest ? [...new Set([newest[0], ...oldest.map(([name]) => name)])] : [];
  }
  status() {
    let oldest = Infinity;
    for (const value of this.entries.values()) oldest = Math.min(oldest, value);
    return { count: this.entries.size, oldestAt: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null, dropped: this.dropped };
  }
}
export class ErrorLog {
  constructor(file, secrets = () => []) { this.file = file; this.secrets = secrets; this.items = []; this.pending = Promise.resolve(); }
  async init() { this.items = await readJson(this.file, []); }
  async add(source, error) {
    let message = String(error?.message || error).replace(/https?:\/\/\S+/g, '[Adresse]').replace(/[\r\n]/g, ' ');
    for (const secret of this.secrets()) if (secret) message = message.split(secret).join('[vertraulich]');
    this.items.unshift({ at: new Date().toISOString(), source, message: message.slice(0, 500) });
    this.items = this.items.slice(0, 10);
    const snapshot = structuredClone(this.items);
    const operation = this.pending.catch(() => {}).then(() => atomicJson(this.file, snapshot));
    this.pending = operation;
    await operation;
  }
}
