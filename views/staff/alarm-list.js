// Tab „Einsätze“: alle offenen SOS-Alarme und Suchaufträge, deiner zuerst.
// Antippen klappt die Details auf (Ablauf, Ort, Aktionen). Unten: heute erledigt + Protokoll als Datei.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { api } from '../../js/services/api.js';
import { clock, isoDay } from '../../js/utils/time.js';
import { download } from '../../js/services/export.js';
import { icon } from '../../js/components/icons.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { renderDetail, statusLine, sinceText, progress, isOpen } from './alarm-detail.js';

const ORDER = { new: 0, accepted: 1, onsite: 2 };

export function mountAlarmList(el, ctx) {
  let closing = null; // Einsatz, bei dem gerade „Wie ist es ausgegangen?“ gefragt wird
  let live = [];      // Funktionen, die jede Sekunde Zeiten nachziehen

  const act = {
    accept: async (a) => {
      await api.alarmAction(a.id, 'accept', { staff: ctx.me.id });
      toast(t('ops.accepted.toast'), { icon: 'check' });
    },
    pass: async (a) => {
      await api.alarmAction(a.id, 'pass');
      toast(t('ops.passed.toast'), { icon: 'forward' });
    },
    takeOver: async (a) => {
      const ok = await confirmModal({
        title: t('ops.takeOver.title'), text: t('ops.takeOver.text', { name: ctx.staffName(a.staff) }),
        ok: t('ops.takeOver'), cancel: t('cancel'), danger: true,
      });
      if (!ok) return;
      await api.alarmAction(a.id, 'accept', { staff: ctx.me.id });
      toast(t('ops.accepted.toast'), { icon: 'check' });
    },
    onsite: async (a) => {
      await api.alarmAction(a.id, 'onsite');
      toast(t('ops.onsite.toast'), { icon: 'flag' });
    },
    finish: async (a, outcome) => {
      closing = null;
      await api.alarmAction(a.id, 'done', { outcome });
      ctx.selected = null;
      toast(t('ops.done.toast', { id: a.id }), { icon: 'check' });
    },
    signal: async (a) => {
      await api.signalChips([a.chip]);
      toast(t('ops.signal.toast', { chip: a.chip }), { icon: 'vibrate' });
    },
    route: (a) => ctx.fit(L.latLngBounds([ctx.myPos(), a.pos]), 16),
    copied: () => toast(t('ops.copied'), { icon: 'copy' }),
    setClosing: (id) => {
      closing = id;
      build();
      run();
    },
  };

  function build() {
    live = [];
    const open = ctx.alarms.filter(isOpen).sort((a, b) =>
      (b.staff === ctx.me.id) - (a.staff === ctx.me.id) || ORDER[a.status] - ORDER[b.status] || b.at - a.at);
    const done = ctx.alarms.filter((a) => !isOpen(a)).sort((a, b) => b.doneAt - a.doneAt);
    const count = (s) => open.filter((a) => a.status === s).length;

    replace(el,
      h('div', { class: 'ops-stats' },
        stat(count('new'), t('ops.stat.new'), count('new') ? 'is-hot' : ''),
        stat(count('accepted'), t('ops.stat.enroute')),
        stat(count('onsite'), t('ops.stat.onsite')),
        stat(done.filter((a) => a.outcome !== 'cancelled').length, t('ops.stat.done'))),
      open.length
        ? h('div', { class: 'ops-list' }, open.map(card))
        : h('div', { class: 'ops-calm' },
          h('span', { class: 'ops-calm-icon' }, icon('shield')),
          h('strong', {}, t('ops.calm.title')),
          h('small', {}, t('ops.calm.text'))),
      done.length ? h('h3', { class: 'ops-h' }, t('ops.doneToday')) : null,
      done.length ? h('div', { class: 'ops-done' }, done.map(doneRow)) : null,
      h('button', { class: 'btn btn-quiet btn-block ops-export', onclick: exportCSV }, icon('download'), t('ops.export')),
      h('p', { class: 'ops-foot' }, t('ops.export.hint')),
    );
  }

  function card(a) {
    const selected = ctx.selected === a.id;
    const mine = a.staff === ctx.me.id;
    const since = h('span', { class: 'num' });
    const status = h('span', { class: 'ops-card-status' });
    const bar = h('i');
    live.push(() => {
      since.textContent = sinceText(a.at);
      status.textContent = statusLine(a, ctx);
      bar.style.width = `${Math.round(progress(a, ctx).f * 100)}%`;
    });
    return h('article', {
      class: `ops-card is-${a.type} is-${a.status}${mine ? ' is-mine' : ''}${selected ? ' is-selected' : ''}`,
    },
    h('button', {
      class: 'ops-card-head',
      'aria-expanded': String(selected),
      onclick: () => {
        if (selected) {
          ctx.selected = null;
          build();
          run();
        } else {
          ctx.selectAlarm(a.id);
        }
      },
    },
    h('span', { class: 'ops-card-type' }, icon(a.type === 'search' ? 'search' : 'siren')),
    h('span', { class: 'ops-card-text' },
      h('span', { class: 'ops-card-top' },
        h('b', {}, a.type === 'search' ? t('ops.search') : 'SOS'),
        h('span', { class: 'num' }, a.id),
        mine ? h('span', { class: 'ops-mine' }, t('ops.mine')) : null),
      h('strong', {}, a.type === 'search' ? `${a.name} · ${ctx.where(a.pos)}` : ctx.where(a.pos)),
      status),
    h('span', { class: 'ops-card-since' }, since, icon('chevron'))),
    a.status === 'accepted' ? h('div', { class: 'ops-card-bar' }, bar) : null,
    selected ? renderDetail(a, ctx, { ...act, closing }) : null);
  }

  function doneRow(a) {
    const react = a.onsiteAt ? Math.round((a.onsiteAt - a.at) / 60000) : null;
    return h('button', { class: 'ops-done-row', onclick: () => ctx.focus(a.pos, 15.5) },
      h('span', { class: 'num ops-done-time' }, clock(new Date(a.at))),
      h('span', { class: 'ops-done-text' },
        h('strong', {}, `${a.type === 'search' ? t('ops.search') : 'SOS'} · ${ctx.where(a.pos)}`),
        h('small', {}, `${ctx.staffName(a.staff)}${react != null ? ` · ${t('ops.react', { min: react })}` : ''}`)),
      h('span', { class: `tag ops-outcome-tag is-${a.outcome}` }, t(`ops.outcome.${a.outcome}`)));
  }

  /** Protokoll des Tages als CSV (öffnet in Excel/Numbers) */
  function exportCSV() {
    const time = (ms) => (ms ? clock(new Date(ms)) : '');
    const rows = [['ID', 'Typ', 'Quelle', 'Chip', 'Ort', 'Lat', 'Lng', 'Eingang', 'Angenommen', 'Vor Ort', 'Erledigt', 'Mitarbeiter', 'Ergebnis', 'Reaktion (min)']];
    [...ctx.alarms].sort((a, b) => a.at - b.at).forEach((a) => rows.push([
      a.id, a.type, a.source, a.chip, ctx.where(a.pos), a.pos[0].toFixed(5), a.pos[1].toFixed(5),
      time(a.at), time(a.acceptedAt), time(a.onsiteAt), time(a.doneAt), ctx.staffName(a.staff),
      a.outcome ? t(`ops.outcome.${a.outcome}`) : t(`ops.state.${a.status}`),
      a.onsiteAt ? Math.round((a.onsiteAt - a.at) / 60000) : '',
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    download(`skitag-einsaetze-${isoDay()}.csv`, `﻿${csv}`, 'text/csv');
    toast(t('ops.exported'), { icon: 'download' });
  }

  const run = () => live.forEach((fn) => fn());

  build();
  run();

  return {
    /** rebuild = Daten haben sich geändert; sonst nur Zeiten nachziehen */
    update(rebuild) {
      if (rebuild) build();
      run();
    },
    destroy() {},
  };
}

function stat(n, label, cls = '') {
  return h('div', { class: `ops-stat ${cls}` }, h('strong', { class: 'num' }, String(n)), h('small', {}, label));
}
