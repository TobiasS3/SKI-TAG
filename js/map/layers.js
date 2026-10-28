// Ebenen auf der Karte: Pisten, Lifte (mit fahrenden Kabinen), Hütten, Gipfel, Route, eigene Spur.
//
// Pisten, Lifte und Kabinen werden auf Canvas gezeichnet (eine Leinwand statt tausender SVG-Linien –
// am Handy viel flüssiger). Ausblenden („nur Route zeigen“) geht deshalb über die Ebenen (Panes),
// Marker (Hütten, Schilder) haben die CSS-Klasse „sk“ – siehe css/components/map.css.

import { hutMarker, pisteDisc, goalMarker } from './markers.js';
import { lineLength, pointAlong, distance } from './geo.js';
import { reducedMotion } from '../utils/dom.js';
import { iconHTML } from '../components/icons.js';

const PISTE_COLOR = {
  easy: '#1f66d1',
  intermediate: '#d7263d',
  advanced: '#15191e',
  expert: '#15191e',
  freeride: '#f08a24',
};

/**
 * Pisten, Lifte und Hütten zeichnen.
 * handlers: { onHut(hut), onLift(lift, edge), onPiste(piste, edge), hutLogo(hut) → HTML }
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

  // Pisten: weißer Rand unten, Farbe oben – gut lesbar auf jeder Karte
  const longest = new Map(); // Pistennummer → längstes Stück (für das Schild)
  for (const e of skimap.edges) {
    if (e.kind !== 'piste') continue;
    const p = skimap.pistes[e.ref];
    const color = PISTE_COLOR[p.diff];
    L.polyline(e.coords, { renderer: pisteCanvas, color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(pistes);
    const line = L.polyline(e.coords, {
      renderer: pisteCanvas,
      color,
      weight: 3.5,
      opacity: 0.95,
      dashArray: p.diff === 'freeride' ? '6 6' : null,
    }).addTo(pistes);
    line.on('click', () => handlers.onPiste?.(p, e));
    if (p.ref && (!longest.has(p.ref) || longest.get(p.ref).len < e.len)) longest.set(p.ref, e);
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
      renderer: liftCanvas, color: '#0e0e10', weight: 3, opacity: 0.9,
    }).addTo(lifts);
    L.polyline(lift.coords, {
      renderer: liftCanvas, color: '#ffffff', weight: 1, opacity: 0.8, dashArray: '1 7', interactive: false,
    }).addTo(lifts);
    line.bindTooltip(lift.name, { sticky: true, className: 'map-tip' });
    line.on('click', () => handlers.onLift?.(lift, e));
    const icon = lift.type === 'gondola' || lift.type === 'cable_car' ? 'gondola' : 'lift';
    const bottom = skimap.ele[e.a] <= skimap.ele[e.b] ? e.a : e.b;
    if ((icon === 'gondola' && skimap.ele[bottom] < VALLEY_ELE) || VALLEY_EXTRA[lift.name]) {
      // Talbahn: großes Schild an der Talstation, schon in der Übersicht sichtbar
      const prio = VALLEY_ORDER.indexOf(lift.name);
      L.marker(skimap.nodes[bottom], {
        icon: L.divIcon({
          className: 'sk mk-valley',
          html: `<span data-prio="${prio < 0 ? 99 : prio}">${iconHTML(icon)}<b>${escapeHTML(VALLEY_EXTRA[lift.name] || shortName(lift.name))}</b></span>`,
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
          html: `<span>${iconHTML(icon)}${escapeHTML(lift.name)}</span>`,
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
  const stopCabins = animateCabins(map, skimap, liftEdges);

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

  // Hütten
  const huts = L.layerGroup().addTo(map);
  for (const hut of skimap.huts) {
    hutMarker(hut, handlers.hutLogo?.(hut)).on('click', () => handlers.onHut?.(hut)).addTo(huts);
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

const SMALL_LIFTS = new Set(['t-bar', 'j-bar', 'platter', 'rope_tow', 'magic_carpet']);
const VALLEY_ELE = 1000; // Talstation tiefer als das = Talbahn (Hahnenkammbahn, Fleckalmbahn …)
// Wenn sich Talbahn-Schilder überdecken, gewinnt die weiter vorne
const VALLEY_ORDER = ['Hahnenkammbahn', 'Fleckalmbahn', 'Hornbahn I', 'Resterhöhe', 'Panoramabahn Kitzbüheler Alpen I', 'Pengelstein I', 'Maierlbahn', 'Wagstättbahn'];
// Einstiege von der Straße, die keine Talgondel sind – mit eigenem Schild-Text
const VALLEY_EXTRA = { 'Resterhöhe': 'Resterhöhe · Pass Thurn' };
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
  const valleys = [...root.querySelectorAll('.mk-valley span')].sort((a, b) => a.dataset.prio - b.dataset.prio);
  const SIDES = ['b', 't', 'r', 'l']; // unter, über, rechts, links von der Talstation
  valleys.forEach((el) => {
    el.classList.remove('is-hidden');
    const free = SIDES.find((side) => {
      el.dataset.side = side;
      const r = el.getBoundingClientRect();
      return !placed.some((p) => hit(r, p));
    });
    if (free) placed.push(el.getBoundingClientRect());
    else {
      el.dataset.side = 'b';
      el.classList.add('is-hidden');
    }
  });
  root.querySelectorAll('.mk-peak span').forEach((el) => {
    el.classList.remove('is-hidden');
    if (placed.some((p) => hit(el.getBoundingClientRect(), p))) el.classList.add('is-hidden');
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
 * Kabinen fahren die Lifte hoch – nur sichtbar, wenn man nah genug dran ist.
 * Eine eigene Leinwand in der Ebene „cabins“: zeichnet nur Kabinen im Bild, ~12 Bilder/s,
 * und pausiert, solange die Karte gezogen oder gezoomt wird (dann fährt die Leinwand einfach mit).
 */
