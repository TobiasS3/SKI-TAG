// Suche: Hütten, Lifte, Pisten (auch nach Nummer, z. B. „21“).
// Leeres Feld antippen → ein paar Vorschläge (Talabfahrten, Streif, Hütten in der Nähe …).
// Eine Gruppe wie „Talabfahrten“ zeigt alle passenden Pisten in der Liste und auf der Karte.

import { h } from '../../js/utils/dom.js';
import { duration } from '../../js/utils/format.js';
import { t } from '../../js/core/i18n.js';
import { searchIndex, route } from '../../js/services/slopes.js';
import { icon } from '../../js/components/icons.js';
import { placeLogo } from './place-media.js';
import { distance as geoDistance } from '../../js/map/geo.js';

const MAX = 8;
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

const BLACK = new Set(['advanced', 'expert']);
const usable = (x) => x.name && !/skiroute|nur während|verbindung/i.test(x.name);

/** Wie lange von hier bis ans untere Ende der Abfahrt (Route übers Pistennetz), sonst null */
function timeToValley(me, run) {
  if (!me || run.loNode == null) return null;
  const r = route(me, run.loNode, 'fast');
  if (!r || r.unreachable) return null;
  // Über welche Piste fährt man am längsten? Die nennen wir („Über Streif Familienabfahrt“)
  const main = r.steps.filter((x) => x.kind === 'piste' && x.item?.name && usable(x.item)).sort((a, b) => b.len - a.len)[0];
  run.via = main?.item.name || run.name;
  return r.time;
}

// Vorschläge kurz merken: die Fahrzeiten ins Tal sind 15 Routen, nicht bei jedem Buchstaben neu
let cache = { at: 0, list: null };

/** Vorschläge fürs leere Suchfeld, höchstens fünf. */
function suggestions(items, getPos) {
  if (cache.list && Date.now() - cache.at < 20000) return cache.list;
  cache = { at: Date.now(), list: buildSuggestions(items, getPos) };
  return cache.list;
}

function buildSuggestions(items, getPos) {
  const me = getPos?.();
  const pistes = items.filter((x) => x.type === 'piste' && usable(x));
  // Talabfahrten: die schnellste von hier zuerst
  const valley = pistes.filter((x) => x.lo < 950 && x.hi - x.lo >= 400 && x.loPos)
    .map((x) => { const run = { ...x }; run.eta = timeToValley(me, run); return run; })
    .sort((a, b) => (a.eta ?? 1e9) - (b.eta ?? 1e9) || (b.hi - b.lo) - (a.hi - a.lo));
  // Schon im Tal (unter 2 min bis unten)? Dann kein „ins Tal“
  const nearest = valley[0]?.eta != null && valley[0].eta >= 120 ? valley[0] : null;
  const blacks = pistes.filter((x) => BLACK.has(x.diff) && x.hi - x.lo >= 150);
  const streif = pistes.find((x) => /^streif-rennstrecke$/i.test(x.name));
  const huts = items.filter((x) => x.type === 'hut');
  const nearHuts = me ? [...huts].sort((a, b) => geoDistance(me, a.pos) - geoDistance(me, b.pos)).slice(0, 6) : [];
  const gondola = items.find((x) => x.type === 'lift' && x.name === 'Hahnenkammbahn');
  return [
    // Ins Tal: gleich die Route ans Ende der schnellsten Talabfahrt
    nearest && {
      id: 'down', icon: 'arrowDown',
      item: { ...nearest, name: `${nearest.name} ${t('search.sg.down.to')}`, pos: nearest.loPos, node: nearest.loNode },
      sub: t('search.sg.down.sub', { name: nearest.via, time: duration(nearest.eta) }),
    },
    valley.length && { id: 'valley', icon: 'piste', items: valley },
    nearHuts.length && { id: 'huts', icon: 'hut', items: nearHuts },
    streif && { id: 'streif', icon: 'flag', item: streif },
    blacks.length && { id: 'black', icon: 'piste', items: blacks },
    gondola && !nearest && { id: 'gondola', icon: 'gondola', item: gondola },
  ].filter(Boolean).slice(0, 5);
}

