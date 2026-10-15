const translations = {
  'Sprache': 'Language',
  'Gateway wird geladen …': 'Loading gateway …',
  'DEIN GATEWAY, DIREKT AUSGELESEN': 'YOUR GATEWAY, READ DIRECTLY',
  'Was kommt an?': 'What’s coming in?',
  'Live-Messwerte und Verlauf aus deiner lokalen Schnittstelle.': 'Live readings and history from your local interface.',
  'Jetzt aktualisieren': 'Refresh now',
  'Alle 10 Sekunden aktualisieren': 'Refresh every 10 seconds',
  'Verbindung wird hergestellt …': 'Connecting …',
  'VERBINDUNG': 'CONNECTION',
  'IP-Adresse im lokalen Netzwerk': 'IP address on the local network',
  'Speichern & verbinden': 'Save & connect',
  'API-Key für die lokale Schnittstelle (ursprünglicher Klartext)': 'Local API key (original plain text)',
  'Optionalen API-Key eingeben': 'Enter an optional API key',
  'Ein leer gelassenes Feld behält den gespeicherten Key bei.': 'Leave this field empty to keep the saved key.',
  'Gespeicherten API-Key entfernen': 'Remove the saved API key',
  'Gespeicherte Einstellung wird geladen …': 'Loading saved settings …',
  'LOKAL AUFGEZEICHNET': 'RECORDED LOCALLY',
  'Deine Messwerte im Verlauf': 'Your readings over time',
  'Zeitraum': 'Time range',
  'Letzte Stunde': 'Last hour',
  'Letzte 6 Stunden': 'Last 6 hours',
  'Letzte 24 Stunden': 'Last 24 hours',
  'Letzte 7 Tage': 'Last 7 days',
  'Verlauf wird geladen …': 'Loading history …',
  'Leistung': 'Power',
  'Batterie-Ladezustand': 'Battery state of charge',
  'Die Aufzeichnung läuft alle 10 Sekunden im Backend, auch ohne geöffneten Browser. Zeiten: Europe/Berlin. Fehlende Zeiträume bleiben leer.': 'The backend records every 10 seconds, even with the browser closed. Time zone: Europe/Berlin. Missing periods are left blank.',
  'Aktuelle Werte': 'Current readings',
  'PV-Leistung': 'PV power',
  'Direkt vom Gateway': 'Directly from the gateway',
  'Verbrauch': 'Consumption',
  'Batterie': 'Battery',
  'Ladezustand': 'State of charge',
  'Verbundene Geräte': 'Connected devices',
  'Aus /v2/devices': 'From /v2/devices',
  'Aktuelle Messwerte': 'Current measurements',
  'Warte auf Daten': 'Waiting for data',
  'Die Antwort wird geladen.': 'Loading response.',
  'Feld': 'Field',
  'Wert': 'Value',
  'Einordnung': 'Description',
  'Vollständige JSON-Antwort': 'Full JSON response',
  'unverändert vom Gateway': 'unchanged from the gateway',
  'Wird geladen …': 'Loading …',
  'GERÄTE IM NETZWERK': 'DEVICES ON THE NETWORK',
  'Aufzeichnungsstatus wird geladen …': 'Loading recording status …',
  'Quelle:': 'Source:',
  '· Nur lokale Schnittstelle · Speicherung im Ordner data/ · Keine Cloud-Anbindung': '· Local interface only · Saved in data/ · No cloud connection',
  'API-Key gespeichert · leer lassen zum Beibehalten': 'API key saved · leave empty to keep it',
  'Ein API-Key ist gespeichert. Leer lassen zum Beibehalten.': 'An API key is saved. Leave empty to keep it.',
  'Kein API-Key gespeichert.': 'No API key saved.',
  'Den ursprünglich im Portal eingegebenen Key verwenden, nicht den daraus erzeugten Wert.': 'Use the original key entered in the portal, not the value generated from it.',
  'Einstellungen konnten nicht geladen werden.': 'Could not load settings.',
  'Die Adresse wird lokal gespeichert und nach einem Neustart weiterverwendet.': 'The address is saved locally and retained after a restart.',
  '{error} Bitte die Seite neu laden.': '{error} Please reload the page.',
  'Bitte eine gültige IPv4-Adresse eingeben, z. B. 192.168.4.119.': 'Enter a valid IPv4 address, e.g. 192.168.4.119.',
  'Adresse wird gespeichert …': 'Saving address …',
  'Speichern fehlgeschlagen.': 'Could not save settings.',
  'Neue Verbindung wird aufgebaut …': 'Establishing a new connection …',
  'Warte auf Daten der gespeicherten Adresse …': 'Waiting for data from the saved address …',
  'Verbindung wird aufgebaut': 'Connecting',
  'Verbindungseinstellungen gespeichert. Die Verbindung wird neu aufgebaut; Live-Daten folgen beim nächsten Abruf.': 'Connection settings saved. Reconnecting; live data will follow on the next poll.',
  'PV-Leistung · W': 'PV power · W',
  'Verbrauchsleistung · W': 'Consumption power · W',
  'Batterie-Ladezustand · %': 'Battery state of charge · %',
  'Batterie-Ladeleistung · W': 'Battery charging power · W',
  'Batterie-Entladeleistung · W': 'Battery discharging power · W',
  'Zeitstempel des Gateways': 'Gateway timestamp',
  'Firmware-Version': 'Firmware version',
  'Datenformat-Version': 'Data format version',
  'Messintervall': 'Measurement interval',
  'Messwerte je Gerät; Zuordnung über _id ↔ deviceId': 'Readings per device; matched using _id ↔ deviceId',
  'Laden {charge} · Entladen {discharge}': 'Charging {charge} · Discharging {discharge}',
  '{count} Einträge – siehe JSON': '{count} entries – see JSON',
  'Originalfeld · siehe JSON': 'Original field · see JSON',
  'Unbenannt': 'Unnamed',
  'Leistung: {value}': 'Power: {value}',
  'Signal: {value}': 'Signal: {value}',
  'connected': 'Connected',
  'disconnected': 'Disconnected',
  'offline': 'Offline',
  'online': 'Online',
  'carcharging': 'EV charger',
  'smartmeter': 'Smart meter',
  'battery': 'Battery',
  'inverter': 'Inverter',
  'Das Gateway meldet keine Geräte.': 'The gateway reports no devices.',
  'Unerwartetes Messdatenformat.': 'Unexpected measurement format.',
  'Unerwartetes Geräteformat.': 'Unexpected device format.',
  '{url} · Abgerufen: {received}{measurement}': '{url} · Retrieved: {received}{measurement}',
  ' · Messzeit: {time}': ' · Measurement time: {time}',
  'HTTP 200 · Messwert älter als 1 Min.': 'HTTP 200 · Reading older than 1 min.',
  'Abruf fehlgeschlagen': 'Request failed',
  '{error} Bereits angezeigte Werte stammen vom letzten erfolgreichen Abruf.': '{error} Displayed readings are from the last successful request.',
  'Aktuell nicht erreichbar': 'Currently unavailable',
  'Daten werden abgerufen …': 'Fetching data …',
  'Aufzeichnung gestört: {error}': 'Recording error: {error}',
  'Aufzeichnung aktiv · alle {seconds} Sekunden · zuletzt gespeichert: {time}': 'Recording active · every {seconds} seconds · last saved: {time}',
  'Aufzeichnung gestartet · warte auf ersten Messwert …': 'Recording started · waiting for the first reading …',
  'Aufzeichnungsstatus derzeit nicht erreichbar.': 'Recording status is currently unavailable.',
  'Aktualisiert um {time}': 'Updated at {time}',
  'Verbindung teilweise oder vollständig unterbrochen': 'Connection partly or fully interrupted',
  'PV-Erzeugung': 'PV generation',
  'Batterie laden': 'Battery charging',
  'Batterie entladen': 'Battery discharging',
  ' · Ladezustand': ' · State of charge',
  'Wähle oben mindestens eine Messreihe aus.': 'Select at least one series above.',
  'Noch keine Messwerte in diesem Zeitraum. Neue Daten erscheinen automatisch.': 'No readings in this period yet. New data will appear automatically.',
  'Für diese Auswahl liegen keine Werte vor.': 'No readings available for this selection.',
  '{metric} über die Zeit. Einzelwerte über den Schieberegler unter dem Diagramm abrufen.': '{metric} over time. Use the slider below the chart to inspect individual readings.',
  'Messzeitpunkt im Diagramm': 'Measurement time in the chart',
  'Verlauf nicht erreichbar': 'History unavailable',
  '{count} gespeicherte Messpunkte · {from} bis {to} · {average}{skipped}': '{count} recorded readings · {from} to {to} · {average}{skipped}',
  '10-Sekunden-Mittelwerte': '10-second averages',
  'Mittelwerte je {minutes} Minute(n)': 'Averages over {minutes} minute(s)',
  ' · {count} unlesbare Speicherzeilen übersprungen': ' · {count} unreadable stored lines skipped',
  'In diesem Zeitraum wurden noch keine Daten aufgezeichnet.': 'No data has been recorded in this period yet.',
  'Verlauf konnte nicht aktualisiert werden: {error}. Bereits angezeigte Kurven stammen vom letzten Abruf.': 'Could not refresh history: {error}. Displayed charts are from the last request.',
  'API-Key muss aus maximal 512 sichtbaren ASCII-Zeichen bestehen.': 'The API key must contain at most 512 visible ASCII characters.',
  'Nur Zugriffe von dieser lokalen Website sind erlaubt.': 'Only requests from this local website are allowed.',
  'JSON erwartet.': 'Expected JSON.',
  'Einstellungen werden gerade gespeichert. Bitte erneut versuchen.': 'Settings are being saved. Please try again.',
  'Anfrage zu groß.': 'Request too large.',
  'Ungültiges JSON.': 'Invalid JSON.',
  'Einstellung konnte nicht gespeichert werden. Die bisherige Adresse bleibt aktiv.': 'Could not save settings. The previous address remains active.',
  'hours muss zwischen 1 und 168 liegen.': 'hours must be between 1 and 168.',
  'Verlauf konnte nicht gelesen werden.': 'Could not read history.',
  'Der erste Gateway-Abruf läuft noch.': 'The first gateway request is still in progress.',
  'HTTPS-Zertifikat des Energy Managers kann nicht verifiziert werden': 'The Energy Manager HTTPS certificate could not be verified',
  'HTTPS-Abruf fehlgeschlagen:': 'HTTPS request failed:',
  'Zugriff verweigert. API-Key und Freigabe der lokalen API prüfen.': 'Access denied. Check the API key and local API access settings.',
  'Ungültiges Messdatenformat': 'Invalid measurement format',
  'Ungültiges Geräteformat': 'Invalid device format',
  'Das HTTPS-Gerätezertifikat stimmt nicht mit dem hinterlegten Zertifikat überein.': 'The device HTTPS certificate does not match the saved certificate.',
  'Gateway-Antwort ist zu groß.': 'The gateway response is too large.',
};
const germanValues = { connected: 'Verbunden', disconnected: 'Getrennt', online: 'Online', offline: 'Offline', carcharging: 'Wallbox', smartmeter: 'Smartmeter', battery: 'Batterie', inverter: 'Wechselrichter' };
let language = 'de';
try { if (localStorage.getItem('varta-language') === 'en') language = 'en'; } catch {}
export const locale = () => language === 'en' ? 'en-GB' : 'de-DE';
export function t(source, parameters = {}) {
  let text = language === 'en' ? (translations[source] ?? source) : (germanValues[source] ?? source);
  return text.replace(/\{(\w+)\}/g, (match, key) => parameters[key] ?? match);
}
export function errorText(value) {
  let text = String(value);
  if (language === 'en') {
    for (const [source, target] of Object.entries(translations).filter(([key]) => !key.includes('{')).sort((a, b) => b[0].length - a[0].length)) text = text.replaceAll(source, target);
  } else {
    text = text.replaceAll('Failed to fetch', 'Netzwerkabruf fehlgeschlagen').replaceAll('fetch failed', 'Netzwerkabruf fehlgeschlagen').replaceAll('The operation was aborted due to timeout', 'Zeitüberschreitung beim Abruf');
  }
  return text;
}
const dynamic = new Map();
export function message(id, source, parameters = {}) {
  dynamic.set(id, { source, parameters });
  const node = document.getElementById(id);
  if (node) node.textContent = errorText(t(source, parameters));
}
export const forgetMessage = id => dynamic.delete(id);
let staticText = [], attributes = [];
function applyLanguage() {
  document.documentElement.lang = language;
  for (const [node, original] of staticText) if (node.isConnected) node.nodeValue = original.replace(original.trim(), t(original.trim()));
  for (const [node, name, original] of attributes) node.setAttribute(name, t(original));
  for (const [id, { source, parameters }] of dynamic) message(id, source, parameters);
  document.getElementById('language').value = language;
}
export function setLanguage(value) {
  if (!['de', 'en'].includes(value)) return;
  language = value;
  try { localStorage.setItem('varta-language', language); } catch {}
  applyLanguage();
  document.dispatchEvent(new CustomEvent('languagechange'));
}
export function initTranslations() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.trim() && !node.parentElement.closest('script,style,code')) staticText.push([node, node.nodeValue]);
  }
  for (const node of document.querySelectorAll('[aria-label],[placeholder]')) for (const name of ['aria-label', 'placeholder']) if (node.hasAttribute(name)) attributes.push([node, name, node.getAttribute(name)]);
  applyLanguage();
  document.getElementById('language').addEventListener('change', event => setLanguage(event.target.value));
}
