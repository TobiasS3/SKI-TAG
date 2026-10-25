// Auswertung eines Skitags: Abfahrten erkennen, Tiefenmeter, Pisten nach Farbe, Abzeichen.
// Plus kleine Bausteine zum Anzeigen (Höhenprofil, Farbbalken, Abfahrtsliste, Abzeichen).

import { h } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { number, duration } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { distance as geoDistance } from '../../js/map/geo.js';

export const emptyDay = () => ({
  status: 'idle', // idle → running → done
  startedAt: null,
  endedAt: null,
  points: [],
  km: 0,
  lifts: 0,
  top: 0,
  elapsed: 0,       // Sekunden unterwegs
  descent: 0,       // Tiefenmeter auf der Piste
  ascent: 0,        // Höhenmeter mit dem Lift
  maxAlt: 0,
  kmByDiff: { easy: 0, intermediate: 0, advanced: 0, freeride: 0 },
  runs: [],         // { startTime, endTime, dist, drop, top, pistes: [] }
  liftsUsed: {},    // Name → Anzahl
  badges: [],
  afterLift: true,  // nächste Piste zählt als neue Abfahrt
});

export const runsCount = (day) => day.runs.length;

/**
 * Neuen Punkt einrechnen. Gibt neu freigeschaltete Abzeichen zurück.
 * p = { lat, lng, alt, speed, kind, ref, time },  skimap = Pistennetz
 */
export function addPoint(day, p, skimap) {
  const prev = day.points.at(-1);
  const point = { lat: p.lat, lng: p.lng, alt: p.alt, time: p.time, speed: p.speed, kind: p.kind };
  const kmh = p.speed * 3.6;

  const gap = prev ? (p.time - prev.time) / 1000 : 0;
  if (gap > 0 && gap < 120) day.elapsed += gap;
  if (p.alt) day.maxAlt = Math.max(day.maxAlt, p.alt);

  if (p.kind === 'lift' && prev?.kind !== 'lift') {
    day.lifts += 1;
    day.afterLift = true;
    const name = p.ref != null ? skimap.lifts[p.ref].name : '?';
    day.liftsUsed[name] = (day.liftsUsed[name] || 0) + 1;
    const run = day.runs.at(-1);
    if (run && !run.endTime) run.endTime = p.time;
  }
  if (p.kind === 'lift' && prev && p.alt && prev.alt && p.alt > prev.alt) day.ascent += p.alt - prev.alt;

  if (p.kind === 'piste') {
    // Neue Abfahrt beginnt
    if (day.afterLift && p.speed > 2) {
      day.afterLift = false;
      day.runs.push({ startTime: p.time, endTime: null, dist: 0, drop: 0, top: 0, pistes: [], startAlt: p.alt || 0 });
    }
    const run = day.runs.at(-1);
    if (prev) {
      const d = geoDistance([prev.lat, prev.lng], [p.lat, p.lng]);
      day.km += d / 1000;
      const piste = p.ref != null ? skimap.pistes[p.ref] : null;
      if (piste) {
        const key = piste.diff === 'expert' ? 'advanced' : piste.diff;
        day.kmByDiff[key] = (day.kmByDiff[key] || 0) + d / 1000;
      }
      if (run) {
        run.dist += d;
        if (piste) {
          const name = piste.ref ? `${piste.ref} ${piste.name || ''}`.trim() : piste.name;
          if (name && !run.pistes.includes(name)) run.pistes.push(name);
          run.black = run.black || ['advanced', 'expert'].includes(piste.diff);
          run.streif = run.streif || /streif/i.test(piste.name || '');
        }
      }
      if (prev.alt && p.alt && p.alt < prev.alt) {
        day.descent += prev.alt - p.alt;
        if (run) run.drop += prev.alt - p.alt;
      }
    }
    if (kmh < 110) {
      day.top = Math.max(day.top, kmh);
      if (run) run.top = Math.max(run.top, kmh);
    }
  }

  day.points.push(point);
  return checkBadges(day);
}

// --- Abzeichen ------------------------------------------------------------------------------
export const BADGES = [
  { id: 'firstRun', test: (d) => d.runs.length >= 1 },
  { id: 'runs10', test: (d) => d.runs.length >= 10 },
  { id: 'speed60', test: (d) => d.top >= 60 },
  { id: 'vert1000', test: (d) => d.descent >= 1000 },
  { id: 'black', test: (d) => d.runs.some((r) => r.black) },
  { id: 'streif', test: (d) => d.runs.some((r) => r.streif) },
  { id: 'summit', test: (d) => d.maxAlt >= 1900 },
  { id: 'km20', test: (d) => d.km >= 20 },
];

