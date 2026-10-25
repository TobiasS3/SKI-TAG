// Tab „Skischule“: alle Gruppen der Skischule live (wo ist welcher Lehrer), Büro und Bergbahn erreichen.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { distance } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';

export function mountSchoolPanel(el, ctx) {
  let live = [];

  function build() {
    live = [];
    const s = ctx.school;
    replace(el,
      h('section', { class: 'sc-head' },
        h('span', { class: 'sc-logo' }, icon('cap')),
        h('span', { class: 'sc-text' }, h('strong', {}, s.name), h('small', {}, s.office)),
        h('a', { class: 'team-call', href: `tel:${s.phone.replace(/\s/g, '')}`, 'aria-label': t('school.callOffice') }, icon('phone'))),
      h('h3', { class: 'ops-h' }, t('school.groups')),
      h('div', { class: 'team-list' }, Object.entries(s.groups).map(([id, g]) => groupRow(id, g))),
      h('section', { class: 'sc-help' },
        h('span', { class: 'sc-help-icon' }, icon('shield')),
        h('span', {},
          h('strong', {}, t('school.help.title')),
          h('small', {}, t('school.help.text'))),
        h('a', { class: 'btn btn-danger btn-small', href: 'tel:140' }, icon('phone'), '140')),
    );
  }

  function groupRow(id, g) {
    const mine = id === ctx.groupId;
    const where = h('small', {});
    live.push(() => {
      const p = mine ? ctx.teacher : ctx.others[id];
      if (!p) {
        where.textContent = '–';
        return;
      }
      const d = mine || !ctx.teacher ? null : geoDistance([ctx.teacher.lat, ctx.teacher.lng], [p.lat, p.lng]);
      where.textContent = `${g.teacher} · ${ctx.where(p)}${d != null ? ` · ${distance(d)}` : ''}`;
    });
    const size = mine ? ctx.kids.length : g.size;
    return h('div', { class: 'team-row' },
      h('button', {
        class: 'team-main',
        onclick: () => {
          const p = mine ? ctx.teacher : ctx.others[id];
          if (p) ctx.focus([p.lat, p.lng], 15);
        },
      },
      h('span', { class: 'sc-badge', style: { '--c': g.color } }, icon('cap')),
      h('span', { class: 'team-text' },
        h('strong', {}, g.name, mine ? h('span', { class: 'ops-mine' }, t('school.mine')) : null),
        where),
      h('span', { class: 'sc-size' }, h('strong', { class: 'num' }, String(size)), h('small', {}, g.level))),
      !mine && g.phone
        ? h('a', { class: 'team-call', href: `tel:${g.phone.replace(/\s/g, '')}`, 'aria-label': t('ops.team.call', { name: g.teacher }) }, icon('phone'))
        : h('span', { class: 'team-call is-empty', 'aria-hidden': 'true' }));
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
