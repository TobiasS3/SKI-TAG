// Name + Code prüfen → Rolle (Gast / Mitarbeiter / Skischule).

import { api } from '../services/api.js';
import { startSession } from './session.js';

export const CODE_LENGTH = 6;

/** Eingabe säubern: Leerzeichen weg, Großbuchstaben. */
export const normalizeCode = (raw) => raw.replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * Einloggen mit Name (wie auf dem Mietbeleg) und Code. Ergebnis:
 *  { ok: true, session }  oder  { ok: false, error: 'noName' | 'format' | 'unknown' | 'name' | 'offline' }
 */
export async function login(name, raw) {
  if (!name.trim()) return { ok: false, error: 'noName' };
  const code = normalizeCode(raw);
  if (code.length !== CODE_LENGTH) return { ok: false, error: 'format' };
  try {
    const user = await api.login(code, name);
    if (!user) return { ok: false, error: 'unknown' };
    if (user === 'name') return { ok: false, error: 'name' };
    return { ok: true, session: startSession(user) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}
