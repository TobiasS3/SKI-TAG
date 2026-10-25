// Uhrzeit und Datum.

import { config } from '../config.js';

// Test-Modus: Mit Fake-Daten kann die App so tun, als wäre es beim Start z. B. 11:00
// (config.demoTime) – die Zeit läuft dann normal weiter. So lässt sich auch abends testen.
const offset = (() => {
  if (!config.fakeData || !config.demoTime) return 0;
  const [h, m] = config.demoTime.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime() - Date.now();
})();

/** Jetzt – im Test-Modus die verschobene Uhr. Für Lifte, Restzeit, Ankunft. */
export const now = () => new Date(Date.now() + offset);

/** Date → "14:05" */
export const clock = (d = now()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "16:30" → Date von heute */
export function todayAt(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Nächste Mitternacht (Ende des heutigen Tages). */
export function nextMidnight(from = new Date()) {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  return d;
}

/** Datum für Dateinamen: "2026-10-22" */
export const isoDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
