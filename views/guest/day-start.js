// „Tag starten“ wie am Drehkreuz: Knopf wird zum Lesegerät – rotes Licht, „piep-piep“,
// grünes Licht, „Gültig · Gute Fahrt“. Kein Vollbild, dauert gut eine Sekunde.
// Antippen überspringt. Bei „weniger Bewegung“ nur kurz grün, ohne Ton-Verzögerung.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { clock } from '../../js/utils/time.js';

const READ_MS = 450;   // „Chip wird gelesen“
const DONE_MS = 1300;  // danach geht die Live-Ansicht auf

/** Spielt den Drehkreuz-Moment auf dem Knopf ab. Fertig, wenn das Promise auflöst. */
export function playDayStart(button) {
  return new Promise((resolve) => {
    const led = h('i', { class: 'gate-led' });
    const text = h('span', { class: 'gate-text' }, t('daygo.reading'));
    button.disabled = true;
    button.classList.add('is-gate');
    button.replaceChildren(h('span', { class: 'gate-sweep' }), led, text);

    const sound = beeper();
    const fast = reducedMotion();
    const timers = [];

    function open() {
      button.classList.add('is-open');
      sound.beep();
      navigator.vibrate?.([25, 60, 25]);
      text.replaceChildren(
        h('strong', {}, t('daygo.valid')),
        h('small', { class: 'num' }, `${t('daygo.go')} · ${clock()}`));
    }

    let done = false;
    function end() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      if (!button.classList.contains('is-open')) open();
      setTimeout(() => sound.close(), 400);
      resolve();
    }

    if (fast) {
      open();
      timers.push(setTimeout(end, 600));
    } else {
      timers.push(setTimeout(open, READ_MS), setTimeout(end, DONE_MS));
    }
    // Ein zweiter Tipp springt gleich weiter (Knopf ist gesperrt → auf dem Elternteil hören).
    // Erst nach diesem Klick anmelden, sonst fängt der Listener den Start-Tipp selbst.
    const skip = button.parentElement;
    timers.push(setTimeout(() => skip?.addEventListener('click', end, { once: true })));
  });
}

/** Drehkreuz-Piepser: zwei kurze, helle Töne (Web Audio). Klappt das nicht, bleibt es still. */
function beeper() {
  let ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    /* kein Ton – egal */
  }
  const tone = (start) => {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 2093; // C7 – klingt nach Lesegerät
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.005);
    gain.gain.setValueAtTime(0.05, t0 + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.12);
  };
  return {
    beep() {
      if (!ctx) return;
      tone(0);
      tone(0.13);
    },
    close: () => ctx?.close?.(),
  };
}
