// Einmal nach dem Login: Der Miet-Chip verbindet sich mit der App.
// Schwarzer Bildschirm, Chip in der Mitte, Statuszeilen haken sich ab –
// danach öffnet sich die Karte kreisförmig aus der Mitte.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { load, save } from '../../js/core/storage.js';
import { icon } from '../../js/components/icons.js';
import { landChip } from './guest-mode.js';

const STEP_MS = 380;      // Abstand zwischen den Statuszeilen
const HOLD_MS = 650;      // „Verbunden“ kurz stehen lassen
const REVEAL_MS = 900;    // Karte öffnet sich

/**
 * page    = die Gäste-Ansicht (wird am Ende kreisförmig aufgedeckt)
 * info()  = liefert beim Anzeigen die aktuellen Chip-Werte { pos, battery, group }
 */
export function showChipConnect(page, session, info) {
  // Nach der Ansicht-Wahl immer zeigen (Merker aus guest-mode.js), sonst einmal pro Einloggen
  let marked = false;
  try {
    marked = sessionStorage.getItem('skitag.fromChoice') === '1';
    sessionStorage.removeItem('skitag.fromChoice');
  } catch { /* privat: egal */ }
  const fromChoice = marked || !!document.querySelector('.mode-fly');
  if ((load('connectedAt') === session.startedAt && !fromChoice) || reducedMotion()) {
    landChip(null); // kam aus der Ansicht-Wahl → Symbol einfach ausblenden
    return Promise.resolve();
  }
  save('connectedAt', session.startedAt);

  page.classList.add('is-hidden-for-reveal');
  const lines = h('ul', { class: 'cc-lines' });
  const status = h('p', { class: 'cc-status' }, t('chip.connecting'));
  const overlay = h('div', { class: 'chip-connect', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'cc-stage' },
      h('i', { class: 'cc-ring' }), h('i', { class: 'cc-ring' }), h('i', { class: 'cc-ring' }),
      h('div', { class: 'cc-chip', 'aria-hidden': 'true' },
        h('span', { class: 'cc-led' }),
        h('span', { class: 'cc-btn' }, 'SOS'),
        h('span', { class: 'cc-check' }, icon('check')))),
    h('p', { class: 'cc-id num' }, session.chip),
    status,
    lines,
  );
  document.body.append(overlay);
  // Kommt aus der Ansicht-Wahl: das fliegende Symbol landet auf dem Chip und wird zu ihm
  const chipEl = overlay.querySelector('.cc-chip');
  // Fliegt das Symbol noch, landet es auf dem Chip; sonst springt der Chip mit seiner eigenen Animation ins Bild
  if (document.querySelector('.mode-fly')) {
    chipEl.classList.add('is-awaiting');
    landChip(chipEl);
  }

  const steps = () => {
    const i = info();
    const out = [[t('chip.step.signal'), '▮▮▮▮']];
    out.push([t('chip.step.gps'), i.pos ? `${i.pos[0].toFixed(4)}, ${i.pos[1].toFixed(4)}` : '…']);
    out.push([t('chip.battery'), i.battery != null ? `${i.battery} %` : '…']);
    if (i.group) out.push([t('chip.step.group'), i.group]);
    out.push([t('chip.step.sos'), t('chip.step.ready')]);
    return out;
  };

  return new Promise((resolve) => {
    // Kurz warten, bis der Chip die erste Position geschickt hat
    setTimeout(() => {
      const list = steps();
      list.forEach(([label, value], k) => {
        setTimeout(() => {
          lines.append(h('li', {}, icon('check'), h('span', {}, label), h('b', { class: 'num' }, value)));
          navigator.vibrate?.(8);
        }, k * STEP_MS);
      });
      setTimeout(() => {
        overlay.classList.add('is-connected');
        status.textContent = t('chip.connected');
        navigator.vibrate?.(60);
        setTimeout(() => {
          // Karte kreisförmig aufdecken, Overlay blendet weg
          page.classList.remove('is-hidden-for-reveal');
          page.classList.add('is-revealing');
          overlay.classList.add('is-leaving');
          setTimeout(() => {
            overlay.remove();
            page.classList.remove('is-revealing');
          }, REVEAL_MS);
          resolve();
        }, HOLD_MS);
      }, list.length * STEP_MS + 150);
    }, 500);
  });
}
