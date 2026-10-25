// Status-Tab (Pisten/Liftstatus): oben umschalten zwischen Liften (Standard) und Pisten.
// Lifte: offen / zu / Wind-Stopp + Öffnungszeiten. Pisten: offen, präpariert, Buckelpiste, gesperrt.
// Nach Teilgebiet sortiert. Antippen → auf der Karte zeigen + Route dorthin.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { clock, todayAt, now as clockNow } from '../../js/utils/time.js';
import { duration, distance } from '../../js/utils/format.js';
import { pisteName } from './slopes-panel.js';
import { icon } from '../../js/components/icons.js';

const FILTERS = ['all', 'open', 'closed'];
// Reihenfolge in der Liste: große Bahnen zuerst
const TYPE_ORDER = ['cable_car', 'gondola', 'mixed_lift', 'chair_lift', 't-bar', 'j-bar', 'platter', 'rope_tow', 'magic_carpet'];

/**
 * Zustand eines Lifts jetzt.
 * → { state: 'open' | 'soon' | 'closing' | 'later' | 'done' | 'hold' | 'closed', open, close, reason, note }
 */
export function liftState(status, name, now = clockNow()) {
  const entry = { ...status?.default, ...status?.lifts?.[name] };
  const open = entry.open || '08:30';
  const close = entry.close || '16:30';
  const base = { open, close, reason: entry.reason, note: entry.note };
  if (entry.status === 'closed') return { ...base, state: 'closed' };
  if (now < todayAt(open)) return { ...base, state: 'later' };
  if (now >= todayAt(close)) return { ...base, state: 'done' };
  if (entry.status === 'hold') return { ...base, state: 'hold' };
  if (todayAt(close) - now < 30 * 60000) return { ...base, state: 'closing' };
  return { ...base, state: 'open' };
}

export const isRunning = (s) => s.state === 'open' || s.state === 'closing';

/** Eindeutige Lifte (gleicher Name im gleichen Gebiet = ein Eintrag), mit Gebiet und Startknoten. */
export function liftList(skimap) {
  const seen = new Map();
  skimap.edges.forEach((e) => {
    if (e.kind !== 'lift') return;
    const lift = skimap.lifts[e.ref];
    const area = skimap.nodeArea[e.a];
    const key = `${area}:${lift.name}`;
    if (!seen.has(key)) seen.set(key, { lift, area, node: e.a, pos: skimap.nodes[e.a] });
  });
  return [...seen.values()];
}

/** Zustand einer Piste: { open, groomed, note, reason } – ohne Eintrag offen und präpariert */
export function pisteState(status, piste) {
  const entry = status?.pistes?.[piste.name] || status?.pistes?.[piste.ref] || {};
  const route = piste.diff === 'freeride' || /skiroute/i.test(piste.name || '');
  return {
    open: entry.status !== 'closed',
    reason: entry.reason,
    groomed: entry.groomed ?? !route,
    note: entry.note || (route ? 'route' : null),
  };
}

/** Eindeutige Pisten (Name oder Nummer) mit Gebiet, Länge und Startknoten */
export function pisteList(skimap) {
  const seen = new Map();
  skimap.edges.forEach((e) => {
    if (e.kind !== 'piste') return;
    const p = skimap.pistes[e.ref];
    const key = p.name || p.ref;
    if (!key) return;
    const area = skimap.nodeArea[e.a];
    const k = `${area}:${key}`;
    if (!seen.has(k)) seen.set(k, { piste: p, area, len: 0, node: e.a, pos: skimap.nodes[e.a], refs: new Set() });
    const x = seen.get(k);
    x.len += e.len;
    x.refs.add(e.ref);
    if (!x.piste.ref && p.ref) x.piste = p;
  });
  return [...seen.values()];
}

