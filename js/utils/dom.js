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
