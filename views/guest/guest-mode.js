// Drei Ansichten für Gäste – was steht im Vordergrund?
//
//   solo  „Solo-Fahrt“        unten: Mein Tag + Route, keine Gruppe
//   group „Familie & Gruppe“  unten: Gruppe + Route, „Mein Tag“ als kleiner Knopf bei der Karte
//   all   „Alles im Blick“    unten: Mein Tag + Route + Gruppe (die bisherige Ansicht)
//
// Die Daten laufen in jeder Ansicht weiter (Spur, Abfahrten, Hüttenpass …) – umschalten
// ändert nur, was man sieht. Gewählt wird nach dem Login (showModeChoice), umgeschaltet im Chip-Menü.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { load, save } from '../../js/core/storage.js';
import { icon } from '../../js/components/icons.js';

export const MODES = ['solo', 'group', 'all'];
export const MODE_TABS = { solo: ['day', 'route'], group: ['group', 'route'], all: ['day', 'route', 'group'] };
export const MODE_ICON = { solo: 'today', group: 'users', all: 'layers' };

export function getMode() {
  const m = load('guestMode');
  return MODES.includes(m) ? m : 'all';
}

export function setMode(m) {
  save('guestMode', m);
}

/**
 * „Jederzeit änderbar“ mit Bild: das Stück Kopfleiste oben rechts aus der App (Wetter + Chip-Knopf),
 * der Chip-Knopf orange umrandet – so erkennt man ihn später sofort wieder.
 */
function chipHint() {
  return h('div', { class: 'mode-chiphint' },
    h('span', { class: 'mch-text' },
      h('strong', {}, t('mode.hintTitle')),
      h('small', {}, t('mode.hint'))),
    h('span', { class: 'mch-bar', 'aria-hidden': 'true' },
      h('span', { class: 'mch-pill' },
        h('small', {}, t('tab.weather')),
        h('b', {}, icon('cloud'), '5°')),
      h('span', { class: 'mch-chip' },
        h('span', { class: 'bat', style: { '--lvl': '0.9' } }),
        icon('maximize', 'mch-more'))));
}

/**
 * Auswahl nach dem Login. Mit skierSVG carvt ein Skifahrer von Box zu Box: An jedem Schwung
 * staubt Schnee und die Box klappt genau dort auf. onPick(mode) kommt nach dem Antippen –
 * das Symbol der Box fliegt dabei in die Mitte und wird im nächsten Bildschirm zum Chip
 * (views/guest/chip-connect.js holt es dort ab).
 */
