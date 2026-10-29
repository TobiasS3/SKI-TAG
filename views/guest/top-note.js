// Meldung oben unter der Kopfleiste, mit Knopf und ×.
// topNote(page, { lead, title, text, action, onAction, onClose }) → { close() }
//   lead = kleines Bild links (z. B. Gesichter der Gruppe oder ein Symbol)

import { h } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { icon } from '../../js/components/icons.js';

export function topNote(page, { lead, title, text, action, onAction, onClose }) {
  const el = h('div', { class: 'top-note', role: 'status' },
    h('div', { class: 'top-note-lead', 'aria-hidden': 'true' }, lead),
    h('div', { class: 'top-note-text' },
      h('strong', {}, title),
      h('small', {}, text)),
    h('button', { class: 'btn btn-small', onclick: () => { close(); onAction?.(); } }, action),
    h('button', { class: 'top-note-close', 'aria-label': t('close'), onclick: () => { close(); onClose?.(); } }, icon('close')));
  page.append(el);

  let open = true;
  function close() {
    if (!open) return;
    open = false;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  }
  return { close };
}
