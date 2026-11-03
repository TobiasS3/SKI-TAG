// „Mein Tag“: Challenges, Höhen-Vergleich, Entdecker, Hüttenpass, Familien-Ziel.
// Alles rechnet aus den Tageswerten. Bewusst nie Tempo: belohnt wird, was man erlebt.

import { h } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { load } from '../../js/core/storage.js';
import { number, distance } from '../../js/utils/format.js';
import { isoDay } from '../../js/utils/time.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { skimap } from '../../js/services/slopes.js';
import { placeLogo } from './place-media.js';

const colors = (d) => ['easy', 'intermediate', 'advanced'].filter((k) => (d.kmByDiff[k] || 0) > 0.05).length;

const CHALLENGES = [
  { id: 'runs5', icon: 'piste', goal: 5, value: (d) => d.runs.length },
  { id: 'vert2000', icon: 'arrowDown', goal: 2000, value: (d) => Math.round(d.descent), unit: 'm' },
  { id: 'colors', icon: 'layers', goal: 3, value: colors },
  { id: 'lifts5', icon: 'gondola', goal: 5, value: (d) => Object.keys(d.liftsUsed).length },
  { id: 'huts3', icon: 'hut', goal: 3, value: (d) => (d.huts || []).length },
  { id: 'high', icon: 'mountain', goal: 1, value: (d) => (d.maxAlt >= 1900 ? 1 : 0), single: true },
  { id: 'valley', icon: 'flag', goal: 1, value: (d) => (d.runs.some((r) => r.minAlt <= 950 && r.drop >= 400) ? 1 : 0), single: true },
];

// Bekannte Höhen in Metern: So fühlen sich Tiefenmeter nach etwas an
const LANDMARKS = [
  ['Stephansdom', 136],
  ['Eiffelturm', 330],
  ['Burj Khalifa', 828],
  ['Großglockner', 3798],
  ['Mont Blanc', 4806],
  ['Mount Everest', 8849],
];

function bar(f) {
  return h('span', { class: 'meter' }, h('i', { style: { width: `${Math.round(Math.min(1, f) * 100)}%` } }));
}

/** Gemeinsame Abfahrten der ganzen Gruppe heute (eigene plus die der anderen) */
function groupRuns(day) {
  const others = load(`gstats-${isoDay()}`, {});
  return day.runs.length + Object.values(others).reduce((sum, d) => sum + (d.runs?.length || 0), 0);
}

/** Neu geschaffte Challenges melden. Gibt true zurück, wenn sich etwas geändert hat. */
export function checkChallenges(day) {
  if (day.status !== 'running') return false;
  day.doneCh ||= [];
  let changed = false;
  for (const c of CHALLENGES) {
    if (day.doneCh.includes(c.id) || c.value(day) < c.goal) continue;
    day.doneCh.push(c.id);
    changed = true;
    toast(t('ch.done', { name: t(`ch.${c.id}`) }), { icon: 'trophy', ms: 4000 });
    navigator.vibrate?.([30, 40, 30]);
  }
  return changed;
}

export function challengeCard(day) {
  const open = CHALLENGES.map((c) => ({ c, v: Math.min(c.value(day), c.goal) }));
  const done = open.filter((x) => x.v >= x.c.goal).length;
  return h('section', { class: 'card ch-card' },
    h('div', { class: 'card-head' },
      h('h3', { class: 'card-title' }, t('ch.title')),
      h('span', { class: 'num ch-count' }, `${done}/${CHALLENGES.length}`)),
    h('ul', { class: 'ch-list' }, open.sort((a, b) => (b.v / b.c.goal) - (a.v / a.c.goal)).map(({ c, v }) => {
      const finished = v >= c.goal;
      return h('li', { class: finished ? 'is-done' : '' },
        h('span', { class: 'ch-mark' }, icon(finished ? 'check' : c.icon)),
        h('span', { class: 'ch-text' },
          h('strong', {}, t(`ch.${c.id}`)),
          c.single ? null : bar(v / c.goal)),
        c.single ? null : h('span', { class: 'num ch-val' }, number(v), h('small', {}, ` / ${number(c.goal)}${c.unit ? ` ${c.unit}` : ''}`)));
    })));
}

export function compareCard(day) {
  const m = day.descent;
  const reached = [...LANDMARKS].reverse().find(([, height]) => m >= height);
  const next = LANDMARKS.find(([, height]) => m < height);
  const times = reached ? Math.floor(m / reached[1]) : 0;
  return h('section', { class: 'card cmp-card' },
    h('p', { class: 'cmp-big' },
      reached
        ? t('cmp.done', { n: times, name: reached[0] })
        : t('cmp.start')),
    next ? bar(m / next[1]) : null,
    next ? h('p', { class: 'small muted' }, t('cmp.next', { m: number(Math.ceil(next[1] - m)), name: next[0] })) : null);
}

export function explorerCard(day) {
  const map = skimap();
  const used = Object.keys(day.liftsUsed);
  const pct = Math.round((used.length / map.lifts.length) * 100);
  return h('section', { class: 'card exp-card' },
    h('div', { class: 'card-head' },
      h('h3', { class: 'card-title' }, t('exp.title')),
      h('span', { class: 'num exp-pct' }, `${pct} %`)),
    bar(used.length / map.lifts.length),
    h('p', { class: 'small muted' }, t('exp.text', { n: used.length, total: map.lifts.length })));
}

const SLOTS = 3;

export function hutPassCard(day, ctx) {
  const map = skimap();
  const visited = (day.huts || []).map((name) => map.huts.find((x) => x.name === name)).filter(Boolean);
  const me = ctx.me.pos;
  const next = me
    ? map.huts.filter((x) => !visited.includes(x)).sort((a, b) => geoDistance(me, a.pos) - geoDistance(me, b.pos))[0]
    : null;
  const slots = [...visited.slice(-SLOTS)];
  while (slots.length < SLOTS) slots.push(null);
  return h('section', { class: 'card pass-card' },
    h('h3', { class: 'card-title' }, t('pass.title')),
    h('div', { class: 'pass-stamps' }, slots.map((hut) => (hut
      ? h('span', { class: 'pass-stamp is-set', title: hut.name }, placeLogo({ type: 'hut', name: hut.name, hut }), h('small', {}, hut.name))
      : h('span', { class: 'pass-stamp' }, icon('hut'))))),
    next ? h('button', {
      class: 'quick-item pass-next',
      onclick: () => ctx.show({ type: 'hut', name: next.name, pos: next.pos, node: next.node, hut: next }),
    },
    placeLogo({ type: 'hut', name: next.name, hut: next }),
    h('span', { class: 'quick-text' },
      h('strong', {}, next.name),
      h('small', {}, t('pass.next', { dist: distance(geoDistance(me, next.pos)) }))),
    icon('chevron')) : null);
}

const FAMILY_GOAL = 20;

export function familyCard(day, ctx) {
  if (!ctx.session.group) return null;
  const n = groupRuns(day);
  return h('section', { class: 'card fam-card' },
    h('div', { class: 'card-head' },
      h('h3', { class: 'card-title' }, t('fam.title')),
      h('span', { class: 'num ch-count' }, `${Math.min(n, FAMILY_GOAL)}/${FAMILY_GOAL}`)),
    bar(n / FAMILY_GOAL),
    h('p', { class: 'small muted' }, t(n >= FAMILY_GOAL ? 'fam.done' : 'fam.text')));
}
