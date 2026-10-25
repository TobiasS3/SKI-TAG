// Letzter Lift: Wann musst du spätestens Richtung Tal los, damit alle nötigen Lifte noch fahren?
//
// Rechnung: Route von dir zur Talstation, wo dein Tag begonnen hat. Für jeden Lift auf der Route:
// Schließzeit minus die Zeit, bis du dort bist = späteste Abfahrt. Die früheste davon zählt.
// Ab 45 min vorher: Hinweis unter der Suche („Hahnenkammbahn schließt um 16:30 – Route starten“).
// Bei 30, 15 und 5 min zusätzlich Meldung + Vibration.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { route, skimap } from '../../js/services/slopes.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { clock, todayAt, now, isoDay } from '../../js/utils/time.js';
import { load, save } from '../../js/core/storage.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { liftState } from './lifts-panel.js';
import { config } from '../../js/config.js';

const SHOW_MIN = 45;           // ab so vielen Minuten vorher den Hinweis zeigen
const ALERTS = [30, 15, 5];    // Meldungen bei diesen Minuten
const CHECK_MS = 15000;        // so oft neu rechnen
const VALLEY_ELE = 1000;       // Talstationen liegen tiefer als das

export function mountLastLift(page, ctx, status) {
  if (!status) return { destroy() {} };
  const map = skimap();
  const el = h('section', { class: 'lastlift', hidden: true, role: 'status' });
  page.querySelector('.search')?.after(el);

  // Talstationen: Lifte, deren untere Station tief liegt
  const valleys = [];
  map.edges.forEach((e) => {
    if (e.kind !== 'lift' || map.ele[e.a] > VALLEY_ELE || !map.coreSet.has(e.a)) return;
    const lift = map.lifts[e.ref];
    if (!valleys.some((v) => v.lift === lift)) valleys.push({ lift, node: e.a, pos: map.nodes[e.a] });
  });

  // Talstation, wo der Tag begonnen hat (gemerkt, damit Neuladen nichts ändert)
  const HOME_KEY = `home-${isoDay()}`;
  let home = valleys.find((v) => v.lift.name === load(HOME_KEY, null)) || null;
  let last = 0;
  let dismissed = false;
  const alerted = new Set();

  function compute() {
    const pos = ctx.me.pos;
    if (!pos || !valleys.length) return null;
    if (!home) {
      home = [...valleys].sort((a, b) => geoDistance(pos, a.pos) - geoDistance(pos, b.pos))[0];
      save(HOME_KEY, home.lift.name);
    }
    if (geoDistance(pos, home.pos) < 300) return { state: 'home' };
    const r = route(pos, home.node, 'fast');
    if (!r || r.unreachable) return { state: 'none' };
    if (!r.lifts) return { state: 'free' };
    let t0 = 0;
    let best = null;
    for (const s of r.steps) {
      if (s.kind === 'lift') {
        const close = todayAt(liftState(status, s.item.name).close).getTime();
        const latest = close - t0 * 1000;
        if (!best || latest < best.at) best = { at: latest, lift: s.item.name, close: liftState(status, s.item.name).close };
      }
      t0 += s.time;
    }
    return { state: 'lifts', ...best, left: (best.at - now().getTime()) / 60000 };
  }

  function update(force = false) {
    if (!force && Date.now() - last < CHECK_MS) return;
    last = Date.now();
    const d = compute();
    if (!d) return;

    // Meldungen bei 30 / 15 / 5 min (je einmal)
    if (d.state === 'lifts') {
      for (const m of ALERTS) {
        if (d.left <= m && d.left > m - 5 && !alerted.has(m)) {
          alerted.add(m);
          dismissed = false;
          toast(t('lastlift.toast', { min: m, lift: d.lift }), { icon: 'clock', ms: 6000 });
          navigator.vibrate?.([80, 60, 80]);
        }
      }
    }

    // „Kein Rückweg“ nur kurz vor Liftschluss – vorher heißt keine Route eher: Position gerade unklar (z. B. im Lift)
    const nearClose = (todayAt(config.resort.liftsClose) - now()) / 60000 <= SHOW_MIN;
    const show = !dismissed && ((d.state === 'lifts' && d.left <= SHOW_MIN && d.left > -10) || (d.state === 'none' && nearClose));
    el.hidden = !show;
    if (!show) return;
    const late = d.state === 'none' || d.left <= 0;
    el.classList.toggle('is-late', late);
    replace(el,
      h('span', { class: 'lastlift-icon' }, icon('clock')),
      h('span', { class: 'lastlift-text' },
        d.state === 'none'
          ? h('strong', {}, t('lastlift.none'))
          : late
            ? h('strong', {}, t('lastlift.missed', { lift: d.lift, close: d.close }))
            : h('strong', {}, t('lastlift.closes', { lift: d.lift, close: d.close })),
        late
          ? h('small', {}, t('lastlift.noneHint'))
          : h('small', {}, t('lastlift.leaveBy', { time: clock(new Date(d.at)), min: Math.max(1, Math.round(d.left)) }))),
      late ? null : h('button', { class: 'lastlift-go', onclick: goHome }, icon('nav'), t('lastlift.start')),
      h('button', { class: 'lastlift-close', 'aria-label': t('close'), onclick: () => { dismissed = true; el.hidden = true; } }, icon('close')));
  }

  /** Navigation ins Tal sofort starten */
  function goHome() {
    dismissed = true;
    el.hidden = true;
    ctx.navigateTo({ type: 'lift', name: home.lift.name, sub: home.lift.typeName, pos: home.pos, node: home.node, lift: home.lift });
  }

  const offs = [on('me', () => update()), on('lang', () => update(true))];
  const timer = setInterval(() => update(true), 60000);

  return {
    destroy() {
      offs.forEach((off) => off());
      clearInterval(timer);
      el.remove();
    },
  };
}
