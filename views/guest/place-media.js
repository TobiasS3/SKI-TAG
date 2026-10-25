// Bilder und Logos zu Hütten und Bahnen – mit Ersatz, wenn nichts da ist.
//
// Quellen (siehe tools/fetch-place-media.py):
//   assets/places/commons/  freie Fotos von Wikimedia Commons (mit Namensnennung)
//   assets/places/web/      Fotos/Logos von den Webseiten der Hütten (nur lokal, nicht im Git)

import { h } from '../../js/utils/dom.js';
import { icon, iconHTML } from '../../js/components/icons.js';

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
  const m = mediaFor(place.name);
  const cls = `place-logo is-${size}`;
  if (place.type === 'piste') {
    return h('span', { class: `${cls} disc diff-${place.diff}` }, h('span', {}, place.ref || ''));
  }
  if (place.type === 'person') {
    return h('span', { class: `${cls} is-person`, style: { '--c': place.member.color } }, place.name[0]);
  }
  const fallback = () => place.type === 'lift'
    ? h('span', { class: `${cls} is-lift` }, icon('gondola'))
    : h('span', { class: `${cls} is-mono`, style: { '--c': colorFor(place.name) } }, initials(place.name));
  if (!m?.logo) return fallback();
  const img = h('img', { src: m.logo, alt: '', loading: 'lazy', decoding: 'async' });
  const el = h('span', { class: `${cls} has-img` }, img);
  img.addEventListener('error', () => el.replaceWith(fallback()), { once: true });
  return el;
}

/**
 * Titelbild der Ortskarte: echtes Foto (mit Bildnachweis) oder – wenn es keins gibt –
 * eine gezeichnete Bergszene. Name und Art stehen groß auf dem Bild.
 * overlay: Elemente, die unten aufs Bild kommen (Name, Infos)
 */
export function placeCover(place, overlay) {
  const m = mediaFor(place.name);
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
  const diff = { easy: '#1f66d1', intermediate: '#e0242f', advanced: '#0e0e10', expert: '#0e0e10', freeride: '#f08a24' }[place.diff];
  const thing = place.type === 'lift'
    ? `<path d="M-10 70 L330 40" stroke="#0e0e10" stroke-width="1.5"/><g transform="translate(${210 + r(5) * 60} ${50 - r(5) * 6})">
         <path d="M0 0v10" stroke="#0e0e10" stroke-width="2"/><rect x="-11" y="10" width="22" height="20" rx="5" fill="#ff2d2d"/>
         <rect x="-7" y="14" width="14" height="7" rx="2" fill="#fff" opacity=".85"/></g>`
    : place.type === 'piste'
      ? `<path d="M${230 + r(5) * 40} 70 C 260 110, 210 130, 250 190" stroke="#fff" stroke-width="22" fill="none" stroke-linecap="round"/>
         <path d="M${230 + r(5) * 40} 70 C 260 110, 210 130, 250 190" stroke="${diff}" stroke-width="5" fill="none" stroke-linecap="round"/>`
      : `<g transform="translate(${236 + r(5) * 40} ${92 + r(6) * 10}) scale(.9)">
           <path d="M-26 0 L0 -20 L26 0 Z" fill="#2a2a30"/><path d="M-28 1 L0 -22 L28 1" stroke="#fff" stroke-width="3" fill="none"/>
           <rect x="-20" y="0" width="40" height="22" fill="#55555d"/><rect x="-5" y="8" width="10" height="14" fill="#2a2a30"/>
           <rect x="-15" y="5" width="7" height="6" fill="#ffd66b"/><rect x="8" y="5" width="7" height="6" fill="#ffd66b"/></g>`;
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="sky${Math.abs(seed)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc2ff"/><stop offset="1" stop-color="#eaf2ff"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#sky${Math.abs(seed)})"/>
    <circle cx="${250 - r(7) * 40}" cy="38" r="16" fill="#fff" opacity=".9"/>
    <path d="M0 120 L${p1} 60 L${p1 + 50} 95 L${p2} 40 L${p2 + 70} 100 L320 70 V180 H0Z" fill="#b8c3d4"/>
    <path d="M${p1 - 18} 78 L${p1} 60 L${p1 + 22} 74 L${p1 + 8} 80Z M${p2 - 24} 64 L${p2} 40 L${p2 + 28} 66 L${p2 + 6} 70Z" fill="#fff"/>
    <path d="M0 150 C 60 110, 120 100, 180 112 S 290 120, 320 104 V180 H0Z" fill="#fff"/>
    <path d="M0 150 C 60 110, 120 100, 180 112 S 290 120, 320 104" stroke="#dfe5ee" stroke-width="2" fill="none"/>
    ${thing}
  </svg>`;
}

/** HTML für Kartenmarker (Leaflet braucht Text). Lädt das Logo nicht, bleibt das Haus-Symbol. */
export function logoHTML(name) {
  const m = mediaFor(name);
  if (m?.logo) return `<img src="${m.logo}" alt="" onerror="this.remove()">${iconHTML('hut')}`;
  return '';
}

export { colorFor };
