// Tab „Lifte“: Bergbahn schaltet Lifte um – läuft / Wind-Stopp / heute zu (mit Grund).
// Gäste sehen das sofort im Status-Tab, und ihre Routen weichen gesperrten Liften aus.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { api } from '../../js/services/api.js';
import { liftList, liftState, isRunning } from '../../js/services/lift-status.js';
import { now as clockNow } from '../../js/utils/time.js';
import { icon, liftIcon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';

const TYPE_ORDER = ['cable_car', 'gondola', 'mixed_lift', 'chair_lift', 't-bar', 'j-bar', 'platter', 'rope_tow', 'magic_carpet'];
const CLOSE_REASONS = ['wind', 'snow', 'revision'];
const GUST_WARN = 50; // km/h – ab hier Sessellifte und Gondeln prüfen

export function mountLiftControl(el, ctx) {
  const lifts = liftList(ctx.skimap).sort((a, b) =>
    TYPE_ORDER.indexOf(a.lift.type) - TYPE_ORDER.indexOf(b.lift.type) || a.lift.name.localeCompare(b.lift.name, 'de'));
  let status = null;
  let query = '';
  let asking = null; // Lift, bei dem gerade nach dem Grund für „zu“ gefragt wird

  const input = h('input', {
    class: 'ops-filter-input', type: 'search', placeholder: t('ops.lifts.filter'), 'aria-label': t('ops.lifts.filter'),
    oninput: (e) => {
      query = e.target.value.trim().toLowerCase();
      renderList();
    },
  });
  const list = h('div', { class: 'lc-areas' });
  const head = h('div');

  async function load() {
    status = await api.getLiftStatus().catch(() => null);
    render();
  }

  function render() {
    if (!status) {
      replace(el, h('p', { class: 'muted' }, t('ops.lifts.none')));
      return;
    }
    const now = clockNow();
    const states = lifts.map((x) => liftState(status, x.lift.name, now));
    const running = states.filter(isRunning).length;
    const hold = states.filter((s) => s.state === 'hold').length;
    const closed = states.filter((s) => s.state === 'closed').length;
    const w = ctx.wind;
    replace(head,
      w ? h('div', { class: `lc-wind${w.gusts >= GUST_WARN ? ' is-warn' : ''}` },
        icon('wind'),
        h('span', {},
          h('strong', {}, t('ops.wind.line', { speed: w.speed, gusts: w.gusts, dir: w.dir })),
          h('small', {}, t(w.gusts >= GUST_WARN ? 'ops.wind.warn' : 'ops.wind.ok')))) : null,
      h('div', { class: 'ops-stats' },
        statBox(running, t('ops.lifts.running')),
        statBox(hold, t('ops.lifts.hold'), hold ? 'is-warn' : ''),
        statBox(closed, t('ops.lifts.closed'))),
      h('p', { class: 'ops-foot' }, icon('users'), t('ops.lifts.hint')));
    input.placeholder = t('ops.lifts.filter');
    replace(el, head, input, list);
    renderList();
  }

  function renderList() {
    const now = clockNow();
    const match = (x) => !query || x.lift.name.toLowerCase().includes(query);
    replace(list, ctx.skimap.areas.map((area, a) => {
      const rows = lifts.filter((x) => x.area === a && match(x));
      if (!rows.length) return null;
      return h('section', { class: 'lc-area' },
        h('h3', { class: 'ops-h' }, area),
        rows.map((x) => row(x, liftState(status, x.lift.name, now))));
    }));
    if (!list.children.length) list.append(h('p', { class: 'muted' }, t('search.empty')));
  }

  function row(x, s) {
    const name = x.lift.name;
    const mode = s.state === 'hold' ? 'hold' : s.state === 'closed' ? 'closed' : 'open';
    const changed = status.lifts?.[name]?.by === 'staff';
    const line = s.state === 'hold' ? t(`lifts.reason.${s.reason || 'wind'}`)
      : s.state === 'closed' ? `${t('lifts.state.closed')}${s.reason ? ` · ${t(`lifts.reason.${s.reason}`)}` : ''}`
        : `${t(isRunning(s) ? 'lifts.state.open' : s.state === 'later' ? 'ops.lifts.notYet' : 'lifts.state.done')} · ${s.open}–${s.close}`;
    return h('div', { class: `lc-row is-${mode}` },
      h('span', { class: 'lc-icon' }, icon(liftIcon(x.lift.type))),
      h('span', { class: 'lc-text' },
        h('strong', {}, name),
        h('small', {}, line, changed ? h('em', {}, ` · ${t('ops.lifts.byYou')}`) : null)),
      h('div', { class: 'lc-seg', role: 'group', 'aria-label': name },
        ['open', 'hold', 'closed'].map((m) => h('button', {
          class: `lc-btn is-${m}`,
          'aria-pressed': String(mode === m),
          title: t(`ops.lifts.set.${m}`),
          onclick: () => (m === 'closed' && mode !== 'closed' ? ask(name) : set(name, m)),
        }, t(`ops.lifts.set.${m}`)))),
      asking === name ? h('div', { class: 'lc-reasons' },
        h('small', {}, t('ops.lifts.why')),
        CLOSE_REASONS.map((r) => h('button', { class: 'choice', onclick: () => set(name, 'closed', r) }, t(`lifts.reason.${r}`))),
        h('button', { class: 'choice', onclick: () => { asking = null; renderList(); } }, t('cancel'))) : null);
  }

  function ask(name) {
    asking = name;
    renderList();
  }

  async function set(name, mode, reason) {
    asking = null;
    const entry = mode === 'open' ? null : { status: mode, reason: reason || 'wind' };
    await api.setLiftStatus(name, entry);
    status = await api.getLiftStatus();
    render();
    toast(t(`ops.lifts.toast.${mode}`, { name }), { icon: mode === 'open' ? 'check' : mode === 'hold' ? 'wind' : 'close' });
  }

  load();
  return {
    update: () => render(),
    destroy() {},
  };
}

function statBox(n, label, cls = '') {
  return h('div', { class: `ops-stat ${cls}` }, h('strong', { class: 'num' }, String(n)), h('small', {}, label));
}
