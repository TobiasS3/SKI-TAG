// Suche: Hütten, Lifte, Pisten (auch nach Nummer, z. B. „21“).
// Leeres Feld antippen → Gruppen, von denen es mehrere gibt (Talabfahrten, Pisten, Parkplätze, Hütten).
// Eine Gruppe zeigt alle passenden Orte in der Leiste und auf der Karte, mit Filtern.
// Einzelne Ziele (Zurück zum Start, Schnellster Weg ins Tal, Streif, 3S Bahn) stehen im Route-Tab: destinations().

import { h, reducedMotion } from '../../js/utils/dom.js';
import { duration } from '../../js/utils/format.js';
import { t } from '../../js/core/i18n.js';
import { searchIndex, route, routeToAny } from '../../js/services/slopes.js';
import { icon } from '../../js/components/icons.js';
import { placeLogo } from './place-media.js';
import { distance as geoDistance } from '../../js/map/geo.js';

const MAX = 8;
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

const BLACK = new Set(['advanced', 'expert']);
const PARK_WALK_M = 600; // so weit läuft man vom Pistenende noch zum Auto
const KASSA_M = 600;     // Pistenende so nah an der Talstation = zu Fuß an der Kassa (Streifalm → Hahnenkammbahn ~500 m)
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
let cache = { at: 0, pos: null, list: null };

function cached(items, getPos, rental) {
  // Neu rechnen nach 20 s, oder wenn man sich über 100 m bewegt hat (z. B. Position zum ersten Mal da)
  const pos = getPos?.() || null;
  const moved = !pos !== !cache.pos || (pos && geoDistance(pos, cache.pos) > 100);
  if (cache.list && !moved && Date.now() - cache.at < 20000) return cache.list;
  cache = { at: Date.now(), pos, list: buildSuggestions(items, getPos, rental) };
  return cache.list;
}

/** Gruppen fürs leere Suchfeld: alles, wovon es mehrere gibt und was auf die Karte kommt. */
const suggestions = (items, getPos, rental) => cached(items, getPos, rental).groups;

let indexed = null;
/**
 * Einzelne Ziele für „Wohin möchten Sie?“ im Route-Tab:
 * [{ id, icon, item, sub }] – item ist das Routenziel.
 */
export function destinations({ getPos, rental }) {
  indexed ||= searchIndex().map((item) => ({ ...item, key: plain(`${item.name} ${item.ref || ''}`) }));
  return cached(indexed, getPos, rental).singles;
}

/** Fahrzeit von hier zu einem Ziel, sonst null */
function timeTo(me, item) {
  if (!me) return null;
  const r = item.nodes ? routeToAny(me, item.nodes, item.pos, 'fast') : item.node != null ? route(me, item.node, 'fast') : null;
  return r && !r.unreachable ? r.time : null;
}

