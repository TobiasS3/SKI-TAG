// Kurzer Hinweis, verschwindet von selbst. toast('Gespeichert', { icon: 'check' })

import { h } from '../utils/dom.js';
import { icon } from './icons.js';

let stack = null;

export function toast(text, { icon: name = null, ms = 3200 } = {}) {
  if (!stack) {
    stack = h('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  const el = h('div', { class: 'toast' }, name ? icon(name) : null, h('span', {}, text));
  stack.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, ms);
}
