export const DAY = 86400000;
export const oldestDay = (now = Date.now()) => new Date(Math.floor(now / DAY) * DAY - 364 * DAY).toISOString().slice(0, 10);
export const dayOf = value => new Date(value).toISOString().slice(0, 10);
export const tableName = day => `Varta${day.replaceAll('-', '')}`;
export function valuesOf(point) {
  const values = {};
  for (const key of ['pW', 'cW', 'bcW', 'bdW', 'soc']) if (Number.isFinite(point?.[key])) values[key] = point[key];
  for (const device of point?.devices || []) for (const key of ['power', 'soc']) {
    if (typeof device._id === 'string' && Number.isFinite(device[key])) values[`device:${device._id}:${key}`] = device[key];
  }
  return values;
}
export function seriesOf(keys, devices = []) {
  const known = { pW: ['PV-Erzeugung', 'W', '#c5ef65'], cW: ['Verbrauch', 'W', '#67b6ff'], bcW: ['Batterie laden', 'W', '#eeb966'], bdW: ['Batterie entladen', 'W', '#bd9bff'], soc: ['Batterie-Ladezustand', '%', '#c5ef65'] };
  const names = new Map(devices.map(d => [d.deviceId, d.name]));
  const colors = ['#58d6c3', '#f08eaa', '#f2d76d', '#ad9bff', '#8cb7ff'];
  return [...keys].sort().map((key, i) => {
    if (known[key]) return { key, label: known[key][0], unit: known[key][1], color: known[key][2] };
    const [, id, field] = key.split(':');
    return { key, label: `${names.get(id) || id}${field === 'soc' ? ' · Ladezustand' : ''}`, unit: field === 'soc' ? '%' : 'W', color: colors[i % colors.length] };
  });
}
export function historyRange(params, now = Date.now()) {
  const to = params.get('to') ? Date.parse(params.get('to')) : now;
  const from = params.get('from') ? Date.parse(params.get('from')) : to - Number(params.get('hours') || 1) * 3600000;
  if (![from, to].every(Number.isFinite) || from >= to || to > now + 60000 || from < Date.parse(oldestDay(now))) throw new Error('Zeitraum muss innerhalb der letzten 365 UTC-Kalendertage liegen.');
  const hours = (to - from) / 3600000;
  const intervalSeconds = hours <= 1 ? 10 : hours <= 24 ? 60 : hours <= 168 ? 300 : hours <= 2160 ? 3600 : 86400;
  return { from, to, intervalSeconds };
}
export function validatePacket(packet, collectorId, now = Date.now()) {
  if (!packet || packet.version !== 1 || packet.collectorId !== collectorId || !/^[a-f0-9-]{36}$/.test(packet.id || '') || !Number.isFinite(Date.parse(packet.createdAt))) throw new Error('Ungültiges Upload-Paket.');
  const time = Date.parse(packet.createdAt);
  if (time > now + 60000 || dayOf(time) < oldestDay(now)) throw new Error('Paket außerhalb der Aufbewahrungszeit.');
  for (const name of ['point', 'devices']) {
    const result = packet[name];
    if (!result || !Number.isFinite(Date.parse(result.attemptAt))) throw new Error('Abrufstatus fehlt.');
    if (result.data !== undefined) {
      if (!Number.isFinite(Date.parse(result.receivedAt))) throw new Error('Abrufzeit fehlt.');
      if (name === 'devices' && (!Array.isArray(result.data) || result.data.some(item => !item || typeof item !== 'object' || typeof item.deviceId !== 'string'))) throw new Error('Ungültige Geräteliste.');
      if (name === 'point' && (!result.data || Array.isArray(result.data) || !Number.isFinite(Date.parse(result.data.t)) || dayOf(result.data.t) < oldestDay(now) || Date.parse(result.data.t) > now + 60000)) throw new Error('Ungültiger Messzeitpunkt.');
      if (name === 'point' && result.data.devices !== undefined && !Array.isArray(result.data.devices)) throw new Error('Ungültige Gerätemesswerte.');
      if (name === 'point' && result.data.devices?.some(item => !item || typeof item !== 'object' || typeof item._id !== 'string')) throw new Error('Ungültige Gerätemesswerte.');
    }
  }
  // Table string properties are limited to 64 KiB UTF-16. Keep headroom for metadata.
  if (JSON.stringify(packet).length > 28000) throw new Error('Paket überschreitet die maximale Größe.');
  return packet;
}
