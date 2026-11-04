// Suche: Hütten, Lifte, Pisten (auch nach Nummer, z. B. „21“).
// Leeres Feld antippen → ein paar Vorschläge (Talabfahrten, Streif, Hütten in der Nähe …).
// Eine Gruppe wie „Talabfahrten“ zeigt alle passenden Pisten in der Liste und auf der Karte.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { duration } from '../../js/utils/format.js';
import { t } from '../../js/core/i18n.js';
import { searchIndex, route } from '../../js/services/slopes.js';
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
let cache = { at: 0, list: null };

/** Vorschläge fürs leere Suchfeld, höchstens fünf. */
function suggestions(items, getPos, rental) {
  if (cache.list && Date.now() - cache.at < 20000) return cache.list;
  cache = { at: Date.now(), list: buildSuggestions(items, getPos, rental) };
  return cache.list;
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
  // Streif: alle Teile der Rennstrecke zusammen, auch die nur fürs Rennen präparierten
  const streifBase = pistes.find((x) => /^streif-rennstrecke$/i.test(x.name));
  const streif = streifBase && {
    ...streifBase,
    lines: items.filter((x) => x.type === 'piste' && (/^streif-rennstrecke/i.test(x.name) || (x.ref === '21' && !x.piste?.name)))
      .flatMap((x) => x.lines),
  };
  const huts = items.filter((x) => x.type === 'hut');
  const nearHuts = me ? [...huts].sort((a, b) => geoDistance(me, a.pos) - geoDistance(me, b.pos)).slice(0, 6) : [];
  const flying = items.find((x) => x.type === 'lift' && /^3S/i.test(x.name));
  const gondola = items.find((x) => x.type === 'lift' && x.name === 'Hahnenkammbahn');
  return [
    // Ins Tal: gleich die Route ans Ende der schnellsten Talabfahrt
    nearest && {
      id: 'down', icon: 'arrowDown', route: true,
      item: { ...nearest, name: `${nearest.name} ${t('search.sg.down.to')}`, pos: nearest.loPos, node: nearest.loNode },
      sub: t('search.sg.down.sub', { name: nearest.via, time: duration(nearest.eta) }),
    },
    valley.length && {
      id: 'valley', icon: 'piste', items: valley,
      // Filter: alle · endet bei einem Parkplatz · endet an der Kassa (Chip zurückgeben)
      filters: [
        { id: 'all', test: () => true },
        { id: 'park', test: (x) => !!x.park },
        kassa && { id: 'kassa', test: (x) => x.kassa, label: t('search.f.kassa', { name: kassa.name }) },
      ].filter(Boolean),
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
    streif && { id: 'streif', icon: 'flag', items: [streif] },
    flying && { id: 'flying', icon: 'gondola', items: [flying] },
    gondola && !nearest && { id: 'gondola', icon: 'gondola', items: [gondola] },
  ].filter(Boolean).slice(0, 6);
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
        onclick: () => (sg.route ? pick(sg.item) : openGroup(sg)),
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
          }, f.label || t(`search.f.${f.id}`), h('small', {}, String(n)));
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
    // „Talabfahrt“, „schwarze“ … getippt? Dann die passende Gruppe ganz oben anbieten
    const pq = plain(q);
    const groups = pq.length >= 3
      ? suggestions(items, getPos, rental).filter((sg) => sg.items?.length > 1 && plain(t(`search.sg.${sg.id}`)).split(/\s+/).some((w) => w.startsWith(pq) || pq.startsWith(w.slice(0, 6))))
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
      const pq = plain(input.value.trim());
      const sg = pq.length >= 3 && suggestions(items, getPos, rental).find((x) => x.items?.length > 1 && plain(t(`search.sg.${x.id}`)).split(/\s+/).some((w) => w.startsWith(pq) || pq.startsWith(w.slice(0, 6))));
      if (sg && active < 0) openGroup(sg);
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
