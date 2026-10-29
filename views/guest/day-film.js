// Tagesfilm: 9 Sekunden Hochformat-Video (für Storys) aus deinem Tag.
//   Titel → deine Spur zeichnet sich in Tempo-Farben übers Pistennetz, Zahlen zählen mit → Endkarte.
//
// Gezeichnet wird auf ein <canvas>. Zum Speichern nimmt MediaRecorder das Canvas als Video auf
// (Safari: MP4, Chrome/Firefox: meist WebM). Ohne MediaRecorder gibt es ein Standbild (PNG).

import { h } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { number } from '../../js/utils/format.js';
import { isoDay } from '../../js/utils/time.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { speedColor } from '../../js/map/layers.js';

const W = 720;
const H = 1280;
const LENGTH = 9; // Sekunden
const PISTE = { easy: '#1f66d1', intermediate: '#e0242f', advanced: '#0e0e10', expert: '#0e0e10', freeride: '#f08a24' };

/**
 * Welche Datei dieses Gerät aufnehmen kann. MP4 zuerst – läuft auf iPhone, Samsung und jedem PC.
 * → { type, ext, video } (ext 'png', wenn gar kein Video geht)
 */
export function filmFormat() {
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((m) => window.MediaRecorder?.isTypeSupported?.(m));
  if (!type || !HTMLCanvasElement.prototype.captureStream) return { type: 'image/png', ext: 'png', video: false };
  return { type, ext: type.startsWith('video/mp4') ? 'mp4' : 'webm', video: true };
}

/** Dateiname ohne Endung: skitag-2026-10-29 */
export const filmName = (day) => `skitag-${isoDay(new Date(day.startedAt || Date.now()))}`;

/** Tagesfilm ohne Vorschau aufnehmen (dauert so lang wie der Film) → File */
export async function recordFilm(day, skimap, onProgress) {
  // Unsichtbar, aber im Dokument – manche Browser nehmen losgelöste Canvas nicht auf
  const canvas = h('canvas', { width: W, height: H, style: { position: 'fixed', left: '-9999px', top: '0' } });
  document.body.append(canvas);
  const film = createFilm(canvas, day, skimap);
  try {
    return await film.record(onProgress);
  } finally {
    film.stop();
    canvas.remove();
  }
}

/** Vollbild-Fenster mit Vorschau (läuft in Schleife) und Knöpfen Speichern / Teilen. */
export function openFilm(day, skimap) {
  const canvas = h('canvas', { class: 'film-canvas', width: W, height: H });
  const film = createFilm(canvas, day, skimap);
  const status = h('p', { class: 'film-status' });
  const saveBtn = h('button', { class: 'btn btn-big', onclick: () => make('save') }, icon('download'), t('film.save'));
  const shareBtn = h('button', { class: 'btn btn-big btn-sun', onclick: () => make('share') }, icon('share'), t('film.share'));
  const root = h('div', { class: 'film', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('film.title') },
    h('div', { class: 'film-frame' }, canvas),
    h('div', { class: 'film-bar' },
      status,
      h('div', { class: 'film-actions' }, saveBtn, shareBtn),
      h('button', { class: 'btn btn-quiet btn-block', onclick: close }, icon('close'), t('close'))));
  document.body.append(root);
  film.loop();

  let busy = false;
  async function make(how) {
    if (busy) return;
    busy = true;
    saveBtn.disabled = true;
    shareBtn.disabled = true;
    status.textContent = t('film.recording');
    const file = await film.record((f) => { status.textContent = `${t('film.recording')} ${Math.round(f * 100)} %`; });
    status.textContent = '';
    busy = false;
    saveBtn.disabled = false;
    shareBtn.disabled = false;
    if (how === 'share' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t('film.title') });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(t('film.saved'), { icon: 'check' });
  }

  function close() {
    film.stop();
    root.remove();
  }
}

