// Teile der App benachrichtigen sich gegenseitig.
// Beispiel: on('lang', render)  …  emit('lang', 'en')

const listeners = new Map();

/** Zuhören. Gibt eine Funktion zum Abmelden zurück. */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name).delete(fn);
}

export function emit(name, data) {
  listeners.get(name)?.forEach((fn) => fn(data));
}
