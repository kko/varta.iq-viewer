import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readHistory } from './history.mjs';

test('history filters, deduplicates, sorts, and retains zero and missing values', async () => {
  const path = await mkdtemp(join(tmpdir(), 'varta-history-'));
  const directory = pathToFileURL(path + '/');
  const now = Date.parse('2026-10-15T18:00:00Z');
  const point = (time, values) => JSON.stringify({ data: { t: time, ...values } });
  try {
    await writeFile(new URL('point-2026-10-15.jsonl', directory), [
      point('2026-10-15T17:59:10Z', { pW: 200, soc: 80 }),
      point('2026-10-15T17:58:00Z', { pW: 0, devices: [{ _id: 'bat', power: -40, soc: 80 }] }),
      point('2026-10-15T17:59:10Z', { pW: 400, soc: 82 }),
      point('2026-10-15T15:00:00Z', { pW: 999 }),
      point('2026-10-15T19:00:00Z', { pW: 999 }),
      '{incomplete', '',
    ].join('\n'));
    await writeFile(new URL('devices-2026-10-15.jsonl', directory), JSON.stringify({ data: [{ deviceId: 'bat', name: 'VARTA Batterie' }] }) + '\n');
    const result = await readHistory(directory, 1, now);
    assert.equal(result.sampleCount, 2);
    assert.equal(result.skippedLines, 1);
    assert.equal(result.points[0].values.pW, 0);
    assert.equal(result.points[1].values.pW, 400);
    assert.equal(result.points[0].values.soc, undefined);
    assert.equal(result.points[0].values['device:bat:power'], -40);
    assert.equal(result.series.find(series => series.key === 'device:bat:power').label, 'VARTA Batterie');
    assert.ok(result.points[0].time < result.points[1].time);

    await writeFile(new URL('point-2026-10-15.jsonl', directory), [
      point('2026-10-15T17:59:10Z', { pW: 100, soc: 80 }),
      point('2026-10-15T17:59:20Z', { pW: 300 }),
    ].join('\n'));
    const aggregated = await readHistory(directory, 24, now);
    assert.equal(aggregated.intervalSeconds, 60);
    assert.equal(aggregated.points.length, 1);
    assert.equal(aggregated.points[0].values.pW, 200);
    assert.equal(aggregated.points[0].values.soc, 80);
  } finally {
    await unlink(new URL('point-2026-10-15.jsonl', directory));
    await unlink(new URL('devices-2026-10-15.jsonl', directory));
    await rmdir(path);
  }
});