function animateCabins(map, skimap, liftEdges) {
  const cabins = [];
  for (const e of liftEdges) {
    const lift = skimap.lifts[e.ref];
    if (lift.type === 'magic_carpet' || lift.type === 'rope_tow') continue;
    const len = lineLength(lift.coords);
    const drag = ['t-bar', 'j-bar', 'platter'].includes(lift.type);
    const count = Math.max(2, Math.min(drag ? 8 : 14, Math.round(len / (drag ? 120 : 150))));
    const speed = { cable_car: 10, gondola: 6, chair_lift: 5, mixed_lift: 5 }[lift.type] || 3;
    const color = lift.type === 'gondola' || lift.type === 'cable_car' ? '#ff2d2d' : '#0e0e10';
    const bounds = L.latLngBounds(lift.coords);
    for (let i = 0; i < count; i++) {
      cabins.push({ coords: lift.coords, len, offset: (i / count) * len, speed, r: drag ? 2 : 3.5, color, bounds });
    }
  }

  const pane = map.getPane('cabins');
  const canvas = L.DomUtil.create('canvas', 'cabins-canvas', pane);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let frame = 0;
  let last = 0;
  let moving = false;
  const start = performance.now();

  function place() {
    const size = map.getSize();
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
  }

  function draw(now) {
    const s = (now - start) / 1000;
    const view = map.getBounds().pad(0.05);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    for (const c of cabins) {
      if (!view.intersects(c.bounds)) continue;
      const at = (c.offset + s * c.speed * 3) % c.len; // dreifach schnell, sieht lebendiger aus
      const pos = pointAlong(c.coords, at);
      const pt = map.latLngToContainerPoint(pos);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.stroke();
    }
  }

  const tick = (now) => {
    frame = requestAnimationFrame(tick);
    if (moving || document.hidden || now - last < 80) return; // ~12 Bilder/s
    last = now;
    draw(now);
  };

  const visible = () => map.getZoom() >= 13.5;
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

/** Route: orange Linie mit schwarzem Rand und feinen weißen Strichen. */
export function drawRoute(map, coords, steps = []) {
  const group = L.layerGroup([
    L.polyline(coords, { pane: 'route', color: '#fff', weight: 13, opacity: 1, interactive: false }),
    L.polyline(coords, { pane: 'route', color: '#0e0e10', weight: 9.5, opacity: 0.95, interactive: false }),
    L.polyline(coords, { pane: 'route', color: '#ff6a13', weight: 6, opacity: 1, interactive: false, className: 'route-core' }),
    L.polyline(coords, { pane: 'route', color: '#fff', weight: 2, opacity: 0.95, dashArray: '2 14', interactive: false, className: 'route-flow' }),
  ]);
  // Schilder auf der Route: Liftname bzw. Pistennummer – nur das, was du wirklich fährst
  for (const step of steps) {
    const sign = routeSign(step);
    if (sign) group.addLayer(sign);
  }
  group.addLayer(goalMarker(coords[coords.length - 1]));
  return group.addTo(map);
}

function routeSign(step) {
  const pos = pointAlong(step.coords, lineLength(step.coords) / 2);
  const opts = { pane: 'route', interactive: false, keyboard: false };
  if (step.kind === 'lift') {
    const icon = step.item.type === 'gondola' || step.item.type === 'cable_car' ? 'gondola' : 'lift';
    return L.marker(pos, {
      ...opts,
      icon: L.divIcon({ className: 'mk-lift is-route', html: `<span>${iconHTML(icon)}${escapeHTML(step.item.name)}</span>`, iconSize: [0, 0] }),
    });
  }
  if (!step.item.ref) return null;
  return L.marker(pos, {
    ...opts,
    icon: L.divIcon({
      className: `mk-disc is-route diff-${step.item.diff}`,
      html: `<span>${escapeHTML(step.item.ref)}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
  });
}

/** Farbe nach Tempo (km/h) für die eigene Spur. */
export function speedColor(kmh) {
  if (kmh < 15) return '#9db7ff';
  if (kmh < 30) return '#2f6dff';
  if (kmh < 45) return '#7a5cff';
  if (kmh < 60) return '#ff6a13';
  return '#ff2d2d';
}

/**
 * Eigene Spur, Stück für Stück. Gleiche Farbe = eine Linie (schont den Browser).
 * add({ lat, lng, speed, kind }) hängt einen Punkt an.
 */
export function createTrack(map) {
  const group = L.layerGroup().addTo(map);
  let line = null;
  let key = null;
  let lastPos = null;

  return {
    add(p) {
      const pos = [p.lat, p.lng];
      const k = p.kind === 'lift' ? 'lift' : speedColor(p.speed * 3.6);
      // Großer Sprung (z. B. Chip kurz ohne Empfang): keine gerade Linie quer übers Gebiet
      if (lastPos && distance(lastPos, pos) > 400) {
        lastPos = null;
        line = null;
      }
      if (k !== key || !line) {
        line = L.polyline(lastPos ? [lastPos, pos] : [pos], {
          pane: 'track',
          color: k === 'lift' ? '#4b6072' : k,
          weight: k === 'lift' ? 2.5 : 5,
          opacity: k === 'lift' ? 0.7 : 1,
          dashArray: k === 'lift' ? '1 7' : null,
          lineCap: 'round',
          interactive: false,
        }).addTo(group);
        key = k;
      } else {
        line.addLatLng(pos);
      }
      lastPos = pos;
    },
    clear() {
      group.clearLayers();
      line = null;
      key = null;
      lastPos = null;
    },
    remove() {
      group.remove();
    },
  };
}
