// Tag beendet: kurze Animation (deine Strecke zeichnet sich, Zahlen zählen hoch),
// danach eine eigene Vollbild-Seite – Karte mit deiner Spur, alle Zahlen, Download.
// Ab jetzt zeigt die App nur noch diese Übersicht (bis zum Abmelden bzw. Mitternacht).

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { number } from '../../js/utils/format.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { createTrack } from '../../js/map/layers.js';
import { goalMarker } from '../../js/map/markers.js';
import { renderSummary } from './day-summary.js';
import { openFilm } from './day-film.js';

const INTRO_MS = 3200;

/**
 * day: aufgezeichneter Tag · skimap: Pistennetz (blass als Hintergrund)
 * onLogout: Abmelden-Knopf · onReset: nur im Test-Modus – Tag löschen und neu anfangen
 */
export function showDayEnd(page, { day, skimap, animate, onLogout, onReset }) {
  page.querySelector('.day-end')?.remove();
  page.classList.add('day-over');
  const root = h('div', { class: 'day-end' });
  page.append(root);

  let map = null;
  if (animate && !reducedMotion()) {
    intro(root, day);
    setTimeout(build, INTRO_MS);
  } else {
    build();
  }

  function build() {
    const date = new Date(day.startedAt || Date.now()).toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const mapEl = h('div', { class: 'map style-winter day-end-mapel' });
    root.replaceChildren(
      h('div', { class: 'day-end-page' },
        h('section', { class: 'day-end-map' },
          mapEl,
          h('header', { class: 'day-end-top' },
            h('img', { src: 'assets/images/logo.svg', alt: '', width: 32, height: 32 }),
            h('span', {}, h('small', {}, date), h('strong', {}, t('dayend.title'))),
            h('button', { class: 'pill', onclick: onLogout }, icon('logout'), h('span', {}, t('top.logout'))))),
        h('section', { class: 'day-end-body' },
          h('button', { class: 'film-cta', onclick: () => openFilm(day, skimap) },
            h('span', { class: 'film-cta-icon' }, icon('play')),
            h('span', {}, h('strong', {}, t('film.cta')), h('small', {}, t('film.ctaHint')))),
          renderSummary(day, {}),
          h('p', { class: 'note day-end-note' }, icon('vibrate'), t('dayend.chipNote')),
          onReset ? h('button', { class: 'btn btn-quiet btn-block day-end-test', onclick: onReset }, icon('today'), t('test.resetDay')) : null)),
    );
    root.classList.add('is-ready');
    requestAnimationFrame(() => {
      map = drawMap(mapEl, day, skimap);
    });
  }

  return {
    destroy() {
      map?.remove();
      root.remove();
      page.classList.remove('day-over');
    },
  };
}

