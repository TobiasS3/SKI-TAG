// Popup-Fenster mit Bestätigung. Gibt ein Promise zurück: true = bestätigt.
//   if (await confirmModal({ title, text, ok, cancel })) …
//
// Info-Fenster mit beliebigem Inhalt (z. B. Lifte, Wetter). Gibt eine Funktion zum Schließen zurück.
//   const close = infoModal({ body: el, label: 'Wetter', closeLabel: 'Schließen' });

import { h } from '../utils/dom.js';
import { icon } from './icons.js';

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

export function infoModal({ body, label, closeLabel, onClose }) {
  const close = () => {
    backdrop.remove();
    removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();

  const closeBtn = h('button', { class: 'modal-close', 'aria-label': closeLabel, onclick: close }, icon('close'));
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => e.target === backdrop && close() },
    h('div', { class: 'modal modal-info', role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
      closeBtn,
      body,
    ),
  );
  document.body.append(backdrop);
  addEventListener('keydown', onKey);
  closeBtn.focus();
  return close;
}
