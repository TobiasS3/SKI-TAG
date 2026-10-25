// Navigation: „Route starten“ – geht mit, während du fährst.
//
// Oben: was als Nächstes kommt („Nimm die Hahnenkammbahn“, noch 240 m).
// Unten: Restzeit, Ankunft, Reststrecke, Fortschritt.
// Karte folgt dir, gefahrener Teil wird grau. Weg verlassen → neu berechnen.
// Am Handy: „Karte“ klappt die Navigation ein – Route bleibt, Tabs/Suche sind wieder da,
// oben ein Streifen „Navigation · 8 min · Zurück“.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on, emit } from '../../js/core/events.js';
import { api } from '../../js/services/api.js';
import { route as planRoute } from '../../js/services/slopes.js';
import { drawRoute } from '../../js/map/layers.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { distance, duration } from '../../js/utils/format.js';
import { clock, now } from '../../js/utils/time.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { pisteName } from './slopes-panel.js';

const OFF_ROUTE_M = 70;      // so weit weg = von der Route abgekommen
const OFF_ROUTE_TICKS = 3;   // … und das mehrmals hintereinander
const ARRIVE_M = 45;         // so nah am Ziel = angekommen

export function startNavigation(ctx, { target, mode, onEnd }) {
  const page = ctx.page;
  let r = null;              // aktuelle Route
  let geo = null;            // vorberechnete Geometrie
  let routeLayer = null;
  let doneLine = null;
  let lastSeg = 0;
  let offTicks = 0;
  let ended = false;
  let destroyed = false;
  let offMe = null;
  const startedAt = Date.now();
  const startedSim = ctx.me.time;

  // --- Oberfläche ------------------------------------------------------------------
  const hud = h('section', { class: 'nav-hud', 'aria-live': 'polite' });
  const bar = h('section', { class: 'nav-bar' });
  const pill = h('button', { class: 'nav-pill', onclick: () => minimize(false) });
  page.append(hud, bar, pill);
  page.classList.add('is-navigating');
  ctx.sheet.collapse();

  // --- Route berechnen + Geometrie vorbereiten ----------------------------------------
  function plan() {
    const next = planRoute(ctx.me.pos, target.node, mode);
    if (!next || next.unreachable || next.coords.length < 2) return false;
    r = next;
    geo = prepare(r);
    lastSeg = 0;
    routeLayer?.remove();
    doneLine?.remove();
    routeLayer = drawRoute(ctx.map, r.coords);
    doneLine = L.polyline([], { pane: 'route', color: '#8e8e97', weight: 7, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(ctx.map);
    api.guide(ctx.session.chip, target.node, mode);
    return true;
  }

  if (!plan()) {
    stop();
    return null;
  }
  ctx.follow(true, 16);

  // --- Neue Position → Fortschritt ---------------------------------------------------------
  function update() {
    if (ended || !ctx.me.pos) return;
    const p = project(geo, ctx.me.pos, lastSeg);
    lastSeg = p.seg;
    const progress = p.along;
    const remaining = Math.max(0, geo.total - progress);

    // Angekommen?
    if (remaining < ARRIVE_M || geoDistance(ctx.me.pos, target.pos) < ARRIVE_M) {
      arrive();
      return;
    }

    // Von der Route abgekommen → neu berechnen
    offTicks = p.dist > OFF_ROUTE_M ? offTicks + 1 : 0;
    if (offTicks >= OFF_ROUTE_TICKS) {
      offTicks = 0;
      if (plan()) {
        toast(t('nav.rerouted'), { icon: 'route' });
        update();
      }
      return;
    }

    // Aktueller Schritt
    let k = 0;
    while (k < r.steps.length - 1 && geo.stepEnd[k] <= progress + 1) k++;
    const step = r.steps[k];
    const toNext = Math.max(0, geo.stepEnd[k] - progress);
    const stepLen = Math.max(1, geo.stepEnd[k] - geo.stepStart[k]);
    let timeLeft = step.time * (toNext / stepLen);
    for (let j = k + 1; j < r.steps.length; j++) timeLeft += r.steps[j].time;

    // Gefahrener Teil grau
    doneLine.setLatLngs([...r.coords.slice(0, p.seg + 1), p.point]);

    renderHud(step, r.steps[k + 1], toNext);
    renderBar(timeLeft, remaining, progress / geo.total);
    // Für die Vorschau im Route-Tab (links am großen Bildschirm)
    emit('nav:progress', { route: r, step: k, timeLeft, remaining, f: progress / geo.total, target });
  }

  function instruction(step) {
    if (step.kind === 'lift') {
      const onIt = ctx.me.kind === 'lift' && ctx.me.ref != null && step.item === ctx.skimap.lifts[ctx.me.ref];
      return t(onIt ? 'nav.rideLift' : 'nav.takeLift', { name: step.item.name });
    }
    return t('nav.skiDown', { name: pisteName(step.item) });
  }

  function stepIcon(step, big) {
    if (step.kind === 'lift') return h('span', { class: `nav-icon${big ? ' is-big' : ''}` }, icon('gondola'));
    return h('span', { class: `nav-icon disc diff-${step.item.diff}${big ? ' is-big' : ''}` }, h('span', {}, step.item.ref || ''));
  }

  function renderHud(step, next, toNext) {
    replace(hud,
      h('div', { class: 'nav-now' },
        stepIcon(step, true),
        h('div', { class: 'nav-now-text' },
          h('span', { class: 'nav-dist num' }, distance(toNext)),
          h('strong', {}, instruction(step)))),
      next
        ? h('div', { class: 'nav-next' }, h('span', {}, t('nav.then')), stepIcon(next, false), h('span', { class: 'nav-next-name' }, instruction(next)))
        : h('div', { class: 'nav-next' }, h('span', {}, t('nav.then')), icon('flag'), h('span', { class: 'nav-next-name' }, t('route.arrive', { name: target.name }))),
    );
  }

  function renderBar(timeLeft, remaining, f) {
    replace(bar,
      h('div', { class: 'nav-progress', style: { '--f': Math.min(1, Math.max(0, f)).toFixed(3) } }, h('i')),
      h('div', { class: 'nav-bar-row' },
        h('div', { class: 'nav-stat nav-stat-main' },
          h('span', { class: 'num' }, duration(timeLeft)),
          h('small', {}, t('route.arrival', { time: clock(new Date(now().getTime() + timeLeft * 1000)) }))),
        h('div', { class: 'nav-stat' },
          h('span', { class: 'num' }, distance(remaining)),
          h('small', {}, target.name)),
        h('button', { class: 'nav-min', onclick: () => minimize(true) }, icon('map'), h('span', {}, t('nav.minimize'))),
        h('button', { class: 'nav-stop', 'aria-label': t('nav.stop'), onclick: () => stop(true) }, icon('close'))),
    );
    replace(pill,
      h('span', { class: 'nav-pill-live' }, h('i')),
      h('span', { class: 'nav-pill-text' },
        h('strong', { class: 'num' }, duration(timeLeft)),
        h('small', {}, target.name)),
      h('span', { class: 'nav-pill-back' }, icon('nav'), t('nav.back')));
  }

  /** Navigation einklappen (normale Ansicht mit Route) oder wieder aufklappen */
  function minimize(on) {
    page.classList.toggle('nav-mini', on);
    if (on) {
      ctx.follow(false);
    } else {
      ctx.sheet.collapse();
      ctx.follow(true, 16);
    }
  }

  function arrive() {
    ended = true;
    minimize(false);
    navigator.vibrate?.([80, 60, 160]);
    api.guide(ctx.session.chip, null);
    const took = ctx.me.time && startedSim ? (ctx.me.time - startedSim) / 1000 : (Date.now() - startedAt) / 1000;
    hud.classList.add('is-arrived');
    replace(hud,
      h('div', { class: 'nav-now' },
        h('span', { class: 'nav-icon is-big is-ok' }, icon('check')),
        h('div', { class: 'nav-now-text' },
          h('span', { class: 'nav-dist' }, t('nav.arrived')),
          h('strong', {}, target.name))),
      h('p', { class: 'nav-next' }, t('nav.took', { time: duration(took) })));
    replace(bar, h('button', { class: 'btn btn-sun btn-block', onclick: () => stop(false) }, icon('check'), t('nav.done')));
    doneLine.setLatLngs(r.coords);
    emit('nav:progress', { route: r, step: r.steps.length, timeLeft: 0, remaining: 0, f: 1, target, arrived: true });
    setTimeout(() => !destroyed && stop(false), 9000);
  }

  // --- Beenden ------------------------------------------------------------------------------
  function stop(byUser = false) {
    if (destroyed) return;
    destroyed = true;
    ended = true;
    offMe?.();
    routeLayer?.remove();
    doneLine?.remove();
    hud.remove();
    bar.remove();
    pill.remove();
    page.classList.remove('is-navigating', 'nav-mini');
    api.guide(ctx.session.chip, null);
    ctx.follow(false);
    if (byUser) toast(t('nav.stopped'), { icon: 'close' });
    onEnd?.();
  }

  offMe = on('me', update);
  update();
  return { stop: (byUser = false) => stop(byUser) };
}

// --- Geometrie --------------------------------------------------------------------------------
// Für die Berechnung genügt eine flache Projektion (Meter in x/y) – das Gebiet ist klein.

function prepare(r) {
  const lat0 = (r.coords[0][0] * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const xy = r.coords.map(([lat, lng]) => [lng * kx, lat * ky]);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  // Anfang/Ende jedes Schritts entlang der Linie
  const stepStart = [];
  const stepEnd = [];
  let idx = 0;
  for (const s of r.steps) {
    stepStart.push(cum[idx]);
    idx += s.coords.length;
    stepEnd.push(cum[Math.min(idx, cum.length) - 1]);
  }
  return { xy, cum, total: cum[cum.length - 1], stepStart, stepEnd, kx, ky, coords: r.coords };
}

/** Nächster Punkt auf der Route (Suche ab dem letzten Abschnitt, damit es nicht zurückspringt). */
function project(geo, pos, fromSeg) {
  const p = [pos[1] * geo.kx, pos[0] * geo.ky];
  const n = geo.xy.length;
  const lo = Math.max(0, fromSeg - 3);
  const hi = Math.min(n - 2, fromSeg + 120);
  let best = { seg: fromSeg, dist: Infinity, along: geo.cum[fromSeg], f: 0 };
  for (let i = lo; i <= hi; i++) {
    const a = geo.xy[i];
    const b = geo.xy[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const d = Math.hypot(a[0] + f * dx - p[0], a[1] + f * dy - p[1]);
    if (d < best.dist) best = { seg: i, dist: d, f, along: geo.cum[i] + f * Math.sqrt(len2) };
  }
  const c = geo.coords;
  const i = best.seg;
  best.point = [c[i][0] + (c[i + 1][0] - c[i][0]) * best.f, c[i][1] + (c[i + 1][1] - c[i][1]) * best.f];
  return best;
}
