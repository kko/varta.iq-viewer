import { readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export async function readHistory(directory, hours, now = Date.now()) {
  const from = now - hours * 3600000;
  const byTime = new Map();
  const names = new Map();
  let skippedLines = 0;
  const files = (await readdir(directory)).sort();
  for (const file of files) {
    if (!/^(point|devices)-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)) continue;
    const isPoint = file.startsWith('point-');
    const lines = createInterface({ input: createReadStream(new URL(file, directory)), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { skippedLines++; continue; }
      if (!isPoint) {
        if (Array.isArray(row.data)) for (const device of row.data) names.set(device.deviceId, device.name);
        continue;
      }
      const time = Date.parse(row.data?.t);
      if (!Number.isFinite(time) || time < from || time > now) continue;
      const values = {};
      for (const key of ['pW', 'cW', 'bcW', 'bdW', 'soc']) {
        if (Number.isFinite(row.data[key])) values[key] = row.data[key];
      }
      for (const device of row.data.devices || []) {
        for (const key of ['power', 'soc']) if (Number.isFinite(device[key])) values[`device:${device._id}:${key}`] = device[key];
      }
      byTime.set(time, { time, values });
    }
  }
  const raw = [...byTime.values()].sort((a, b) => a.time - b.time);
  const intervalSeconds = hours <= 1 ? 10 : hours <= 24 ? 60 : 300;
  const bucketMs = intervalSeconds * 1000;
  const buckets = new Map();
  for (const point of raw) {
    const time = Math.floor(point.time / bucketMs) * bucketMs;
    if (!buckets.has(time)) buckets.set(time, { time, sums: {}, counts: {} });
    const bucket = buckets.get(time);
    for (const [key, value] of Object.entries(point.values)) {
      bucket.sums[key] = (bucket.sums[key] || 0) + value;
      bucket.counts[key] = (bucket.counts[key] || 0) + 1;
    }
  }
  const points = [...buckets.values()].map(bucket => ({ time: bucket.time, values: Object.fromEntries(Object.entries(bucket.sums).map(([key, sum]) => [key, sum / bucket.counts[key]])) }));
  const known = {
    pW: ['PV-Erzeugung', 'W', '#c5ef65'], cW: ['Verbrauch', 'W', '#67b6ff'],
    bcW: ['Batterie laden', 'W', '#eeb966'], bdW: ['Batterie entladen', 'W', '#bd9bff'],
    soc: ['Batterie-Ladezustand', '%', '#c5ef65'],
  };
  const colors = ['#58d6c3', '#f08eaa', '#f2d76d', '#ad9bff', '#8cb7ff'];
  const keys = new Set(raw.flatMap(point => Object.keys(point.values)));
  let color = 0;
  const series = [...keys].map(key => {
    if (known[key]) return { key, label: known[key][0], unit: known[key][1], color: known[key][2] };
    const [, id, field] = key.split(':');
    return { key, label: `${names.get(id) || id}${field === 'soc' ? ' · Ladezustand' : ''}`, unit: field === 'soc' ? '%' : 'W', color: colors[color++ % colors.length] };
  });
  return { from, to: now, intervalSeconds, sampleCount: raw.length, firstSample: raw[0]?.time ?? null, lastSample: raw.at(-1)?.time ?? null, skippedLines, series, points };
}
