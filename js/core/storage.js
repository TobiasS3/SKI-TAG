// Daten im Browser speichern (localStorage).
// Im privaten Modus kann der Speicher fehlen – dann geht einfach nichts verloren, es wird nur nichts gemerkt.

const PREFIX = 'skitag.';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Speicher voll oder gesperrt */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* egal */
  }
}
