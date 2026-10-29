// „Mein Tag“: Aufzeichnung starten, Live-Werte, Spur auf der Karte.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { load, save } from '../../js/core/storage.js';
import { createTrack } from '../../js/map/layers.js';
import { duration, number } from '../../js/utils/format.js';
import { isoDay, todayAt, now as clockNow } from '../../js/utils/time.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { skimap } from '../../js/services/slopes.js';
import { pisteName } from './slopes-panel.js';
import { renderSummary } from './day-summary.js';
import { emptyDay, addPoint, altitudeChart, difficultyBar, runList, badgeRow } from './day-stats.js';
import { playDayStart } from './day-start.js';
import { topNote } from './top-note.js';

const MAX_KMH = 100; // Tacho-Ende
const KEY = () => `day-${isoDay()}`;
const REMIND_MS = 2 * 60 * 1000; // so lange nach dem Einloggen ohne „Tag starten“ → Erinnerung oben

export function mountTracking(el, ctx) {
  let day = { ...emptyDay(), ...load(KEY(), {}) };
  if (!Array.isArray(day.runs)) day = emptyDay(); // gespeichert mit älterer Version
  const track = createTrack(ctx.map);
  day.points.forEach((p) => track.add(p));

  // --- Live-Ansicht -------------------------------------------------------------
  const gauge = speedGauge();
  const now = h('p', { class: 'day-now' });
  const altEl = h('span', { class: 'day-alt num' });
  const stats = {
    km: statCell('day.km'),
    runs: statCell('day.runs'),
    descent: statCell('day.descent'),
    top: statCell('day.top'),
    lifts: statCell('day.lifts'),
    time: statCell('day.time'),
  };
  const extras = h('div', { class: 'day-extras' });
  const liftsLeft = h('p', { class: 'muted small day-left' });
  let extrasTick = 0;

  function render() {
    ctx.sheet.badge('day', day.status === 'running');
    if (day.status === 'idle') {
      replace(el, h('div', { class: 'day-intro' },
        h('div', { class: 'day-intro-art', 'aria-hidden': 'true', html: TRACK_ART }),
        h('h2', { class: 'title' }, t('day.title')),
        h('p', { class: 'muted' }, t('day.lead')),
        h('ul', { class: 'day-features' },
          ['day.f.speed', 'day.f.vert', 'day.f.runs', 'day.f.file'].map((k) => h('li', {}, icon('check'), t(k)))),
        h('button', { class: 'btn btn-big btn-block day-start', onclick: start }, icon('play'), t('day.start')),
        liftsLeft,
      ));
      updateLiftsLeft();
      return;
    }
    if (day.status === 'done') {
      // Tag vorbei: Übersicht als eigene Vollbild-Seite (views/guest/day-end.js)
      ctx.dayFullscreen?.(false);
      replace(el, renderSummary(day, {}));
      ctx.endDay?.(day, { animate: justEnded });
      justEnded = false;
      return;
    }
    const full = ctx.page.classList.contains('day-full');
    replace(el,
      h('div', { class: 'day-bar' },
        h('h2', { class: 'title' }, t('tab.day')),
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => ctx.dayFullscreen?.(!full) },
          icon(full ? 'close' : 'expand'), t(full ? 'day.fullClose' : 'day.full'))),
      h('div', { class: 'day-live' },
        h('div', { class: 'instrument day-instrument' },
          h('div', { class: 'instrument-head' },
            h('span', { class: 'day-rec' }, h('i'), t('day.started')),
            h('span', { class: 'day-chip' }, ctx.session.chip)),
          gauge.el,
          h('div', { class: 'day-under-gauge' }, now, altEl),
          h('dl', { class: 'day-stats' }, Object.values(stats).map((s) => s.el))),
        extras,
        h('button', { class: 'btn btn-quiet btn-block', onclick: stop }, icon('stop'), t('day.stop')),
        liftsLeft,
      ));
    updateLive();
    renderExtras();
  }

  function updateLive() {
    if (day.status !== 'running') return;
    const me = ctx.me;
    gauge.set(me.speed * 3.6);
    stats.km.set(number(day.km, 1), 'km');
    stats.runs.set(day.runs.length);
    stats.descent.set(number(day.descent), 'm');
    stats.top.set(Math.round(day.top), 'km/h');
    stats.lifts.set(day.lifts);
    stats.time.set(duration(day.elapsed || 0));
    now.replaceChildren(h('span', {}, t('day.now')), ' ', h('strong', {}, activity(me)));
    altEl.replaceChildren(icon('mountain'), me.alt ? `${number(me.alt)} m` : '–');
    updateLiftsLeft();
  }

  /** Höhenprofil, Farben, Abfahrten, Abzeichen – nicht bei jedem Signal neu zeichnen */
  function renderExtras() {
    const bar = difficultyBar(day);
    replace(extras,
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, t('day.profile')),
        altitudeChart(day.points)),
      bar ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.byColor')), bar) : null,
      day.runs.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.runList')), runList(day, { limit: 5 })) : null,
      h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.badges')), badgeRow(day)),
    );
  }

  function updateLiftsLeft() {
    const left = (todayAt(config.resort.liftsClose) - clockNow()) / 1000;
    liftsLeft.textContent = left > 0 ? t('day.liftsLeft', { time: duration(left) }) : t('top.liftsClosed');
  }

  function activity(me) {
    const map = skimap();
    if (me.kind === 'lift' && me.ref != null) {
      return me.speed > 0.5 ? t('day.onLift', { name: map.lifts[me.ref].name }) : t('day.waiting');
    }
    if (me.kind === 'piste' && me.ref != null && me.speed > 0.5) {
      return t('day.onPiste', { name: pisteName(map.pistes[me.ref]) });
    }
    return t('day.standing');
  }

  // --- Neue Position vom Chip -------------------------------------------------
  function onPosition(p) {
    if (day.status !== 'running') return;
    const fresh = addPoint(day, p, skimap());
    track.add(day.points.at(-1));
    fresh.forEach((id, i) => setTimeout(() => {
      toast(t('badge.unlocked', { name: t(`badge.${id}`) }), { icon: 'trophy' });
      navigator.vibrate?.([30, 40, 30]);
    }, i * 900));
    if (day.points.length % 5 === 0) save(KEY(), day);
    updateLive();
    // Zusatz-Bereiche alle paar Signale oder wenn sich etwas Wichtiges tut
    extrasTick += 1;
    if (fresh.length || extrasTick % 6 === 0) renderExtras();
  }

  // --- Erinnerung: 2 Minuten nach dem Einloggen noch nicht gestartet? ----------------------
  const remindKey = `dayremind-${ctx.session.startedAt}`;
  let reminder = null;
  const remindTimer = setTimeout(() => {
    if (day.status !== 'idle' || load(remindKey, false)) return;
    save(remindKey, true); // pro Einloggen nur einmal
    reminder = topNote(ctx.page, {
      lead: icon('play'),
      title: t('dayremind.title'),
      text: t('dayremind.text'),
      action: t('day.start'),
      onAction: () => {
        // „Mein Tag“ öffnen und den echten Knopf drücken → Drehkreuz-Moment läuft wie gewohnt
        ctx.sheet.open('day');
        requestAnimationFrame(() => {
          const btn = el.querySelector('.day-start');
          btn?.scrollIntoView({ block: 'center' });
          btn?.click();
        });
      },
    });
  }, Math.max(1500, ctx.session.startedAt + REMIND_MS - Date.now()));

  async function start(e) {
    reminder?.close();
    day = { ...emptyDay(), status: 'running', startedAt: ctx.me.time || Date.now() };
    track.clear();
    save(KEY(), day);
    await playDayStart(e.currentTarget); // Drehkreuz-Moment auf dem Knopf, dann Live-Ansicht
    render();
  }

  let justEnded = false;

  async function stop() {
    const ok = await confirmModal({
      title: t('day.stop.title'), text: t('day.stop.text'), ok: t('day.stop'), cancel: t('cancel'),
    });
    if (!ok) return;
    day.status = 'done';
    day.endedAt = ctx.me.time || Date.now();
    const run = day.runs.at(-1);
    if (run && !run.endTime) run.endTime = day.endedAt;
    save(KEY(), day);
    justEnded = true;
    render();
  }

  const offs = [on('me', onPosition), on('lang', render), on('dayfull', () => day.status === 'running' && render())];
  const timer = setInterval(updateLiftsLeft, 60000);
  render();

  return {
    hasPoints: () => day.points.length > 1,
    destroy() {
      offs.forEach((off) => off());
      clearInterval(timer);
      clearTimeout(remindTimer);
      reminder?.close();
      save(KEY(), day);
      track.remove();
    },
  };
}

