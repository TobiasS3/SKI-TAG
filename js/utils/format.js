// Zahlen und Texte formatieren.

import { getLang } from '../core/i18n.js';

const locale = () => (getLang() === 'de' ? 'de-AT' : 'en-GB');

/** 1234 → "1,2 km", 340 → "340 m" */
export function distance(m) {
  if (m >= 1000) {
    return `${(m / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(m)} m`;
}

/** Sekunden → "1 h 05 min" / "12 min" */
export function duration(s) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** m/s → "54 km/h" */
export const speed = (ms) => `${Math.round(ms * 3.6)} km/h`;

export const number = (n, digits = 0) =>
  n.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** -7 → "−7°" (echtes Minuszeichen) */
export const temp = (c) => `${c < 0 ? '−' : ''}${Math.abs(Math.round(c))}°`;
