// Öffnungszeiten aus OpenStreetMap lesen („Mo-Su 09:00-16:30“, „Fr-We 09:00-16:30“,
// „Winter: Mo-So 10:00-16:00“, „Dec-Apr: Mo 16:30-01:00; Dec-Sep: Tu-Su,PH 16:30-01:00“).
// Nur die häufigen Fälle – was nicht passt, gilt als unbekannt.
//
//   openingState('Mo-Su 09:00-16:30', new Date()) → { known: true, open: true, until: '16:30' }

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_ALIAS = { So: 'Su', Di: 'Tu', Mi: 'We', Do: 'Th', Sa: 'Sa' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** „Fr-We“ / „Mo,We“ / „Mo-Su,PH“ → Wochentage (0 = Sonntag) */
function dayset(spec) {
  const set = new Set();
  for (const part of spec.split(',')) {
    if (part === 'PH') continue; // Feiertage – ignorieren
    const [a, b] = part.split('-').map((d) => DAYS.indexOf(DAY_ALIAS[d] || d));
    if (a < 0) return null;
    if (b == null || b < 0) set.add(a);
    else for (let d = a; ; d = (d + 1) % 7) { set.add(d); if (d === b) break; }
  }
  return set;
}

/** „Dec-Apr“ / „Winter“ → passt der Monat? */
function monthOk(spec, month) {
  if (/^winter$/i.test(spec)) return [11, 0, 1, 2, 3].includes(month);
  const [a, b] = spec.split('-').map((m) => MONTHS.indexOf(m));
  if (a < 0) return true;
  if (b == null || b < 0) return month === a;
  for (let m = a; ; m = (m + 1) % 12) { if (m === month) return true; if (m === b) return false; }
}

export function openingState(text, date = new Date()) {
  if (!text) return { known: false };
  const day = date.getDay();
  const now = date.getHours() * 60 + date.getMinutes();
  let today = null; // Zeiten, die heute gelten (spätere Regel gewinnt, wie bei OSM)
  let understood = false;
  for (let rule of text.split(';').map((r) => r.trim()).filter(Boolean)) {
    const season = rule.match(/^([A-Za-z]{3}(?:-[A-Za-z]{3})?|Winter):\s*/);
    if (season) {
      understood = true;
      if (!monthOk(season[1], date.getMonth())) continue;
      rule = rule.slice(season[0].length);
    }
    const m = rule.match(/^(?:([A-Za-z,-]+)\s+)?((?:\d{1,2}:\d{2}-\d{1,2}:\d{2},?)+)$/);
    if (!m) {
      if (/^24\/7$/.test(rule)) { today = [[0, 24 * 60]]; understood = true; }
      continue;
    }
    const days = m[1] ? dayset(m[1]) : new Set(DAYS.map((_, i) => i));
    if (!days) continue;
    understood = true;
    if (days.has(day)) today = m[2].split(',').filter(Boolean).map((r) => r.split('-').map(minutes));
  }
  if (!understood) return { known: false };
  if (!today) return { known: true, open: false };
  for (const [from, to] of today) {
    const end = to <= from ? to + 24 * 60 : to; // über Mitternacht
    if (now >= from && now < end) return { known: true, open: true, until: fmt(to) };
    if (now < from) return { known: true, open: false, from: fmt(from) };
  }
  return { known: true, open: false };
}

const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
