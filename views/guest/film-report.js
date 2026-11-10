// Tagesfilm, zweiter Teil: „Ihr Tag im Detail“ als langes Bild, das am Ende des Videos
// automatisch durchscrollt – Höhenprofil, Pisten nach Farbe, Hüttenpass, Abfahrten, Abzeichen,
// Lieblingslifte. Gezeichnet auf ein Canvas im App-Stil: weiße Karten auf Navy.
//
//   const report = buildReport(day, 720);   // → <canvas> (Höhe je nach Inhalt)

import { t, getLang } from '../../js/core/i18n.js';
import { number, duration } from '../../js/utils/format.js';
import { BADGES } from './day-stats.js';

const NAVY = '#0b1226';
const NAVY_2 = '#182650';
const INK = '#0b1226';
const INK_2 = '#5f6c8c';
const ORANGE = '#ff5b22';
const DIFF = { easy: '#1f66d1', intermediate: '#e0242f', advanced: '#0e0e10', freeride: '#f08a24' };
const FONT = '-apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';

export function buildReport(day, W) {
  const PAD = 40;
  const CW = W - PAD * 2; // Kartenbreite
  // Erst messen (Höhe), dann zeichnen: jede Karte ist eine Funktion (ctx, y) → Höhe
  const cards = [
    profileCard(day),
    diffCard(day),
    hutCard(day),
    runsCard(day),
    badgeCard(day),
    liftsCard(day),
  ].filter(Boolean);

  const HEAD = 220;
  const GAP = 28;
  const FOOT = 260;
  const height = HEAD + cards.reduce((s, c) => s + c.h + GAP, 0) + FOOT;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Hintergrund: Navy-Verlauf über die ganze Länge
  const g = ctx.createLinearGradient(0, 0, W, height);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, NAVY_2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, height);

  // Kopf
  const date = new Date(day.startedAt || Date.now())
    .toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  ctx.fillStyle = '#fff';
  ctx.font = `800 56px ${FONT}`;
  ctx.fillText(t('film.detail'), PAD, 120);
  ctx.fillStyle = '#b9c6e4';
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(date, PAD, 165);

  let y = HEAD;
  for (const c of cards) {
    card(ctx, PAD, y, CW, c.h);
    c.draw(ctx, PAD + 32, y + 32, CW - 64);
    y += c.h + GAP;
  }

  // Fuß: Ski Tag
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText('Ski Tag', W / 2, y + 120);
  ctx.fillStyle = '#b9c6e4';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(t('film.thanks'), W / 2, y + 165);
  ctx.textAlign = 'left';

  return canvas;
}

// --- Karten ----------------------------------------------------------------------------------

function profileCard(day) {
  const pts = (day.points || []).filter((p) => p.alt);
  if (pts.length < 3) return null;
  const step = Math.max(1, Math.floor(pts.length / 200));
  const sample = pts.filter((_, i) => i % step === 0);
  const min = Math.min(...sample.map((p) => p.alt));
  const max = Math.max(...sample.map((p) => p.alt));
  return {
    h: 380,
    draw(ctx, x, y, w) {
      title(ctx, t('day.profile'), x, y);
      const top = y + 70;
      const ch = 210;
      const span = Math.max(50, max - min);
      const xy = sample.map((p, i) => [x + (i / (sample.length - 1)) * w, top + 8 + (1 - (p.alt - min) / span) * (ch - 16)]);
      const fill = ctx.createLinearGradient(0, top, 0, top + ch);
      fill.addColorStop(0, 'rgba(47, 109, 255, 0.45)');
      fill.addColorStop(1, 'rgba(47, 109, 255, 0)');
      ctx.beginPath();
      ctx.moveTo(x, top + ch);
      xy.forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.lineTo(x + w, top + ch);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      xy.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.font = `700 26px ${FONT}`;
      ctx.fillStyle = INK_2;
      ctx.fillText(`↑ ${number(max)} m`, x, top + ch + 44);
      ctx.textAlign = 'right';
      ctx.fillText(`↓ ${number(min)} m`, x + w, top + ch + 44);
      ctx.textAlign = 'left';
    },
  };
}

