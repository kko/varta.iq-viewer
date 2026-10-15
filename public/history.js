const $ = id => document.getElementById(id);
const selected = new Map();
let requestId = 0;
const timeLabel = (time, long = false) => new Date(time).toLocaleString('de-DE', {
  timeZone: 'Europe/Berlin', ...(long ? { day: '2-digit', month: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', ...(long ? { second: '2-digit' } : {}),
});
const format = value => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value);

function draw(history, unit, target, legendTarget) {
  const series = history.series.filter(item => item.unit === unit);
  const container = $(target);
  const legend = $(legendTarget);
  legend.replaceChildren();
  for (const item of series) {
    if (!selected.has(item.key)) selected.set(item.key, !item.key.startsWith('device:'));
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = selected.get(item.key);
    checkbox.style.accentColor = item.color;
    checkbox.addEventListener('change', () => { selected.set(item.key, checkbox.checked); draw(history, unit, target, legendTarget); });
    const text = document.createElement('span'); text.textContent = item.label; text.style.color = item.color;
    label.append(checkbox, text); legend.append(label);
  }
  const active = series.filter(item => selected.get(item.key));
  const points = history.points;
  if (!points.length || !active.length) {
    container.replaceChildren();
    const empty = document.createElement('p'); empty.className = 'chart-empty';
    empty.textContent = points.length ? 'Wähle oben mindestens eine Messreihe aus.' : 'Noch keine Messwerte in diesem Zeitraum. Neue Daten erscheinen automatisch.';
    container.append(empty); return;
  }
  const width = 1000, height = 270, left = 64, right = 24, top = 20, bottom = 45;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const numbers = points.flatMap(point => active.map(item => point.values[item.key]).filter(Number.isFinite));
  if (!numbers.length) { container.textContent = 'Für diese Auswahl liegen keine Werte vor.'; return; }
  let min = unit === '%' ? 0 : Math.min(0, ...numbers);
  let max = unit === '%' ? 100 : Math.max(1, ...numbers) * 1.12;
  if (min < 0) min *= 1.12;
  const x = time => left + (time - history.from) / (history.to - history.from) * chartWidth;
  const y = value => top + (max - value) / (max - min) * chartHeight;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${unit === '%' ? 'Ladezustand' : 'Leistung'} über die Zeit. Einzelwerte über den Schieberegler unter dem Diagramm abrufen.`);
  function node(tag, attrs, text) {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    svg.append(element); return element;
  }
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    node('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), stroke: '#283346' });
    node('text', { x: left - 10, y: y(value) + 4, 'text-anchor': 'end', fill: '#8e9db2', 'font-size': 12 }, format(value));
  }
  for (let i = 0; i <= 4; i++) {
    const time = history.from + (history.to - history.from) * i / 4;
    node('text', { x: x(time), y: height - 14, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle', fill: '#8e9db2', 'font-size': 12 }, timeLabel(time, Number($('historyRange').value) > 24));
  }
  for (const item of active) {
    let path = '', previousTime = null;
    for (const point of points) {
      const value = point.values[item.key];
      if (!Number.isFinite(value)) { previousTime = null; continue; }
      const connected = previousTime !== null && point.time - previousTime <= Math.max(30000, history.intervalSeconds * 1500);
      path += `${connected ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(value).toFixed(2)} `;
      previousTime = point.time;
    }
    node('path', { d: path, fill: 'none', stroke: item.color, 'stroke-width': 2, 'stroke-linejoin': 'round' });
    // Dots also make isolated samples visible; there is no interpolation across outages.
    for (const point of points) if (Number.isFinite(point.values[item.key])) node('circle', { cx: x(point.time), cy: y(point.values[item.key]), r: points.length < 100 ? 2.5 : 1, fill: item.color });
  }
  const cursor = node('line', { x1: left, x2: left, y1: top, y2: height - bottom, stroke: '#dce5f0', 'stroke-dasharray': '4 4', opacity: .5 });
  const readout = document.createElement('div'); readout.className = 'chart-readout'; readout.setAttribute('aria-live', 'polite');
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(points.length - 1); slider.value = slider.max; slider.className = 'chart-slider'; slider.setAttribute('aria-label', 'Messzeitpunkt im Diagramm');
  function inspect(index) {
    const point = points[index];
    slider.value = String(index); cursor.setAttribute('x1', x(point.time)); cursor.setAttribute('x2', x(point.time));
    slider.setAttribute('aria-valuetext', timeLabel(point.time, true));
    readout.replaceChildren();
    const time = document.createElement('strong'); time.textContent = timeLabel(point.time, true); readout.append(time);
    for (const item of active) {
      const span = document.createElement('span'); span.style.color = item.color;
      span.textContent = `${item.label}: ${Number.isFinite(point.values[item.key]) ? format(point.values[item.key]) + ' ' + unit : '—'}`;
      readout.append(span);
    }
  }
  slider.addEventListener('input', () => inspect(Number(slider.value)));
  svg.addEventListener('pointermove', event => {
    const box = svg.getBoundingClientRect();
    const time = history.from + (((event.clientX - box.left) / box.width * width - left) / chartWidth) * (history.to - history.from);
    let nearest = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].time - time) < Math.abs(points[nearest].time - time)) nearest = i;
    inspect(nearest);
  });
  container.replaceChildren(svg, slider, readout);
  inspect(points.length - 1);
}

export async function refreshHistory() {
  const id = ++requestId;
  const hours = $('historyRange').value;
  try {
    const response = await fetch(`/api/history?hours=${hours}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const history = await response.json();
    if (id !== requestId) return;
    if (!response.ok) throw new Error(history.error || 'Verlauf nicht erreichbar');
    $('historyMeta').textContent = history.sampleCount
      ? `${format(history.sampleCount)} gespeicherte Messpunkte · ${timeLabel(history.firstSample, true)} bis ${timeLabel(history.lastSample, true)} · ${history.intervalSeconds === 10 ? '10-Sekunden-Mittelwerte' : `Mittelwerte je ${history.intervalSeconds / 60} Minute(n)`}${history.skippedLines ? ` · ${history.skippedLines} unlesbare Speicherzeilen übersprungen` : ''}`
      : 'In diesem Zeitraum wurden noch keine Daten aufgezeichnet.';
    draw(history, 'W', 'powerChart', 'powerLegend');
    draw(history, '%', 'socChart', 'socLegend');
  } catch (error) {
    if (id === requestId) $('historyMeta').textContent = `Verlauf konnte nicht aktualisiert werden: ${error.message}. Bereits angezeigte Kurven stammen vom letzten Abruf.`;
  }
}
$('historyRange').addEventListener('change', refreshHistory);
