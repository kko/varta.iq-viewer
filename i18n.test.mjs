import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('German/English selection covers all page text and preserves the saved language', async () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.document = { documentElement: {}, getElementById: () => ({}), dispatchEvent: () => {} };
  const { t, locale, setLanguage, errorText } = await import('./public/i18n.js');
  assert.equal(t('Aktuelle Messwerte'), 'Aktuelle Messwerte');
  assert.equal(locale(), 'de-DE');
  setLanguage('en');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(values.get('varta-language'), 'en');
  assert.equal(locale(), 'en-GB');
  assert.equal(t('Aktuelle Messwerte'), 'Current measurements');
  assert.equal(t('Laden {charge} · Entladen {discharge}', { charge: '10 W', discharge: '0 W' }), 'Charging 10 W · Discharging 0 W');
  assert.ok(!errorText('HTTPS-Abruf fehlgeschlagen: point: HTTP 403 – Zugriff verweigert. API-Key und Freigabe der lokalen API prüfen.').includes('verweigert'));
  assert.equal(t('SMA STP SUNNY TRIPOWER'), 'SMA STP SUNNY TRIPOWER');
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  const unchanged = new Set(['VARTA.iq Viewer', 'V', 'Deutsch', 'English', 'VARTA.iQ Energy Manager', 'W', '%', 'pW', 'cW', 'soc', 'GET', '/v2/point', '/v2/devices', 'GET /v2/point', '↻', '—']);
  const texts = [...html.matchAll(/>([^<>]+)</g)].map(match => match[1].trim()).filter(Boolean);
  for (const text of texts) if (!unchanged.has(text)) assert.notEqual(t(text), text, `Missing English translation: ${text}`);
  setLanguage('de');
  assert.equal(values.get('varta-language'), 'de');
  assert.equal(t('Aktuelle Messwerte'), 'Aktuelle Messwerte');
  setLanguage('invalid');
  assert.equal(locale(), 'de-DE');
});
