import { refreshHistory } from './history.js';
const $ = id => document.getElementById(id);
const number = (value, unit = '') => typeof value === 'number' && Number.isFinite(value)
  ? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)}${unit ? ' ' + unit : ''}` : '—';
const date = value => new Date(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
const hints = {
  pW: 'PV-Leistung · W', cW: 'Verbrauchsleistung · W', soc: 'Batterie-Ladezustand · %',
  bcW: 'Batterie-Ladeleistung · W', bdW: 'Batterie-Entladeleistung · W',
  t: 'Zeitstempel des Gateways', fw: 'Firmware-Version', v: 'Datenformat-Version',
  iv: 'Messintervall', devices: 'Messwerte je Gerät; Zuordnung über _id ↔ deviceId',
};
let point = null;
let deviceList = null;
let busy = false;
let settingsSaving = false;
let gatewayRevision = 0;

function showGateway(ip) {
  $('gatewayAddress').textContent = ip;
  $('gatewayLink').textContent = ip;
  $('gatewayLink').href = `http://${ip}/`;
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Einstellungen konnten nicht geladen werden.');
    const settings = await response.json();
    $('gatewayIp').value = settings.gatewayIp;
    showGateway(settings.gatewayIp);
    $('settingsMessage').textContent = 'Die Adresse wird lokal gespeichert und nach einem Neustart weiterverwendet.';
    $('saveSettings').disabled = false;
  } catch (error) { $('settingsMessage').textContent = error.message + ' Bitte die Seite neu laden.'; }
}

$('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (settingsSaving) return;
  const ip = $('gatewayIp').value.trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some(part => Number(part) > 255 || (part.length > 1 && part.startsWith('0')))) {
    $('settingsMessage').textContent = 'Bitte eine gültige IPv4-Adresse eingeben, z. B. 192.168.4.119.';
    $('gatewayIp').focus(); return;
  }
  settingsSaving = true; $('saveSettings').disabled = true;
  $('settingsMessage').textContent = 'Adresse wird gespeichert …';
  try {
    const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gatewayIp: ip }) });
    const settings = await response.json();
    if (!response.ok) throw new Error(settings.error || 'Speichern fehlgeschlagen.');
    gatewayRevision++;
    $('gatewayIp').value = settings.gatewayIp;
    showGateway(settings.gatewayIp);
    point = null; deviceList = null;
    for (const id of ['pv', 'load', 'soc', 'deviceCount']) $(id).textContent = '—';
    $('battery').textContent = 'Neue Verbindung wird aufgebaut …';
    $('fields').replaceChildren(); $('devices').replaceChildren();
    for (const name of ['point', 'devices']) {
      $(name + 'Json').textContent = 'Warte auf Daten der gespeicherten Adresse …';
      $(name + 'Meta').textContent = `http://${settings.gatewayIp}/v2/${name}`;
      $(name + 'Status').textContent = 'Verbindung wird aufgebaut';
      $(name + 'Status').className = 'badge';
    }
    $('settingsMessage').textContent = 'Adresse gespeichert. Die Verbindung wird neu aufgebaut; Live-Daten folgen beim nächsten Abruf.';
  } catch (error) { $('settingsMessage').textContent = error.message; }
  finally { settingsSaving = false; $('saveSettings').disabled = false; }
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderPoint(data) {
  $('pv').textContent = number(data.pW, 'W');
  $('load').textContent = number(data.cW, 'W');
  $('soc').textContent = number(data.soc, '%');
  $('battery').textContent = `Laden ${number(data.bcW, 'W')} · Entladen ${number(data.bdW, 'W')}`;
  const rows = Object.entries(data).map(([key, value]) => {
    const row = element('tr');
    const shown = Array.isArray(value) ? `${value.length} Einträge – siehe JSON` : value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
    row.append(element('td', '', key), element('td', '', shown), element('td', '', hints[key] || 'Originalfeld · siehe JSON'));
    return row;
  });
  $('fields').replaceChildren(...rows);
}

