// Simulierter Chip – fährt wie ein echter Gast durchs Skigebiet.
// Wird NUR von api.js benutzt. Sobald echte Chips senden, fällt diese Datei weg.

import { config } from '../config.js';
import { skimap, findPath, edgeTime } from './slopes.js';
import { pointAlong, distance } from '../map/geo.js';
import { now } from '../utils/time.js';

const TICK_MS = 1000;

/**
 * Startet einen Fake-Chip. cb bekommt laufend:
 * { lat, lng, alt (m), speed (m/s), kind: 'piste'|'lift'|'walk', ref, time, battery (%) }
 *
 * Rückgabe: { stop(), goTo(node, mode) }
 *   goTo = „Der Gast folgt jetzt der Navigation zu diesem Punkt“ (null = wieder frei fahren)
 */
export function simulateChip({ seed = 1, start, mode = 'fast' }, cb) {
  const map = skimap();
  const rand = mulberry(seed);
  let node = start != null ? start : map.core[Math.floor(rand() * map.core.length)];
  let queue = [];          // Kanten, die noch gefahren werden
  let edge = null;
  let along = 0;           // Meter auf der aktuellen Kante
  let edgeSpeed = 0;
  let wait = 0;            // Sekunden Pause (Anstehen, Hütte)
  let guide = null;        // { node, mode } wenn navigiert wird
  let simTime = now().getTime();
  const t0 = simTime;
  const battery0 = 70 + Math.round(rand() * 30); // Akku beim Start in %

  // Zufällige Ziele nur im selben Teilgebiet (zum Horn geht's nur mit dem Bus)
  const sameArea = (n) => map.nodeArea[n] === map.nodeArea[node];

  function nextPath() {
    if (guide) {
      if (node === guide.node) return []; // angekommen: stehen bleiben
      return findPath(node, guide.node, guide.mode) || [];
    }
    // Mal ein Lift oben, mal irgendwo – wie ein echter Tag
    const lifts = map.edges.filter((e) => e.kind === 'lift' && map.coreSet.has(e.b) && e.len > 400 && sameArea(e.b));
    const core = map.core.filter(sameArea);
    for (let tries = 0; tries < 12; tries++) {
      const target = rand() < 0.6 && lifts.length
        ? lifts[Math.floor(rand() * lifts.length)].b
        : core[Math.floor(rand() * core.length)];
      const path = findPath(node, target, mode);
      if (path && path.length > 2) return path;
    }
    return [];
  }

  function step(dt) {
    let left = dt;
    while (left > 0) {
      if (wait > 0) {
        const w = Math.min(wait, left);
        wait -= w;
        left -= w;
        continue;
      }
      if (!edge) {
        if (!queue.length) queue = nextPath();
        if (!queue.length) return;
        edge = map.edges[queue.shift()];
        along = 0;
        const t = edgeTime(edge);
        if (edge.kind === 'lift') {
          wait = 30 + rand() * 120;
          edgeSpeed = edge.len / (t - 120);
        } else {
          // Jeder fährt etwas anders schnell
          edgeSpeed = (edge.len / t) * (0.8 + rand() * 0.9);
        }
        continue;
      }
      const move = Math.min(left, (edge.len - along) / edgeSpeed);
      along += move * edgeSpeed;
      left -= move;
      if (along >= edge.len - 0.01) {
        node = edge.b;
        edge = null;
      }
    }
  }

  let last = null;
  function emit() {
    const pos = edge ? pointAlong(edge.coords, along) : map.nodes[node];
    const kind = edge ? edge.kind : 'walk';
    // Höhe: zwischen Anfang und Ende der Kante verteilt
    const alt = edge
      ? map.ele[edge.a] + (map.ele[edge.b] - map.ele[edge.a]) * Math.min(1, along / Math.max(1, edge.len))
      : map.ele[node];
    // echte Geschwindigkeit aus dem zurückgelegten Weg
    const speed = last ? distance(last, pos) / ((TICK_MS / 1000) * config.simSpeed) : 0;
    last = pos;
    const battery = Math.max(5, Math.round(battery0 - (simTime - t0) / (1000 * 60 * 12))); // ~5 % pro Stunde
    cb({
      lat: pos[0], lng: pos[1], alt: Math.round(alt),
      speed: wait > 0 ? 0 : speed, kind, ref: edge?.ref ?? null, time: simTime, battery,
    });
  }

  // Start-Position sofort melden
  emit();
  const timer = setInterval(() => {
    const dt = (TICK_MS / 1000) * config.simSpeed;
    simTime += dt * 1000;
    step(dt);
    emit();
  }, TICK_MS);

  return {
    stop: () => clearInterval(timer),
    goTo(target, guideMode = 'fast') {
      guide = target == null ? null : { node: target, mode: guideMode };
      queue = []; // aktuelle Kante zu Ende fahren, dann neuer Weg
      if (wait > 0 && edge?.kind !== 'lift') wait = 0;
    },
  };
}

/** Kleiner Zufallsgenerator mit Startwert – gleicher Seed, gleicher Tag. */
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