export function createSearch({ onPick, onGroup, getPos }) {
  const items = searchIndex().map((item) => ({ ...item, key: plain(`${item.name} ${item.ref || ''}`) }));

  const input = h('input', {
    type: 'search',
    class: 'search-input',
    'data-i18n-placeholder': 'search.placeholder',
    'aria-label': t('search.placeholder'),
    autocomplete: 'off',
    enterkeyhint: 'search',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': 'search-results',
  });
  const clear = h('button', { class: 'search-clear', type: 'button', hidden: true, 'aria-label': 'Löschen' }, icon('close'));
  const list = h('ul', { class: 'search-results', id: 'search-results', role: 'listbox', hidden: true });
  const el = h('div', { class: 'search' },
    h('div', { class: 'search-box' }, icon('search'), input, clear),
    list,
  );

  let results = [];
  let active = -1;

  function find(query) {
    const q = plain(query.trim());
    if (!q) return [];
    const scored = [];
    for (const item of items) {
      let score = -1;
      if (item.type === 'piste' && item.ref && plain(item.ref) === q) score = 0;
      else if (item.key.startsWith(q)) score = 1;
      else if (item.key.split(/\s+/).some((w) => w.startsWith(q))) score = 2;
      else if (item.key.includes(q)) score = 3;
      if (score >= 0) scored.push([score, item]);
    }
    const order = { hut: 0, lift: 1, piste: 2 };
    scored.sort((a, b) => a[0] - b[0] || order[a[1].type] - order[b[1].type] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, MAX).map(([, item]) => item);
  }

  let group = null; // offene Gruppe, z. B. alle Talabfahrten

  function row(item, i) {
    return h('li', {
      class: 'search-item',
      role: 'option',
      id: `sr-${i}`,
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => pick(item),
    },
    thumb(item),
    h('span', { class: 'search-text' },
      h('strong', {}, item.name),
      h('small', {}, item.eta != null
        ? t('search.valleyEta', { m: Math.round(item.hi - item.lo), time: duration(item.eta) })
        : item.type === 'lift' ? item.sub : item.type === 'piste' && item.hi ? t('search.pisteDrop', { m: Math.round(item.hi - item.lo) }) : t(`search.${item.type}`))),
    i === 0 && item.eta != null ? h('span', { class: 'search-badge' }, t('search.fastest')) : null);
  }

  function showSuggestions() {
    const list0 = suggestions(items, getPos);
    results = [];
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    list.replaceChildren(
      h('li', { class: 'search-head', role: 'presentation' }, t('search.suggest')),
      ...list0.map((sg) => h('li', {
        class: 'search-item search-suggest',
        role: 'option',
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => (sg.item ? pick(sg.item) : openGroup(sg)),
      },
      h('span', { class: `search-sg-icon sg-${sg.id}` }, icon(sg.icon)),
      h('span', { class: 'search-text' },
        h('strong', {}, t(`search.sg.${sg.id}`)),
        h('small', {}, sg.sub || (sg.items ? t('search.sg.count', { n: sg.items.length }) : t(`search.sg.${sg.id}.sub`)))),
      icon('chevron'))));
  }

  function openGroup(sg) {
    group = sg;
    el.classList.add('has-group');
    clear.hidden = false;
    results = sg.items;
    active = -1;
    list.replaceChildren(
      h('li', { class: 'search-head search-head-back', role: 'presentation' },
        h('button', {
          type: 'button',
          class: 'search-back',
          onpointerdown: (e) => e.preventDefault(),
          onclick: () => { group = null; el.classList.remove('has-group'); onGroup?.(null); showSuggestions(); },
        }, icon('back'), t(`search.sg.${sg.id}`)),
        h('button', { type: 'button', class: 'search-done', onclick: () => { input.value = ''; clear.hidden = true; close(); onGroup?.(null); } }, t('search.done'))),
      ...sg.items.map(row));
    // Tastatur zu, sonst verdeckt sie am Handy genau die Karte, auf der die Gruppe aufleuchtet
    input.blur();
    onGroup?.(sg.items, sg, items);
  }

  function render() {
    const q = input.value.trim();
    clear.hidden = !q;
    if (!q && document.activeElement === input) {
      if (group) return;
      showSuggestions();
      return;
    }
    group = null;
    el.classList.remove('has-group');
    results = find(q);
    // „Talabfahrt“, „schwarze“ … getippt? Dann die passende Gruppe ganz oben anbieten
    const pq = plain(q);
    const groups = pq.length >= 3
      ? suggestions(items, getPos).filter((sg) => sg.items && plain(t(`search.sg.${sg.id}`)).split(/\s+/).some((w) => w.startsWith(pq) || pq.startsWith(w.slice(0, 6))))
      : [];
    active = -1;
    list.hidden = !q;
    input.setAttribute('aria-expanded', String(!!q));
    if (!q) return;
    if (!results.length && !groups.length) {
      list.replaceChildren(h('li', { class: 'search-empty' }, t('search.empty')));
      return;
    }
    list.replaceChildren(
      ...groups.map((sg) => h('li', {
        class: 'search-item search-suggest',
        role: 'option',
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => openGroup(sg),
      },
      h('span', { class: `search-sg-icon sg-${sg.id}` }, icon(sg.icon)),
      h('span', { class: 'search-text' },
        h('strong', {}, t(`search.sg.${sg.id}`)),
        h('small', {}, t('search.sg.count', { n: sg.items.length }))),
      icon('chevron'))),
      ...results.map(row));
  }

  function close() {
    group = null;
    el.classList.remove('has-group');
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function pick(item) {
    input.value = '';
    input.blur();
    close();
    onGroup?.(null);
    onPick(item);
  }

  function move(dir) {
    if (!results.length) return;
    active = (active + dir + results.length) % results.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', `sr-${active}`);
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    if (e.key === 'Enter') {
      const pq = plain(input.value.trim());
      const sg = pq.length >= 3 && suggestions(items, getPos).find((x) => x.items && plain(t(`search.sg.${x.id}`)).split(/\s+/).some((w) => w.startsWith(pq) || pq.startsWith(w.slice(0, 6))));
      if (sg && active < 0) openGroup(sg);
      else if (results.length) pick(results[Math.max(active, 0)]);
    }
    if (e.key === 'Escape') { input.value = ''; close(); onGroup?.(null); input.blur(); }
  });
  input.addEventListener('focus', () => {
    el.classList.add('is-focused');
    if (!input.value.trim()) showSuggestions();
  });
  input.addEventListener('blur', () => {
    el.classList.remove('is-focused');
    // Am iPhone kommt „blur“ vor dem Tipp auf die Liste – erst kurz warten, sonst ist sie schon weg.
    // Eine offene Gruppe bleibt stehen, damit man auf der Karte schauen und schieben kann.
    setTimeout(() => {
      if (document.activeElement !== input && !input.value.trim() && !group) close();
    }, 350);
  });
  clear.addEventListener('click', () => {
    input.value = '';
    if (group) { close(); onGroup?.(null); }
    render();
    input.focus();
  });

  return { el };
}

/** Kleines Bild vorne: Logo, Pistenschild oder Liftsymbol. */
export function thumb(item) {
  return placeLogo(item);
}