export function showModeChoice(host, { skierSVG = null, onPick }) {
  const cards = MODES.map((mode) => h('button', {
    class: `mode-card mode-${mode}`,
    type: 'button',
    'data-mode': mode,
    onclick: () => pick(mode),
  },
  h('span', { class: 'mode-icon' }, icon(MODE_ICON[mode])),
  h('span', { class: 'mode-text' },
    h('strong', { class: 'mode-name' }, t(`mode.${mode}`)),
    h('span', { class: 'mode-lead' }, t(`mode.${mode}.lead`)),
    h('span', { class: 'mode-what' }, t(`mode.${mode}.what`))),
  icon('chevron', 'mode-go')));

  const el = h('section', { class: 'mode-choice', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mode-title', tabindex: '-1' },
    h('header', { class: 'mode-head' },
      h('h1', { class: 'mode-title', id: 'mode-title' }, t('mode.title')),
      chipHint()),
    h('div', { class: 'mode-list' }, cards));
  host.append(el);
  el.scrollTop = 0; // immer oben anfangen

  let done = false;
  function pick(mode) {
    if (done) return;
    done = true;
    setMode(mode);
    // Merker für den Chip-Bildschirm: „kommt aus der Auswahl“ → Chip-Animation auf jeden Fall zeigen
    try { sessionStorage.setItem('skitag.fromChoice', '1'); } catch { /* privat: egal */ }
    navigator.vibrate?.(20);
    const card = cards[MODES.indexOf(mode)];
    el.classList.add('is-picked');
    card.classList.add('is-chosen');
    if (reducedMotion()) {
      onPick(mode);
      return;
    }
    // Box ploppt kurz auf, dann löst sich das Symbol und schwebt in die Mitte
    setTimeout(() => flyToChip(card, mode), 220);
    setTimeout(() => onPick(mode), 1000);
  }

  const openAll = () => cards.forEach((c) => c.classList.add('is-open'));
  if (!skierSVG || reducedMotion()) {
    el.classList.add('is-open');
    openAll();
    el.focus({ preventScroll: true });
    return el;
  }
  requestAnimationFrame(() => el.classList.add('is-open'));
  ride(el, cards, skierSVG);
  // Fokus aufs Fenster, nicht auf eine Box – sonst sieht die erste aus wie schon gewählt
  setTimeout(() => el.focus({ preventScroll: true }), 2200);
  return el;
}

/**
 * Der Skifahrer fährt einmal durch (~2,5 s, danach läuft nichts mehr): Schwung rechts an
 * Box 1, links an Box 2, rechts an Box 3, dann unten raus. Spur und Schnee bleiben hinter den Boxen.
 */
function ride(el, cards, skierSVG) {
  const W = innerWidth;
  const H = innerHeight;
  const rects = cards.map((c) => c.getBoundingClientRect());
  const edge = Math.min(34, W * 0.08);
  const apexes = rects.map((r, i) => [i % 2 ? edge : W - edge, r.top + r.height * 0.5]);
  const pts = [
    [W + 50, rects[0].top - 20], // von rechts herein, unter der Überschrift
    ...apexes,
    [W * 0.3, Math.min(H + 80, rects[rects.length - 1].bottom + 140)],
  ];
  const d = smoothPath(pts);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mode-track');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path class="mode-track-spray" d="${d}"/><path class="mode-track-line" d="${d}"/>`;
  const [spray, line] = svg.querySelectorAll('path');
  const skier = h('div', { class: 'mode-skier', 'aria-hidden': 'true', html: skierSVG });
  el.prepend(svg);
  el.append(skier);

  const total = line.getTotalLength();
  [spray, line].forEach((p) => { p.style.strokeDasharray = `${total}`; p.style.strokeDashoffset = `${total}`; });
  // Wo auf der Spur liegen die Schwünge? (nächster Punkt zur Spitze)
  const apexAt = apexes.map(([ax, ay]) => {
    let best = 0;
    let bestD = Infinity;
    for (let s = 0; s <= 240; s += 1) {
      const p = line.getPointAtLength((s / 240) * total);
      const dd = (p.x - ax) ** 2 + (p.y - ay) ** 2;
      if (dd < bestD) { bestD = dd; best = (s / 240) * total; }
    }
    return best;
  });

  const DURATION = 2500;
  // Erst anschieben, dann gleichmäßig carven, unten auslaufen
  const ease = (x) => 0.4 * x + 0.6 * (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const opened = new Set();
  const t0 = performance.now();
  let face = 1;

  (function frame(now) {
    const x = Math.min(1, (now - t0) / DURATION);
    const len = ease(x) * total;
    const p = line.getPointAtLength(len);
    const q = line.getPointAtLength(Math.min(total, len + 6));
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    if (Math.abs(dx) > 0.6) face = dx > 0 ? -1 : 1; // Skifahrer schaut im Bild nach links
    const slope = (Math.atan2(dy, Math.abs(dx) + 0.001) * 180) / Math.PI;
    const tilt = Math.max(-28, Math.min(28, slope * 0.45)) * (face === 1 ? -1 : 1);
    skier.style.transform = `translate(${p.x - 30}px, ${p.y - 52}px) rotate(${tilt}deg) scaleX(${face})`;
    line.style.strokeDashoffset = `${total - len}`;
    spray.style.strokeDashoffset = `${total - len}`;

    apexAt.forEach((at, i) => {
      if (opened.has(i) || len < at - 8) return;
      opened.add(i);
      openCard(cards[i], rects[i], apexes[i], i % 2 ? -1 : 1);
      snowBurst(el, apexes[i], i % 2 ? -1 : 1);
      navigator.vibrate?.(10);
    });

    if (x < 1) requestAnimationFrame(frame);
    else {
      skier.remove();
      el.classList.add('is-ridden'); // Spur tritt zurück
      cards.forEach((c, i) => openCard(c, rects[i], apexes[i], 1));
    }
  })(t0);
}

/** Box wächst aus dem Schwung heraus (Ursprung = Stelle des Schwungs) */
function openCard(card, r, [ax, ay], side) {
  if (card.classList.contains('is-open')) return;
  const ox = Math.min(Math.max(ax - r.left, 0), r.width);
  const oy = Math.min(Math.max(ay - r.top, 0), r.height);
  card.style.transformOrigin = `${ox}px ${oy}px`;
  card.style.setProperty('--tilt', `${side * 5}deg`);
  card.classList.add('is-open');
}

/** Schneestaub am Schwung: ein paar Flocken fliegen nach außen weg, einmal */
function snowBurst(el, [x, y], side) {
  for (let i = 0; i < 14; i += 1) {
    const flake = h('i', { class: 'mode-flake', style: { left: `${x}px`, top: `${y}px` } });
    el.append(flake);
    const a = (-110 + Math.random() * 140) * (Math.PI / 180); // nach oben/außen
    const dist = 26 + Math.random() * 52;
    const tx = Math.cos(a) * dist * side;
    const ty = Math.sin(a) * dist;
    const s = 0.5 + Math.random() * 0.9;
    flake.animate([
      { transform: `translate(-50%, -50%) scale(${s})`, opacity: 0.95 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${s * 0.4})`, opacity: 0 },
    ], { duration: 520 + Math.random() * 380, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' })
      .onfinish = () => flake.remove();
  }
}

/** Glatte Kurve durch alle Punkte (Catmull-Rom → Bézier) */
function smoothPath(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/**
 * Nach der Wahl: Das farbige Symbol der Box löst sich und schwebt in die Mitte.
 * Es hängt am <body>, überlebt also den Wechsel zur Gäste-Ansicht – dort wird es zum Chip.
 */
function flyToChip(card, mode) {
  const tile = card.querySelector('.mode-icon');
  const r = tile.getBoundingClientRect();
  const fly = h('div', { class: `mode-fly mode-fly-${mode}`, 'aria-hidden': 'true' }, icon(MODE_ICON[mode]));
  Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(fly);
  tile.style.visibility = 'hidden';
  fly.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  // Kurz danach: in die Mitte, so groß wie der Chip
  setTimeout(() => requestAnimationFrame(() => {
    const size = 112;
    Object.assign(fly.style, {
      left: `${(innerWidth - size) / 2}px`,
      top: `${innerHeight * 0.3}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
    fly.classList.add('is-flying');
  }), 160);
  // Sicherheitsnetz: falls niemand es abholt
  setTimeout(() => fly.isConnected && landChip(null), 8000);
}

/**
 * Vom Chip-Bildschirm aufgerufen: Symbol landet auf dem Chip (target) und verschwindet.
 * Ohne target blendet es einfach aus. Gibt true zurück, wenn ein Symbol unterwegs war.
 */
export function landChip(target) {
  const fly = document.querySelector('.mode-fly');
  if (!fly) return false;
  if (!target || reducedMotion()) {
    fly.classList.add('is-gone');
    setTimeout(() => fly.remove(), 400);
    return true;
  }
  const b = target.getBoundingClientRect();
  Object.assign(fly.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  fly.classList.add('is-landing');
  // Ring läuft einmal vom Chip nach außen, wenn das Symbol landet
  setTimeout(() => target.parentElement?.classList.add('is-landed'), 420);
  setTimeout(() => {
    target.classList.add('is-landed');
    fly.classList.add('is-gone');
    setTimeout(() => fly.remove(), 300);
  }, 420);
  return true;
}

/**
 * Bestätigung nach dem Umschalten: kleine Plakette oben in der Mitte mit dem farbigen
 * Symbol und einem Haken, die kurz auftaucht und wieder geht.
 */
export function modeHud(mode) {
  document.querySelector('.mode-hud')?.remove();
  const hud = h('div', { class: `mode-hud mode-${mode}`, role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'mode-icon' }, icon(MODE_ICON[mode])),
    h('span', { class: 'mode-hud-text' }, h('small', {}, t('mode.switched')), h('strong', {}, t(`mode.${mode}`))),
    h('span', { class: 'mode-hud-check' }, icon('check')));
  document.body.append(hud);
  navigator.vibrate?.([12, 40, 12]);
  setTimeout(() => hud.classList.add('is-leaving'), 1700);
  setTimeout(() => hud.remove(), 2100);
}

/** Umschalter fürs Chip-Menü: drei Zeilen, die aktive ist weiß. */
export function modeSwitch(current, onChange) {
  const box = h('div', { class: 'menu-mode', role: 'group', 'aria-label': t('mode.menuTitle') },
    h('span', { class: 'menu-mode-title' }, t('mode.menuTitle')));
  const btns = MODES.map((mode) => h('button', {
    class: 'menu-mode-btn',
    type: 'button',
    'aria-pressed': String(mode === current),
    onclick: (e) => {
      e.stopPropagation();
      if (mode === current) return;
      // Erst sichtbar umspringen lassen, dann umschalten
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(MODES[i] === mode)));
      navigator.vibrate?.(10);
      setTimeout(() => onChange(mode), reducedMotion() ? 0 : 260);
    },
  },
  h('span', { class: `mode-icon mode-${mode}` }, icon(MODE_ICON[mode])),
  h('span', { class: 'menu-mode-text' }, h('strong', {}, t(`mode.${mode}`)), h('small', {}, t(`mode.${mode}.short`))),
  icon('check', 'menu-mode-check')));
  box.append(...btns);
  return box;
}
