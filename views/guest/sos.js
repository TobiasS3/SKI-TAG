// SOS-Notruf aus der App.
//
// Regel: KEINE Fehlalarme. Deshalb drei Sicherungen hintereinander:
//   1. Knopf 3 Sekunden gedrückt halten (Loslassen = abgebrochen)
//   2. 5 Sekunden Countdown mit großem „Abbrechen“
//   3. Erst dann geht der Alarm an den nächsten Mitarbeiter
// Danach: Status-Karte mit Helfer, Ankunftszeit, Notrufnummern, „Mir geht's gut“.

import { h, replace, reducedMotion } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { on, emit } from '../../js/core/events.js';
import { load, save, remove } from '../../js/core/storage.js';
import { api } from '../../js/services/api.js';
import { distance as geoDistance, bearing, compass } from '../../js/map/geo.js';
import { distance } from '../../js/utils/format.js';
import { clock } from '../../js/utils/time.js';
import { config } from '../../js/config.js';
import { icon, iconHTML } from '../../js/components/icons.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';

const HOLD_MS = 3000;
const COUNTDOWN_S = 5;
const RING = 2 * Math.PI * 46; // Umfang des Fortschrittsrings (r = 46)

export function mountSOS(page, ctx) {
  let alarm = load('sos', null); // aktiver Notruf (bleibt nach Neuladen erhalten)
  let staffLayer = null;
  let staffTimer = 0;

  // --- 1. Der Knopf: gedrückt halten -------------------------------------------
  const ringBar = svgRing();
  const label = h('span', { class: 'sos-label', 'data-sub': t('sos.hold') }, 'SOS');
  const hint = h('span', { class: 'sos-hint', 'aria-hidden': 'true' });
  const button = h('button', {
    class: 'sos-btn',
    type: 'button',
    'aria-label': t('sos.button'),
    'aria-describedby': 'sos-help',
  }, ringBar.el, label);
  const help = h('span', { class: 'visually-hidden', id: 'sos-help' }, t('sos.holdHint'));
  const wrap = h('div', { class: 'sos-wrap' }, hint, button, help);
  page.append(wrap);

  let holdStart = 0;
  let holdFrame = 0;
  let lastSecond = -1;

  function startHold(e) {
    if (alarm || holdStart) return;
    e?.preventDefault();
    holdStart = performance.now();
    lastSecond = -1;
    wrap.classList.add('is-holding');
    hint.textContent = t('sos.keepHolding');
    navigator.vibrate?.(30);
    holdFrame = requestAnimationFrame(tickHold);
  }

  function tickHold(now) {
    const f = Math.min(1, (now - holdStart) / HOLD_MS);
    ringBar.set(f);
    button.style.setProperty('--f', f.toFixed(3));
    const left = Math.ceil((HOLD_MS - (now - holdStart)) / 1000);
    if (left !== lastSecond && left > 0) {
      lastSecond = left;
      label.textContent = String(left);
      navigator.vibrate?.(25);
    }
    if (f >= 1) {
      endHold(true);
      return;
    }
    holdFrame = requestAnimationFrame(tickHold);
  }

  function endHold(completed) {
    if (!holdStart) return;
    cancelAnimationFrame(holdFrame);
    const held = performance.now() - holdStart;
    holdStart = 0;
    wrap.classList.remove('is-holding');
    label.textContent = 'SOS';
    ringBar.set(0);
    button.style.setProperty('--f', 0);
    hint.textContent = '';
    if (completed) {
      startCountdown();
    } else if (held < HOLD_MS) {
      // Kurz angetippt: erklären statt auslösen
      wrap.classList.add('show-tip');
      hint.textContent = t('sos.holdHint');
      clearTimeout(wrap.tipTimer);
      wrap.tipTimer = setTimeout(() => {
        wrap.classList.remove('show-tip');
        hint.textContent = '';
      }, 2600);
    }
  }

  button.addEventListener('pointerdown', (e) => {
    try {
      button.setPointerCapture(e.pointerId); // Finger darf leicht verrutschen
    } catch {
      /* manche Geräte erlauben das nicht – egal */
    }
    startHold(e);
  });
  button.addEventListener('pointerup', () => endHold(false));
  button.addEventListener('pointercancel', () => endHold(false));
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  // Tastatur: Leertaste/Enter halten
  button.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startHold(e);
  });
  button.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') endHold(false);
  });

  // --- 2. Countdown: letzte Chance zum Abbrechen ---------------------------------
  const overlay = h('div', { class: 'sos-overlay', hidden: true, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'sos-title' });
  page.append(overlay);
  let countdownTimer = 0;

  function startCountdown() {
    let left = COUNTDOWN_S;
    const number = h('span', { class: 'sos-count num' }, String(left));
    const ring = svgRing('sos-count-ring', 1);
    const cancelBtn = h('button', { class: 'btn btn-big sos-cancel', onclick: cancelCountdown }, icon('close'), t('sos.cancel'));
    replace(overlay,
      h('div', { class: 'sos-stage' },
        h('p', { class: 'sos-kicker' }, icon('avalanche'), t('sos.countdownKicker')),
        h('h2', { class: 'sos-title', id: 'sos-title' }, t('sos.countdownTitle')),
        h('div', { class: 'sos-count-wrap' }, ring.el, number),
        h('p', { class: 'sos-text' }, t('sos.countdownText')),
        cancelBtn,
        h('button', { class: 'sos-now', onclick: () => { clearInterval(countdownTimer); send(); } }, t('sos.sendNow')),
      ));
    overlay.hidden = false;
    overlay.classList.add('is-countdown');
    requestAnimationFrame(() => ring.set(0, COUNTDOWN_S * 1000));
    cancelBtn.focus();
    navigator.vibrate?.([80, 60, 80]);

    countdownTimer = setInterval(() => {
      left -= 1;
      number.textContent = String(Math.max(left, 0));
      number.classList.remove('tick');
      void number.offsetWidth;
      number.classList.add('tick');
      navigator.vibrate?.(40);
      if (left <= 0) {
        clearInterval(countdownTimer);
        send();
      }
    }, 1000);
  }

  function cancelCountdown() {
    clearInterval(countdownTimer);
    overlay.hidden = true;
    overlay.classList.remove('is-countdown');
    toast(t('sos.cancelled'), { icon: 'check' });
    button.focus();
  }

  // --- 3. Senden ---------------------------------------------------------------------
  async function send() {
    replace(overlay,
      h('div', { class: 'sos-stage' },
        h('div', { class: 'sos-sending', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('span', { html: iconHTML('vibrate') })),
        h('h2', { class: 'sos-title', id: 'sos-title' }, t('sos.sending')),
        h('p', { class: 'sos-text' }, t('sos.sendingText'))));
    const pos = ctx.me.pos || config.resort.center;
    try {
      const result = await api.sendSOS(ctx.session.chip, pos);
      alarm = { ...result, pos, staffStart: [result.staff.lat, result.staff.lng] };
      save('sos', alarm);
      overlay.hidden = true;
      overlay.classList.remove('is-countdown');
      navigator.vibrate?.([200, 100, 200, 100, 400]);
      emit('sos', alarm);
      showActive();
      if (ctx.session.group) setTimeout(() => toast(t('sos.groupInformed'), { icon: 'users' }), 1600);
    } catch {
      replace(overlay,
        h('div', { class: 'sos-stage' },
          h('h2', { class: 'sos-title', id: 'sos-title' }, t('sos.failed')),
          h('p', { class: 'sos-text' }, t('sos.failedText')),
          h('a', { class: 'btn btn-big sos-call', href: 'tel:140' }, icon('phone'), t('sos.call140')),
          h('button', { class: 'btn btn-quiet', onclick: () => { overlay.hidden = true; } }, t('cancel'))));
    }
  }

  // --- 4. Aktiver Notruf: Status-Karte + Helfer auf der Karte -------------------------
  const panel = h('section', { class: 'sos-active', hidden: true, 'aria-live': 'polite' });
  page.append(panel);
  const vignette = h('div', { class: 'sos-vignette', hidden: true, 'aria-hidden': 'true' });
  page.append(vignette);

  function showActive() {
    if (!alarm) return;
    wrap.hidden = true;
    vignette.hidden = false;
    panel.hidden = false;
    page.classList.add('has-sos');
    drawStaff();
    renderActive();
    clearInterval(staffTimer);
    staffTimer = setInterval(() => {
      moveStaff();
      renderActive();
    }, 1000);
    const bounds = L.latLngBounds([alarm.pos, alarm.staffStart]);
    ctx.fit(bounds, 16);
  }

  /** Wo ist der Helfer gerade? (Fake: fährt in der berechneten Zeit zu dir) */
  function staffPosition() {
    const elapsed = ((Date.now() - alarm.sentAt) / 1000) * config.simSpeed;
    const f = Math.min(1, elapsed / alarm.eta);
    return {
      f,
      pos: [
        alarm.staffStart[0] + (alarm.pos[0] - alarm.staffStart[0]) * f,
        alarm.staffStart[1] + (alarm.pos[1] - alarm.staffStart[1]) * f,
      ],
      left: Math.max(0, alarm.eta - elapsed), // Sekunden (in Simulations-Zeit)
    };
  }

  function drawStaff() {
    staffLayer?.remove();
    const s = staffPosition();
    const helper = L.marker(s.pos, {
      icon: L.divIcon({
        className: 'mk-helper',
        html: `<span>${iconHTML('users')}</span><b>${alarm.staff.name}</b>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      zIndexOffset: 1200,
    });
    const line = L.polyline([s.pos, alarm.pos], {
      color: '#e5322d', weight: 3, dashArray: '2 10', lineCap: 'round', className: 'sos-line', interactive: false,
    });
    const target = L.circleMarker(alarm.pos, {
      radius: 26, color: '#e5322d', weight: 2, fillColor: '#e5322d', fillOpacity: 0.12, className: 'sos-target', interactive: false,
    });
    staffLayer = L.layerGroup([target, line, helper]).addTo(ctx.map);
    staffLayer.helper = helper;
    staffLayer.line = line;
    staffLayer.target = target;
  }

  function moveStaff() {
    if (!staffLayer) return;
    const s = staffPosition();
    staffLayer.helper.setLatLng(s.pos);
    staffLayer.line.setLatLngs([s.pos, alarm.pos]);
  }

  function renderActive() {
    const s = staffPosition();
    const away = geoDistance(s.pos, alarm.pos);
    const arrived = s.f >= 1;
    const dir = compass(bearing(alarm.pos, alarm.staffStart), getLang());
    replace(panel,
      h('button', {
        class: 'sos-active-head',
        'aria-expanded': String(!panel.classList.contains('is-min')),
        onclick: () => {
          panel.classList.toggle('is-min');
          renderActive();
        },
      },
        h('span', { class: 'sos-live' }, h('i'), t('sos.active')),
        h('span', { class: 'sos-id num' }, alarm.id),
        icon('chevron')),
      h('h2', { class: 'sos-active-title' }, arrived ? t('sos.arrived', { name: alarm.staff.name }) : t('sos.onTheWay')),
      h('div', { class: 'sos-helper' },
        h('span', { class: 'sos-helper-avatar' }, alarm.staff.name[0]),
        h('div', { class: 'sos-helper-text' },
          h('strong', {}, alarm.staff.name),
          h('small', {}, `${alarm.staff.role}, ${alarm.staff.station}`)),
        h('div', { class: 'sos-eta' },
          h('span', { class: 'num' }, arrived ? '0' : String(Math.max(1, Math.round(s.left / 60)))),
          h('small', {}, 'min'))),
      h('div', { class: 'sos-progress', style: { '--f': s.f } }, h('i')),
      h('p', { class: 'sos-meta' },
        h('span', {}, t('sos.distance', { dist: distance(away), dir })),
        h('span', {}, t('sos.sentAt', { time: clock(new Date(alarm.sentAt)) }))),
      h('p', { class: 'sos-advice' }, icon('locate'), t('sos.stay')),
      h('p', { class: 'sos-coords num' }, `${alarm.pos[0].toFixed(5)}, ${alarm.pos[1].toFixed(5)}`),
      h('div', { class: 'sos-calls' },
        h('a', { class: 'btn sos-call', href: 'tel:140' }, icon('phone'), t('sos.call140')),
        h('a', { class: 'btn btn-quiet', href: 'tel:112' }, icon('phone'), '112')),
      h('button', { class: 'sos-ok', onclick: endAlarm }, icon('check'), t('sos.imOk')),
    );
  }

  async function endAlarm() {
    const ok = await confirmModal({
      title: t('sos.end.title'), text: t('sos.end.text'), ok: t('sos.end.ok'), cancel: t('sos.end.keep'),
    });
    if (!ok) return;
    await api.cancelSOS(alarm.id);
    alarm = null;
    remove('sos');
    clearInterval(staffTimer);
    staffLayer?.remove();
    staffLayer = null;
    panel.hidden = true;
    vignette.hidden = true;
    wrap.hidden = false;
    page.classList.remove('has-sos');
    emit('sos', null);
    toast(t('sos.ended'), { icon: 'check' });
  }

  // Sprache gewechselt → Texte neu
  const offLang = on('lang', () => {
    button.setAttribute('aria-label', t('sos.button'));
    help.textContent = t('sos.holdHint');
    label.dataset.sub = t('sos.hold');
    if (alarm) renderActive();
  });

  // Der Chip sendet weiter: Ziel des Helfers wandert mit
  const offMe = on('me', (p) => {
    if (!alarm || !staffLayer) return;
    alarm.pos = [p.lat, p.lng];
    staffLayer.target.setLatLng(alarm.pos);
    moveStaff();
  });

  // Nach Neuladen: laufenden Notruf wieder anzeigen
  if (alarm) showActive();

  return {
    destroy() {
      clearInterval(countdownTimer);
      clearInterval(staffTimer);
      cancelAnimationFrame(holdFrame);
      staffLayer?.remove();
      offLang();
      offMe();
      if (alarm) save('sos', alarm);
    },
  };
}

/** Ring aus SVG, der sich füllt (f = 0…1). */
function svgRing(className = 'sos-ring', start = 0) {
  const el = h('span', {
    class: className,
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="ring-bg"/><circle cx="50" cy="50" r="46" class="ring-bar"
      stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - start)}"/></svg>`,
  });
  const bar = el.querySelector('.ring-bar');
  return {
    el,
    set(f, ms = 0) {
      bar.style.transition = ms && !reducedMotion() ? `stroke-dashoffset ${ms}ms linear` : 'none';
      bar.style.strokeDashoffset = String(RING * (1 - f));
    },
  };
}

