// Pisten, Lifte, Hütten – und die Routenplanung darauf.
//
// Das Skigebiet ist ein Netz: Knoten (Kreuzungen, Stationen) und Kanten
// (Pistenstück bergab, Liftfahrt bergauf, kurzer Fußweg). Eine Route ist der
// schnellste Weg durch dieses Netz (Dijkstra-Algorithmus).

import { api } from './api.js';
import { distance } from '../map/geo.js';

let map = null;   // Daten aus data/skimap/kitzski.json
let out = null;   // ausgehende Kanten je Knoten
let closed = new Set(); // Lifte (Index), die gerade nicht fahren – Routen meiden sie
let closedPistes = new Set(); // Pisten (Index), die gesperrt sind

/** Liftstatus → welche Lifte gerade zu sind (Indizes in map.lifts). */
export function setClosedLifts(indices) {
  closed = new Set(indices);
}

/** Pistenstatus → welche Pisten gesperrt sind (Indizes in map.pistes). */
export function setClosedPistes(indices) {
  closedPistes = new Set(indices);
}

// Durchschnittstempo inkl. kurzer Pausen, in m/s
const SKI_SPEED = { easy: 6.5, intermediate: 8, advanced: 9, expert: 9, freeride: 6 };
const LIFT_SPEED = {
  cable_car: 8, gondola: 6, chair_lift: 5, mixed_lift: 5,
  't-bar': 3, 'j-bar': 3, platter: 3, rope_tow: 2, magic_carpet: 0.6,
};
const LIFT_WAIT = 120; // Sekunden anstehen + einsteigen
const WALK_SPEED = 1.2;

export const BLACK = new Set(['advanced', 'expert', 'freeride']);

export async function loadSkimap() {
  if (map) return map;
  map = await api.getSkimap();
  // Skirouten wie auf dem KitzSki-Plan: orange gestrichelt. In OpenStreetMap stehen sie oft als
  // schwarz/rot drin – der Name („Skiroute Giggling“) verrät sie.
  map.pistes.forEach((p) => {
    if (/skiroute/i.test(p.name || '')) p.diff = 'freeride';
  });
  out = map.nodes.map(() => []);
  map.edges.forEach((e, i) => out[e.a].push(i));
  map.coreSet = new Set(map.core);
  return map;
}

/** Wie lange dauert eine Kante wirklich? (Sekunden) */
export function edgeTime(e) {
  if (e.kind === 'lift') return LIFT_WAIT + e.len / (LIFT_SPEED[map.lifts[e.ref].type] ?? 4);
  if (e.kind === 'walk') return e.len / WALK_SPEED;
  return e.len / SKI_SPEED[map.pistes[e.ref].diff];
}

/**
 * Kosten für die Suche – hier wirken die Einstellungen:
 *  mode = 'fast' | 'avoidBlack' | 'preferBlack' | 'easyOnly'
 */
function edgeCost(e, mode) {
  const t = edgeTime(e);
  if (e.kind === 'lift' && closed.has(e.ref)) return Infinity;
  if (e.kind === 'piste' && closedPistes.has(e.ref)) return Infinity;
  if (e.kind !== 'piste') return t;
  const diff = map.pistes[e.ref].diff;
  if (mode === 'avoidBlack' && BLACK.has(diff)) return Infinity;
  if (mode === 'easyOnly' && diff !== 'easy') return Infinity;
  if (mode === 'preferBlack') return BLACK.has(diff) ? t * 0.35 : t * 1.4;
  return t;
}

