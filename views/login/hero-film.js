// Startfilm: Flug über das echte Skigebiet, in Echtzeit gezeichnet aus data/skimap/kitzski.json.
// Gelände als Punkte, Pisten und Lifte wachsen vom Tal zum Gipfel, dann fahren drei Chips umher.
// Kein Videomaterial: keine Lizenzfrage, bleibt auf jedem Bildschirm scharf.
// Weniger Bewegung gewünscht → ein einziges Standbild.

import { reducedMotion } from '../../js/utils/dom.js';
import { api } from '../../js/services/api.js';

const COLORS = {
  easy: '#4d8dff',
  intermediate: '#ff4d57',
  advanced: '#eef0f5',
  expert: '#eef0f5',
  freeride: '#f59e3a',
  lift: 'rgba(255, 255, 255, 0.5)',
};
const CHIPS = ['#5b8cff', '#ff8a3d', '#2fd08a'];
const REVEAL_S = 4.5;     // so lange wachsen die Linien
const LIFT_Z = 2.4;       // Höhen überzeichnen, damit die Berge wirken
const TILT = 1.02;        // Blickwinkel von oben (Radiant)
const FRAME_MS = 1000 / 24;

export function mountHeroFilm(canvas) {
  const g = canvas.getContext('2d');
  let scene = null;
  let raf = 0;
  let last = 0;
  let start = 0;
  let w = 0;
  let h = 0;
  let gone = false;

  function resize() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = box.width;
    h = box.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene && reducedMotion()) draw(30);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  api.getSkimap().then((map) => {
    if (gone) return;
    scene = buildScene(map);
    if (reducedMotion()) draw(30);
    else raf = requestAnimationFrame(loop);
  }).catch(() => { /* ohne Daten bleibt der dunkle Hintergrund */ });

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    start ||= now;
    draw((now - start) / 1000);
  }

  function draw(time) {
    const portrait = h > w;
    const angle = -0.5 + Math.sin(time * 0.06) * 0.42;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const scale = (portrait ? Math.min(w * 1.25, h * 0.62) : Math.min(w * 0.62, h * 1.05)) / scene.radius;
    const cx = portrait ? w * 0.5 : w * 0.34;
    const cy = portrait ? h * 0.27 : h * 0.5;
    const depth = scene.radius * 2.6;
    const tiltC = Math.cos(TILT);
    const tiltS = Math.sin(TILT);

    const project = (x, y, z) => {
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      const sy = ry * tiltC - z * tiltS;
      const p = depth / (depth + ry * tiltS + z * tiltC);
      return [cx + rx * p * scale, cy + sy * p * scale, p];
    };

    g.clearRect(0, 0, w, h);
    const reveal = Math.min(1, time / REVEAL_S);

    // Gelände: hohe Punkte heller
    g.fillStyle = '#c9d6ff';
    for (let i = 0; i < scene.dots.length; i += 4) {
      const [x, y] = project(scene.dots[i], scene.dots[i + 1], scene.dots[i + 2]);
      g.globalAlpha = scene.dots[i + 3] * (0.35 + reveal * 0.65);
      g.fillRect(x, y, 1.3, 1.3);
    }
    g.globalAlpha = 1;

    // Pisten und Lifte: erst weicher Schein, dann die scharfe Linie
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [kind, lines] of scene.lines) {
      g.beginPath();
      for (const line of lines) {
        if (line.grow > reveal) continue;
        for (let i = 0; i < line.pts.length; i += 3) {
          const [x, y] = project(line.pts[i], line.pts[i + 1], line.pts[i + 2]);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
      }
      g.strokeStyle = COLORS[kind];
      if (kind !== 'lift' && w > 700) { // weicher Schein nur auf großen Bildschirmen
        g.globalAlpha = 0.16;
        g.lineWidth = 4;
        g.stroke();
        g.globalAlpha = 1;
      }
      g.lineWidth = kind === 'lift' ? 0.9 : 1.4;
      g.stroke();
    }

    // Chips: fahren durchs Netz und funken ihre Position
    if (reveal >= 1 || reducedMotion()) {
      scene.chips.forEach((chip, i) => {
        const pos = advance(chip, scene);
        const [x, y] = project(pos[0], pos[1], pos[2]);
        const wave = (time * 0.5 + i * 0.33) % 1;
        g.strokeStyle = CHIPS[i];
        g.globalAlpha = (1 - wave) * 0.8;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, 4 + wave * 20, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = CHIPS[i];
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.fill();
      });
    }
  }

  return {
    destroy() {
      gone = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    },
  };
}