function buildSuggestions(items, getPos, rental) {
  const me = getPos?.();
  const pistes = items.filter((x) => x.type === 'piste' && usable(x));
  const parking = items.filter((x) => x.type === 'parking');
  // Kassa, an der der Chip gemietet wurde: dort gibt man ihn am Abend zurück
  const kassa = rental && items.find((x) => x.type === 'lift' && x.name === rental);
  // Talabfahrten: jede Abfahrt, die hinunter zu einer Talstation führt (Kitzbühel, Kirchberg, Jochberg, Pass Thurn …)
  const valley = pistes.filter((x) => x.loPos && x.lo < 1300 && x.hi - x.lo >= 300)
    .map((x) => {
      const run = { ...x };
      run.eta = timeToValley(me, run);
      // Wo kommt man unten an? Nächster Parkplatz (zu Fuß erreichbar) und ob dort die eigene Kassa ist
      const park = parking.map((p) => [p, geoDistance(x.loPos, p.pos)]).filter(([, d]) => d < PARK_WALK_M).sort((a, b) => a[1] - b[1])[0];
      run.park = park?.[0] || null;
      run.kassa = !!kassa && geoDistance(x.loPos, kassa.low) < KASSA_M;
      return run;
    })
    .sort((a, b) => (a.eta ?? 1e9) - (b.eta ?? 1e9) || (b.hi - b.lo) - (a.hi - a.lo));
  // Schon im Tal (unter 2 min bis unten)? Dann kein „ins Tal“
  const nearest = valley[0]?.eta != null && valley[0].eta >= 120 ? valley[0] : null;
  const streifBase = pistes.find((x) => /^streif-rennstrecke$/i.test(x.name));
  const huts = items.filter((x) => x.type === 'hut');
  const nearHuts = me ? [...huts].sort((a, b) => geoDistance(me, a.pos) - geoDistance(me, b.pos)).slice(0, 6) : [];
  const flying = items.find((x) => x.type === 'lift' && /^3S/i.test(x.name));
  // Pisten nach Farbe: jede Piste mit Nummer einmal, sortiert nach Nummer
  const byRef = (a, b) => (parseInt(a.ref, 10) || 999) - (parseInt(b.ref, 10) || 999) || String(a.ref).localeCompare(String(b.ref));
  const colored = pistes.filter((x) => x.ref && x.lines?.length && ['easy', 'intermediate', 'advanced', 'expert'].includes(x.diff)).sort(byRef);

  // Ausgangspunkt: Talstation, an der der Tag begonnen hat (dort wurde der Chip gemietet), und der Parkplatz daneben
  const startPark = kassa && parking.map((p) => [p, geoDistance(kassa.low, p.pos)]).filter(([, d]) => d < PARK_WALK_M).sort((a, b) => a[1] - b[1])[0]?.[0];
  const startItem = kassa && { ...kassa, name: t('dest.start.to', { name: kassa.name }), pos: kassa.low, node: kassa.lowNode };
  const startEta = startItem && timeTo(me, startItem);
  const atStart = startItem && me && geoDistance(me, startItem.pos) < 150;
  const parkEta = startPark && timeTo(me, startPark);
  const eta = (time) => (time != null ? ` · ${duration(time)}` : '');

  const singles = [
    startItem && !atStart && {
      id: 'start', icon: 'home', item: startItem, primary: true,
      sub: `${t('dest.start.sub', { name: kassa.name })}${eta(startEta)}`,
    },
    startPark && !atStart && {
      id: 'car', icon: 'parking', item: startPark,
      sub: `${startPark.name}${eta(parkEta)}`,
    },
    // Ins Tal: gleich die Route ans Ende der schnellsten Talabfahrt
    nearest && {
      id: 'down', icon: 'arrowDown',
      item: { ...nearest, name: `${nearest.name} ${t('search.sg.down.to')}`, pos: nearest.loPos, node: nearest.loNode },
      sub: t('search.sg.down.sub', { name: nearest.via, time: duration(nearest.eta) }),
    },
    streifBase && { id: 'streif', icon: 'flag', item: streifBase, sub: `${t('search.sg.streif.sub')}${eta(timeTo(me, streifBase))}` },
    flying && { id: 'flying', icon: 'gondola', item: flying, sub: `${t('search.sg.flying.sub')}${eta(timeTo(me, flying))}` },
  ].filter(Boolean);

  const groups = [
    valley.length && {
      id: 'valley', icon: 'piste', items: valley,
      // Filter: alle · endet bei einem Parkplatz · endet an der Kassa (Chip zurückgeben)
      filters: [
        { id: 'all', test: () => true },
        { id: 'park', test: (x) => !!x.park },
        kassa && { id: 'kassa', test: (x) => x.kassa, label: t('search.f.kassa', { name: kassa.name }) },
      ].filter(Boolean),
    },
    colored.length && {
      id: 'pistes', icon: 'piste', items: colored,
      // Filter nach Farbe wie auf den Schildern; „rot“ oder „schwarze“ tippen öffnet gleich den Filter
      filters: [
        { id: 'all', test: () => true },
        { id: 'easy', test: (x) => x.diff === 'easy', words: ['blau', 'blaue', 'leicht', 'blue', 'easy'] },
        { id: 'intermediate', test: (x) => x.diff === 'intermediate', words: ['rot', 'rote', 'mittel', 'red'] },
        { id: 'advanced', test: (x) => BLACK.has(x.diff), words: ['schwarz', 'schwarze', 'schwer', 'black'] },
      ],
    },
    parking.length && {
      id: 'parking', icon: 'parking',
      items: me ? [...parking].sort((a, b) => geoDistance(me, a.pos) - geoDistance(me, b.pos)) : parking,
      // Filter: alle · kostenlos · je Ort (Kitzbühel, Kirchberg …)
      filters: [
        { id: 'all', test: () => true },
        { id: 'free', test: (x) => x.parking.fee === false },
        ...[...new Set(parking.map((x) => x.parking.town))].map((town) => ({ id: `town-${town}`, label: town, test: (x) => x.parking.town === town })),
      ],
    },
    nearHuts.length && { id: 'huts', icon: 'hut', items: nearHuts },
  ].filter(Boolean);
  return { groups, singles };
}

/** Wohin führt die Route, wenn man eine Karte aus der Gruppe nimmt? */
function routeTarget(item, filter) {
  if (item.type !== 'piste' || !item.loPos) return item;
  // Talabfahrt mit Ziel Parkplatz: Route gleich bis zum Parkplatz
  if (filter === 'park' && item.park) return item.park;
  return { ...item, name: `${item.name} ${t('search.sg.down.to')}`, pos: item.loPos, node: item.loNode };
}

