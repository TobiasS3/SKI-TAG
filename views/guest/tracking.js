// „Mein Tag“: Aufzeichnung starten, Live-Werte, Spur auf der Karte.

import { h, replace, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on, emit } from '../../js/core/events.js';
import { load, save } from '../../js/core/storage.js';
import { createTrack, TRACK_COLOR } from '../../js/map/layers.js';
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
import { checkChallenges, challengeCard, compareCard, explorerCard, hutPassCard, familyCard } from './day-challenges.js';

const KEY = () => `day-${isoDay()}`;
const REMIND_MS = 2 * 60 * 1000; // so lange nach dem Einloggen ohne „Tag starten“ → Erinnerung oben

export function mountTracking(el, ctx) {
  let day = { ...emptyDay(), ...load(KEY(), {}) };
  if (!Array.isArray(day.runs)) day = emptyDay(); // gespeichert mit älterer Version
  const track = createTrack(ctx.map);
  day.points.forEach((p) => track.add(p));
  const ridden = createRidden(ctx.map);
  ridden.set(riddenOf(day));

  // --- Live-Ansicht -------------------------------------------------------------
  const now = h('p', { class: 'day-now' });
  const stats = {
    runs: statCell('day.runs', true),
    descent: statCell('day.descent', true),
    km: statCell('day.km'),
    lifts: statCell('day.lifts'),
    time: statCell('day.time'),
  };
  const extras = h('div', { class: 'day-extras' });
  const liftsLeft = h('p', { class: 'muted small day-left' });
  let extrasTick = 0;

  function render() {
    ctx.sheet.badge('day', day.status === 'running');
    if (day.status === 'idle') {
      const step = (ic, title, text) => h('li', {},
        h('span', { class: 'day-step-icon' }, icon(ic)),
        h('span', {}, h('strong', {}, title), h('small', {}, text)));
      replace(el, h('div', { class: 'day-intro' },
        h('section', { class: 'day-hero' },
          h('h2', { class: 'day-hero-title' }, t('day.title')),
          h('p', {}, t('day.lead')),
          h('button', { class: 'btn btn-sun btn-big btn-block day-start', onclick: start }, icon('play'), t('day.start')),
          liftsLeft),
        h('ol', { class: 'day-steps' },
          step('play', t('day.step1'), t('day.step1Text')),
          step('piste', t('day.step2'), t('day.step2Text')),
          h('li', { class: 'day-step-end' },
            h('span', { class: 'day-step-icon' }, icon('stop')),
            h('span', {}, h('strong', {}, t('day.step3')), h('small', {}, t('day.step3Text'))))),
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
        h('h2', { class: 'title day-title' }, t('tab.day')),
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => ctx.dayFullscreen?.(!full) },
          icon(full ? 'close' : 'expand'), t(full ? 'day.fullClose' : 'day.full'))),
      h('div', { class: 'day-live' },
        h('section', { class: 'day-panel' },
          h('span', { class: 'day-rec' }, h('i'), t('day.started')),
          h('dl', { class: 'day-bigs' }, stats.runs.el, stats.descent.el),
          h('dl', { class: 'day-smalls' }, stats.km.el, stats.lifts.el, stats.time.el),
          now),
        extras,
        h('button', { class: 'btn btn-big btn-block day-stop', onclick: stop }, icon('stop'), t('day.stop')),
        liftsLeft,
      ));
    updateLive();
    renderExtras();
  }

  function updateLive() {
    if (day.status !== 'running') return;
    const me = ctx.me;
    stats.km.set(number(day.km, 1), 'km');
    stats.runs.set(day.runs.length);
    stats.descent.set(number(day.descent), 'm');
    stats.lifts.set(day.lifts);
    stats.time.set(duration(day.elapsed || 0));
    // Tempo und Höhe bewusst klein, neben dem, was gerade passiert
    now.replaceChildren(h('strong', {}, activity(me)),
      h('span', { class: 'num' }, [`${Math.round(me.speed * 3.6)} km/h`, me.alt ? `${number(me.alt)} m` : null].filter(Boolean).join(' · ')));
    updateLiftsLeft();
  }

  /** Höhenprofil, Farben, Abfahrten, Abzeichen – nicht bei jedem Signal neu zeichnen */
  function renderExtras() {
    const bar = difficultyBar(day);
    // Zuerst Höhenprofil, Farben und Abzeichen, danach die Challenges, ganz unten die Abfahrten
    replace(extras,
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, t('day.profile')),
        altitudeChart(day.points)),
      bar ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.byColor')), bar) : null,
      day.badges.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.badges')), badgeRow(day, { onlyEarned: true })) : null,
      challengeCard(day),
      compareCard(day),
      familyCard(day, ctx),
      explorerCard(day),
      hutPassCard(day, ctx),
      // Abfahrten ganz unten
      day.runs.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.runList')), runList(day, { limit: 5 })) : null,
    );
  }

  function updateLiftsLeft() {
    // Auf die Minute abrunden: zeigt dasselbe wie die Kopfleiste
    const left = Math.floor((todayAt(config.resort.liftsClose) - clockNow()) / 60000) * 60;
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
    ridden.set(riddenOf(day));
    fresh.forEach((id, i) => setTimeout(() => {
      toast(t('badge.unlocked', { name: t(`badge.${id}`) }), { icon: 'trophy' });
      navigator.vibrate?.([30, 40, 30]);
    }, i * 900));
    const challenged = checkChallenges(day);
    if (day.points.length % 5 === 0) save(KEY(), day);
    updateLive();
    // Zusatz-Bereiche alle paar Signale oder wenn sich etwas Wichtiges tut
    extrasTick += 1;
    if (fresh.length || challenged || extrasTick % 6 === 0) renderExtras();
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
    ridden.clear();
    save(KEY(), day);
    await playDayStart(e.currentTarget); // Drehkreuz-Moment auf dem Knopf, dann Live-Ansicht
    const from = el.querySelector('.day-hero')?.getBoundingClientRect();
    render();
    emit('daystatus', day.status);
    launch(from);
  }

  /**
   * Übergang Start → Live: die blaue Box „fährt los“. Sie wächst aus der Start-Box in ihre
   * neue Form, Lichtstreifen ziehen durch, die Inhalte kommen nacheinander, darunter gleitet
   * alles weich herein. Bei „weniger Bewegung“ einfach sofort.
   */
  function launch(from) {
    const panel = el.querySelector('.day-panel');
    if (!panel || !from || reducedMotion() || !panel.animate) return;
    const to = panel.getBoundingClientRect();
    const ease = 'cubic-bezier(.2, .9, .25, 1)';
    panel.classList.add('is-launch');
    panel.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: '26px' },
      { transform: 'none' },
    ], { duration: 620, easing: ease });
    [...panel.children].forEach((child, i) => child.animate([
      { opacity: 0, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 420, delay: 360 + i * 90, easing: ease, fill: 'backwards' }));
    // Alles darunter kommt hinterher
    const below = [el.querySelector('.day-bar'), ...el.querySelectorAll('.day-extras > *, .day-live > .btn, .day-left')].filter(Boolean);
    below.forEach((node, i) => node.animate([
      { opacity: 0, transform: 'translateY(36px)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 520, delay: 520 + Math.min(i, 6) * 70, easing: ease, fill: 'backwards' }));
    setTimeout(() => panel.classList.remove('is-launch'), 1600);
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
    emit('daystatus', day.status);
  }

  const offs = [on('me', onPosition), on('lang', render), on('dayfull', () => day.status === 'running' && render())];
  const timer = setInterval(updateLiftsLeft, 60000);
  render();

  return {
    hasPoints: () => day.points.length > 1,
    /** Bereich der heutigen Spur (für den Filter „Gefahren“) */
    bounds: () => (day.points.length ? L.latLngBounds(day.points.map((p) => [p.lat, p.lng])) : null),
    status: () => day.status,
    destroy() {
      offs.forEach((off) => off());
      clearInterval(timer);
      clearTimeout(remindTimer);
      reminder?.close();
      save(KEY(), day);
      track.remove();
      ridden.remove();
    },
  };
}

/**
 * Filter „Gefahren“: die Linien sind die eigene orange Spur. Darauf kommen Schilder, damit man sieht,
 * was eine Piste war (farbiger Kreis mit Nummer) und was ein Lift (Liftnummer, Linie gestrichelt in Orange).
 * Eigene Ebene, die nur im Filter „Gefahren“ zu sehen ist (css/components/map.css).
 */
export function createRidden(map) {
  if (!map.getPane('ridden')) map.createPane('ridden').style.zIndex = 436; // über der Spur
  if (!map.getPane('riddenSigns')) map.createPane('riddenSigns').style.zIndex = 446;
  const group = L.layerGroup().addTo(map);
  const shown = { lifts: new Set(), pistes: new Set() };
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const line = (coords, opts) => L.polyline(coords, { pane: 'ridden', interactive: false, lineCap: 'round', lineJoin: 'round', ...opts });
  const sign = (pos, cls, html, z) => L.marker(pos, {
    pane: 'riddenSigns', interactive: false, keyboard: false, zIndexOffset: z,
    icon: L.divIcon({ className: `mk-rsign ${cls}`, html: `<span>${html}</span>`, iconSize: [0, 0] }),
  });
  // Überlappende Schilder ausblenden – nur, wenn die Ebene wirklich zu sehen ist: unsichtbare Schilder
  // haben keine Größe, dann lägen scheinbar alle übereinander und fast alle würden versteckt
  const declutter = () => {
    const els = [...map.getContainer().querySelectorAll('.leaflet-riddenSigns-pane .mk-rsign span')];
    const overlap = (r, q) => r.left < q.right + 3 && r.right > q.left - 3 && r.top < q.bottom + 2 && r.bottom > q.top - 2;
    const placed = [];
    for (const el of els) {
      // Jedes Schild bleibt genau an seiner Stelle auf der Spur (nie verschieben, nie verstecken).
      // Zu eng → nur die Nummer, der Name kommt beim Reinzoomen dazu
      el.style.visibility = '';
      el.style.marginTop = '';
      el.classList.remove('is-compact');
      let r = el.getBoundingClientRect();
      if (!r.width) continue;
      if (placed.some((q) => overlap(r, q))) {
        el.classList.add('is-compact');
        r = el.getBoundingClientRect();
      }
      placed.push(r);
    }
  };
  map.on('zoomend moveend', declutter);
  const offFocus = on('focus', () => requestAnimationFrame(declutter));
  let pisteLines = null; // Piste → alle ihre Stücke (aus den Kanten des Pistennetzes)
  const linesOf = (net, i) => {
    if (!pisteLines) {
      pisteLines = new Map();
      net.edges.forEach((e) => {
        if (e.kind !== 'piste') return;
        if (!pisteLines.has(e.ref)) pisteLines.set(e.ref, []);
        pisteLines.get(e.ref).push(e.coords);
      });
    }
    return pisteLines.get(i);
  };
  // Dieselbe Piste besteht aus vielen Stücken, mal mit, mal ohne Nummer – Schild nur einmal
  const shownRefs = new Set();
  const shownNames = new Map(); // Name → { ref, marker }
  return {
    set(r) {
      const net = skimap();
      if (!r || !net) return;
      let added = false;
      // Lifte zuerst: ihr Schild gewinnt, wenn es eng wird
      r.lifts.forEach((i) => {
        const l = net.lifts[i];
        if (shown.lifts.has(i) || !l?.coords) return;
        shown.lifts.add(i);
        added = true;
        group.addLayer(line(l.coords, { color: '#fff', weight: 10 }));
        group.addLayer(line(l.coords, { color: TRACK_COLOR, weight: 6 }));
        group.addLayer(line(l.coords, { color: '#fff', weight: 2.2, dashArray: '1 8' }));
        const mid = l.coords[Math.floor(l.coords.length / 2)];
        const lead = l.code ? `<i>${esc(l.code)}</i>` : '';
        group.addLayer(sign(mid, 'is-lift is-ridden', `${lead}<b>${esc(l.name)}</b>`, 500));
      });
      // Stücke mit Nummer zuerst – dann steht „19 Kapellenabfahrt“ da, nicht nur „Kapellenabfahrt“
      [...r.pistes].sort((a, b) => !!net.pistes[b]?.ref - !!net.pistes[a]?.ref).forEach((i) => {
        const p = net.pistes[i];
        // Schild immer auf der eigenen orangen Spur: der Spurpunkt, der der Piste am nächsten ist
        // Kein Spurpunkt in der Nähe: lieber kein Schild als eines irgendwo auf der Piste
        const at = onTrack(r.points, linesOf(net, i)) || r.at?.[i]?.pos;
        if (shown.pistes.has(i) || !p || !at || (!p.ref && !p.name)) return;
        shown.pistes.add(i);
        // Eine Nummer = ein Schild (21 Streif, 21 Walde … sind auf dem Plan dieselbe Piste 21),
        // und „Kapellenabfahrt“ ohne Nummer nicht noch einmal neben „19 Kapellenabfahrt“
        const name = (p.name || '').replace(/\s*\(.*\)\s*$/, ''); // ohne „(nur während Rennen präpariert)“
        if (p.ref && shownRefs.has(p.ref)) return;
        const before = name && shownNames.get(name);
        if (before && (before.ref || !p.ref)) return;
        if (before) group.removeLayer(before.marker); // vorher ohne Nummer – jetzt mit Nummer zeigen
        const marker = sign(at, 'is-piste is-ridden', `<i class="diff-${p.diff}">${esc(p.ref || '')}</i>${name ? `<b>${esc(name)}</b>` : ''}`, 400);
        if (p.ref) shownRefs.add(p.ref);
        if (name) shownNames.set(name, { ref: p.ref, marker });
        added = true;
        group.addLayer(marker);
      });
      if (added) requestAnimationFrame(declutter);
    },
    clear() {
      group.clearLayers();
      shown.lifts.clear();
      shown.pistes.clear();
      shownNames.clear();
      shownRefs.clear();
    },
    remove() {
      map.off('zoomend moveend', declutter);
      offFocus();
      group.remove();
    },
  };
}

/** Punkt der eigenen Spur, der am nächsten an der Piste liegt (null, wenn keine Spur da ist) */
function onTrack(points, lines) {
  if (!points?.length || !lines?.length) return null;
  const coords = lines.flat();
  const step = Math.max(1, Math.floor(points.length / 600)); // lange Tage: nicht jeden Punkt prüfen
  let best = null;
  let bestD = Infinity;
  for (let k = 0; k < points.length; k += step) {
    const p = points[k];
    if (p.kind === 'lift') continue;
    for (const c of coords) {
      const d = (p.lat - c[0]) ** 2 + ((p.lng - c[1]) * 0.68) ** 2;
      if (d < bestD) { bestD = d; best = [p.lat, p.lng]; }
    }
  }
  // weiter als ~150 m weg: das ist nicht die Stelle, wo man gefahren ist
  return bestD < (150 / 111000) ** 2 ? best : null;
}

/**
 * Gefahrene Lifte/Pisten des Tages. Tage, die vor dieser Funktion gestartet wurden, haben
 * noch keine Liste – dann aus „Mein Tag“ ableiten (Liftnamen, Pisten je Abfahrt).
 */
export function riddenOf(day) {
  const net = skimap();
  if (!net) return { ...day.ridden, points: day.points };
  const r = { lifts: [...(day.ridden?.lifts || [])], pistes: [...(day.ridden?.pistes || [])], at: day.ridden?.at || {}, points: day.points };
  Object.keys(day.liftsUsed || {}).forEach((name) => {
    const i = net.lifts.findIndex((l) => l.name === name);
    if (i >= 0 && !r.lifts.includes(i)) r.lifts.push(i);
  });
  const label = (p) => (p.ref ? `${p.ref} ${p.name || ''}`.trim() : p.name);
  const names = new Set((day.runs || []).flatMap((run) => run.pistes || []));
  if (names.size) {
    net.pistes.forEach((p, i) => {
      if (names.has(label(p)) && !r.pistes.includes(i)) r.pistes.push(i);
    });
  }
  return r;
}

/** Ein Wert im Tagespanel. big = einer der zwei großen Werte */
function statCell(key, big = false) {
  const value = h('span', { class: 'num' });
  const unit = h('small');
  const label = h('dt', {});
  const el = h('div', { class: big ? 'day-big' : 'day-small' }, h('dd', {}, value, unit), label);
  return {
    el,
    set(v, u = '') {
      label.textContent = t(key);
      value.textContent = v;
      unit.textContent = u;
    },
  };
}
