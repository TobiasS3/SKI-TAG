// Zugang läuft um Mitternacht aus – die App ist nur ein Werkzeug für den Miet-Tag.

import { load, save, remove } from './storage.js';
import { nextMidnight } from '../utils/time.js';

const KEY = 'session';

/** Nach erfolgreichem Login: Sitzung bis Mitternacht anlegen. */
export function startSession(user) {
  const session = { ...user, startedAt: Date.now(), expiresAt: nextMidnight().getTime() };
  save(KEY, session);
  return session;
}

/** Aktuelle Sitzung oder null, wenn keine da ist oder sie abgelaufen ist. */
export function currentSession() {
  const session = load(KEY);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    endSession();
    return null;
  }
  return session;
}

export function endSession() {
  remove(KEY);
}

/** cb wird genau um Mitternacht aufgerufen. Gibt eine Abbruch-Funktion zurück. */
export function onExpire(cb) {
  const session = currentSession();
  if (!session) return () => {};
  // setTimeout hält höchstens ~24 Tage – reicht für einen Tag locker
  const timer = setTimeout(() => {
    endSession();
    cb();
  }, session.expiresAt - Date.now());
  return () => clearTimeout(timer);
}
