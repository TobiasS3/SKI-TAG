// Meldung oben unter der Kopfleiste, mit Knopf und ×. Es ist immer nur eine sichtbar:
// Kommt eine zweite dazu, wartet sie, bis die erste weg ist.
// topNote(page, { lead, title, text, action, onAction, onClose }) → { close() }
//   lead = kleines Bild links (z. B. Gesichter der Gruppe oder ein Symbol)

import { h } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { icon } from '../../js/components/icons.js';

let showing = null;
const waiting = [];

export function topNote(page, opts) {
  const note = { page, opts, el: null, closed: false, close: () => closeNote(note) };
  if (showing) waiting.push(note);
  else show(note);
  return { close: note.close };
}

function show(note) {
  const { lead, title, text, action, onAction, onClose } = note.opts;
  showing = note;
  note.el = h('div', { class: 'top-note', role: 'status' },
    h('div', { class: 'top-note-lead', 'aria-hidden': 'true' }, lead),
    h('div', { class: 'top-note-text' },
      h('strong', {}, title),
      h('small', {}, text)),
    h('button', { class: 'btn btn-small', onclick: () => { note.close(); onAction?.(); } }, action),
    h('button', { class: 'top-note-close', 'aria-label': t('close'), onclick: () => { note.close(); onClose?.(); } }, icon('close')));
  note.page.append(note.el);
}

function closeNote(note) {
  if (note.closed) return;
  note.closed = true;
  if (showing !== note) {
    waiting.splice(waiting.indexOf(note), 1);
    return;
  }
  note.el.classList.add('is-leaving');
  setTimeout(() => {
    note.el.remove();
    showing = null;
    const next = waiting.shift();
    if (next) show(next);
  }, 250);
}