function renderDevices() {
  if (!deviceList) return;
  $('deviceCount').textContent = String(deviceList.length);
  $('devices').replaceChildren(...deviceList.map(device => {
    const card = element('article', 'device');
    const top = element('div', 'device-top');
    top.append(element('h3', '', device.name || 'Unbenannt'), element('span', 'type', device.type || '—'));
    card.append(top);
    if (device.description) card.append(element('p', '', device.description));
    const id = element('p');
    id.append(element('code', '', `ID: ${device.deviceId || '—'}`));
    card.append(id);
    const reading = point?.devices?.find(item => item._id === device.deviceId);
    if (reading) {
      card.append(element('p', 'reading', [
        `Leistung: ${number(reading.power, 'W')}`,
        ...(typeof reading.soc === 'number' ? [`SoC: ${number(reading.soc, '%')}`] : []),
        `Signal: ${reading.signal ?? '—'}`,
      ].join(' · ')));
    }
    return card;
  }));
  if (!deviceList.length) $('devices').append(element('p', 'empty', 'Das Gateway meldet keine Geräte.'));
}

async function load(name) {
  const revision = gatewayRevision;
  const badge = $(name + 'Status');
  try {
    const response = await fetch(`/api/${name}`, { cache: 'no-store', signal: AbortSignal.timeout(11000) });
    const result = await response.json();
    if (revision !== gatewayRevision) return false;
    if (!response.ok || result.error) throw new Error(result.error || `HTTP ${response.status}`);
    if (name === 'point' && (!result.data || Array.isArray(result.data) || typeof result.data !== 'object')) throw new Error('Unerwartetes Messdatenformat.');
    if (name === 'devices' && !Array.isArray(result.data)) throw new Error('Unerwartetes Geräteformat.');
    $(name + 'Json').textContent = JSON.stringify(result.data, null, 2);
    $(name + 'Meta').textContent = `${result.url} · Abgerufen: ${date(result.receivedAt)}${name === 'point' && result.data.t ? ` · Messzeit: ${date(result.data.t)}` : ''}`;
    const stale = name === 'point' && result.data.t && Date.now() - Date.parse(result.data.t) > 60000;
    badge.textContent = stale ? 'HTTP 200 · Messwert älter als 1 Min.' : `HTTP ${result.status}`;
    badge.className = stale ? 'badge fail' : 'badge ok';
    if (name === 'point') { point = result.data; renderPoint(point); }
    else deviceList = result.data;
    return true;
  } catch (error) {
    if (revision !== gatewayRevision) return false;
    badge.textContent = 'Abruf fehlgeschlagen'; badge.className = 'badge fail';
    $(name + 'Meta').textContent = error.message + ' Bereits angezeigte Werte stammen vom letzten erfolgreichen Abruf.';
    if (name === 'point') {
      for (const id of ['pv', 'load', 'soc']) $(id).textContent = '—';
      $('battery').textContent = 'Aktuell nicht erreichbar';
    } else $('deviceCount').textContent = '—';
    return false;
  }
}

async function refresh() {
  if (busy || settingsSaving) return;
  busy = true; $('refresh').disabled = true;
  $('status').textContent = 'Daten werden abgerufen …';
  try {
    const results = await Promise.all([load('point'), load('devices'), refreshHistory()]);
    try {
      const response = await fetch('/api/recording', { cache: 'no-store' });
      const recording = await response.json();
      $('recording').textContent = recording.error
        ? `Aufzeichnung gestört: ${recording.error}`
        : recording.lastSavedAt
          ? `Aufzeichnung aktiv · alle ${recording.intervalSeconds} Sekunden · zuletzt gespeichert: ${date(recording.lastSavedAt)}`
          : 'Aufzeichnung gestartet · warte auf ersten Messwert …';
    } catch { $('recording').textContent = 'Aufzeichnungsstatus derzeit nicht erreichbar.'; }
    renderDevices();
    if (!results[1]) $('deviceCount').textContent = '—';
    const ok = results.slice(0, 2).every(Boolean);
    $('status').textContent = ok ? `Aktualisiert um ${new Date().toLocaleTimeString('de-DE')}` : 'Verbindung teilweise oder vollständig unterbrochen';
    $('status').className = ok ? '' : 'error';
  } finally { busy = false; $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh);
setInterval(() => { if ($('auto').checked && !document.hidden) refresh(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('auto').checked) refresh(); });
loadSettings();
refresh();
