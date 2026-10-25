// „Tag starten“: eine Gondel fährt am Seil ins Bild, bremst in der Station (pendelt nach, Gong),
// und fährt dann beschleunigt an der Stütze vorbei aus dem Bild. Berge, Schnee, „Los geht's“.
// Antippen überspringt. Bei „weniger Bewegung“ gibt es keine Szene.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';

const DURATION = 3400;
const STOP_MS = 1300; // Gondel steht in der Mitte → Gong

export function playDayStart(page) {
  if (reducedMotion()) return;
  const root = h('div', { class: 'dg', 'aria-hidden': 'true', html: SCENE });
  root.append(h('div', { class: 'dg-text' },
    h('small', {}, t('daygo.ready')),
    h('strong', {}, t('day.go'))));
  page.append(root);

  const sound = chime();
  const timers = [
    setTimeout(() => {
      sound.ding();
      navigator.vibrate?.([30, 50, 30]);
    }, STOP_MS),
    setTimeout(end, DURATION),
  ];

  let done = false;
  function end() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    root.classList.add('is-out');
    setTimeout(() => {
      root.remove();
      sound.close();
    }, 450);
  }
  root.addEventListener('click', end);
}

/** Stations-Gong: zwei weiche Töne (Web Audio). Klappt das nicht, bleibt es still. */
function chime() {
  let ctx = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    /* kein Ton – egal */
  }
  const tone = (freq, start, dur) => {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };
  return {
    ding() {
      if (!ctx) return;
      tone(988, 0, 0.9);    // H
      tone(784, 0.28, 1.1); // G
    },
    close: () => ctx?.close?.(),
  };
}