/** Karte in Meter um die Gebietsmitte umrechnen: nur das große Teilgebiet (Index 0). */
function buildScene(map) {
  const main = map.nodes.map((n, i) => ({ n, i })).filter(({ i }) => map.nodeArea[i] === 0);
  const lat0 = main.reduce((s, { n }) => s + n[0], 0) / main.length;
  const lng0 = main.reduce((s, { n }) => s + n[1], 0) / main.length;
  const ele = main.map(({ i }) => map.ele[i] || 0);
  const eleMin = Math.min(...ele);
  const eleMax = Math.max(...ele);
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const toX = (lng) => (lng - lng0) * kx;
  const toY = (lat) => -(lat - lat0) * 111320;
  const toZ = (e) => -(e - (eleMin + eleMax) / 2) * LIFT_Z;
  const pts = main.map(({ n, i }) => [toX(n[1]), toY(n[0]), map.ele[i] || eleMin]);
  const radius = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));

  // --- Linien -------------------------------------------------------------------------
  const groups = new Map();
  const walk = new Map(); // Knoten → Kanten, auf denen die Chips weiterfahren
  for (const e of map.edges) {
    if (map.nodeArea[e.a] !== 0 || !e.coords?.length) continue;
    const kind = e.kind === 'lift' ? 'lift' : map.pistes[e.ref]?.diff || 'easy';
    const a = map.ele[e.a] || eleMin;
    const b = map.ele[e.b] || eleMin;
    const last = Math.max(1, e.coords.length - 1);
    const line = new Float32Array(e.coords.length * 3);
    e.coords.forEach(([lat, lng], i) => {
      line[i * 3] = toX(lng);
      line[i * 3 + 1] = toY(lat);
      line[i * 3 + 2] = toZ(a + ((b - a) * i) / last);
    });
    if (!groups.has(kind)) groups.set(kind, []);
    // Tal zuerst, Gipfel zuletzt
    groups.get(kind).push({ pts: line, grow: (Math.min(a, b) - eleMin) / (eleMax - eleMin + 1) * 0.92 });
    const entry = { a: e.a, b: e.b, line };
    if (!walk.has(e.a)) walk.set(e.a, []);
    if (!walk.has(e.b)) walk.set(e.b, []);
    walk.get(e.a).push(entry);
    walk.get(e.b).push(entry);
  }

  // --- Gelände: Höhe an jedem Rasterpunkt aus den nächsten Knoten geschätzt ----------------
  const dots = [];
  const STEP = radius / 30;
  for (let x = -radius; x <= radius; x += STEP) {
    for (let y = -radius; y <= radius; y += STEP) {
      let sum = 0;
      let weight = 0;
      let near = Infinity;
      for (const [px, py, pe] of pts) {
        const d2 = (px - x) ** 2 + (py - y) ** 2 + 1;
        near = Math.min(near, d2);
        const w = 1 / (d2 * d2);
        sum += w * pe;
        weight += w;
      }
      if (near > (radius * 0.2) ** 2) continue;
      const e = sum / weight;
      const fade = 1 - Math.sqrt(near) / (radius * 0.2);
      dots.push(x, y, toZ(e), (0.1 + 0.42 * ((e - eleMin) / (eleMax - eleMin + 1))) * fade);
    }
  }

  // --- Chips: feste Startpunkte, damit der Film immer gleich aussieht ------------------------
  const nodes = [...walk.keys()];
  const chips = CHIPS.map((_, i) => startChip(walk, nodes[Math.floor(((i + 1) * nodes.length) / 4)], i * 7 + 3));
  return { dots: new Float32Array(dots), lines: [...groups], radius, walk, chips };
}

function startChip(walk, node, seed) {
  const chip = { node, seed, line: null, i: 0, forward: true };
  nextEdge(chip, walk);
  return chip;
}

function nextEdge(chip, walk) {
  const options = walk.get(chip.node) || [];
  chip.seed = (chip.seed * 9301 + 49297) % 233280; // kleiner, wiederholbarer Zufall
  const edge = options[chip.seed % Math.max(1, options.length)];
  if (!edge) return;
  chip.forward = edge.a === chip.node;
  chip.node = chip.forward ? edge.b : edge.a;
  chip.line = edge.line;
  chip.i = 0;
}

/** Chip ein Stück weiterbewegen, gibt [x, y, z] zurück. */
function advance(chip, scene) {
  const count = chip.line.length / 3;
  const step = 0.35;
  chip.i += step;
  if (chip.i >= count - 1) {
    nextEdge(chip, scene.walk);
    return advance(chip, scene);
  }
  const at = chip.forward ? chip.i : count - 1 - chip.i;
  const k = Math.floor(at);
  const f = at - k;
  const next = Math.min(count - 1, k + 1);
  const line = chip.line;
  return [0, 1, 2].map((o) => line[k * 3 + o] + (line[next * 3 + o] - line[k * 3 + o]) * f);
}