/** Nächster gut erreichbarer Knoten zu einer Position (optional nur in einem Teilgebiet). */
export function nearestNode(pos, area = null) {
  let best = map.core[0];
  let bestD = Infinity;
  for (const n of map.core) {
    if (area != null && map.nodeArea[n] !== area) continue;
    const d = distance(pos, map.nodes[n]);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Schnellster Weg von Knoten zu Knoten. Gibt Kanten-Indizes zurück oder null. */
export function findPath(from, to, mode = 'fast') {
  const n = map.nodes.length;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  cost[from] = 0;
  // Bei ~400 Knoten reicht eine einfache Suche ohne Heap.
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const ei of out[u]) {
      const e = map.edges[ei];
      const c = cost[u] + edgeCost(e, mode);
      if (c < cost[e.b]) {
        cost[e.b] = c;
        prev[e.b] = ei;
      }
    }
  }
  if (from !== to && prev[to] < 0) return null;
  const path = [];
  for (let v = to; v !== from; v = map.edges[prev[v]].a) path.unshift(prev[v]);
  return path;
}

/**
 * Route mit Zusammenfassung für die Anzeige.
 * Schritte fassen gleiche Pisten/Lifte zusammen: „Lift X hoch“, „Piste 21 runter“.
 */
export function route(fromPos, toNode, mode = 'fast') {
  const start = nearestNode(fromPos);
  // Ziel außerhalb des Kerns (z. B. Station knapp neben der Piste) → nächster erreichbarer Knoten
  if (!map.coreSet.has(toNode)) toNode = nearestNode(map.nodes[toNode], map.nodeArea[toNode]);
  // Anderes Teilgebiet (z. B. Horn): nur mit dem Skibus erreichbar
  if (map.nodeArea[start] !== map.nodeArea[toNode]) {
    return { unreachable: 'area', area: map.areas[map.nodeArea[toNode]] };
  }
  const path = findPath(start, toNode, mode);
  if (!path) return null;

  const steps = [];
  let time = 0;
  let dist = 0;
  let up = 0;
  let down = 0;
  for (const ei of path) {
    const e = map.edges[ei];
    const t = edgeTime(e);
    time += t;
    dist += e.len;
    const dh = map.ele[e.b] - map.ele[e.a];
    if (dh > 0) up += dh;
    else down -= dh;
    if (e.kind === 'walk') {
      if (steps.length) steps[steps.length - 1].coords.push(...e.coords);
      continue;
    }
    const key = `${e.kind}:${e.kind === 'piste' ? pisteKey(map.pistes[e.ref]) : e.ref}`;
    const last = steps[steps.length - 1];
    if (last && last.key === key) {
      last.len += e.len;
      last.time += t;
      last.coords.push(...e.coords);
      if (e.kind === 'piste' && !last.item.ref) last.item = map.pistes[e.ref]; // Stück mit Nummer bevorzugen
    } else {
      steps.push({
        key, kind: e.kind, len: e.len, time: t, coords: [...e.coords],
        item: e.kind === 'piste' ? map.pistes[e.ref] : map.lifts[e.ref],
      });
    }
  }
  mergeShortPistes(steps);
  return {
    steps, time, dist, up, down,
    target: toNode,
    coords: steps.flatMap((s) => s.coords),
    pistes: steps.filter((s) => s.kind === 'piste').length,
    lifts: steps.filter((s) => s.kind === 'lift').length,
    blacks: steps.filter((s) => s.kind === 'piste' && BLACK.has(s.item.diff)).length,
  };
}

// Gleicher Name = gleiche Piste (manche Stücke haben eine Nummer, andere nicht)
const pisteKey = (p) => p.name || p.ref || p.diff;

const SHORT = 150; // Meter – kürzere Pistenstücke sind nur Verbindungen

/** Kurze Pistenstücke in die Nachbar-Piste schieben, damit die Liste übersichtlich bleibt. */
function mergeShortPistes(steps) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind !== 'piste' || s.len >= SHORT) continue;
    const next = steps[i + 1]?.kind === 'piste' ? steps[i + 1] : null;
    const prev = steps[i - 1]?.kind === 'piste' ? steps[i - 1] : null;
    const into = next || prev;
    if (!into) continue;
    into.len += s.len;
    into.time += s.time;
    if (into === next) into.coords.unshift(...s.coords);
    else into.coords.push(...s.coords);
    steps.splice(i, 1);
    i -= 1;
  }
  // Danach können zwei gleiche Pisten direkt hintereinander stehen
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].key === steps[i - 1].key) {
      steps[i - 1].len += steps[i].len;
      steps[i - 1].time += steps[i].time;
      steps[i - 1].coords.push(...steps[i].coords);
      steps.splice(i, 1);
      i -= 1;
    }
  }
}

