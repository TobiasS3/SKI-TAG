// Reichweiten-Alarm (unterm Radar): Ist jemand weiter weg als eingestellt, vibriert DEIN Chip
// (und das Handy) – damit du dich umdrehst. Der Chip vom Kind bleibt ruhig.
// Pro Person anhakbar – z. B. nur das Kind, Mama darf ruhig wegfahren.
// Am Anfang ist niemand angehakt – Sie wählen selbst, auf wen Sie aufpassen.
// Einstellung pro Gruppe im Speicher: { on: true, m: 500, chips: ['CHIP-0043'] }

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { load, save } from '../../js/core/storage.js';
import { distance } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { api } from '../../js/services/api.js';
import { isoDay } from '../../js/utils/time.js';

// Regler-Stufen (Meter): unten fein, oben grob
const STEPS = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
const BACK = 0.85; // erst unter 85 % gilt man wieder als „in Reichweite“ → kein Dauer-Brummen an der Grenze

export function mountRangeAlarm(groupId, myChip, people, { onChange }) {
  const KEY = `alarm-${groupId}-${isoDay()}`; // gilt nur heute – morgen startet wieder leer
  const saved = load(KEY, null);
  const cfg = {
    on: saved?.on ?? true,
    m: saved?.m ?? 500,
    chips: saved?.chips ?? [],
  };
  const out = new Set(); // Chips, die gerade außer Reichweite sind

  function store() {
    save(KEY, cfg);
    onChange?.();
  }

  const watched = (m) => cfg.on && cfg.chips.includes(m.chip);

  /**
   * Mit aktuellen Abständen aufrufen: [{ m, d }]. Vibriert bei neuem „zu weit weg“.
   * Gibt alle zurück, die gerade zu weit weg sind.
   */
  function check(list) {
    const far = [];
    list.forEach(({ m, d }) => {
      if (!watched(m)) {
        out.delete(m.chip);
        return;
      }
      if (d > cfg.m) {
        far.push({ m, d });
        if (!out.has(m.chip)) {
          out.add(m.chip);
          api.signalGroup(groupId, myChip); // eigener Chip vibriert
          navigator.vibrate?.([300, 120, 300, 120, 600]);
          toast(t('range.out', { name: m.name, dist: distance(d) }), { icon: 'vibrate', ms: 6000 });
        }
      } else if (d < cfg.m * BACK && out.has(m.chip)) {
        out.delete(m.chip);
        toast(t('range.back', { name: m.name }), { icon: 'check' });
      } else if (out.has(m.chip)) {
        far.push({ m, d }); // knapp an der Grenze: bleibt „zu weit“
      }
    });
    return far;
  }

  // --- Ansicht -----------------------------------------------------------------------
  const el = h('section', { class: 'card range-card' });
  const value = h('output', { class: 'range-value num' });
  const slider = h('input', {
    type: 'range', class: 'range-slider', min: '0', max: String(STEPS.length - 1), step: '1',
    oninput: () => {
      cfg.m = STEPS[+slider.value];
      paintSlider();
    },
    onchange: store,
  });

  function paintSlider() {
    value.textContent = distance(cfg.m);
    slider.style.setProperty('--p', `${(+slider.value / (STEPS.length - 1)) * 100}%`);
    slider.setAttribute('aria-valuetext', distance(cfg.m));
  }

  function render() {
    const idx = STEPS.indexOf(cfg.m);
    slider.value = String(idx < 0 ? 3 : idx);
    slider.setAttribute('aria-label', t('range.slider'));
    paintSlider();
    el.classList.toggle('is-off', !cfg.on);

    const toggle = h('button', {
      class: 'switch', role: 'switch', 'aria-checked': String(cfg.on), 'aria-label': t('range.title'),
      onclick: () => {
        cfg.on = !cfg.on;
        if (!cfg.on) out.clear();
        store();
        render();
      },
    });

    const pills = people.map((m) => h('button', {
      class: 'range-person',
      style: { '--c': m.color },
      'aria-pressed': String(cfg.chips.includes(m.chip)),
      disabled: !cfg.on,
      onclick: () => {
        cfg.chips = cfg.chips.includes(m.chip) ? cfg.chips.filter((c) => c !== m.chip) : [...cfg.chips, m.chip];
        out.delete(m.chip);
        store();
        render();
      },
    },
      h('span', { class: 'avatar' }, m.name[0]), // ohne Kind-Rand: hier zählt nur angehakt / nicht
      h('span', {}, m.name),
      icon('check')));

    const nobody = cfg.on && !people.some((m) => cfg.chips.includes(m.chip));

    replace(el,
      h('div', { class: 'range-head' },
        h('span', { class: 'range-icon' }, icon('vibrate')),
        h('div', {},
          h('h3', { class: 'card-title' }, t('range.title')),
          h('p', { class: 'muted small' }, cfg.on ? t('range.lead') : t('range.offLead'))),
        toggle),
      h('div', { class: 'range-body' },
        h('div', { class: 'range-row' },
          slider,
          value),
        h('div', { class: 'range-scale muted', 'aria-hidden': 'true' },
          h('span', {}, distance(STEPS[0])), h('span', {}, distance(STEPS[STEPS.length - 1]))),
        h('p', { class: 'range-label small' }, t('range.for')),
        h('div', { class: 'range-people' }, pills),
        nobody ? h('p', { class: 'muted small' }, t('range.nobody')) : null));
  }

  return {
    el,
    render,
    check,
    on: () => cfg.on,
    count: () => cfg.chips.length,
    range: () => cfg.m,
    watched,
    isOut: (chip) => out.has(chip),
  };
}