function diffCard(day) {
  const parts = ['easy', 'intermediate', 'advanced', 'freeride']
    .map((d) => [d, day.kmByDiff?.[d] || 0]).filter(([, km]) => km > 0.01);
  const total = parts.reduce((s, [, km]) => s + km, 0);
  if (!total) return null;
  return {
    h: 170 + parts.length * 56,
    draw(ctx, x, y, w) {
      title(ctx, t('film.byColor'), x, y);
      // Gestapelter Balken
      let bx = x;
      const by = y + 72;
      ctx.save();
      roundRect(ctx, x, by, w, 36, 18);
      ctx.clip();
      parts.forEach(([d, km]) => {
        const bw = (km / total) * w;
        ctx.fillStyle = DIFF[d];
        ctx.fillRect(bx, by, bw + 1, 36);
        bx += bw;
      });
      ctx.restore();
      // Legende
      parts.forEach(([d, km], i) => {
        const ly = by + 96 + i * 56;
        ctx.beginPath();
        ctx.arc(x + 12, ly - 9, 12, 0, Math.PI * 2);
        ctx.fillStyle = DIFF[d];
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `600 30px ${FONT}`;
        ctx.fillText(t(`diff.${d}`), x + 40, ly);
        ctx.textAlign = 'right';
        ctx.font = `800 30px ${FONT}`;
        ctx.fillText(`${number(km, 1)} km`, x + w, ly);
        ctx.textAlign = 'left';
      });
    },
  };
}

function hutCard(day) {
  const huts = day.huts || [];
  const rows = Math.max(1, Math.min(huts.length, 6));
  return {
    h: 150 + rows * 64,
    draw(ctx, x, y, w) {
      title(ctx, t('pass.title'), x, y, `${huts.length}`);
      if (!huts.length) {
        ctx.fillStyle = INK_2;
        ctx.font = `500 28px ${FONT}`;
        ctx.fillText(t('film.noHut'), x, y + 112);
        return;
      }
      huts.slice(0, 6).forEach((name, i) => {
        const ry = y + 80 + i * 64;
        hutStamp(ctx, x, ry, 46);
        ctx.fillStyle = INK;
        ctx.font = `700 30px ${FONT}`;
        ctx.fillText(fit(ctx, name, w - 70), x + 64, ry + 33);
      });
    },
  };
}

function runsCard(day) {
  const runs = (day.runs || []).map((r, i) => ({ ...r, n: i + 1 }));
  if (!runs.length) return null;
  const list = runs.slice(-8).reverse();
  return {
    h: 130 + list.length * 84 + (runs.length > list.length ? 40 : 0),
    draw(ctx, x, y, w) {
      title(ctx, t('day.runs'), x, y, `${runs.length}`);
      list.forEach((r, i) => {
        const ry = y + 84 + i * 84;
        // Nummer im Kreis
        ctx.beginPath();
        ctx.arc(x + 24, ry + 24, 24, 0, Math.PI * 2);
        ctx.fillStyle = NAVY_2;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 24px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(r.n), x + 24, ry + 33);
        ctx.textAlign = 'left';
        // Name + km/Zeit
        const name = (r.pistes || []).slice(0, 2).join(', ') || t('day.run');
        ctx.fillStyle = INK;
        ctx.font = `700 28px ${FONT}`;
        ctx.fillText(fit(ctx, name, w - 230), x + 66, ry + 18);
        ctx.fillStyle = INK_2;
        ctx.font = `500 24px ${FONT}`;
        const time = r.endTime ? ` · ${duration((r.endTime - r.startTime) / 1000)}` : '';
        ctx.fillText(`${number((r.dist || 0) / 1000, 1)} km${time}`, x + 66, ry + 52);
        // Höhenmeter rechts
        ctx.textAlign = 'right';
        ctx.fillStyle = INK;
        ctx.font = `800 32px ${FONT}`;
        ctx.fillText(`${number(Math.round(r.drop || 0))}`, x + w - 46, ry + 36);
        ctx.fillStyle = INK_2;
        ctx.font = `600 22px ${FONT}`;
        ctx.fillText('hm', x + w, ry + 36);
        ctx.textAlign = 'left';
      });
      if (runs.length > list.length) {
        ctx.fillStyle = INK_2;
        ctx.font = `500 24px ${FONT}`;
        ctx.fillText(t('film.moreRuns', { n: runs.length - list.length }), x, y + 84 + list.length * 84 + 20);
      }
    },
  };
}

