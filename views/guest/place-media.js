// Bilder und Logos zu Hütten und Bahnen – mit Ersatz, wenn nichts da ist.
//
// Quellen (siehe tools/fetch-place-media.py):
//   assets/places/commons/  freie Fotos von Wikimedia Commons (mit Namensnennung)
//   assets/places/web/      Fotos/Logos von den Webseiten der Hütten (nur lokal, nicht im Git)

import { h } from '../../js/utils/dom.js';
import { icon, liftIcon } from '../../js/components/icons.js';
import { skimap } from '../../js/services/slopes.js';

let media = {};

export const setMedia = (m) => {
  media = m || {};
};

export const mediaFor = (name) => media[name] || null;

/** Anfangsbuchstaben: „Gasthof Fleckalm“ → „GF“, „Seidlalm“ → „SE“ */
export function initials(name) {
  const skip = new Set(['bei', 'am', 'im', 'zum', 'zur', 'der', 'die', 'das', 'und', 'the', 'de']);
  const words = name.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((w) => w && !skip.has(w.toLowerCase()));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || '?').slice(0, 2).toUpperCase();
}

// Ruhige Farben fürs Monogramm – passend zum Design (Schwarz, Grau, Akzente)
const MONO_COLORS = ['#0e0e10', '#2a2a30', '#ff6a13', '#2f6dff', '#55555d', '#16b46b'];

function colorFor(name) {
  let x = 0;
  for (const ch of name) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return MONO_COLORS[Math.abs(x) % MONO_COLORS.length];
}

/** Logo der Hütte/Bahn – echtes Logo oder Monogramm. size: 'small' | 'big' */
export function placeLogo(place, size = 'small') {
  // Lifte zeigen ihr Symbol: ein Logo mit gleichem Namen gehört meist der Hütte daneben
  const m = place.type === 'lift' ? null : mediaFor(place.name);
  const cls = `place-logo is-${size}`;
  if (place.type === 'piste') {
    return h('span', { class: `${cls} disc diff-${place.diff}` }, h('span', {}, place.ref || ''));
  }
  if (place.type === 'parking') {
    return h('span', { class: `${cls} is-parking` }, 'P');
  }
  if (place.type === 'person') {
    return h('span', { class: `${cls} is-person`, style: { '--c': place.member.color } }, place.name[0]);
  }
  const fallback = () => place.type === 'lift'
    ? h('span', { class: `${cls} is-lift` }, icon(liftIcon(place.lift?.type)))
    : h('span', { class: `${cls} is-badge` });
  // Foto wirkt am besten, dann echtes Logo, sonst ein eigenes gezeichnetes Bild – nie Buchstaben
  // Groß über dem Titelbild nur ein echtes Logo, sonst stünde das Foto doppelt da
  const src = size === 'big' ? m?.logo : m?.photo || m?.logo;
  if (!src) return fallback();
  const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
  const el = h('span', { class: `${cls} ${src === m.photo ? 'has-photo' : 'has-img'}` }, img);
  img.addEventListener('error', () => el.replaceWith(fallback()), { once: true });
  return el;
}

/**
 * Titelbild der Ortskarte: echtes Foto (mit Bildnachweis) oder – wenn es keins gibt –
 * eine gezeichnete Bergszene. Name und Art stehen groß auf dem Bild.
 * overlay: Elemente, die unten aufs Bild kommen (Name, Infos)
 */
export function placeCover(place, overlay) {
  // Heißt ein Lift wie eine Hütte (Steinbergkogel), gehört das Foto der Hütte: dann das Bild der Bahn zeigen
  const clash = place.type === 'lift' && skimap()?.huts.some((x) => x.name === place.name);
  const m = clash ? null : mediaFor(place.name);
  const fig = h('figure', { class: 'place-cover' });
  const art = () => h('div', { class: 'place-art', html: coverArt(place) });
  if (m?.photo) {
    const img = h('img', { src: m.photo, alt: place.name, loading: 'lazy', decoding: 'async' });
    img.addEventListener('error', () => {
      img.replaceWith(art());
      fig.classList.remove('has-photo');
      fig.querySelector('.place-credit')?.remove();
    }, { once: true });
    fig.classList.add('has-photo');
    fig.append(img);
    const credit = m.credit
      ? h('a', { class: 'place-credit', href: m.credit.source, target: '_blank', rel: 'noopener' }, `Foto: ${m.credit.artist}, ${m.credit.license}`)
      : m.website ? h('span', { class: 'place-credit' }, `Foto: ${new URL(m.website).hostname.replace(/^www\./, '')}`) : null;
    if (credit) fig.append(credit);
  } else {
    fig.append(art());
  }
  fig.append(h('figcaption', { class: 'place-cover-text' }, overlay));
  return fig;
}

