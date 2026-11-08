// Kleine Helfer für HTML-Elemente.

/**
 * Element bauen: h('button', { class: 'btn', onclick: fn }, 'Text')
 * Kinder dürfen Strings, Elemente, Arrays oder null sein.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Inhalt eines Elements ersetzen. */
export function replace(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

/** Nutzer will weniger Bewegung? (Systemeinstellung) */
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Breite Ansicht: Bereich links statt unten. Gilt am Computer/Tablet und am Handy quer
 * (gleiche Bedingung wie die @media-Regeln in den CSS-Dateien).
 */
export const WIDE_MEDIA = '(min-width: 900px), (orientation: landscape) and (max-height: 520px) and (min-width: 640px)';
export const isWide = () => matchMedia(WIDE_MEDIA).matches;


/**
 * Weicher Übergang für neuen Inhalt: kommt leicht von der Seite (dir: 1 = von rechts, -1 = von links,
 * 0 = von unten) und blendet ein. Bei „weniger Bewegung“ sofort.
 */
export function slideIn(el, dir = 0, ms = 180) {
  if (!el?.animate || reducedMotion()) return;
  // Klein und kurz: nur ein Hauch Bewegung, damit es sich nicht wie Laden anfühlt
  const from = dir ? `translateX(${dir * 8}px)` : 'translateY(6px)';
  el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: Math.min(ms, 200), easing: 'ease-out' });
}

/**
 * Macht el.hidden weich: Auf = wächst leicht aus der Ecke (origin) und blendet ein,
 * Zu = schrumpft leicht und blendet aus, erst danach wirklich versteckt.
 * Wer auch immer el.hidden setzt, bekommt den Übergang automatisch.
 */
export function smoothHidden(el, origin = 'top right') {
  const native = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
  let out = null;
  el.style.transformOrigin = origin;
  Object.defineProperty(el, 'hidden', {
    configurable: true,
    get: () => native.get.call(el),
    set: (v) => {
      const was = native.get.call(el);
      if (!v) {
        out?.cancel();
        out = null;
        native.set.call(el, false);
        if (was && el.animate && !reducedMotion()) {
          el.animate([{ opacity: 0, transform: 'scale(.97) translateY(-3px)' }, { opacity: 1, transform: 'none' }],
            { duration: 160, easing: 'ease-out' });
        }
        return;
      }
      if (was || out) return;
      if (!el.animate || reducedMotion()) return native.set.call(el, true);
      out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }],
        { duration: 120, easing: 'ease-in' });
      out.onfinish = () => { out = null; native.set.call(el, true); };
    },
  });
  return el;
}
