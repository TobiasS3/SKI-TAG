// Ebenen auf der Karte: Pisten, Lifte (mit fahrenden Kabinen), Hütten, Gipfel, Route, eigene Spur.
//
// Pisten, Lifte und Kabinen werden auf Canvas gezeichnet (eine Leinwand statt tausender SVG-Linien –
// am Handy viel flüssiger). Ausblenden („nur Route zeigen“) geht deshalb über die Ebenen (Panes),
// Marker (Hütten, Schilder) haben die CSS-Klasse „sk“ – siehe css/components/map.css.

import { hutMarker, parkingMarker, pisteDisc, goalMarker } from './markers.js?v=8';
import { lineLength, pointAlong, distance } from './geo.js';
import { reducedMotion } from '../utils/dom.js';
import { iconHTML, liftIcon } from '../components/icons.js';

const PISTE_COLOR = {
  easy: '#1f66d1',
  intermediate: '#d7263d',
  advanced: '#15191e',
  expert: '#15191e',
  freeride: '#f08a24',
};

/**
 * Pisten, Lifte und Hütten zeichnen.
 * handlers: { onHut(hut), onLift(lift, edge), onPiste(piste, edge) }
 */
export function drawSkimap(map, skimap, handlers = {}) {
  map.createPane('pistes').style.zIndex = 410;
  map.createPane('lifts').style.zIndex = 420;
  map.createPane('cabins').style.zIndex = 425;
  map.createPane('route').style.zIndex = 430;
  map.createPane('track').style.zIndex = 435;
  // Eine Leinwand für Pisten UND Lifte (mehrere übereinander würden sich die Klicks wegnehmen).
  // Reihenfolge = Zeichenreihenfolge: erst Pisten, dann Lifte obendrauf.
  const pisteCanvas = L.canvas({ pane: 'pistes', padding: 0.4, tolerance: 6 });
  const liftCanvas = pisteCanvas;

  const pistes = L.layerGroup().addTo(map);
  const labels = L.layerGroup().addTo(map);

  // Pisten: erst alle weißen Ränder, dann alle Farben – sonst schneidet ein Rand die Nachbarpiste ab.
  // refined: Linien geglättet, und wo Rot auf Blau trifft, läuft die Farbe sanft ineinander.
  const refined = !!handlers.refined;
  const longest = new Map(); // Pistennummer → längstes Stück (für das Schild)
  const pisteEdges = skimap.edges.filter((e) => e.kind === 'piste');
  const lineOf = new Map(pisteEdges.map((e) => [e, refined ? smoothLine(e.coords) : e.coords]));
  for (const e of pisteEdges) {
    L.polyline(lineOf.get(e), { renderer: pisteCanvas, color: '#fff', weight: refined ? 6 : 7.5, opacity: 0.9, interactive: false, lineJoin: 'round' }).addTo(pistes);
  }
  const colorsAt = new Map(); // Knoten → Farben der Pisten, die dort enden
  for (const e of pisteEdges) {
    const color = PISTE_COLOR[skimap.pistes[e.ref].diff];
    for (const n of [e.a, e.b]) {
      if (!colorsAt.has(n)) colorsAt.set(n, new Set());
      colorsAt.get(n).add(color);
    }
  }
  for (const e of pisteEdges) {
    const p = skimap.pistes[e.ref];
    const color = PISTE_COLOR[p.diff];
    const coords = lineOf.get(e);
    const line = L.polyline(coords, {
      renderer: pisteCanvas,
      color,
      weight: refined ? 3.2 : 4,
      opacity: 1,
      lineJoin: 'round',
      dashArray: p.diff === 'freeride' ? '6 6' : null,
    }).addTo(pistes);
    line.on('click', () => handlers.onPiste?.(p, e));
    if (p.ref && (!longest.has(p.ref) || longest.get(p.ref).len < e.len)) longest.set(p.ref, e);
    if (refined && p.diff !== 'freeride') {
      fadeEnd(coords, color, colorsAt.get(e.a), pistes, pisteCanvas);
      fadeEnd([...coords].reverse(), color, colorsAt.get(e.b), pistes, pisteCanvas);
    }
  }
  for (const [, e] of longest) {
    const mid = pointAlong(e.coords, e.len / 2);
    pisteDisc(mid, skimap.pistes[e.ref]).addTo(labels);
  }

  // Lifte: dunkle Linie + Stationen
  const lifts = L.layerGroup().addTo(map);
  // Je Lift nur eine Kante – Bahnen in beide Richtungen (3S) haben zwei
  const seen = new Set();
  const liftEdges = skimap.edges.filter((e) => e.kind === 'lift' && !seen.has(e.ref) && seen.add(e.ref));
  for (const e of liftEdges) {
    const lift = skimap.lifts[e.ref];
    // Seil: dunkle Linie, darauf feine helle Striche
    const line = L.polyline(lift.coords, {
      renderer: liftCanvas, color: '#0b1226', weight: 3, opacity: 0.95,
    }).addTo(lifts);
    if (!refined) {
      L.polyline(lift.coords, {
        renderer: liftCanvas, color: '#ffffff', weight: 1, opacity: 0.8, dashArray: '1 7', interactive: false,
      }).addTo(lifts);
    }
    line.bindTooltip(lift.name, { sticky: true, className: 'map-tip' });
    line.on('click', () => handlers.onLift?.(lift, e));
    const icon = liftIcon(lift.type);
    if (refined) {
      liftChip(lift, e, icon, handlers).addTo(lifts);
      continue;
    }
    const bottom = skimap.ele[e.a] <= skimap.ele[e.b] ? e.a : e.b;
    if ((icon === 'gondola' && skimap.ele[bottom] < VALLEY_ELE) || VALLEY_EXTRA[lift.name]) {
      // Talbahn: großes Schild an der Talstation, schon in der Übersicht sichtbar
      const prio = VALLEY_ORDER.indexOf(lift.name);
      L.marker(skimap.nodes[bottom], {
        icon: L.divIcon({
          className: 'sk mk-valley',
          html: `<span data-prio="${prio < 0 ? 99 : prio}">${iconHTML(icon)}${codeHTML(lift)}<b>${escapeHTML(VALLEY_EXTRA[lift.name] || shortName(lift.name))}</b></span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 500,
      }).addTo(lifts);
    } else {
      // Name in der Mitte der Linie – große Bahnen schon ab mittlerem Zoom, kleine erst näher
      const main = !SMALL_LIFTS.has(lift.type);
      L.marker(pointAlong(lift.coords, lineLength(lift.coords) / 2), {
        icon: L.divIcon({
          className: `sk mk-lift${main ? ' is-main' : ''}`,
          html: `<span>${iconHTML(icon)}${codeHTML(lift)}${escapeHTML(lift.name)}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(lifts);
    }
    // Stationen: unten rund, oben eckig (wie Tal- und Bergstation)
    L.circleMarker(lift.coords[0], {
      renderer: liftCanvas, radius: 4, color: '#0e0e10', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false,
    }).addTo(lifts);
    L.marker(lift.coords[lift.coords.length - 1], {
      icon: L.divIcon({ className: 'sk mk-station', html: `<span></span><b>${escapeHTML(lift.name)}</b>`, iconSize: [12, 12], iconAnchor: [6, 6] }),
      interactive: false,
      keyboard: false,
    }).addTo(lifts);
  }
  const stopCabins = animateCabins(map, skimap, liftEdges, handlers.liftRuns);

  // Gipfel und Bergstationen mit Höhe – geben der Karte Orientierung
  const peaks = L.layerGroup().addTo(map);
  for (const peak of findPeaks(skimap)) {
    L.marker(peak.pos, {
      icon: L.divIcon({
        className: `sk mk-peak${peak.major ? ' is-major' : ''}`,
        html: `<span><b>${escapeHTML(peak.name)}</b><small>${peak.ele} m</small></span>`,
        iconSize: [0, 0],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(peaks);
  }

  // Orte zur Orientierung (die vorgemalte Karte hat keine Beschriftung)
  for (const [name, pos] of handlers.towns || []) {
    L.marker(pos, {
      icon: L.divIcon({ className: 'mk-town', html: `<span>${escapeHTML(name)}</span>`, iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(peaks);
  }

  // Hütten
  const huts = L.layerGroup().addTo(map);
  for (const hut of skimap.huts) {
    hutMarker(hut).on('click', () => handlers.onHut?.(hut)).addTo(huts);
  }

  // Parkplätze an den Talstationen
  for (const p of skimap.parking || []) {
    parkingMarker(p).on('click', () => handlers.onParking?.(p)).addTo(huts);
  }

  // Namen, die sich überdecken, ausblenden (erst ab Zoom 15 sind Namen sichtbar)
  let frame = 0;
  const tidy = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => declutter(map));
  };
  map.on('zoomend moveend', tidy);
  tidy();

  return {
    destroy() {
      stopCabins();
      map.off('zoomend moveend', tidy);
      cancelAnimationFrame(frame);
    },
  };
}

/** Weicher Verlauf (Chaikin): aus eckigen Kartenpunkten wird eine fließende Linie, Enden bleiben fest */
function smoothLine(coords) {
  if (coords.length < 3) return coords;
  let pts = coords;
  for (let round = 0; round < 2; round++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

const mixColor = (a, b, f) => {
  const ch = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * f)).join(',')})`;
};

/** Trifft die Piste am Anfang von coords auf eine andersfarbige: auf den letzten Metern zur Mitte hin mischen */
function fadeEnd(coords, color, here, layer, renderer) {
  const other = [...(here || [])].find((c) => c !== color);
  const len = lineLength(coords);
  if (!other || len < 40) return;
  const reach = Math.min(70, len / 2);
  const STEPS = 4;
  for (let i = 0; i < STEPS; i++) {
    const from = pointAlong(coords, (reach * i) / STEPS);
    const to = pointAlong(coords, (reach * (i + 1)) / STEPS);
    L.polyline([from, to], {
      renderer, color: mixColor(color, other, 0.5 * (1 - (i + 0.5) / STEPS)), weight: 3.2, opacity: 1, interactive: false,
    }).addTo(layer);
  }
}

/** Lift-Schild: von weitem nur der Code (B3). Antippen zeigt den Namen und öffnet direkt den Lift mit Bild. */
function liftChip(lift, e, icon, handlers) {
  const main = !SMALL_LIFTS.has(lift.type);
  const marker = L.marker(pointAlong(lift.coords, lineLength(lift.coords) / 2), {
    icon: L.divIcon({
      className: `sk mk-chip${main ? ' is-main' : ''}`,
      html: `<span>${lift.code ? `<i>${escapeHTML(lift.code)}</i>` : iconHTML(icon)}<b>${escapeHTML(lift.name)}</b></span>`,
      iconSize: [0, 0],
    }),
    title: lift.name,
    zIndexOffset: main ? 300 : 200,
  });
  marker.on('click', () => {
    const el = marker.getElement();
    el?.closest('.leaflet-container')?.querySelectorAll('.mk-chip.is-open').forEach((x) => x.classList.remove('is-open'));
    el?.classList.add('is-open');
    marker.setZIndexOffset(800);
    handlers.onLift?.(lift, e);
  });
  return marker;
}

const SMALL_LIFTS = new Set(['t-bar', 'j-bar', 'platter', 'rope_tow', 'magic_carpet']);
const VALLEY_ELE = 1000; // Talstation tiefer als das = Talbahn (Hahnenkammbahn, Fleckalmbahn …)
// Wenn sich Talbahn-Schilder überdecken, gewinnt die weiter vorne
const VALLEY_ORDER = ['Hahnenkammbahn', 'Fleckalmbahn', 'Hornbahn I', 'Resterhöhe', 'Panoramabahn Kitzbüheler Alpen I', 'Pengelstein I', 'Maierlbahn', 'Wagstättbahn', 'Gaisberg'];
// Einstiege von der Straße, die keine Talgondel sind – mit eigenem Schild-Text
const VALLEY_EXTRA = { 'Resterhöhe': 'Resterhöhe · Pass Thurn', 'Gaisberg': 'Gaisberg' };
/** Offizieller KitzSki-Code wie auf dem Pistenplan („A1“), falls bekannt */
const codeHTML = (lift) => (lift.code ? `<i class="mk-code">${escapeHTML(lift.code)}</i>` : '');

/** Lange Namen fürs Schild kürzen: „Panoramabahn Kitzbüheler Alpen I“ → „Panoramabahn“ */
const shortName = (name) => name.replace(/ Kitzbüheler Alpen I+$/, '');

/**
 * Überlappende Namen ausblenden: Lifte zuerst, dann Hütten. Wer zuerst Platz hat, bleibt.
 * Symbole (Hütten-Haus, eigener Punkt, Gruppe, Gipfel) zählen als belegt.
 * Ausgeblendete Elemente (display: none) haben keine Größe und zählen nicht.
 */
function declutter(map) {
  const root = map.getContainer();
  const hit = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;

  // 1. Talbahnen untereinander (wichtigste zuerst), dann Gipfel, die von Talbahnen verdeckt würden
  // Knöpfe über der Karte (Kartenfilter, SOS …) gelten als belegt – Schilder weichen ihnen aus
  const placed = [...document.querySelectorAll('.map-controls button, .sos-btn')].map((el) => el.getBoundingClientRect());
  // Große Gipfel (Hahnenkamm, Pengelstein, Resterhöhe, Horn …) zuerst – sonst verdeckt z. B. das
  // Schild „Hahnenkammbahn“ den Hahnenkamm, während Pengelstein schon zu sehen ist
  root.querySelectorAll('.mk-peak.is-major span').forEach((el) => {
    el.classList.remove('is-hidden');
    const r = el.getBoundingClientRect();
    if (placed.some((p) => hit(r, p))) el.classList.add('is-hidden');
    else placed.push(r);
  });
  const valleys = [...root.querySelectorAll('.mk-valley span')].sort((a, b) => a.dataset.prio - b.dataset.prio);
  const SIDES = ['b', 't', 'r', 'l']; // unter, über, rechts, links von der Talstation
  // Schild muss ganz in der Karte liegen – sonst hängt es halb aus dem Bild
  const box = root.getBoundingClientRect();
  const inside = (r) => r.left >= box.left + 4 && r.right <= box.right - 4 && r.top >= box.top && r.bottom <= box.bottom;
  valleys.forEach((el) => {
    el.classList.remove('is-hidden');
    const free = SIDES.find((side) => {
      el.dataset.side = side;
      const r = el.getBoundingClientRect();
      return inside(r) && !placed.some((p) => hit(r, p));
    });
    if (free) placed.push(el.getBoundingClientRect());
    else {
      el.dataset.side = 'b';
      el.classList.add('is-hidden');
    }
  });
  root.querySelectorAll('.mk-peak:not(.is-major) span').forEach((el) => {
    el.classList.remove('is-hidden');
    if (placed.some((p) => hit(el.getBoundingClientRect(), p))) el.classList.add('is-hidden');
  });

  // Lift-Schilder: wichtige Bahnen zuerst, was sich überdeckt, verschwindet. Geöffnete bleiben immer.
  const chips = [...root.querySelectorAll('.mk-chip')].sort((a, b) => Number(b.classList.contains('is-open')) - Number(a.classList.contains('is-open')) || Number(b.classList.contains('is-main')) - Number(a.classList.contains('is-main')));
  const chipTaken = [...root.querySelectorAll('.mk-peak span:not(.is-hidden)')].map((el) => el.getBoundingClientRect());
  chips.forEach((c) => {
    c.classList.remove('is-hidden');
    const r = c.firstElementChild.getBoundingClientRect();
    if (!c.classList.contains('is-open') && chipTaken.some((t) => hit(r, t))) c.classList.add('is-hidden');
    else chipTaken.push(r);
  });

  const hutLabels = map.getZoom() >= 15 ? ', .mk-hut .mk-label' : '';
  const labels = [...root.querySelectorAll(`.mk-lift.is-main span, .mk-lift:not(.is-main):not(.is-route) span${hutLabels}`)];
  // 2. Lift- und Hüttennamen: sichtbare Talbahnen, Gipfel und Symbole zählen als belegt
  labels.forEach((el) => el.classList.remove('is-hidden'));
  const view = root.getBoundingClientRect();
  const taken = [...root.querySelectorAll('.mk-hut-badge, .mk-me, .mk-friend, .mk-peak span:not(.is-hidden), .mk-valley span:not(.is-hidden)')].map((el) => el.getBoundingClientRect());
  for (const el of labels) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right < view.left || r.left > view.right || r.bottom < view.top || r.top > view.bottom) continue;
    if (taken.some((t) => hit(r, t))) el.classList.add('is-hidden');
    else taken.push(r);
  }
}

/**
 * Kabinen fahren auf den Liftlinien – man sieht sofort: das ist ein Lift, und er läuft.
 * Hoch auf der einen Seite des Seils, runter auf der anderen. Gesperrte Lifte stehen still.
 * Eigene Leinwand in der Ebene „cabins“, nur was im Bild ist, ~25 Bilder/s.
 */
const samePoint = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 0.002;

function animateCabins(map, skimap, liftEdges, liftRuns) {
  const cabins = [];
  for (const e of liftEdges) {
    const lift = skimap.lifts[e.ref];
    if (lift.type === 'magic_carpet' || lift.type === 'rope_tow') continue;
    const len = lineLength(lift.coords);
    const count = Math.max(3, Math.min(10, Math.round(len / 260)));
    const speed = { cable_car: 15, gondola: 13, chair_lift: 10, mixed_lift: 10 }[lift.type] || 8;
    const bounds = L.latLngBounds(lift.coords);
    lift.upward = skimap.ele[e.a] <= skimap.ele[e.b] === samePoint(lift.coords[0], skimap.nodes[e.a]);
    for (let i = 0; i < count; i++) {
      cabins.push({ lift, coords: lift.coords, len, offset: (i / count) * len, speed, bounds, i });
    }
  }

  const pane = map.getPane('cabins');
  const canvas = L.DomUtil.create('canvas', 'cabins-canvas', pane);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  let frame = 0;
  let last = 0;
  let moving = false;
  let stopped = new Set();
  let checked = 0;
  const start = performance.now();

  function place() {
    const size = map.getSize();
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
  }

  // Eine Kabine für alle Lifte: einheitlich, weiß mit dunklem Rand
  function cabin(x, y, zoom) {
    const k = zoom >= 15 ? 1.2 : zoom >= 14 ? 1 : zoom >= 13 ? 0.85 : 0.7;
    ctx.beginPath();
    ctx.roundRect(x - 4 * k, y - 4 * k, 8 * k, 8 * k, 2.4 * k);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#0b1226';
    ctx.stroke();
  }

  function draw(now) {
    if (now - checked > 5000) {
      checked = now;
      stopped = new Set(skimap.lifts.filter((l) => liftRuns && !liftRuns(l)));
    }
    const s = (now - start) / 1000;
    const zoom = map.getZoom();
    const stride = zoom < 13 ? 4 : zoom < 14 ? 2 : 1;
    const view = map.getBounds().pad(0.05);
    const mpp = (40075016 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (256 * 2 ** zoom);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of cabins) {
      if (c.i % stride || stopped.has(c.lift) || !view.intersects(c.bounds)) continue;
      // Alle Kabinen fahren nur bergauf: am tieferen Ende der Linie beginnen
      const run = (c.offset + s * c.speed * mpp) % c.len;
      const pt = map.latLngToContainerPoint(pointAlong(c.coords, c.lift.upward === false ? c.len - run : run));
      cabin(pt.x, pt.y, zoom);
    }
  }

  const tick = (now) => {
    frame = requestAnimationFrame(tick);
    if (moving || document.hidden || now - last < 66) return; // ~15 Bilder/s, schont den Akku
    last = now;
    draw(now);
  };

  const visible = () => map.getZoom() >= 12;
  const onStart = () => { moving = true; };
  const onZoomStart = () => { moving = true; canvas.style.visibility = 'hidden'; };
  const onEnd = () => {
    moving = false;
    place();
    canvas.style.visibility = visible() ? '' : 'hidden';
    cancelAnimationFrame(frame);
    if (!visible()) return;
    draw(performance.now());
    if (!reducedMotion()) frame = requestAnimationFrame(tick);
  };
  map.on('movestart', onStart);
  map.on('zoomstart', onZoomStart);
  map.on('moveend zoomend resize', onEnd);
  onEnd();

  return () => {
    cancelAnimationFrame(frame);
    map.off('movestart', onStart);
    map.off('zoomstart', onZoomStart);
    map.off('moveend zoomend resize', onEnd);
    canvas.remove();
  };
}

// Bekannte Punkte: Bergstation eines Lifts → Name am Berg. major = groß beschriften.
const PEAKS = [
  { lift: 'Hahnenkammbahn', name: 'Hahnenkamm', major: true },
  { lift: 'Pengelstein II', name: 'Pengelstein', major: true },
  { lift: 'Steinbergkogel', name: 'Steinbergkogel' },
  { lift: 'Ehrenbachhöhe', name: 'Ehrenbachhöhe' },
  { lift: 'Zweitausender', name: 'Zweitausender' },
  { lift: 'Resterhöhe', name: 'Resterhöhe', major: true },
  { lift: 'Horngipfelbahn', name: 'Kitzbüheler Horn', major: true },
  // 3S: Station auf der Jochberger Seite (die tiefere der beiden Bergstationen)
  { lift: '3S Bahn', name: 'Wurzhöhe · 3S', major: true, end: 'low' },
  { lift: 'Bichlalmlift', name: 'Bichlalm' },
  { lift: 'Gaisberg', name: 'Gaisberg' },
];

function findPeaks(skimap) {
  const out = [];
  for (const p of PEAKS) {
    const e = skimap.edges.find((x) => x.kind === 'lift' && skimap.lifts[x.ref].name === p.lift);
    if (!e) continue;
    // Bergstation = das höhere Ende – außer es ist ausdrücklich das tiefere gewünscht (3S)
    const high = skimap.ele[e.b] >= skimap.ele[e.a] ? e.b : e.a;
    const top = p.end === 'low' ? (high === e.b ? e.a : e.b) : high;
    out.push({ ...p, pos: skimap.nodes[top], ele: skimap.ele[top] });
  }
  return out;
}

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Route: kräftige Linie mit schwarzem Rand und laufenden Strichen. Farbe wählt die Ansicht. */
export function drawRoute(map, coords, steps = [], { color = '#ff6a13', flow = '#fff' } = {}) {
  // Schilder liegen in einer eigenen Ebene über der Linie, nicht dahinter
  if (!map.getPane('routeSigns')) map.createPane('routeSigns').style.zIndex = 445;
  const group = L.layerGroup([
    L.polyline(coords, { pane: 'route', color: '#fff', weight: 13, opacity: 1, interactive: false }),
    L.polyline(coords, { pane: 'route', color: '#0e0e10', weight: 9.5, opacity: 0.95, interactive: false }),
    L.polyline(coords, { pane: 'route', color, weight: 6, opacity: 1, interactive: false, className: 'route-core' }),
    L.polyline(coords, { pane: 'route', color: flow, weight: 2, opacity: 0.95, dashArray: '2 14', interactive: false, className: 'route-flow' }),
  ]);
  // Liftstücke der Route sieht man als Lift: dunkel mit weißen Punkten, wie auf der Karte
  for (const step of steps) {
    if (step.kind !== 'lift') continue;
    group.addLayer(L.polyline(step.coords, { pane: 'route', color: '#0e1530', weight: 7, opacity: 1, interactive: false, className: 'route-lift' }));
    group.addLayer(L.polyline(step.coords, { pane: 'route', color: '#fff', weight: 2.5, opacity: 1, dashArray: '1 8', lineCap: 'round', interactive: false }));
  }
  // Schilder auf der Route: Liftname bzw. Pistennummer – nur das, was du wirklich fährst
  for (const step of steps) {
    const sign = routeSign(step);
    if (sign) group.addLayer(sign);
  }
  group.addLayer(goalMarker(coords[coords.length - 1]));
  group.addTo(map);
  // Schilder dürfen sich nicht überdecken: Lifte zuerst, Pisten nur wo Platz ist
  const declutter = () => {
    const signs = [...map.getContainer().querySelectorAll('.mk-rsign')]
      .sort((a, b) => b.classList.contains('is-lift') - a.classList.contains('is-lift'));
    const placed = [];
    for (const el of signs) {
      el.style.visibility = '';
      const r = el.firstElementChild?.getBoundingClientRect();
      if (!r) continue;
      const hit = placed.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 3 && r.bottom > p.top - 3);
      if (hit) el.style.visibility = 'hidden';
      else placed.push(r);
    }
  };
  requestAnimationFrame(declutter);
  map.on('zoomend', declutter);
  group.on('remove', () => map.off('zoomend', declutter));
  return group;
}

function routeSign(step) {
  const pos = pointAlong(step.coords, lineLength(step.coords) / 2);
  const opts = { pane: 'routeSigns', interactive: false, keyboard: false };
  const item = step.item;
  if (step.kind === 'lift') {
    // wie das Liftschild auf der Karte: Kürzel (oder Symbol) + Name
    const lead = item.code ? `<i>${escapeHTML(item.code)}</i>` : iconHTML(liftIcon(item.type));
    return L.marker(pos, {
      ...opts,
      zIndexOffset: 500,
      icon: L.divIcon({ className: 'mk-rsign is-lift', html: `<span>${lead}<b>${escapeHTML(item.name)}</b></span>`, iconSize: [0, 0] }),
    });
  }
  if (!item.ref && !item.name) return null;
  // Piste: farbige Scheibe mit Nummer + Name
  const disc = item.ref ? `<i class="diff-${item.diff}">${escapeHTML(item.ref)}</i>` : `<i class="diff-${item.diff}"></i>`;
  return L.marker(pos, {
    ...opts,
    zIndexOffset: 400,
    icon: L.divIcon({ className: 'mk-rsign is-piste', html: `<span>${disc}${item.name ? `<b>${escapeHTML(item.name)}</b>` : ''}</span>`, iconSize: [0, 0] }),
  });
}

/** Eigene Spur: Orange mit weißem Rand. */
export const TRACK_COLOR = '#ff5b22';

/**
 * Eigene Spur, Stück für Stück: Abfahrten kräftig mit weißem Rand, Liftfahrten fein gepunktet.
 * add({ lat, lng, speed, kind }) hängt einen Punkt an.
 */
export function createTrack(map) {
  const group = L.layerGroup().addTo(map);
  let line = null;
  let casing = null;
  let key = null;
  let lastPos = null;

  return {
    add(p) {
      const pos = [p.lat, p.lng];
      const k = p.kind === 'lift' ? 'lift' : 'run';
      // Großer Sprung (z. B. Chip kurz ohne Empfang): keine gerade Linie quer übers Gebiet
      if (lastPos && distance(lastPos, pos) > 400) {
        lastPos = null;
        line = null;
      }
      if (k !== key || !line) {
        const start = lastPos ? [lastPos, pos] : [pos];
        casing = k === 'run'
          ? L.polyline(start, { pane: 'track', color: '#fff', weight: 7, opacity: 1, lineCap: 'round', interactive: false }).addTo(group)
          : null;
        line = L.polyline(start, {
          pane: 'track',
          color: k === 'lift' ? '#0b1226' : TRACK_COLOR,
          weight: k === 'lift' ? 2.5 : 4,
          opacity: k === 'lift' ? 0.7 : 1,
          dashArray: k === 'lift' ? '1 7' : null,
          lineCap: 'round',
          interactive: false,
        }).addTo(group);
        key = k;
      } else {
        line.addLatLng(pos);
        casing?.addLatLng(pos);
      }
      lastPos = pos;
    },
    clear() {
      group.clearLayers();
      line = null;
      casing = null;
      key = null;
      lastPos = null;
    },
    remove() {
      group.remove();
    },
  };
}
