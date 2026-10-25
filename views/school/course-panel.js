// Tab „Kurs“: Abholung mit Countdown, Tagesplan mit „Jetzt“-Markierung, Nachricht an alle Eltern,
// Anwesenheitsliste als Datei (wer war wann beim Durchzählen dabei).

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { api } from '../../js/services/api.js';
import { clock, todayAt, isoDay, now as clockNow } from '../../js/utils/time.js';
import { duration } from '../../js/utils/format.js';
import { download } from '../../js/services/export.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';

const KIND_ICON = { meet: 'flag', lift: 'gondola', ski: 'piste', hut: 'hut' };
const QUICK = ['fun', 'onTime', 'late', 'gloves'];

export function mountCourse(el, ctx) {
  const g = ctx.group;
  let sending = false;
  let timer = 0;


  const pickupBox = h('div');
  const planBox = h('div');

  /** Abholung + Tagesplan – laufen mit der Uhr mit */
  function tick() {
    const now = clockNow();
    const plan = g.plan || [];
    // aktueller Punkt = letzter, dessen Uhrzeit schon vorbei ist
    let current = -1;
    plan.forEach((p, i) => {
      if (todayAt(p.time) <= now) current = i;
    });
    const left = (todayAt(g.pickup.time) - now) / 1000;

    replace(pickupBox, h('section', { class: `pickup${left < 30 * 60 && left > 0 ? ' is-soon' : ''}` },
      h('span', { class: 'pickup-icon' }, icon('flag')),
      h('span', { class: 'pickup-text' },
        h('small', {}, t('school.pickup.title')),
        h('strong', {}, `${g.pickup.time} · ${g.pickup.place}`)),
      h('span', { class: 'pickup-left num' }, left > 0 ? duration(left) : t('school.pickup.now'))));

    replace(planBox, plan.length ? h('ol', { class: 'plan' }, plan.map((p, i) => {
      const state = i < current ? 'is-past' : i === current ? 'is-now' : 'is-next';
      const inSec = (todayAt(p.time) - now) / 1000;
      return h('li', { class: `plan-item ${state}` },
        h('span', { class: 'plan-time num' }, p.time),
        h('span', { class: 'plan-dot' }, icon(KIND_ICON[p.kind] || 'clock')),
        h('span', { class: 'plan-text' },
          h('strong', {}, p.text),
          i === current ? h('small', { class: 'plan-now' }, t('school.plan.now'))
            : i === current + 1 && inSec > 0 ? h('small', {}, t('school.plan.in', { time: duration(inSec) })) : null));
    })) : h('p', { class: 'muted' }, t('school.plan.none')));
  }

  function render() {
    const input = h('input', {
      class: 'ops-filter-input course-input', type: 'text', maxlength: 160,
      placeholder: t('school.msg.placeholder'), 'aria-label': t('school.msg.placeholder'),
    });
    replace(el,
      pickupBox,
      h('h3', { class: 'ops-h' }, t('school.plan')),
      planBox,
      h('h3', { class: 'ops-h' }, t('school.msg.title')),
      h('section', { class: 'msg-card' },
        h('p', { class: 'msg-lead' }, icon('message'), t('school.msg.lead', { n: ctx.kids.length })),
        h('div', { class: 'msg-quick' }, QUICK.map((q) => h('button', { class: 'choice', onclick: () => send(t(`school.msg.${q}`, { time: g.pickup.time, place: g.pickup.place })) }, t(`school.msg.${q}.short`)))),
        h('form', {
          class: 'msg-form',
          onsubmit: (e) => {
            e.preventDefault();
            if (input.value.trim()) send(input.value.trim()).then(() => { input.value = ''; });
          },
        }, input, h('button', { class: 'btn btn-small', type: 'submit' }, t('school.msg.send')))),
      h('button', { class: 'btn btn-quiet btn-block ops-export', onclick: exportList }, icon('download'), t('school.attendance')),
      h('p', { class: 'ops-foot' }, t('school.attendance.hint')),
    );
    tick();
  }

  async function send(text) {
    if (sending) return;
    sending = true;
    await api.messageParents(ctx.groupId, text);
    sending = false;
    toast(t('school.msg.sent', { n: ctx.kids.length }), { icon: 'message' });
  }

  /** Anwesenheitsliste: jedes Kind mit Eltern-Telefon und jedem Durchzählen des Tages */
  function exportList() {
    const counts = ctx.headcounts;
    const head = ['Kind', 'Alter', 'Eltern', 'Telefon', 'Chip', ...counts.map((c) => `Gezählt ${clock(new Date(c.at))}`)];
    const rows = ctx.kids.map((k) => [k.name, k.age, k.parent.name, k.parent.phone, k.chip,
      ...counts.map((c) => (c.missing.includes(k.name) ? 'fehlt' : 'da'))]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`skitag-${ctx.groupId.toLowerCase()}-${isoDay()}.csv`, `﻿${csv}`, 'text/csv');
    toast(t('ops.exported'), { icon: 'download' });
  }

  render();
  timer = setInterval(tick, 30000);
  return {
    update: render,
    destroy: () => clearInterval(timer),
  };
}
