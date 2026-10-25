// Code prüfen → Rolle (Gast / Mitarbeiter / Skischule).

import { api } from '../services/api.js';
import { startSession } from './session.js';

export const CODE_LENGTH = 6;

/** Eingabe säubern: Leerzeichen weg, Großbuchstaben. */
export const normalizeCode = (raw) => raw.replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * Einloggen. Ergebnis:
 *  { ok: true, session }  oder  { ok: false, error: 'format' | 'unknown' | 'offline' }
 */
export async function login(raw) {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LENGTH) return { ok: false, error: 'format' };
  try {
    const user = await api.login(code);
    if (!user) return { ok: false, error: 'unknown' };
    return { ok: true, session: startSession(user) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}
