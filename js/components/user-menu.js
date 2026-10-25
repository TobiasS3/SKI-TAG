// Menü oben rechts (Bergbahn, Skischule): Wer bin ich, eigene Einträge, Sprache, Abmelden.
//
//   const menu = createUserMenu({ initial: 'M', head: () => [...], items: () => [...], onLogout });
//   topbar.append(menu.el);

import { h } from '../utils/dom.js';
import { t, toggleLang } from '../core/i18n.js';
import { icon } from './icons.js';

export function createUserMenu({ initial, head = () => [], items = () => [], onLogout }) {
  const button = h('button', { class: 'avatar-btn', 'data-i18n-label': 'top.menu', 'aria-expanded': 'false' }, initial);
  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' });
  const el = h('div', { class: 'menu-wrap' }, button, menu);

  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const item = (name, label, onclick) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { close(); onclick(); } }, icon(name), label);

  function render() {
    menu.replaceChildren(
      ...head(),
      ...items().map(([name, label, fn]) => item(name, label, fn)),
      item('globe', t('lang.switch'), toggleLang),
      item('logout', t('top.logout'), onLogout),
    );
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    render();
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  });
  const onDoc = (e) => !menu.contains(e.target) && close();
  document.addEventListener('click', onDoc);

  return { el, close, destroy: () => document.removeEventListener('click', onDoc) };
}
