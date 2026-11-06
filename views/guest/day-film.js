// Tagesfilm: 9 Sekunden Hochformat-Video (für Storys) aus deinem Tag.
//   Titel → ein Punkt fährt deinen Tag ab und zieht die Spur hinter sich her, Zahlen zählen mit → Endkarte.
//   Kein Pistennetz im Hintergrund: zu sehen ist nur, was wirklich gefahren wurde.
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
import { TRACK_COLOR } from '../../js/map/layers.js';

const W = 720;
const H = 1280;
const LENGTH = 9; // Sekunden

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

  // Zahlen über die Spur verteilt (für das Mitzählen)
  const totals = { km: day.km || 0, descent: day.descent || 0, lifts: day.lifts || 0, runs: day.runs?.length || 0 };
  const date = new Date(day.startedAt || Date.now()).toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
  const fade = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

  function draw(time) {
    const drawP = ease(fade(time, 0.8, 5.8));        // Spur
    const endCard = fade(time, 6.4, 7.0);            // Endkarte blendet ein

    // Hintergrund: Nachtblau wie der Start der App – keine Pisten vorgezeichnet,
    // auf dem Bild steht nur, was der Punkt wirklich gefahren ist
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b1226');
    g.addColorStop(1, '#1b2c5e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // weiches Licht hinter der Spur
    const glow = ctx.createRadialGradient(W / 2, box.y + box.h / 2, 40, W / 2, box.y + box.h / 2, box.w * 0.75);
    glow.addColorStop(0, 'rgba(120, 150, 230, 0.18)');
    glow.addColorStop(1, 'rgba(120, 150, 230, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Spur bis genau zum Punkt: Der Punkt zieht die Linie hinter sich her (weich zwischen zwei Messpunkten)
    const pos = drawP * (track.length - 1);
    const n = Math.floor(pos);
    if (track.length > 1) {
      const a = track[n].xy;
      const b = track[Math.min(n + 1, track.length - 1)].xy;
      const f = pos - n;
      const tip = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const path = [...track.slice(0, n + 1).map((x) => x.xy), tip];
      // Weicher oranger Schein unter der Linie – auf Nachtblau hebt sich die Spur so am besten ab
      ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(255, 106, 43, 0.22)';
      ctx.lineWidth = 20;
      ctx.stroke();
      for (let i = 1; i < path.length; i++) {
        const lift = track[Math.min(i, track.length - 1)].p.kind === 'lift';
        ctx.beginPath();
        ctx.moveTo(...path[i - 1]);
        ctx.lineTo(...path[i]);
        ctx.strokeStyle = lift ? 'rgba(255, 255, 255, 0.75)' : TRACK_COLOR;
        ctx.lineWidth = lift ? 4 : 9;
        ctx.setLineDash(lift ? [4, 10] : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Start: grüner Punkt
      ctx.beginPath();
      ctx.arc(...track[0].xy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#16b46b';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      // Der Punkt, der zeichnet
      ctx.beginPath();
      ctx.arc(...tip, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = TRACK_COLOR;
      ctx.stroke();
    }

    // Kopf: Logo, „Mein Skitag“, Ort + Datum
    const head = fade(time, 0, 0.6);
    ctx.globalAlpha = head;
    if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 48, 70, 72, 72);
    ctx.fillStyle = '#fff';
    ctx.font = '800 58px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillText(t('film.headline'), 140, 120);
    ctx.font = '600 28px -apple-system, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#b9c6e4';
    ctx.fillText(`${config.resort.name} · ${date}`, 142, 162);
    ctx.globalAlpha = 1;

    // Zahlen unten: zählen mit der Spur hoch
    const f = drawP;
    const tiles = [
      [number(totals.km * f, 1), t('day.km')],
      [number(totals.descent * f), t('day.descent')],
      [String(Math.round(totals.lifts * f)), t('day.lifts')],
      [String(Math.round(totals.runs * f)), t('day.runs')],
    ];
    const y0 = H - 380;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    roundRect(40, y0, W - 80, 320, 36);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    tiles.forEach(([v, label], i) => {
      const x = 80 + (i % 2) * ((W - 160) / 2);
      const y = y0 + 110 + Math.floor(i / 2) * 140;
      ctx.fillStyle = '#fff';
      ctx.font = '800 72px "Avenir Next Condensed", "Arial Narrow", Helvetica, sans-serif';
      ctx.fillText(v, x, y);
      ctx.fillStyle = '#b9c6e4';
      ctx.font = '700 26px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillText(label, x, y + 40);
    });

    // Endkarte: abgedunkelt, großer Wert, Ski Tag
    if (endCard > 0) {
      ctx.globalAlpha = endCard;
      const eg = ctx.createLinearGradient(0, 0, W, H);
      eg.addColorStop(0, '#0b1226');
      eg.addColorStop(1, '#1b2c5e');
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '800 200px "Avenir Next Condensed", "Arial Narrow", Helvetica, sans-serif';
      ctx.fillText(number(totals.km, 1), W / 2, H / 2 - 40);
      ctx.font = '700 40px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#b9c6e4';
      ctx.fillText(t('day.km'), W / 2, H / 2 + 20);
      ctx.fillStyle = '#ff5b22';
      ctx.font = '800 34px -apple-system, Helvetica, Arial, sans-serif';
      ctx.fillText(`${number(totals.descent)} m ↓  ·  ${totals.lifts} ${t('day.lifts')}  ·  ${totals.runs} ${t('day.runs')}`, W / 2, H / 2 + 100);
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
