// „Tag beenden?“ – eigene Rückfrage statt des schlichten Schwarz-Weiß-Fensters:
// oben Navy mit Pistenlinien und den Zahlen des Tages, unten orange „Tag beenden“ und „Weiterfahren“.
// Gibt ein Promise zurück: true = beenden.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { number } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';

export function confirmDayStop(day) {
  return new Promise((resolve) => {
    const stat = (value, unit, label) => h('div', { class: 'ds-stat' },
      h('dd', { class: 'num' }, value, unit ? h('small', {}, ` ${unit}`) : null),
      h('dt', {}, label));

    const okBtn = h('button', { class: 'ds-ok', type: 'button', onclick: () => close(true) },
      h('span', { class: 'ds-ok-icon' }, icon('stop')), t('day.stop'));
    const box = h('div', { class: 'day-stop-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ds-title' },
      h('header', { class: 'ds-head' },
        h('p', { class: 'ds-rec' }, h('i', { 'aria-hidden': 'true' }), t('day.started')),
        h('h2', { id: 'ds-title' }, t('day.stop.title')),
        h('dl', { class: 'ds-stats' },
          stat(String(day.runs?.length || 0), null, t('day.runs')),
          stat(number(Math.round(day.descent || 0)), 'm', t('day.descent')),
          stat(number(day.km || 0, 1), 'km', t('day.km')))),
      h('div', { class: 'ds-body' },
        h('p', {}, t('day.stop.short')),
        okBtn,
        h('button', { class: 'ds-cancel', type: 'button', onclick: () => close(false) },
          icon('piste'), t('day.stop.keep'))));
    const backdrop = h('div', { class: 'modal-backdrop ds-backdrop', onclick: (e) => e.target === backdrop && close(false) }, box);

    const onKey = (e) => e.key === 'Escape' && close(false);
    function close(result) {
      removeEventListener('keydown', onKey);
      if (reducedMotion()) backdrop.remove();
      else {
        backdrop.classList.add('is-closing');
        setTimeout(() => backdrop.remove(), 260);
      }
      resolve(result);
    }

    document.body.append(backdrop);
    addEventListener('keydown', onKey);
    okBtn.focus({ preventScroll: true });
  });
}
