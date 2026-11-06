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
          renderSummary(day, {
            name,
            onFilm: () => openFilm(day, skimap),
            // Gleich unter den Zahlen und nicht zu übersehen: Chip zurückgeben (Orange, Rot bleibt dem Notruf)
            afterHero: h('div', { class: 'day-end-return', role: 'note' },
              h('span', { class: 'day-end-return-icon' }, icon('alert')),
              h('div', {},
                h('strong', {}, t('dayend.returnTitle')),
                h('span', {}, t('dayend.chipNote')))),
          }),
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

/** Karte nur zum Anschauen: gemalte Karte, darauf nur Ihre Spur (keine fremden Pisten), Start und Ziel. */
function drawMap(el, day, skimap) {
  const map = createMap(el, { painted: true });
  map.createPane('track').style.zIndex = 435;

  const pts = day.points.map((p) => [p.lat, p.lng]);
  // Spur in den freien Teil der Karte einpassen: oben die Kopfzeile, unten schiebt sich die Übersicht drüber
  const fit = () => map.fitBounds(pts.length ? L.latLngBounds(pts) : L.latLngBounds(skimap.nodes), {
    paddingTopLeft: [40, 104], paddingBottomRight: [40, 120], maxZoom: 16,
  });
  fit();

  const track = createTrack(map);
  day.points.forEach((p) => track.add(p));
  if (pts.length) {
    L.circleMarker(pts[0], { pane: 'track', radius: 7, color: '#fff', weight: 3, fillColor: '#16b46b', fillOpacity: 1 }).addTo(map);
    goalMarker(pts[pts.length - 1]).addTo(map);
  }
  // Erst wenn die Karte ihre echte Größe kennt, sitzt der Ausschnitt
  setTimeout(() => { map.invalidateSize(); fit(); }, 60);
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