export function createSearch({ onPick, onShow, onGroup, getPos, rental }) {
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
  let groupFilter = null; // gewählter Filter in der Gruppe ('all', 'park' …)
  let selected = null; // eine Karte aus der Gruppe angetippt: nur sie steht auf der Karte

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
        : item.type === 'lift' || item.type === 'parking' ? item.sub : item.type === 'piste' && item.hi ? t('search.pisteDrop', { m: Math.round(item.hi - item.lo) }) : t(`search.${item.type}`))),
    i === 0 && item.eta != null ? h('span', { class: 'search-badge' }, t('search.fastest')) : null);
  }

  function showSuggestions() {
    const list0 = suggestions(items, getPos, rental);
    results = [];
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    list.replaceChildren(
      h('li', { class: 'search-head', role: 'presentation' }, t('search.suggest')),
      ...list0.map((sg) => h('li', {
        class: 'search-item search-suggest',
        role: 'option',
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => openGroup(sg),
      },
      h('span', { class: `search-sg-icon sg-${sg.id}` }, icon(sg.icon)),
      h('span', { class: 'search-text' },
        h('strong', {}, t(`search.sg.${sg.id}`)),
        h('small', {}, sg.sub || (sg.items.length > 1 ? t('search.sg.count', { n: sg.items.length }) : t(`search.sg.${sg.id}.sub`)))),
      icon('chevron'))));
  }

  /** Untertitel einer Karte in der Leiste */
  function cardSub(item, i) {
    if (item.type === 'parking') {
      const p = item.parking;
      return [p.station.replace(/ Kitzbüheler Alpen I+$/, ''), p.fee === false ? t('park.free') : p.fee ? t('park.fee') : null].filter(Boolean).join(' · ');
    }
    if (item.eta != null) {
      // Ziel Parkplatz: Zeit + welcher Parkplatz („1 min · P1 Hahnenkammbahn“), sonst „Am schnellsten“
      if (groupFilter === 'park' && item.park) return `${duration(item.eta)} · ${item.park.name.replace(/Parkplatz /, '')}`;
      return i === 0 ? `${t('search.fastest')} · ${duration(item.eta)}` : duration(item.eta);
    }
    if (item.type === 'lift') return item.sub;
    if (item.type === 'piste' && item.hi) return `${Math.round(item.hi - item.lo)} hm`;
    return t(`search.${item.type}`);
  }

  /**
   * Kleine Karte in der Leiste. Erstes Antippen: nur dieser Ort auf der Karte, groß.
   * Nochmal antippen: Ort öffnen (Infos, Route).
   */
  function card(item, i, sg) {
    const isSel = selected === item;
    return h('li', {
      class: `search-card${isSel ? ' is-selected' : ''}`,
      role: 'option',
      'aria-selected': String(isSel),
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => {
        if (!isSel) return openGroup(sg, groupFilter, item);
        list.hidden = true; // Leiste weg, damit der Ort frei zu sehen ist; Suchfeld antippen holt sie zurück
        onShow?.(item, sg);
      },
    },
    thumb(item),
    h('span', { class: 'search-text' }, h('strong', {}, item.name), h('small', { class: i === 0 && item.eta != null ? 'is-fast' : '' }, cardSub(item, i))),
    isSel
      ? h('button', {
        type: 'button',
        class: 'search-card-go',
        'aria-label': t('route.show'),
        onpointerdown: (e) => e.preventDefault(),
        onclick: (e) => { e.stopPropagation(); pick(routeTarget(item, groupFilter)); },
      }, icon('route'))
      : icon('chevron'));
  }

  /** Gruppe öffnen (z. B. Talabfahrten). filter: gewählter Filter, pick: eine Karte daraus allein zeigen */
  function openGroup(sg, filter = sg.filters ? 'all' : null, pick = null) {
    group = sg;
    groupFilter = filter;
    selected = pick;
    el.classList.add('has-group');
    clear.hidden = false;
    const test = sg.filters?.find((f) => f.id === filter)?.test || (() => true);
    const shown = sg.items.filter(test);
    results = shown;
    active = -1;
    const single = shown.length === 1;
    const back = () => {
      if (selected) return openGroup(sg, groupFilter); // zurück zu allen der Gruppe
      group = null;
      selected = null;
      el.classList.remove('has-group');
      onGroup?.(null);
      showSuggestions();
      input.focus();
    };
    list.replaceChildren(
      h('li', { class: 'search-head search-head-back', role: 'presentation' },
        h('button', {
          type: 'button',
          class: 'search-back',
          onpointerdown: (e) => e.preventDefault(),
          onclick: back,
        }, icon('back'), h('span', {}, t(`search.sg.${sg.id}`),
          selected ? h('small', {}, ` · ${t('search.showAll')}`) : single ? null : h('small', {}, ` · ${shown.length}`))),
        h('button', { type: 'button', class: 'search-done', onclick: closeGroup }, t('search.done'))),
      sg.filters ? h('li', { class: 'search-filters-wrap', role: 'presentation' },
        h('div', { class: 'search-filters', role: 'group' }, sg.filters.map((f) => {
          const n = sg.items.filter(f.test).length;
          return h('button', {
            type: 'button',
            class: `search-filter${f.id === filter ? ' is-on' : ''}`,
            'aria-pressed': String(f.id === filter),
            disabled: n ? null : true,
            onpointerdown: (e) => e.preventDefault(),
            onclick: () => openGroup(sg, f.id),
          }, f.words ? h('i', { class: `dot diff-${f.id}` }) : null, f.label || t(`search.f.${f.id}`), h('small', {}, String(n)));
        }))) : null,
      shown.length
        ? h('li', { class: `search-strip-wrap${single ? ' is-single' : ''}`, role: 'presentation' },
          h('ul', { class: 'search-strip' }, shown.map((x, k) => card(x, k, sg))))
        : h('li', { class: 'search-empty', role: 'presentation' }, t('search.f.none')),
    );
    // Gewählte Karte ins Bild schieben
    if (selected) requestAnimationFrame(() => list.querySelector('.search-card.is-selected')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }));
    // Tastatur zu, sonst verdeckt sie am Handy genau die Karte, auf der die Gruppe aufleuchtet
    input.blur();
    onGroup?.(selected ? [selected] : shown, sg, items, { filter, focus: !!selected });
  }

  function closeGroup() {
    input.value = '';
    clear.hidden = true;
    close();
    onGroup?.(null);
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
    // „Talabfahrt“, „rote“, „Parkplatz“ … getippt? Dann die passende Gruppe ganz oben anbieten
    const groups = groupHits(q);
    active = -1;
    list.hidden = !q;
    input.setAttribute('aria-expanded', String(!!q));
    if (!q) return;
    if (!results.length && !groups.length) {
      list.replaceChildren(h('li', { class: 'search-empty' }, t('search.empty')));
      return;
    }
    list.replaceChildren(
      ...groups.map(({ sg, filter }) => {
        const f = sg.filters?.find((x) => x.id === filter);
        const n = f ? sg.items.filter(f.test).length : sg.items.length;
        return h('li', {
          class: 'search-item search-suggest',
          role: 'option',
          onpointerdown: (e) => e.preventDefault(),
          onclick: () => openGroup(sg, filter || undefined),
        },
        h('span', { class: `search-sg-icon sg-${sg.id}${f?.words ? ` sg-diff-${f.id}` : ''}` }, icon(sg.icon)),
        h('span', { class: 'search-text' },
          h('strong', {}, f?.words ? t(`search.sg.${sg.id}.${f.id}`) : t(`search.sg.${sg.id}`)),
          h('small', {}, t('search.sg.count', { n }))),
        icon('chevron'));
      }),
      ...results.map(row));
  }

  /** Welche Gruppen passen zum Getippten? Titel („Talabfahrten“) oder Filter-Wort („rote“ → Pisten, Filter Rot) */
  function groupHits(query) {
    const pq = plain(query.trim());
    if (pq.length < 3) return [];
    const hits = [];
    for (const sg of suggestions(items, getPos, rental)) {
      if (!(sg.items?.length > 1)) continue;
      const words = plain(t(`search.sg.${sg.id}`)).split(/\s+/);
      const byWord = sg.filters?.find((f) => f.words?.some((w) => w === pq || (pq.length >= 4 && w.startsWith(pq))));
      if (byWord) hits.push({ sg, filter: byWord.id });
      else if (words.some((w) => w.startsWith(pq) || pq.startsWith(w.slice(0, 6)))) hits.push({ sg, filter: null });
    }
    return hits;
  }

  function close() {
    group = null;
    selected = null;
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
      const hit = groupHits(input.value)[0];
      if (hit && active < 0) openGroup(hit.sg, hit.filter || undefined);
      else if (results.length) pick(results[Math.max(active, 0)]);
    }
    if (e.key === 'Escape') { input.value = ''; close(); onGroup?.(null); input.blur(); }
  });
  input.addEventListener('focus', () => {
    el.classList.add('is-focused');
    if (group) { list.hidden = false; return; }
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

  return { el, closeGroup: () => group && closeGroup() };
}

/** Kleines Bild vorne: Logo, Pistenschild oder Liftsymbol. */
export function thumb(item) {
  return placeLogo(item);
}
