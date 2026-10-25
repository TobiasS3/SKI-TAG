// Popup-Fenster mit Bestätigung. Gibt ein Promise zurück: true = bestätigt.
//   if (await confirmModal({ title, text, ok, cancel })) …

import { h } from '../utils/dom.js';

export function confirmModal({ title, text, ok, cancel, danger = false }) {
  return new Promise((resolve) => {
    const close = (result) => {
      backdrop.remove();
      removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => e.key === 'Escape' && close(false);

    const okBtn = h('button', { class: `btn ${danger ? 'btn-danger' : ''}`, onclick: () => close(true) }, ok);
    const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close(false) },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
        h('h2', { class: 'title', id: 'modal-title' }, title),
        h('p', { class: 'muted' }, text),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn btn-quiet', onclick: () => close(false) }, cancel),
          okBtn,
        ),
      ),
    );
    document.body.append(backdrop);
    addEventListener('keydown', onKey);
    okBtn.focus();
  });
}