function statCell(key) {
  const value = h('span', { class: 'num' });
  const unit = h('small');
  const label = h('dt', {});
  const el = h('div', { class: 'stat' }, label, h('dd', {}, value, unit));
  return {
    el,
    set(v, u = '') {
      label.textContent = t(key);
      value.textContent = v;
      unit.textContent = u;
    },
  };
}

/** Tacho: Halbkreis mit Skala, füllt sich mit dem Tempo. */
function speedGauge() {
  const R = 80;
  const LEN = Math.PI * R;
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = Math.PI - (i / 10) * Math.PI;
    const r1 = 64;
    const r2 = i % 5 ? 59 : 54;
    return `<line x1="${(100 + Math.cos(a) * r1).toFixed(1)}" y1="${(100 - Math.sin(a) * r1).toFixed(1)}"
      x2="${(100 + Math.cos(a) * r2).toFixed(1)}" y2="${(100 - Math.sin(a) * r2).toFixed(1)}" class="gauge-tick"/>`;
  }).join('');
  const el = h('div', { class: 'gauge', html: `
    <svg viewBox="0 0 200 116" aria-hidden="true">
      <defs>
        <linearGradient id="gauge-grad" x1="0" x2="1">
          <stop offset="0" stop-color="#2f6dff"/>
          <stop offset=".5" stop-color="#7a5cff"/>
          <stop offset=".78" stop-color="#ff6a13"/>
          <stop offset="1" stop-color="#ff2d2d"/>
        </linearGradient>
      </defs>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--night-3)" stroke-width="14" stroke-linecap="round"/>
      ${ticks}
      <path class="gauge-bar" d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#gauge-grad)" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${LEN}" stroke-dashoffset="${LEN}"/>
    </svg>` });
  const value = h('span', { class: 'gauge-value num' }, '0');
  const label = h('span', { class: 'gauge-unit' }, 'km/h');
  el.append(h('div', { class: 'gauge-read' }, value, label));
  const bar = el.querySelector('.gauge-bar');
  return {
    el,
    set(kmh) {
      const f = Math.min(kmh, MAX_KMH) / MAX_KMH;
      bar.style.strokeDashoffset = String(LEN * (1 - f));
      value.textContent = Math.round(kmh);
    },
  };
}

// Kleine Zeichnung: Spur in Tempo-Farben den Hang hinunter
const TRACK_ART = `
<svg viewBox="0 0 320 120">
  <defs>
    <linearGradient id="art-grad" x1="1" x2="0">
      <stop offset="0" stop-color="#2f6dff"/><stop offset=".55" stop-color="#ff6a13"/><stop offset="1" stop-color="#ff2d2d"/>
    </linearGradient>
  </defs>
  <path d="M0 120 L0 70 C60 40 120 20 200 12 C250 8 290 10 320 14 V120Z" fill="#e8e8ec"/>
  <path d="M286 18 C240 30 260 48 214 56 C168 64 196 80 150 88 C104 96 120 108 60 112"
        fill="none" stroke-width="6" stroke-linecap="round" stroke="url(#art-grad)" class="art-line"/>
  <circle cx="286" cy="18" r="8" fill="#2f6dff" stroke="#fff" stroke-width="3"/>
</svg>`;
