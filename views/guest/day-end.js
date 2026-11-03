// Tag beendet: kurze Animation (deine Strecke zeichnet sich, Zahlen zählen hoch),
// danach eine eigene Vollbild-Seite – Karte mit deiner Spur, alle Zahlen, Download.
// Ab jetzt zeigt die App nur noch diese Übersicht (bis zum Abmelden bzw. Mitternacht).

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { number } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { createMap } from '../../js/map/map.js';
import { createTrack } from '../../js/map/layers.js';
import { goalMarker } from '../../js/map/markers.js';
import { renderSummary, traceSVG } from './day-summary.js';
import { openFilm } from './day-film.js';

const INTRO_MS = 3200;

/**
 * day: aufgezeichneter Tag · skimap: Pistennetz (blass als Hintergrund)
 * name: Vorname für die Überschrift · onLogout: Abmelden-Knopf · onReset: nur im Test-Modus – Tag löschen und neu anfangen
 */
export function showDayEnd(page, { day, skimap, animate, name, onLogout, onReset }) {
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
          renderSummary(day, { name, onFilm: () => openFilm(day, skimap) }),
          onReset ? h('button', { class: 'btn btn-quiet btn-block day-end-test', onclick: onReset }, icon('today'), t('test.resetDay')) : null,
          // Ganz unten und nicht zu übersehen: Chip zurückgeben
          h('div', { class: 'day-end-return', role: 'note' },
            icon('alert'),
            h('div', {},
              h('strong', {}, t('dayend.returnTitle')),
              h('span', {}, t('dayend.chipNote')))))),
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

/** Karte nur zum Anschauen: gemalte Karte, Pisten zurückhaltend, deine Spur orange, Start und Ziel. */
function drawMap(el, day, skimap) {
  const map = createMap(el, { painted: true });
  map.createPane('pistes').style.zIndex = 410;
  map.createPane('track').style.zIndex = 435;

  // Erst den Ausschnitt setzen – Linien brauchen eine Karte mit Ansicht
  const pts = day.points.map((p) => [p.lat, p.lng]);
  // oben Platz für die Kopfzeile
  map.fitBounds(pts.length ? L.latLngBounds(pts) : L.latLngBounds(skimap.nodes), { paddingTopLeft: [36, 110], paddingBottomRight: [36, 150], maxZoom: 15 });

  const DIFF = { easy: '#1f66d1', intermediate: '#e0242f', advanced: '#0e0e10', expert: '#0e0e10', freeride: '#f08a24' };
  for (const e of skimap.edges) {
    if (e.kind !== 'piste') continue;
    L.polyline(e.coords, { pane: 'pistes', color: DIFF[skimap.pistes[e.ref].diff], weight: 2.5, opacity: 0.45, interactive: false }).addTo(map);
  }

  const track = createTrack(map);
  day.points.forEach((p) => track.add(p));
  if (pts.length) {
    L.circleMarker(pts[0], { pane: 'track', radius: 7, color: '#fff', weight: 3, fillColor: '#0a9a5e', fillOpacity: 1 }).addTo(map);
    goalMarker(pts[pts.length - 1]).addTo(map);
  }
  setTimeout(() => map.invalidateSize(), 60);
  return map;
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
