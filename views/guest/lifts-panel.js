// Status-Tab (Pisten/Liftstatus): oben umschalten zwischen Liften (Standard) und Pisten.
// Lifte: offen / zu / Wind-Stopp + Öffnungszeiten. Pisten: offen, präpariert, Buckelpiste, gesperrt.
// Nach Teilgebiet sortiert. Antippen → auf der Karte zeigen + Route dorthin.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { clock, todayAt, now as clockNow } from '../../js/utils/time.js';
import { duration, distance } from '../../js/utils/format.js';
import { pisteName } from './slopes-panel.js';
import { liftState, isRunning, liftList, pisteState, pisteList } from '../../js/services/lift-status.js';
import { icon } from '../../js/components/icons.js';

const FILTERS = ['all', 'open', 'closed'];
// Reihenfolge in der Liste: große Bahnen zuerst
const TYPE_ORDER = ['cable_car', 'gondola', 'mixed_lift', 'chair_lift', 't-bar', 'j-bar', 'platter', 'rope_tow', 'magic_carpet'];

// Zustand von Liften und Pisten – wird auch von der Bergbahn-Ansicht gebraucht
export { liftState, isRunning, liftList, pisteState, pisteList };

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