/** Alles, was man suchen kann: Hütten, Lifte, Pisten. */
export function searchIndex() {
  const items = [];
  map.huts.forEach((hut) => items.push({ type: 'hut', name: hut.name, pos: hut.pos, node: hut.node, hut }));
  const seenLift = new Set();
  map.edges.forEach((e) => {
    if (e.kind !== 'lift' || seenLift.has(e.ref)) return;
    seenLift.add(e.ref);
    const lift = map.lifts[e.ref];
    items.push({ type: 'lift', name: lift.name, sub: lift.typeName, pos: map.nodes[e.a], node: e.a, lift });
  });
  const seenPiste = new Map();
  map.edges.forEach((e) => {
    if (e.kind !== 'piste') return;
    const p = map.pistes[e.ref];
    const key = pisteKey(p);
    if (!p.name && !p.ref) return;
    if (!seenPiste.has(key)) {
      // Ziel = Anfang der Piste, wenn er im Kern liegt
      const node = map.coreSet.has(e.a) ? e.a : nearestNode(map.nodes[e.a]);
      seenPiste.set(key, { type: 'piste', name: p.name || `Piste ${p.ref}`, ref: p.ref, diff: p.diff, pos: map.nodes[e.a], node, piste: p });
    } else if (!seenPiste.get(key).ref && p.ref) {
      seenPiste.get(key).ref = p.ref;
    }
  });
  items.push(...seenPiste.values());
  return items;
}

/**
 * Wo liegt ein Punkt? Nächste Piste oder nächster Lift – für Einsätze („Piste 21 Familienabfahrt, 1.540 m“).
 * → { kind: 'piste' | 'lift', item, dist (m), ele (m) }
 */
export function placeAt(pos) {
  let best = null;
  for (const e of map.edges) {
    if (e.kind === 'walk') continue;
    for (let i = 0; i < e.coords.length; i += 2) {
      const d = distance(pos, e.coords[i]);
      if (!best || d < best.dist) best = { e, dist: d, f: e.coords.length > 1 ? i / (e.coords.length - 1) : 0 };
    }
  }
  if (!best) return null;
  const { e, f } = best;
  return {
    kind: e.kind,
    item: e.kind === 'piste' ? map.pistes[e.ref] : map.lifts[e.ref],
    dist: best.dist,
    ele: Math.round(map.ele[e.a] + (map.ele[e.b] - map.ele[e.a]) * f),
  };
}

/** Kurzer Name für einen Ort: „21 Streif Familienabfahrt“ oder „Hahnenkammbahn“ (null, wenn nichts in der Nähe) */
export function placeLabel(pos) {
  const p = placeAt(pos);
  if (!p || p.dist > 400) return null;
  const { item } = p;
  if (p.kind === 'lift') return item.name;
  if (item.name && item.ref) return `${item.ref} ${item.name}`;
  return item.name || (item.ref ? `Piste ${item.ref}` : null);
}

/** Ort eines Chips: Der Chip meldet selbst, in welchem Lift / auf welcher Piste er ist (kind + ref). */
export function chipPlace(p) {
  if (p.kind === 'lift' && p.ref != null) return map.lifts[p.ref].name;
  const piste = p.kind === 'piste' && p.ref != null ? map.pistes[p.ref] : null;
  if (piste?.name) return piste.ref ? `${piste.ref} ${piste.name}` : piste.name;
  return placeLabel([p.lat, p.lng]);
}

export const skimap = () => map;
