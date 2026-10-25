// Tab „Team“: du selbst (Dienst / Pause) und alle Kollegen – frei, im Einsatz oder in Pause.
// Alarme gehen immer an den nächsten FREIEN Mitarbeiter; in Pause bekommst du keine.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { distance } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { isOpen } from './alarm-detail.js';

export function mountTeam(el, ctx, { setDuty }) {
  let live = [];

  function stateOf(s) {
    const a = ctx.alarms.find((x) => x.staff === s.id && isOpen(x) && x.status !== 'new');
    if (a) return { key: 'busy', alarm: a };
    if (ctx.staffState[s.id] === 'break') return { key: 'break' };
    return { key: 'free' };
  }

  function build() {
    live = [];
    const others = ctx.staff.filter((s) => s.id !== ctx.me.id);
    const states = ctx.staff.map(stateOf);
    const n = (k) => states.filter((s) => s.key === k).length;
    const mine = stateOf(ctx.me);
    const duty = ctx.staffState[ctx.me.id] === 'break' ? 'break' : 'free';

    replace(el,
      h('section', { class: 'team-me' },
        h('div', { class: 'team-me-head' },
          h('span', { class: 'team-avatar is-me' }, ctx.me.name[0]),
          h('span', { class: 'team-text' },
            h('strong', {}, `${ctx.me.name} · ${t('map.me')}`),
            h('small', {}, `${ctx.me.role} · ${ctx.me.station}`)),
          h('span', { class: `team-state is-${mine.key}` }, t(`ops.team.${mine.key}`))),
        h('div', { class: 'seg team-duty' },
          ['free', 'break'].map((s) => h('button', {
            class: 'seg-btn', 'aria-pressed': String(duty === s), disabled: mine.key === 'busy' ? true : null,
            onclick: () => duty !== s && setDuty(s),
          }, icon(s === 'free' ? 'shield' : 'pause'), t(`ops.duty.${s}`)))),
        h('p', { class: 'team-hint' }, t(mine.key === 'busy' ? 'ops.team.hintBusy' : duty === 'break' ? 'ops.team.hintBreak' : 'ops.team.hintFree'))),
      h('div', { class: 'team-sum' },
        sum(n('free'), t('ops.team.free'), 'free'),
        sum(n('busy'), t('ops.team.busy'), 'busy'),
        sum(n('break'), t('ops.team.break'), 'break')),
      h('div', { class: 'team-list' }, others
        .map((s) => ({ s, st: stateOf(s), d: geoDistance(ctx.myPos(), ctx.staffPos[s.id]?.pos || [s.lat, s.lng]) }))
        .sort((a, b) => a.d - b.d)
        .map(row)),
    );
  }

  function row({ s, st }) {
    const where = h('small', {});
    live.push(() => {
      const pos = ctx.staffPos[s.id]?.pos || [s.lat, s.lng];
      const d = distance(geoDistance(ctx.myPos(), pos));
      where.textContent = st.key === 'busy'
        ? `${st.alarm.id} · ${t(st.alarm.status === 'onsite' ? 'ops.state.onsite' : 'ops.state.accepted')} · ${d}`
        : `${s.role} · ${s.station} · ${d}`;
    });
    return h('div', { class: `team-row is-${st.key}` },
      h('button', {
        class: 'team-main',
        onclick: () => (st.key === 'busy' ? ctx.selectAlarm(st.alarm.id) : ctx.focus(ctx.staffPos[s.id]?.pos || [s.lat, s.lng], 15.5)),
      },
      h('span', { class: `team-avatar is-${st.key}` }, s.name[0]),
      h('span', { class: 'team-text' }, h('strong', {}, s.name), where),
      h('span', { class: `team-state is-${st.key}` }, t(`ops.team.${st.key}`))),
      h('a', { class: 'team-call', href: `tel:${s.phone.replace(/\s/g, '')}`, 'aria-label': t('ops.team.call', { name: s.name }) }, icon('phone')));
  }

  const run = () => live.forEach((fn) => fn());
  build();
  run();

  return {
    update(rebuild) {
      if (rebuild) build();
      run();
    },
    destroy() {},
  };
}

function sum(n, label, key) {
  return h('div', { class: `team-sum-item is-${key}` }, h('i'), h('strong', { class: 'num' }, String(n)), h('small', {}, label));
}