// Hochformat 400 × 800. Seil: y = 645 − 1,1·x. Die Gondel (Gruppe .dg-cabin) fährt daran entlang,
// .dg-swing pendelt um die Klemme am Seil.
const SCENE = `
<svg class="dg-art" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="dg-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f6fe0"/><stop offset=".55" stop-color="#7fb4ff"/><stop offset="1" stop-color="#e8f2ff"/>
    </linearGradient>
    <linearGradient id="dg-body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4a4a"/><stop offset=".55" stop-color="#e3201f"/><stop offset="1" stop-color="#b3110f"/>
    </linearGradient>
    <linearGradient id="dg-glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fc3ef"/><stop offset=".5" stop-color="#456a99"/><stop offset="1" stop-color="#1f3350"/>
    </linearGradient>
    <linearGradient id="dg-steel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3a3a42"/><stop offset=".5" stop-color="#8a8a94"/><stop offset="1" stop-color="#3a3a42"/>
    </linearGradient>
  </defs>

  <rect width="400" height="800" fill="url(#dg-sky)"/>
  <circle cx="300" cy="150" r="34" fill="#fff6d6"/>

  <!-- ferne Berge -->
  <g class="dg-far">
    <path d="M-60 520 L40 380 L95 440 L170 330 L250 450 L320 360 L420 470 L480 420 V800 H-60Z" fill="#b9c9e2"/>
    <path d="M18 410 L40 380 L62 404 L46 412Z M150 358 L170 330 L192 362 L172 368Z M300 388 L320 360 L342 390 L322 394Z" fill="#fff"/>
  </g>
  <!-- nahe Hänge mit Wald -->
  <g class="dg-near">
    <path d="M-80 650 C 40 560, 160 600, 240 640 S 400 610, 480 570 V800 H-80Z" fill="#fff"/>
    <path d="M-80 650 C 40 560, 160 600, 240 640 S 400 610, 480 570" fill="none" stroke="#d5deea" stroke-width="3"/>
    <g fill="#1d2a26">
      <path d="M20 640 l12-34 12 34z M46 632 l9-26 9 26z M70 628 l11-30 11 30z M330 610 l12-34 12 34z M356 604 l9-26 9 26z M300 618 l10-28 10 28z"/>
    </g>
    <path d="M-80 800 V720 C 60 690, 200 700, 480 680 V800Z" fill="#f4f7fb"/>
  </g>

  <!-- Stütze und Seil -->
  <g class="dg-tower">
    <path d="M318 800 L334 292 L350 800" fill="none" stroke="url(#dg-steel)" stroke-width="9"/>
    <path d="M326 560 L342 560 M324 680 L344 680 M328 440 L340 440" stroke="#55555d" stroke-width="4"/>
    <!-- Querträger mit Rollen, auf denen das Seil läuft (Seil kreuzt bei x≈318–326) -->
    <rect x="300" y="288" width="68" height="10" rx="3" fill="#2a2a30"/>
    <circle cx="318" cy="295" r="6" fill="#55555d"/><circle cx="330" cy="282" r="6" fill="#55555d"/>
  </g>
  <path d="M-60 711 L460 139" stroke="#14141a" stroke-width="3.5"/>
  <path d="M-60 724 L460 152" stroke="#14141a" stroke-width="1.5" opacity=".45"/>

  <!-- Gondel -->
  <g class="dg-cabin">
    <g class="dg-swing">
      <!-- Klemme am Seil + Gehänge -->
      <rect x="-16" y="-9" width="32" height="14" rx="4" fill="#2a2a30"/>
      <circle cx="-8" cy="-2" r="4" fill="#8a8a94"/><circle cx="8" cy="-2" r="4" fill="#8a8a94"/>
      <path d="M0 5 V40 Q0 52 -12 56" fill="none" stroke="url(#dg-steel)" stroke-width="7" stroke-linecap="round"/>
      <path d="M0 40 Q0 52 12 56" fill="none" stroke="url(#dg-steel)" stroke-width="7" stroke-linecap="round"/>
      <!-- Dach -->
      <path d="M-58 72 Q-56 56 -34 54 H34 Q56 56 58 72 Z" fill="#2a2a30"/>
      <!-- Kabine -->
      <rect x="-70" y="68" width="140" height="150" rx="30" fill="url(#dg-body)"/>
      <rect x="-70" y="68" width="140" height="150" rx="30" fill="none" stroke="#7d0b0b" stroke-opacity=".35" stroke-width="2"/>
      <!-- Panoramafenster -->
      <rect x="-60" y="84" width="120" height="74" rx="18" fill="url(#dg-glass)"/>
      <path d="M-20 84 V158 M20 84 V158" stroke="#1a1a20" stroke-width="4"/>
      <!-- Spiegelung -->
      <path d="M-50 150 L-20 88 H-6 L-36 150Z" fill="#fff" opacity=".22"/>
      <path d="M8 150 L30 104 H38 L16 150Z" fill="#fff" opacity=".14"/>
      <!-- Leute drinnen (Silhouetten) -->
      <g fill="#0f1a2a" opacity=".55">
        <circle cx="-40" cy="128" r="8"/><path d="M-52 158 Q-40 136 -28 158Z"/>
        <circle cx="38" cy="126" r="8"/><path d="M26 158 Q38 134 50 158Z"/>
      </g>
      <!-- Tür, Schriftzug, unterer Rand -->
      <path d="M0 164 V214" stroke="#7d0b0b" stroke-opacity=".5" stroke-width="2"/>
      <text x="0" y="186" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-weight="800" font-size="13" fill="#fff" letter-spacing="2">SKI TAG</text>
      <rect x="-56" y="216" width="112" height="6" rx="3" fill="#2a2a30"/>
    </g>
  </g>

  <!-- Schnee -->
  <g class="dg-snow" fill="#fff">
    <circle cx="40" cy="-10" r="3"/><circle cx="110" cy="-40" r="2"/><circle cx="170" cy="-20" r="3.5"/>
    <circle cx="240" cy="-60" r="2.5"/><circle cx="300" cy="-15" r="3"/><circle cx="360" cy="-50" r="2"/>
    <circle cx="80" cy="-90" r="2.5"/><circle cx="210" cy="-110" r="3"/><circle cx="330" cy="-100" r="2.5"/>
  </g>
</svg>`;