/** Das Canvas-Video. play(t) zeichnet Zeitpunkt t (Sekunden). */
function createFilm(canvas, day, skimap) {
  const ctx = canvas.getContext('2d');
  const pts = day.points.filter((p) => p.lat && p.lng);
  const logo = new Image();
  logo.src = 'assets/images/logo.svg';

  // --- Projektion: Spur (oder ganzes Gebiet) in den Kartenbereich einpassen ---------------
  const box = { x: 40, y: 230, w: W - 80, h: H - 230 - 420 };
  const src = pts.length > 1 ? pts.map((p) => [p.lat, p.lng]) : skimap.nodes;
  let [minLat, maxLat, minLng, maxLng] = [Infinity, -Infinity, Infinity, -Infinity];
  src.forEach(([la, ln]) => {
    minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln);
  });
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * kx, 0.004);
  const spanY = Math.max(maxLat - minLat, 0.004);
  const scale = Math.min(box.w / spanX, box.h / spanY) * 0.9;
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  const P = (la, ln) => [box.x + box.w / 2 + (ln - cx) * kx * scale, box.y + box.h / 2 - (la - cy) * scale];
  const track = pts.map((p) => ({ xy: P(p.lat, p.lng), p }));
  const edges = skimap.edges.filter((e) => e.kind !== 'walk').map((e) => ({ e, xy: e.coords.map(([la, ln]) => P(la, ln)) }));

  // Zahlen über die Spur verteilt (für das Mitzählen)
  const totals = { km: day.km || 0, descent: day.descent || 0, top: day.top || 0, runs: day.runs?.length || 0 };
  const date = new Date(day.startedAt || Date.now()).toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  const fade = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

  function draw(time) {
    const drawP = ease(fade(time, 0.8, 5.8));        // Spur
    const endCard = fade(time, 6.4, 7.0);            // Endkarte blendet ein

    // Hintergrund: Schnee mit leichtem Himmel oben
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#dbe9ff');
    g.addColorStop(0.35, '#f4f7fb');
    g.addColorStop(1, '#eceff4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Pistennetz blass
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const { e, xy } of edges) {
      ctx.beginPath();
      xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (e.kind === 'lift') {
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = 'rgba(14,14,16,.35)';
        ctx.lineWidth = 2;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = PISTE[skimap.pistes[e.ref].diff];
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 4;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);

    // Spur bis zum aktuellen Punkt: weißer Rand, dann Tempo-Farben
    const n = Math.max(1, Math.floor(drawP * (track.length - 1)));
    if (track.length > 1) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const [x, y] = track[i].xy;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 16;
      ctx.stroke();
      for (let i = 1; i <= n; i++) {
        const a = track[i - 1];
        const b = track[i];
        ctx.beginPath();
        ctx.moveTo(...a.xy);
        ctx.lineTo(...b.xy);
        const lift = b.p.kind === 'lift';
        ctx.strokeStyle = lift ? '#0e0e10' : speedColor(b.p.speed * 3.6);
        ctx.lineWidth = lift ? 4 : 9;
        ctx.setLineDash(lift ? [4, 8] : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Punkt an der Spitze mit Tempo
      const head = track[n];
      ctx.beginPath();
      ctx.arc(...head.xy, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#2f6dff';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      if (drawP < 1 && head.p.kind !== 'lift') {
        const kmh = `${Math.round(head.p.speed * 3.6)} km/h`;
        ctx.font = '800 26px -apple-system, Helvetica, Arial, sans-serif';
        const tw = ctx.measureText(kmh).width;
        const [hx, hy] = head.xy;
        ctx.fillStyle = '#0e0e10';
        roundRect(hx + 20, hy - 46, tw + 24, 40, 12);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(kmh, hx + 32, hy - 17);
      }
    }

    // Kopf: Logo, „Mein Skitag“, Ort + Datum
    const head = fade(time, 0, 0.6);
    ctx.globalAlpha = head;
    if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 48, 70, 72, 72);
    ctx.fillStyle = '#0e0e10';
    ctx.font = '800 58px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText(t('film.headline'), 140, 120);
    ctx.font = '600 28px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#55555d';
    ctx.fillText(`${config.resort.name} · ${date}`, 142, 162);
    ctx.globalAlpha = 1;

    // Zahlen unten: zählen mit der Spur hoch
    const f = drawP;
    const tiles = [
      [number(totals.km * f, 1), t('day.km')],
      [number(totals.descent * f), t('day.descent')],
      [String(Math.round(totals.top * f)), 'km/h Top'],
      [String(Math.round(totals.runs * f)), t('day.runs')],
    ];
    const y0 = H - 380;
    ctx.fillStyle = '#0e0e10';
    roundRect(40, y0, W - 80, 320, 36);
    ctx.fill();
    tiles.forEach(([v, label], i) => {
      const x = 80 + (i % 2) * ((W - 160) / 2);
      const y = y0 + 110 + Math.floor(i / 2) * 140;
      ctx.fillStyle = '#fff';
      ctx.font = '800 72px "Avenir Next Condensed", "Arial Narrow", Helvetica, sans-serif';
      ctx.fillText(v, x, y);
      ctx.fillStyle = '#9a9aa4';
      ctx.font = '700 26px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillText(label, x, y + 40);
    });

    // Endkarte: abgedunkelt, großer Wert, Ski Tag
    if (endCard > 0) {
      ctx.globalAlpha = endCard;
      ctx.fillStyle = '#0e0e10';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '800 200px "Avenir Next Condensed", "Arial Narrow", Helvetica, sans-serif';
      ctx.fillText(number(totals.km, 1), W / 2, H / 2 - 40);
      ctx.font = '700 40px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#9a9aa4';
      ctx.fillText(t('day.km'), W / 2, H / 2 + 20);
      ctx.fillStyle = '#ff6a13';
      ctx.font = '800 34px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillText(`${number(totals.descent)} m ↓  ·  ${Math.round(totals.top)} km/h  ·  ${totals.runs} ${t('day.runs')}`, W / 2, H / 2 + 100);
      if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, W / 2 - 40, H - 260, 80, 80);
      ctx.fillStyle = '#fff';
      ctx.font = '800 40px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillText('Ski Tag', W / 2, H - 130);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  let frame = 0;
  let start = 0;
  function loop() {
    stop();
    start = performance.now();
    const tick = (now) => {
      draw(((now - start) / 1000) % (LENGTH + 1)); // 1 s Pause am Ende
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame);
  }

  /** Einmal komplett abspielen und aufnehmen → File (Video oder PNG) */
  function record(onProgress) {
    const name = filmName(day);
    const { type, ext, video } = filmFormat();
    if (!video) {
      draw(LENGTH - 0.5);
      return new Promise((resolve) => canvas.toBlob((b) => resolve(new File([b], `${name}.png`, { type: 'image/png' })), 'image/png'));
    }
    stop();
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    return new Promise((resolve) => {
      rec.onstop = () => {
        resolve(new File(chunks, `${name}.${ext}`, { type: type.split(';')[0] }));
        loop();
      };
      rec.start();
      const t0 = performance.now();
      const tick = (now) => {
        const s = (now - t0) / 1000;
        draw(Math.min(s, LENGTH));
        onProgress?.(Math.min(1, s / LENGTH));
        if (s < LENGTH) frame = requestAnimationFrame(tick);
        else rec.stop();
      };
      frame = requestAnimationFrame(tick);
    });
  }

  return { loop, stop, record };
}
