// Startseite: Video einer fahrenden Gondel, Code eingeben → richtige Ansicht.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t, toggleLang, translate } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { login, normalizeCode, CODE_LENGTH } from '../../js/core/auth.js';
import { go } from '../../js/core/router.js';
import { api } from '../../js/services/api.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { temp } from '../../js/utils/format.js';

// Video: Gondelbahn im Schnee, Drohnenflug in 4K (Pexels – freie Nutzung erlaubt, Namensnennung freiwillig).
// Freies Material aus Kitzbühel gibt es (noch) nicht – siehe docs/bildnachweis.md.
const VIDEO = {
  src: 'assets/video/skitag-intro.mp4',
  poster: 'assets/video/skitag-intro-poster.jpg',
  // Handy hochkant: eigener Schnitt, in dem die Gondel oben im Bild hängt (nicht hinter der Code-Karte)
  srcPortrait: 'assets/video/skitag-intro-hoch.mp4',
  posterPortrait: 'assets/video/skitag-intro-hoch-poster.jpg',
  place: 'Gondelbahn im Schnee',
  credit: 'Pexels',
  source: 'https://www.pexels.com/video/30115054/',
};

export async function mountLogin(root) {
  const input = h('input', {
    id: 'code',
    class: 'code-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'one-time-code',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: String(CODE_LENGTH + 2),
    'aria-describedby': 'code-error code-hint',
  });
  const slots = Array.from({ length: CODE_LENGTH }, (_, i) => h('span', { class: 'code-slot', style: { '--i': i } }));
  const error = h('p', { class: 'login-error', id: 'code-error', role: 'alert' });
  const submitLabel = h('span', { 'data-i18n': 'login.button' });
  const submit = h('button', { class: 'btn btn-big btn-block login-submit', type: 'submit' }, submitLabel, icon('chevron'));

  const form = h('form', { class: 'login-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); send(); } },
    h('label', { class: 'login-label', for: 'code', 'data-i18n': 'login.label' }),
    h('div', { class: 'code-pass' },
      h('div', { class: 'code-slots', 'aria-hidden': 'true' }, slots),
      input),
    error,
    submit,
    h('p', { class: 'login-hint', id: 'code-hint', 'data-i18n': 'login.hint' }),
  );

  const board = h('dl', { class: 'login-board' });
  const demo = config.fakeData ? demoCodes(input, () => update()) : null;

  // Video: stumm + playsinline, sonst spielt iOS es nicht automatisch ab.
  // Weniger Bewegung gewünscht → nur das Standbild.
  const portrait = matchMedia('(orientation: portrait)').matches;
  const video = h('video', {
    class: 'hero-video',
    poster: portrait ? VIDEO.posterPortrait : VIDEO.poster,
    muted: true,
    loop: true,
    playsinline: true,
    preload: 'auto',
    autoplay: reducedMotion() ? null : true,
    'aria-hidden': 'true',
  }, h('source', { src: portrait ? VIDEO.srcPortrait : VIDEO.src, type: 'video/mp4' }));
  video.muted = true; // Attribut allein reicht manchen Browsern nicht
  const caption = h('a', { class: 'hero-caption', target: '_blank', rel: 'noopener', href: VIDEO.source },
    `${VIDEO.place}. Video: ${VIDEO.credit}`);

  const page = h('main', { class: 'login' },
    h('div', { class: 'hero', 'aria-hidden': 'true' }, video, h('div', { class: 'hero-shade' })),
    h('header', { class: 'login-top' },
      h('img', { class: 'login-logo', src: 'assets/images/logo.svg', alt: '', width: 34, height: 34 }),
      h('span', { class: 'login-brand' }, 'Ski Tag'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'lang-btn', type: 'button', onclick: toggleLang },
        icon('globe'), h('span', { 'data-i18n': 'lang.switch' }))),
    h('section', { class: 'login-intro' },
      h('p', { class: 'login-resort' }, h('i'), `${config.resort.name}, Tirol`),
      h('h1', { class: 'login-title', 'data-i18n': 'login.title' }),
      h('p', { class: 'login-lead', 'data-i18n': 'login.lead' }),
      h('div', { class: 'hero-meta' }, caption)),
    h('section', { class: 'login-card' },
      form,
      board,
      demo),
    h('div', { class: 'login-iris', 'aria-hidden': 'true' }),
  );
  root.append(page);
  translate(page);

  // Autoplay kann blockiert sein (Stromsparmodus) – dann bleibt das Standbild stehen
  if (!reducedMotion()) video.play?.().catch(() => {});

  // --- Eingabe in die sechs Felder spiegeln ---------------------------------
  function update() {
    const code = normalizeCode(input.value).slice(0, CODE_LENGTH);
    if (input.value !== code) input.value = code;
    slots.forEach((s, i) => {
      s.textContent = code[i] || '';
      s.classList.toggle('is-filled', !!code[i]);
      s.classList.toggle('is-active', document.activeElement === input && i === Math.min(code.length, CODE_LENGTH - 1));
    });
    error.textContent = '';
    page.classList.remove('has-error');
    if (code.length === CODE_LENGTH) send();
  }
  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', update);

  let busy = false;
  async function send() {
    if (busy) return;
    busy = true;
    submit.disabled = true;
    submitLabel.textContent = t('login.loading');
    const result = await login(input.value);
    if (result.ok) {
      celebrate(result.session.role);
      return;
    }
    busy = false;
    submit.disabled = false;
    submitLabel.textContent = t('login.button');
    error.textContent = t(`login.error.${result.error}`);
    page.classList.remove('has-error');
    void page.offsetWidth; // Animation neu starten
    page.classList.add('has-error');
    navigator.vibrate?.([40, 40, 40]);
    input.focus();
  }

  /** Erfolg: Felder werden grün, Karte fliegt weg, Skifahrer carvt durchs Bild, Schwarz-Blende. */
  function celebrate(role) {
    input.blur();
    submitLabel.textContent = t('login.welcome');
    navigator.vibrate?.(30);
    if (reducedMotion()) {
      go(role);
      return;
    }
    // Schwarzer Kreis startet am Knopf
    const r = submit.getBoundingClientRect();
    page.style.setProperty('--iris-x', `${r.left + r.width / 2}px`);
    page.style.setProperty('--iris-y', `${r.top + r.height / 2}px`);
    page.classList.add('is-success');
    setTimeout(() => skier(page), 250);
    setTimeout(() => page.classList.add('is-leaving'), 900);
    setTimeout(() => go(role), 2400);
  }

  // --- Anzeigetafel: Lifte, Temperatur, Schnee ------------------------------
  let weather = null;
  api.getWeather().then((w) => {
    weather = w;
    renderBoard();
  }).catch(() => renderBoard());

  function renderBoard() {
    const top = weather?.stations?.[weather.stations.length - 1];
    const cells = [boardCell('login.board.lifts', `${config.resort.liftsOpen}–${config.resort.liftsClose}`)];
    if (top) cells.push(boardCell('login.board.temp', temp(top.temp)));
    if (weather?.snow?.mountain != null) cells.push(boardCell('login.board.snow', `${weather.snow.mountain} cm`));
    board.replaceChildren(...cells);
  }
  renderBoard();

  const offLang = on('lang', () => {
    translate(page);
    renderBoard();
    if (!busy) submitLabel.textContent = t('login.button');
  });

  if (!matchMedia('(pointer: coarse)').matches) input.focus({ preventScroll: true });

  return () => {
    video.pause();
    offLang();
  };
}

