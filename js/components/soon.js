// Platzhalter für Ansichten, die noch nicht gebaut sind (Bergbahn, Skischule).

import { h } from '../utils/dom.js';
import { t, translate } from '../core/i18n.js';
import { endSession } from '../core/session.js';
import { go } from '../core/router.js';
import { icon } from './icons.js';

export function mountSoon(root, session) {
  const page = h('main', { class: 'soon' },
    h('img', { src: 'assets/images/logo.svg', alt: '', width: 64, height: 64 }),
    h('p', { class: 'muted' }, t(`role.${session.role}`)),
    h('h1', { class: 'title', 'data-i18n': 'soon.title' }),
    h('p', { class: 'muted', 'data-i18n': 'soon.text' }),
    h('button', { class: 'btn btn-quiet', onclick: () => { endSession(); go('login'); } },
      icon('logout'), h('span', { 'data-i18n': 'top.logout' })),
  );
  translate(page);
  root.append(page);
  return () => {};
}