/** Karte nur zum Anschauen: blasses Pistennetz, deine Spur kräftig mit Rand in Tempo-Farben, Start und Ziel. */
function drawMap(el, day, skimap) {
  const map = L.map(el, { zoomControl: false, zoomSnap: 0.25 });
  L.tileLayer(config.tiles.url, {
    maxZoom: config.tiles.maxZoom, attribution: config.tiles.attribution, className: 'map-tiles',
  }).addTo(map);
  map.createPane('pistes').style.zIndex = 410;
  map.createPane('track').style.zIndex = 435;

  // Erst den Ausschnitt setzen – Linien brauchen eine Karte mit Ansicht
  const pts = day.points.map((p) => [p.lat, p.lng]);
  // oben Platz für die Kopfzeile
  map.fitBounds(pts.length ? L.latLngBounds(pts) : L.latLngBounds(skimap.nodes), { paddingTopLeft: [30, 100], paddingBottomRight: [30, 50] });

  // Pisten in ihren Farben, aber zurückhaltend – deine Spur soll herausstechen
  const DIFF = { easy: '#1f66d1', intermediate: '#e0242f', advanced: '#0e0e10', expert: '#0e0e10', freeride: '#f08a24' };
  for (const e of skimap.edges) {
    if (e.kind === 'walk') continue;
    const lift = e.kind === 'lift';
    L.polyline(lift ? [e.coords[0], e.coords[e.coords.length - 1]] : e.coords, {
      pane: 'pistes', color: lift ? '#0e0e10' : DIFF[skimap.pistes[e.ref].diff], weight: lift ? 1.5 : 3,
      opacity: lift ? 0.35 : 0.3, dashArray: lift ? '2 5' : null, interactive: false,
    }).addTo(map);
  }

  // Deine Spur: weißer und schwarzer Rand darunter, damit sie auf jeder Karte heraussticht
  for (const seg of segments(day.points)) {
    const coords = seg.points.map((p) => [p.lat, p.lng]);
    if (seg.lift) {
      L.polyline(coords, { pane: 'track', color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(map);
      L.polyline(coords, { pane: 'track', color: '#0e0e10', weight: 3, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
    } else {
      L.polyline(coords, { pane: 'track', color: '#fff', weight: 14, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      L.polyline(coords, { pane: 'track', color: '#0e0e10', weight: 10, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    }
  }
  const track = createTrack(map);
  day.points.forEach((p) => track.add(p));
  if (pts.length) {
    L.circleMarker(pts[0], { pane: 'track', radius: 7, color: '#fff', weight: 3, fillColor: '#16b46b', fillOpacity: 1 }).addTo(map);
    goalMarker(pts[pts.length - 1]).addTo(map);
  }
  setTimeout(() => map.invalidateSize(), 60);
  return map;
}

/** Spur in Stücke teilen: Liftfahrt / Ski (große Sprünge ohne Empfang trennen auch) */
function segments(points) {
  const out = [];
  let cur = null;
  let last = null;
  for (const p of points) {
    const lift = p.kind === 'lift';
    const jump = last && Math.abs(p.lat - last.lat) + Math.abs(p.lng - last.lng) > 0.005;
    if (!cur || cur.lift !== lift || jump) {
      cur = { lift, points: last && !jump ? [last] : [] };
      out.push(cur);
    }
    cur.points.push(p);
    last = p;
  }
  return out;
}

// --- Animation --------------------------------------------------------------------------

function intro(root, day) {
  const km = h('span', { class: 'num' }, '0');
  const vert = h('span', { class: 'num' }, '0');
  root.append(h('div', { class: 'day-end-intro' },
    h('p', { class: 'day-end-kicker' }, h('i'), t('dayend.kicker')),
    h('div', { class: 'day-end-trace', html: traceSVG(day.points) }),
    h('div', { class: 'day-end-count' },
      h('div', {}, km, h('small', {}, t('day.km'))),
      h('div', {}, vert, h('small', {}, t('day.descent')))),
    h('h2', { class: 'day-end-title' }, t('dayend.title'))));
  countUp(km, day.km || 0, 1);
  countUp(vert, day.descent || 0, 0);
  setTimeout(() => root.classList.add('is-leaving'), INTRO_MS - 450);
}

function countUp(el, to, digits) {
  const start = performance.now();
  const dur = 1800;
  const tick = (now) => {
    const f = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - f) ** 3;
    el.textContent = number(to * eased, digits);
    if (f < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Deine Spur als SVG (flach projiziert), zeichnet sich von selbst; ein Punkt fährt sie ab. */
function traceSVG(points) {
  const W = 300;
  const H = 220;
  let d;
  if (points.length > 1) {
    const lat0 = (points[0].lat * Math.PI) / 180;
    const xs = points.map((p) => p.lng * Math.cos(lat0));
    const ys = points.map((p) => -p.lat);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - 30) / (maxX - minX || 1), (H - 30) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * k) / 2;
    const oy = (H - (maxY - minY) * k) / 2;
    // höchstens ~400 Punkte, sonst wird der Pfad unnötig groß
    const step = Math.max(1, Math.floor(points.length / 400));
    d = xs.filter((_, i) => i % step === 0 || i === xs.length - 1)
      .map((x, i) => {
        const j = Math.min(points.length - 1, i * step);
        return `${i ? 'L' : 'M'}${(ox + (xs[j] - minX) * k).toFixed(1)} ${(oy + (ys[j] - minY) * k).toFixed(1)}`;
      }).join(' ');
  } else {
    // Noch keine Spur: eine Abfahrt als Platzhalter
    d = 'M40 30 C 200 50, 80 110, 220 130 S 120 200, 260 200';
  }
  return `<svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="trace-grad" x1="0" x2="1"><stop offset="0" stop-color="#2f6dff"/><stop offset=".6" stop-color="#ff6a13"/><stop offset="1" stop-color="#ff2d2d"/></linearGradient></defs>
    <path d="${d}" class="trace-shadow" pathLength="1"/>
    <path d="${d}" class="trace-line" pathLength="1" stroke="url(#trace-grad)"/>
    <circle r="6" class="trace-dot"><animateMotion dur="2s" fill="freeze" path="${d}" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 .05 .4 1"/></circle>
  </svg>`;
}