/**
 * Skifahrer fährt in einer S-Kurve von oben rechts nach unten links und zieht eine Spur.
 * Die Kurve wird für die Bildschirmgröße berechnet; Skifahrer folgt ihr per CSS offset-path.
 */
function skier(page) {
  if (!CSS.supports?.('offset-path', "path('M0 0 L1 1')")) return;
  const w = innerWidth;
  const hgt = innerHeight;
  const d = `M ${w + 60} ${hgt * 0.1} C ${w * 0.15} ${hgt * 0.2}, ${w * 0.95} ${hgt * 0.5}, ${w * 0.45} ${hgt * 0.6} S ${w * 0.05} ${hgt * 0.75}, ${-80} ${hgt * 0.95}`;
  const layer = h('div', { class: 'login-ski', 'aria-hidden': 'true' });
  layer.innerHTML = `
    <svg class="login-ski-track" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
      <path d="${d}" class="ski-spray" pathLength="100"/>
      <path d="${d}" class="ski-line" pathLength="100"/>
    </svg>
    <div class="login-skier" style="offset-path: path('${d}')">${SKIER}</div>`;
  page.append(layer);
}

// Skifahrer von der Seite, in der Hocke, fährt nach links
const SKIER = `<svg viewBox="0 0 64 64" width="64" height="64">
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 50 L58 56" stroke="#0e0e10" stroke-width="3.5"/>
    <path d="M10 49 C6 48 4 46 5 44" stroke="#0e0e10" stroke-width="3" fill="none"/>
    <path d="M44 22 L56 46" stroke="#55555d" stroke-width="2"/>
    <path d="M30 42 L22 51 M34 42 L36 53" stroke="#2a2a30" stroke-width="5"/>
    <path d="M28 24 L36 40 L30 43 Z" fill="#2a2a30"/>
    <path d="M24 16 C30 14 38 20 37 30 L31 33 C27 28 24 22 24 16 Z" fill="#ff2d2d"/>
    <path d="M30 22 L44 22" stroke="#ff2d2d" stroke-width="4.5"/>
    <circle cx="22" cy="12" r="5.5" fill="#f2c9a4"/>
    <path d="M16.5 11 C17 5 27 5 27.5 10 Z" fill="#2f6dff"/>
    <rect x="15.5" y="10" width="7" height="3" rx="1.5" fill="#0e0e10"/>
  </g>
</svg>`;

function boardCell(key, value) {
  return h('div', { class: 'board-cell' },
    h('dt', {}, t(key)),
    h('dd', { class: 'num' }, value));
}

/** Nur im Test-Modus: Codes zum Antippen. */
function demoCodes(input, onPick) {
  const codes = [
    ['K7M2X9', 'role.guest'],
    ['BERG27', 'role.staff'],
    ['SKUL38', 'role.school'],
  ];
  return h('details', { class: 'login-demo' },
    h('summary', { 'data-i18n': 'login.demo' }),
    h('div', { class: 'login-demo-list' },
      codes.map(([code, role]) => h('button', {
        type: 'button',
        class: 'demo-code',
        onclick: () => {
          input.value = code;
          onPick();
        },
      }, h('span', { class: 'num' }, code), h('span', { 'data-i18n': role }))),
    ),
  );
}
