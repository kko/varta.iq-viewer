const $ = id => document.getElementById(id);
const form = $('settings'); let csrf = '', refreshing = false;
const date = value => value ? new Date(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '—';
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, { method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  if (response.status === 401 && path !== 'login') show(false);
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function show(loggedIn) { $('admin').hidden = !loggedIn; $('login').hidden = loggedIn; $('logout').hidden = !loggedIn; }
function row(values) { const tr = document.createElement('tr'); for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } return tr; }
async function refresh() {
  if (!csrf || refreshing) return; refreshing = true;
  try {
    const s = await api('status');
    $('statuses').replaceChildren(...['point', 'devices'].map(name => row([`VARTA / ${name}`, s[name].error ? 'Fehler' : s[name].stale ? 'Warte / veraltet' : 'OK', `Versuch: ${date(s[name].attemptAt)}`, `Erfolg: ${date(s[name].lastSuccessAt)}`])), row(['Azure-Upload', !s.upload.enabled ? 'Deaktiviert' : s.upload.error ? 'Fehler' : s.upload.stale ? 'Warte / veraltet' : 'OK', `Versuch: ${date(s.upload.lastAttemptAt)}`, `Aktuell bestätigt: ${date(s.upload.lastCurrentSuccessAt)}`]), row(['Messwert', s.measurementStale ? 'Veraltet / fehlt' : 'Aktuell', date(s.latestMeasurementAt), `Letzter beliebiger Upload: ${date(s.upload.lastSuccessAt)}`]));
    $('buffer').textContent = `Puffer: ${s.buffer.count} Pakete · ältestes: ${date(s.buffer.oldestAt)} · nach 30 Tagen verworfen: ${s.buffer.dropped} · nächste Wiederholung: ${date(s.upload.retryAt)}`;
    $('errors').replaceChildren(...s.errors.map(error => row([date(error.at), error.source, error.message])));
    if (!s.errors.length) $('errors').append(row(['—', '—', 'Keine Fehler gespeichert.']));
  } catch (error) { $('message').textContent = error.message; } finally { refreshing = false; }
}
async function load() {
  const config = await api('settings');
  for (const name of ['gatewayIp', 'uploadUrl', 'collectorId']) form.elements[name].value = config[name];
  form.elements.enabled.checked = config.enabled;
  for (const [name, flag] of [['gatewayApiKey', 'hasGatewayApiKey'], ['uploadKey', 'hasUploadKey']]) { form.elements[name].value = ''; form.elements[name].placeholder = config[flag] ? 'Gespeichert · leer lassen zum Beibehalten' : 'Noch nicht gespeichert'; }
  $('removeVarta').checked = false; $('removeAzure').checked = false;
  show(true); await refresh();
}
$('login').addEventListener('submit', async event => { event.preventDefault(); try { csrf = (await api('login', 'POST', { password: $('password').value })).csrf; $('password').value = ''; $('message').textContent = ''; await load(); } catch (error) { $('message').textContent = error.message; } });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const input = Object.fromEntries(['gatewayIp', 'uploadUrl', 'collectorId'].map(name => [name, form.elements[name].value.trim()])); input.enabled = form.elements.enabled.checked;
  for (const [name, remove] of [['gatewayApiKey', 'removeVarta'], ['uploadKey', 'removeAzure']]) { if ($(remove).checked) input[name] = ''; else if (form.elements[name].value.trim()) input[name] = form.elements[name].value.trim(); }
  try { await api('settings', 'PUT', input); await load(); $('message').textContent = 'Einstellungen gespeichert.'; } catch (error) { $('message').textContent = error.message; }
});
for (const [id, path] of [['testVarta', 'test/varta'], ['testAzure', 'test/azure']]) $(id).addEventListener('click', async () => { $(id).disabled = true; $('message').textContent = 'Verbindungstest läuft …'; try { const result = await api(path, 'POST', {}); $('message').textContent = result.ok ? 'Verbindungstest erfolgreich.' : `point: ${result.point} · devices: ${result.devices}`; await refresh(); } catch (error) { $('message').textContent = error.message; } finally { $(id).disabled = false; } });
$('logout').addEventListener('click', async () => { try { await api('logout', 'POST', {}); csrf = ''; show(false); } catch (error) { $('message').textContent = error.message; } });
try { csrf = (await api('session')).csrf; await load(); } catch { show(false); }
setInterval(refresh, 5000);
