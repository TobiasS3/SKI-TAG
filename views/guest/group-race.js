// Gruppe: Rangliste des Tages (Top-Speed, Tiefenmeter, Pisten-km, Abfahrten) und Gruppen-Rekorde.
// Gezählt wird insgesamt über den Tag, nicht pro Piste.
//
// Eigene Werte kommen aus „Mein Tag“, die der anderen aus ihren Chip-Signalen (gleiche Auswertung).
// Echt liefert später der Server die Tageswerte jeder Person – hier rechnet die App sie selbst.

import { h, replace } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { load, save } from '../../js/core/storage.js';
import { number } from '../../js/utils/format.js';
import { isoDay } from '../../js/utils/time.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { skimap } from '../../js/services/slopes.js';
import { emptyDay, addPoint } from './day-stats.js';

const CATS = [
  { id: 'top', unit: 'km/h', value: (d) => Math.round(d.top), fmt: (v) => String(v) },
  { id: 'descent', unit: 'm', value: (d) => Math.round(d.descent), fmt: (v) => number(v) },
  { id: 'km', unit: 'km', value: (d) => d.km, fmt: (v) => number(v, 1) },
  { id: 'runs', unit: '', value: (d) => d.runs.length, fmt: (v) => String(v) },
];

export function mountRace(ctx, groupId, members) {
  const STATS_KEY = `gstats-${isoDay()}`;
  const REC_KEY = `grecords-${groupId}`;
  const stats = new Map(); // chip → Tageswerte (ohne Punkte-Liste)
  const saved = load(STATS_KEY, {});
  members.forEach((m) => {
    if (!m.me) stats.set(m.chip, { ...emptyDay(), ...saved[m.chip], points: [] });
  });
  let records = load(REC_KEY, {});
  let cat = 'top';
  let ticks = 0;
  const el = h('section', { class: 'card race' });

  /** Eigene Werte: aus „Mein Tag“ (nur wenn aufgezeichnet wird oder wurde) */
  const mine = () => {
    const d = load(`day-${isoDay()}`, null);
    return d && d.status !== 'idle' && Array.isArray(d.runs) ? d : null;
  };

  function onPoint(chip, p) {
    const d = stats.get(chip);
    if (!d) return;
    addPoint(d, p, skimap());
    d.points = d.points.slice(-2); // für die Auswertung reicht der letzte Punkt
    d.badges = [];
    if (++ticks % 10 === 0) persist();
  }

  function persist() {
    const out = {};
    stats.forEach((d, chip) => { out[chip] = { ...d, points: [] }; });
    save(STATS_KEY, out);
  }

  function rows(c) {
    return members.map((m) => {
      const d = m.me ? mine() : stats.get(m.chip);
      return { m, v: d ? c.value(d) : null };
    }).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  }

  /** Neue Gruppen-Rekorde prüfen (über alle Tage, im Browser gespeichert) */
  function checkRecords() {
    let changed = false;
    for (const c of CATS) {
      const best = rows(c)[0];
      if (!best || !best.v) continue;
      const old = records[c.id];
      if (!old || best.v > old.value) {
        records[c.id] = { value: best.v, name: best.m.name, chip: best.m.chip, date: isoDay() };
        changed = true;
        // Nur melden, wenn ein Rekord von einem früheren Tag fällt (sonst kommt am ersten Tag dauernd eine Meldung)
        if (old && old.value > 0 && old.date !== isoDay()) toast(t('race.newRecord', { name: best.m.name, what: t(`race.cat.${c.id}`), value: `${c.fmt(best.v)} ${c.unit}`.trim() }), { icon: 'trophy', ms: 5000 });
      }
    }
    if (changed) save(REC_KEY, records);
  }

  function render() {
    checkRecords();
    const c = CATS.find((x) => x.id === cat);
    const list = rows(c);
    const top = list[0]?.v;
    const rec = records[c.id];
    replace(el,
      h('div', { class: 'race-head' },
        h('h3', { class: 'card-title' }, t('race.title')),
        h('span', { class: 'muted small' }, t('race.today'))),
      h('div', { class: 'choice-row race-cats' },
        CATS.map((x) => h('button', {
          class: 'choice',
          'aria-pressed': String(x.id === cat),
          onclick: () => { cat = x.id; render(); },
        }, t(`race.cat.${x.id}`)))),
      h('ol', { class: 'race-list' }, list.map(({ m, v }, i) => {
        const lead = v != null && v === top && v > 0;
        return h('li', { class: `${lead ? 'is-lead' : ''}${m.me ? ' is-me' : ''}`, style: { '--c': m.color } },
          h('span', { class: 'race-pos num' }, lead ? icon('trophy') : String(i + 1)),
          h('span', { class: 'avatar' }, m.name[0]),
          h('span', { class: 'race-name' }, m.me ? t('group.you') : m.name),
          h('span', { class: 'race-bar' }, h('i', { style: { width: `${top && v ? Math.max(4, (v / top) * 100) : 0}%` } })),
          h('span', { class: 'race-val num' }, v == null ? '–' : c.fmt(v), v == null ? null : h('small', {}, ` ${c.unit}`)));
      })),
      !mine() ? h('p', { class: 'muted small' }, t('race.startDay')) : null,
      rec ? h('p', { class: 'race-record' }, icon('trophy'),
        h('span', {}, t('race.record'), ' ', h('strong', {}, `${c.fmt(rec.value)} ${c.unit}`.trim()), ` – ${rec.name}, ${dateLabel(rec.date)}`)) : null,
    );
  }

  return {
    el,
    onPoint,
    render,
    destroy: persist,
  };
}

function dateLabel(iso) {
  return iso === isoDay() ? t('weather.today') : new Date(`${iso}T12:00`).toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', { day: 'numeric', month: 'short' });
}
