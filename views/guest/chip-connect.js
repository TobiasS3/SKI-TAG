// Einmal nach dem Login: Der Miet-Chip verbindet sich mit der App.
// Schwarzer Bildschirm, Chip in der Mitte, Statuszeilen haken sich ab –
// danach öffnet sich die Karte kreisförmig aus der Mitte.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { load, save } from '../../js/core/storage.js';
import { icon } from '../../js/components/icons.js';

const STEP_MS = 380;      // Abstand zwischen den Statuszeilen
const HOLD_MS = 650;      // „Verbunden“ kurz stehen lassen
const REVEAL_MS = 900;    // Karte öffnet sich

/**
 * page    = die Gäste-Ansicht (wird am Ende kreisförmig aufgedeckt)
 * info()  = liefert beim Anzeigen die aktuellen Chip-Werte { pos, battery, group }
 */
export function showChipConnect(page, session, info) {
  if (load('connectedAt') === session.startedAt || reducedMotion()) return Promise.resolve();
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
