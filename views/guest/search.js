// Suche: Hütten, Lifte, Pisten (auch nach Nummer, z. B. „21“).

import { h } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { searchIndex } from '../../js/services/slopes.js';
import { icon } from '../../js/components/icons.js';
import { placeLogo } from './place-media.js';

const MAX = 8;
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export function createSearch({ onPick }) {
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

  function render() {
    const q = input.value.trim();
    clear.hidden = !q;
    results = find(q);
    active = -1;
    list.hidden = !q;
    input.setAttribute('aria-expanded', String(!!q));
    if (!q) return;
    if (!results.length) {
      list.replaceChildren(h('li', { class: 'search-empty' }, t('search.empty')));
      return;
    }
    list.replaceChildren(...results.map((item, i) => h('li', {
      class: 'search-item',
      role: 'option',
      id: `sr-${i}`,
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => pick(item),
    },
      thumb(item),
      h('span', { class: 'search-text' },
        h('strong', {}, item.name),
        h('small', {}, item.type === 'lift' ? item.sub : t(`search.${item.type}`))),
    )));
  }

  function pick(item) {
    input.value = '';
    render();
    input.blur();
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
    if (e.key === 'Enter' && results.length) pick(results[Math.max(active, 0)]);
    if (e.key === 'Escape') { input.value = ''; render(); input.blur(); }
  });
  input.addEventListener('focus', () => el.classList.add('is-focused'));
  input.addEventListener('blur', () => el.classList.remove('is-focused'));
  clear.addEventListener('click', () => { input.value = ''; render(); input.focus(); });

  return { el };
}

/** Kleines Bild vorne: Logo, Pistenschild oder Liftsymbol. */
export function thumb(item) {
  return placeLogo(item);
}