function badgeCard(day) {
  const earned = BADGES.filter((b) => (day.badges || []).includes(b.id));
  if (!earned.length) return null;
  return {
    h: 130 + earned.length * 64,
    draw(ctx, x, y, w) {
      title(ctx, t('film.badges'), x, y, `${earned.length}`);
      earned.forEach((b, i) => {
        const ry = y + 80 + i * 64;
        ctx.beginPath();
        ctx.arc(x + 23, ry + 23, 23, 0, Math.PI * 2);
        ctx.fillStyle = ORANGE;
        ctx.fill();
        trophy(ctx, x + 23, ry + 23);
        ctx.fillStyle = INK;
        ctx.font = `700 30px ${FONT}`;
        ctx.fillText(fit(ctx, t(`badge.${b.id}`), w - 70), x + 64, ry + 33);
      });
    },
  };
}

function liftsCard(day) {
  const list = Object.entries(day.liftsUsed || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!list.length) return null;
  return {
    h: 130 + list.length * 58,
    draw(ctx, x, y, w) {
      title(ctx, t('day.favLifts'), x, y);
      list.forEach(([name, n], i) => {
        const ry = y + 104 + i * 58;
        ctx.fillStyle = INK;
        ctx.font = `600 30px ${FONT}`;
        ctx.fillText(fit(ctx, name, w - 90), x, ry);
        ctx.textAlign = 'right';
        ctx.font = `800 30px ${FONT}`;
        ctx.fillText(`${n}×`, x + w, ry);
        ctx.textAlign = 'left';
      });
    },
  };
}

// --- Helfer ----------------------------------------------------------------------------------

function card(ctx, x, y, w, hgt) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, w, hgt, 32);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

function title(ctx, text, x, y, count) {
  ctx.fillStyle = INK;
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(text, x, y + 34);
  if (count != null) {
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = ORANGE;
    ctx.fillText(` · ${count}`, x + tw, y + 34);
  }
}

/** Text kürzen, bis er passt (…) */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Hütten-Stempel: braunes Holzschild mit Häuschen (wie auf der Karte) */
function hutStamp(ctx, x, y, s) {
  roundRect(ctx, x, y, s, s, 12);
  ctx.fillStyle = '#8a4b22';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.2, y + s * 0.52);
  ctx.lineTo(x + s * 0.5, y + s * 0.24);
  ctx.lineTo(x + s * 0.8, y + s * 0.52);
  ctx.lineTo(x + s * 0.8, y + s * 0.8);
  ctx.lineTo(x + s * 0.2, y + s * 0.8);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#f5b324';
  ctx.fillRect(x + s * 0.43, y + s * 0.56, s * 0.14, s * 0.14);
}

/** Kleiner Pokal in Weiß */
function trophy(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 10);
  ctx.lineTo(cx + 8, cy - 10);
  ctx.lineTo(cx + 7, cy - 1);
  ctx.quadraticCurveTo(cx, cy + 6, cx - 7, cy - 1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy + 4);
  ctx.lineTo(cx, cy + 9);
  ctx.moveTo(cx - 6, cy + 10);
  ctx.lineTo(cx + 6, cy + 10);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, hgt, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, r);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
  ctx.arcTo(x, y + hgt, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
