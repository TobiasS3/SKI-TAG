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

/** Alles von Ski Tag löschen – außer den Schlüsseln in keep (z. B. die Sprache). Nur zum Testen. */
export function clearAll(keep = []) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX) && !keep.includes(k.slice(PREFIX.length)))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* egal */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* egal */
  }
}