export function mountLifts(el, ctx, status, pistes) {
  let filter = 'all';
  let mode = 'lifts'; // 'lifts' | 'pistes'
  const all = liftList(ctx.skimap);
  const allPistes = pisteList(ctx.skimap);

  function render() {
    if (mode === 'pistes') return renderPistes();
    if (!status) {
      replace(el, h('div', { class: 'empty' }, icon('gondola'), h('p', {}, t('lifts.unavailable'))));
      return;
    }
    const now = clockNow();
    const rows = all.map((x) => ({ ...x, s: liftState(status, x.lift.name, now) }));
    const running = rows.filter((r) => isRunning(r.s)).length;
    const visible = rows.filter((r) => filter === 'all' || (filter === 'open' ? isRunning(r.s) : !isRunning(r.s)));

    replace(el,
      modeSwitch(),
      h('section', { class: 'lifts-head' },
        h('div', {},
          h('h2', { class: 'title' }, t('lifts.title')),
          h('p', { class: 'muted small' }, t('lifts.updated', { time: clock(new Date(status.updatedAt)) }))),
        h('p', { class: 'lifts-count' },
          h('span', { class: 'num' }, String(running)),
          h('small', {}, t('lifts.ofOpen', { n: rows.length })))),
      h('div', { class: 'lifts-meter', 'aria-hidden': 'true' }, h('i', { style: { width: `${(running / rows.length) * 100}%` } })),
      h('div', { class: 'choice-row', role: 'group', 'aria-label': t('lifts.title') },
        FILTERS.map((f) => h('button', {
          class: 'choice',
          'aria-pressed': String(f === filter),
          onclick: () => { filter = f; render(); },
        }, t(`lifts.filter.${f}`)))),
      ctx.skimap.areas.map((area, a) => {
        const list = visible.filter((r) => r.area === a).sort(byType);
        if (!list.length) return null;
        return h('section', { class: 'card lifts-area' },
          h('h3', { class: 'card-title' }, area),
          h('ul', { class: 'lift-rows' }, list.map(row)));
      }),
      h('p', { class: 'wx-source' }, t('lifts.source')),
    );
  }

  /** Umschalter oben: Lifte | Pisten */
  function modeSwitch() {
    return h('div', { class: 'seg', role: 'tablist' },
      ['lifts', 'pistes'].map((m) => h('button', {
        class: 'seg-btn',
        role: 'tab',
        'aria-selected': String(m === mode),
        onclick: () => { mode = m; filter = 'all'; render(); },
      }, icon(m === 'lifts' ? 'gondola' : 'piste'), t(`status.${m}`))));
  }

  function renderPistes() {
    if (!pistes) {
      replace(el, modeSwitch(), h('div', { class: 'empty' }, icon('piste'), h('p', {}, t('pistes.unavailable'))));
      return;
    }
    const rows = allPistes.map((x) => ({ ...x, s: pisteState(pistes, x.piste) }));
    const open = rows.filter((r) => r.s.open).length;
    const visible = rows.filter((r) => filter === 'all' || (filter === 'open' ? r.s.open : !r.s.open));
    replace(el,
      modeSwitch(),
      h('section', { class: 'lifts-head' },
        h('div', {},
          h('h2', { class: 'title' }, t('pistes.title')),
          h('p', { class: 'muted small' }, t('pistes.groomed', { time: pistes.groomedAt || '–' }))),
        h('p', { class: 'lifts-count' },
          h('span', { class: 'num' }, String(open)),
          h('small', {}, t('lifts.ofOpen', { n: rows.length })))),
      h('div', { class: 'lifts-meter', 'aria-hidden': 'true' }, h('i', { style: { width: `${(open / rows.length) * 100}%` } })),
      h('div', { class: 'choice-row', role: 'group', 'aria-label': t('pistes.title') },
        FILTERS.map((f) => h('button', {
          class: 'choice',
          'aria-pressed': String(f === filter),
          onclick: () => { filter = f; render(); },
        }, t(`lifts.filter.${f}`)))),
      ctx.skimap.areas.map((area, a) => {
        const list = visible.filter((r) => r.area === a).sort(byDiff);
        if (!list.length) return null;
        return h('section', { class: 'card lifts-area' },
          h('h3', { class: 'card-title' }, area),
          h('ul', { class: 'lift-rows' }, list.map(pisteRow)));
      }),
      h('p', { class: 'wx-source' }, t('lifts.source')),
    );
  }

  function pisteRow(r) {
    const { piste: p, s } = r;
    const state = !s.open ? 'is-closed' : s.note === 'moguls' || s.note === 'icy' || s.note === 'route' ? 'is-hold' : 'is-open';
    const label = !s.open
      ? (s.reason ? t(`pistes.reason.${s.reason}`) : t('lifts.state.closed'))
      : s.note ? t(`pistes.note.${s.note}`) : t('pistes.groomedShort');
    return h('li', {},
      h('button', {
        class: `lift-row ${state}`,
        onclick: () => ctx.choose({ type: 'piste', name: pisteName(p), ref: p.ref, diff: p.diff, pos: r.pos, node: r.node, piste: p }),
      },
      h('span', { class: `lift-icon disc diff-${p.diff}` }, h('span', {}, p.ref || '')),
      h('span', { class: 'lift-text' },
        h('strong', {}, p.name || `Piste ${p.ref}`),
        h('small', {}, t(`diff.${p.diff}`), ' · ', distance(r.len))),
      h('span', { class: 'lift-state' }, label)));
  }

  function row(r) {
    const { lift, s } = r;
    const big = lift.type === 'gondola' || lift.type === 'cable_car';
    return h('li', {},
      h('button', {
        class: `lift-row is-${s.state}`,
        onclick: () => ctx.choose({ type: 'lift', name: lift.name, sub: lift.typeName, pos: r.pos, node: r.node, lift }),
      },
      h('span', { class: 'lift-icon' }, icon(big ? 'gondola' : 'lift')),
      h('span', { class: 'lift-text' },
        h('strong', {}, lift.name),
        h('small', {}, lift.typeName, ' · ', h('span', { class: 'num' }, `${s.open}–${s.close}`))),
      h('span', { class: 'lift-state' }, stateText(s))));
  }

  function stateText(s) {
    if (s.state === 'closing') {
      return t('lifts.state.closing', { time: duration((todayAt(s.close) - clockNow()) / 1000) });
    }
    if (s.state === 'later') return t('lifts.state.later', { time: s.open });
    if (s.state === 'hold' || s.state === 'closed') {
      return s.reason ? t(`lifts.reason.${s.reason}`) : t(`lifts.state.${s.state}`);
    }
    return t(`lifts.state.${s.state}`);
  }

  const offs = [on('lang', render)];
  const timer = setInterval(render, 60000);
  render();

  return {
    destroy() {
      offs.forEach((off) => off());
      clearInterval(timer);
    },
  };
}

const DIFF_ORDER = ['easy', 'intermediate', 'advanced', 'expert', 'freeride'];
function byDiff(a, b) {
  return DIFF_ORDER.indexOf(a.piste.diff) - DIFF_ORDER.indexOf(b.piste.diff)
    || String(a.piste.ref || a.piste.name).localeCompare(String(b.piste.ref || b.piste.name), 'de', { numeric: true });
}

function byType(a, b) {
  return TYPE_ORDER.indexOf(a.lift.type) - TYPE_ORDER.indexOf(b.lift.type) || a.lift.name.localeCompare(b.lift.name, 'de');
}
