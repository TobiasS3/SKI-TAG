// Info zum Tag – fliegt nach dem Einloggen herein und zeigt mit einem Pfeil auf den Chip-Knopf
// oben rechts (Akku), denn dort liegen „Tracking starten“ und „Tag beenden“.
//
//   1. „Tracking starten“: Jetzt starten · Jetzt nicht
//   2. Jetzt nicht → „Sie finden das jederzeit hier oben“ (Pfeil, Chip-Knopf leuchtet kurz)
//   3. Nach dem Start → „Am Abend hier den Tag beenden“
//
// Pro Einloggen nur einmal (beim bloßen Neuladen nicht nochmal).

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { load, save } from '../../js/core/storage.js';
import { icon } from '../../js/components/icons.js';

const DELAY_MS = 1000;     // nach dem Chip-Bildschirm kurz die Karte ankommen lassen
const END_DELAY_MS = 2200; // nach dem Start: Drehkreuz-Moment abwarten

export function mountDayCoach(ctx, { anchor, tracking }) {
  const KEY = `daycoach-${ctx.session.startedAt}`;
  const seen = load(KEY, {}); // { start: true, end: true }
  let card = null;
  let timer = null;
  let gone = false;

  ctx.connected.then(() => {
    if (gone || seen.start || tracking.status() !== 'idle') return;
    timer = setTimeout(() => show('start'), DELAY_MS);
  });

  // Tag läuft → einmal zeigen, wo er am Abend beendet wird
  const off = on('daystatus', (status) => {
    if (status !== 'running' || seen.end) return;
    clearTimeout(timer);
    timer = setTimeout(() => show('end'), END_DELAY_MS);
  });

  function remember(step) {
    seen[step] = true;
    save(KEY, seen);
  }

  function show(step) {
    if (gone) return;
    // Ein Fenster ist offen (z. B. „Mein Tag“) → warten, sonst läge die Info darunter
    if (document.querySelector('.modal-backdrop:not(.is-closing)') || ctx.page.classList.contains('day-full')) {
      clearTimeout(timer);
      timer = setTimeout(() => show(step), 700);
      return;
    }
    close(true);
    if (step === 'start') remember('start');
    if (step === 'end') remember('end');

    const body = {
      start: () => [
        h('div', { class: 'coach-head' },
          h('span', { class: 'coach-icon is-start' }, icon('play')),
          h('strong', {}, t('coach.start.title'))),
        h('p', {}, t('coach.start.text')),
        h('div', { class: 'coach-actions' },
          h('button', { class: 'btn btn-sun btn-big coach-go', type: 'button', onclick: () => { close(); tracking.requestStart(); } },
            icon('play'), t('coach.start.now')),
          h('button', { class: 'btn btn-quiet coach-later', type: 'button', onclick: () => show('later') }, t('coach.start.later'))),
      ],
      later: () => [
        h('div', { class: 'coach-head' },
          h('span', { class: 'coach-icon' }, icon('play')),
          h('strong', {}, t('coach.later.title'))),
        h('p', {}, t('coach.later.text')),
        h('button', { class: 'btn btn-quiet coach-ok', type: 'button', onclick: () => close() }, t('coach.ok')),
      ],
      end: () => [
        h('div', { class: 'coach-head' },
          h('span', { class: 'coach-icon is-end' }, icon('stop')),
          h('strong', {}, t('coach.end.title'))),
        h('p', {}, t('coach.end.text')),
        h('button', { class: 'btn btn-quiet coach-ok', type: 'button', onclick: () => close() }, t('coach.ok')),
      ],
    }[step]();

    const arrow = h('i', { class: 'coach-arrow', 'aria-hidden': 'true' });
    card = h('div', { class: `day-coach is-${step}`, role: 'dialog', 'aria-live': 'polite', 'aria-label': t(`coach.${step}.title`) },
      arrow, ...body);
    ctx.page.append(card);
    place(card, arrow);
    pulse(); // bleibt stehen, bis „Verstanden“ (bzw. Jetzt starten / Jetzt nicht) gedrückt wird
  }

  /** Karte unter die Kopfleiste, Pfeil genau über die Mitte des Chip-Knopfs */
  function place(el, arrow) {
    // Ohne getBoundingClientRect der Karte: die steckt gerade in der Einflug-Animation (verkleinert)
    const a = anchor.getBoundingClientRect();
    const host = ctx.page.getBoundingClientRect();
    const x = Math.min(Math.max(a.left + a.width / 2 - host.left - el.offsetLeft, 24), el.offsetWidth - 24);
    arrow.style.left = `${x}px`;
    el.style.transformOrigin = `${x}px -10px`; // fliegt aus dem Chip-Knopf heraus
  }

  /** Chip-Knopf leuchtet ein paar Mal auf – einmalig, keine Dauer-Animation */
  function pulse() {
    if (reducedMotion()) return;
    anchor.classList.remove('is-pointed');
    void anchor.offsetWidth;
    anchor.classList.add('is-pointed');
    setTimeout(() => anchor.classList.remove('is-pointed'), 2600);
  }

  function close(instant = false) {
    clearTimeout(timer);
    const el = card;
    card = null;
    if (!el) return;
    if (instant || reducedMotion()) return el.remove();
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 300);
  }

  return {
    destroy() {
      gone = true;
      off();
      close(true);
    },
  };
}
