// Zustand von Liften und Pisten aus dem Liftstatus (api.getLiftStatus / api.getPisteStatus).
// Gebraucht von Gäste- und Bergbahn-Ansicht.

import { todayAt, now as clockNow } from '../utils/time.js';

/**
 * Zustand eines Lifts jetzt.
 * → { state: 'open' | 'soon' | 'closing' | 'later' | 'done' | 'hold' | 'closed', open, close, reason, note }
 */
export function liftState(status, name, now = clockNow()) {
  const entry = { ...status?.default, ...status?.lifts?.[name] };
  const open = entry.open || '08:30';
  const close = entry.close || '16:30';
  const base = { open, close, reason: entry.reason, note: entry.note };
  if (entry.status === 'closed') return { ...base, state: 'closed' };
  if (now < todayAt(open)) return { ...base, state: 'later' };
  if (now >= todayAt(close)) return { ...base, state: 'done' };
  if (entry.status === 'hold') return { ...base, state: 'hold' };
  if (todayAt(close) - now < 30 * 60000) return { ...base, state: 'closing' };
  return { ...base, state: 'open' };
}

export const isRunning = (s) => s.state === 'open' || s.state === 'closing';

/** Eindeutige Lifte (gleicher Name im gleichen Gebiet = ein Eintrag), mit Gebiet und Startknoten. */
export function liftList(skimap) {
  const seen = new Map();
  skimap.edges.forEach((e) => {
    if (e.kind !== 'lift') return;
    const lift = skimap.lifts[e.ref];
    const area = skimap.nodeArea[e.a];
    const key = `${area}:${lift.name}`;
    if (!seen.has(key)) seen.set(key, { lift, area, node: e.a, pos: skimap.nodes[e.a] });
  });
  return [...seen.values()];
}

/** Zustand einer Piste: { open, groomed, note, reason } – ohne Eintrag offen und präpariert */
export function pisteState(status, piste) {
  const entry = status?.pistes?.[piste.name] || status?.pistes?.[piste.ref] || {};
  const route = piste.diff === 'freeride' || /skiroute/i.test(piste.name || '');
  return {
    open: entry.status !== 'closed',
    reason: entry.reason,
    groomed: entry.groomed ?? !route,
    note: entry.note || (route ? 'route' : null),
  };
}

/** Eindeutige Pisten (Name oder Nummer) mit Gebiet, Länge und Startknoten */
export function pisteList(skimap) {
  const seen = new Map();
  skimap.edges.forEach((e) => {
    if (e.kind !== 'piste') return;
    const p = skimap.pistes[e.ref];
    const key = p.name || p.ref;
    if (!key) return;
    const area = skimap.nodeArea[e.a];
    const k = `${area}:${key}`;
    if (!seen.has(k)) seen.set(k, { piste: p, area, len: 0, node: e.a, pos: skimap.nodes[e.a], refs: new Set() });
    const x = seen.get(k);
    x.len += e.len;
    x.refs.add(e.ref);
    if (!x.piste.ref && p.ref) x.piste = p;
  });
  return [...seen.values()];
}