function checkBadges(day) {
  const fresh = [];
  for (const b of BADGES) {
    if (!day.badges.includes(b.id) && b.test(day)) {
      day.badges.push(b.id);
      fresh.push(b.id);
    }
  }
  return fresh;
}

// --- Bausteine zum Anzeigen --------------------------------------------------------------------

/** Höhenprofil des Tages als Fläche. dark = für dunkle Instrumente */
export function altitudeChart(points, { dark = false, height = 72 } = {}) {
  const pts = points.filter((p) => p.alt);
  if (pts.length < 3) return h('div', { class: 'alt-chart is-empty' }, t('day.noProfile'));
  const step = Math.max(1, Math.floor(pts.length / 160));
  const sample = pts.filter((_, i) => i % step === 0);
  const min = Math.min(...sample.map((p) => p.alt));
  const max = Math.max(...sample.map((p) => p.alt));
  const W = 300;
  const span = Math.max(50, max - min);
  const xy = sample.map((p, i) => [
    (i / (sample.length - 1)) * W,
    4 + (1 - (p.alt - min) / span) * (height - 8),
  ]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const id = `alt-${Math.random().toString(36).slice(2, 7)}`;
  return h('figure', { class: `alt-chart${dark ? ' is-dark' : ''}` },
    h('div', {
      class: 'alt-svg',
      html: `<svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${dark ? '#5b8cff' : '#2f6dff'}" stop-opacity=".45"/>
          <stop offset="1" stop-color="${dark ? '#5b8cff' : '#2f6dff'}" stop-opacity="0"/></linearGradient></defs>
        <polygon points="0,${height} ${line} ${W},${height}" fill="url(#${id})"/>
        <polyline points="${line}" fill="none" stroke="${dark ? '#fff' : '#0e0e10'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      </svg>`,
    }),
    h('figcaption', {},
      h('span', {}, icon('arrowUp'), `${number(max)} m`),
      h('span', {}, icon('arrowDown'), `${number(min)} m`)));
}

/** Gestapelter Balken: wie viele km auf blau / rot / schwarz */
export function difficultyBar(day) {
  const parts = [
    ['easy', day.kmByDiff.easy],
    ['intermediate', day.kmByDiff.intermediate],
    ['advanced', day.kmByDiff.advanced],
    ['freeride', day.kmByDiff.freeride],
  ].filter(([, km]) => km > 0.01);
  const total = parts.reduce((s, [, km]) => s + km, 0);
  if (!total) return null;
  return h('div', { class: 'diff-bar' },
    h('div', { class: 'diff-bar-track' },
      parts.map(([diff, km]) => h('i', { class: `diff-${diff}`, style: { flex: km } }))),
    h('ul', { class: 'diff-bar-legend' },
      parts.map(([diff, km]) => h('li', {}, h('i', { class: `dot diff-${diff}` }), t(`diff.${diff}`), h('b', { class: 'num' }, `${number(km, 1)} km`)))));
}

/** Liste der Abfahrten (neueste oben) */
export function runList(day, { limit = Infinity } = {}) {
  const runs = day.runs.map((r, i) => ({ ...r, n: i + 1 })).reverse().slice(0, limit);
  if (!runs.length) return null;
  return h('ol', { class: 'run-list' },
    runs.map((r) => h('li', {},
      h('span', { class: 'run-n num' }, r.n),
      h('div', { class: 'run-text' },
        h('strong', {}, r.pistes.slice(0, 2).join(', ') || t('day.run')),
        h('small', {},
          `${number(r.dist / 1000, 1)} km`,
          r.drop ? `, ${number(r.drop)} hm` : '',
          r.endTime ? `, ${duration((r.endTime - r.startTime) / 1000)}` : `, ${t('day.runNow')}`)),
      h('span', { class: 'run-top num' }, `${Math.round(r.top)}`, h('small', {}, 'km/h')))));
}

/** Abzeichen – erreichte farbig, offene grau */
export function badgeRow(day, { onlyEarned = false } = {}) {
  const list = onlyEarned ? BADGES.filter((b) => day.badges.includes(b.id)) : BADGES;
  if (!list.length) return null;
  return h('ul', { class: 'badges' },
    list.map((b) => h('li', { class: day.badges.includes(b.id) ? 'is-earned' : '' },
      h('span', { class: 'badge-icon' }, icon('trophy')),
      h('span', {}, t(`badge.${b.id}`)))));
}