// Gezeichnete Szene: Himmel, zwei Bergketten mit Schnee, je nach Ort Hütte, Gondel oder Piste.
function coverArt(place) {
  const seed = [...place.name].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7);
  const r = (i) => ((Math.abs(seed >> i) % 100) / 100);
  const p1 = 40 + r(1) * 60;
  const p2 = 160 + r(3) * 80;
  const diff = { easy: '#4d8dff', intermediate: '#ff4d57', advanced: '#0b1226', expert: '#0b1226', freeride: '#f59e3a' }[place.diff];
  const cable = '<path d="M-10 62 L330 30" stroke="#fff" stroke-width="2"/>';
  const thing = place.type === 'lift' ? cable + (LIFT_ART[place.lift?.type] || LIFT_ART.gondola)
    : place.type === 'parking'
      ? `<g transform="translate(${226 + r(5) * 40} 70)"><path d="M18 52v70" stroke="#c9d3e6" stroke-width="5"/>
           <rect width="36" height="36" x="0" y="20" rx="7" fill="#1f55d6" stroke="#fff" stroke-width="3"/>
           <text x="18" y="48" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="25" fill="#fff">P</text></g>`
    : place.type === 'piste'
      ? `<path d="M${230 + r(5) * 40} 70 C 260 110, 210 130, 250 190" stroke="#fff" stroke-width="22" fill="none" stroke-linecap="round"/>
         <path d="M${230 + r(5) * 40} 70 C 260 110, 210 130, 250 190" stroke="${diff}" stroke-width="5" fill="none" stroke-linecap="round"/>`
      : `<g transform="translate(${236 + r(5) * 40} ${92 + r(6) * 10}) scale(.9)">
           <path d="M-26 0 L0 -20 L26 0 Z" fill="#3f2a1c"/><path d="M-28 1 L0 -22 L28 1" stroke="#fff" stroke-width="3" fill="none"/>
           <rect x="-20" y="0" width="40" height="22" fill="#8a5a36"/><rect x="-5" y="8" width="10" height="14" fill="#54331c"/>
           <rect x="-15" y="5" width="7" height="6" fill="#ffd66b"/><rect x="8" y="5" width="7" height="6" fill="#ffd66b"/></g>`;
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="sky${Math.abs(seed)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1226"/><stop offset="1" stop-color="#2a4380"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#sky${Math.abs(seed)})"/>
    <circle cx="${70 + r(7) * 40}" cy="34" r="13" fill="#fff" opacity=".9"/>
    <path d="M0 120 L${p1} 60 L${p1 + 50} 95 L${p2} 40 L${p2 + 70} 100 L320 70 V180 H0Z" fill="#4a6299"/>
    <path d="M${p1 - 18} 78 L${p1} 60 L${p1 + 22} 74 L${p1 + 8} 80Z M${p2 - 24} 64 L${p2} 40 L${p2 + 28} 66 L${p2 + 6} 70Z" fill="#fff"/>
    <path d="M0 150 C 60 110, 120 100, 180 112 S 290 120, 320 104 V180 H0Z" fill="#fff"/>
    ${thing}
  </svg>`;
}

// Was am Seil hängt: je Lift-Art das richtige Gerät, groß im Bild
const GONDOLA = `<g transform="translate(225 39)"><path d="M0 0v14" stroke="#fff" stroke-width="3"/><rect x="-24" y="14" width="48" height="50" rx="11" fill="#fff"/><rect x="-18" y="21" width="36" height="20" rx="4" fill="#2a4380"/><path d="M0 21v20" stroke="#fff" stroke-width="2"/><rect x="-24" y="50" width="48" height="5" fill="#e5450d"/></g>`;
const LIFT_ART = {
  gondola: GONDOLA,
  mixed_lift: GONDOLA,
  cable_car: `<g transform="translate(215 40)"><path d="M-14 0v12M14-2v14" stroke="#fff" stroke-width="3"/><rect x="-44" y="12" width="88" height="56" rx="10" fill="#fff"/><rect x="-37" y="20" width="74" height="22" rx="4" fill="#2a4380"/><path d="M-12 20v22M12 20v22" stroke="#fff" stroke-width="2"/><rect x="-44" y="54" width="88" height="5" fill="#e5450d"/></g>`,
  chair_lift: `<g transform="translate(225 39)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"><path d="M0 0v24" stroke-width="3"/><path d="M-30 24h60" stroke-width="3"/><path d="M-30 24v26M30 24v26" stroke-width="3"/><path d="M-32 34h64" stroke-width="2.5"/><rect x="-32" y="50" width="64" height="9" rx="4" fill="#e5450d" stroke="#fff" stroke-width="2"/><path d="M-32 59v10M32 59v10M-32 69h64" stroke-width="2.5"/></g>`,
  't-bar': `<g transform="translate(225 39)" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="3.5"><path d="M0 0v62"/><path d="M-24 62h48" stroke="#e5450d" stroke-width="6"/></g>`,
  'j-bar': `<g transform="translate(225 39)" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="3.5"><path d="M0 0v62"/><path d="M0 62h24" stroke="#e5450d" stroke-width="6"/></g>`,
  platter: `<g transform="translate(225 39)" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="3.5"><path d="M0 0v58"/><circle cy="66" r="9" fill="#e5450d" stroke="#fff" stroke-width="2.5"/></g>`,
  magic_carpet: `<g transform="translate(120 120)"><path d="M0 34 L150 8" stroke="#0b1226" stroke-width="10" stroke-linecap="round"/><path d="M0 34 L150 8" stroke="#e5450d" stroke-width="3" stroke-dasharray="8 8"/></g>`,
};

export { colorFor };
