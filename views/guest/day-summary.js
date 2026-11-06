// Tagesrückblick: Zahlen, Höhenprofil, Abfahrten, Abzeichen – und „Übersicht downloaden“:
// der Tagesfilm als Video (MP4), das auf iPhone, Samsung und PC einfach aufgeht.

import { h } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { duration, number } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { saveFile, isIOS } from '../../js/services/export.js';
import { skimap } from '../../js/services/slopes.js';
import { altitudeChart, difficultyBar, runList, badgeRow, BADGE_COUNT } from './day-stats.js';
import { challengeCard, compareCard } from './day-challenges.js';
import { recordFilm, filmFormat, filmName } from './day-film.js';

export function renderSummary(day, { onNew, onFilm, name, afterHero = null } = {}) {
  const bar = difficultyBar(day);
  return h('div', { class: 'recap' },
    // Kopf: persönliche Zeile, drei große Zahlen, darunter der Rest
    h('section', { class: 'instrument recap-hero' },
      h('h2', { class: 'recap-title' }, headline(day, name)),
      h('div', { class: 'recap-trio' },
        big('day.descent', number(day.descent), 'm'),
        big('day.km', number(day.km, 1), 'km'),
        big('day.runs', day.runs.length, '')),
      h('dl', { class: 'recap-row' },
        tile('day.lifts', day.lifts),
        tile('day.maxAlt', number(day.maxAlt), 'm'),
        tile('pass.title', (day.huts || []).length),
        tile('day.time', duration(day.elapsed || 0)))),
    afterHero,
    filmCard(day, onFilm),
    // Wie bei „Mein Tag“: zuerst die Daten, dann Abzeichen und Challenges, ganz unten die Abfahrten
    h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.profile')), altitudeChart(day.points)),
    bar ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.byColor')), bar) : null,
    badgeCard(day),
    challengeCard(day),
    compareCard(day),
    favouriteLifts(day),
    // Abfahrten ganz unten
    day.runs.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.runList')), runList(day)) : null,
    onNew ? h('button', { class: 'btn btn-quiet btn-block', onclick: onNew }, icon('play'), t('day.again')) : null,
  );
}

/** Abzeichen: die geschafften groß, die offenen nur als eine Zeile */
function badgeCard(day) {
  const left = BADGE_COUNT - day.badges.length;
  return h('section', { class: 'card recap-badges' },
    h('div', { class: 'card-head' },
      h('h3', { class: 'card-title' }, t('day.badges')),
      h('span', { class: 'recap-badges-count num' }, `${day.badges.length}/${BADGE_COUNT}`)),
    badgeRow(day, { onlyEarned: true }),
    left > 0 ? h('p', { class: 'small muted recap-badges-left' }, t(day.badges.length ? 'recap.badgesLeft' : 'recap.badgesNone', { n: left })) : null);
}

/** Ein Satz, der zum Tag passt – mit Vornamen, wenn wir ihn kennen */
function headline(day, name) {
  const key = day.descent >= 3000 ? 'big' : day.runs.length ? 'good' : 'short';
  return name ? t(`recap.head.${key}`, { name }) : t(`recap.head.${key}.anon`);
}

function big(key, value, unit) {
  return h('div', { class: 'recap-big-stat' },
    h('span', { class: 'num' }, String(value), unit ? h('small', {}, unit) : null),
    h('span', { class: 'recap-big-label' }, t(key)));
}

/** Tagesfilm: Vorschau Ihrer Spur, antippen spielt ihn ab; darunter Download und Teilen */
function filmCard(day, onFilm) {
  const preview = h(onFilm ? 'button' : 'div', {
    class: 'recap-film-preview',
    onclick: onFilm || null,
    'aria-label': onFilm ? t('film.cta') : null,
    html: traceSVG(day.points, { loop: true }),
  });
  if (onFilm) preview.append(h('span', { class: 'recap-film-play' }, icon('play')));
  return h('section', { class: 'recap-film' },
    h('div', { class: 'recap-film-head' },
      preview,
      h('div', { class: 'recap-film-text' },
        h('strong', {}, t('film.cta')),
        h('small', {}, t('film.ctaHint')))),
    downloadBlock(day));
}

/** Ihre Spur als SVG (flach projiziert): ein Punkt fährt sie ab und zieht die Linie hinter sich her. */
export function traceSVG(points, { loop = false } = {}) {
  const W = 300;
  const H = 220;
  let d;
  if (points.length > 1) {
    const lat0 = (points[0].lat * Math.PI) / 180;
    const xs = points.map((p) => p.lng * Math.cos(lat0));
    const ys = points.map((p) => -p.lat);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - 30) / (maxX - minX || 1), (H - 30) / (maxY - minY || 1));
    const ox = (W - (maxX - minX) * k) / 2;
    const oy = (H - (maxY - minY) * k) / 2;
    // höchstens ~400 Punkte, sonst wird der Pfad unnötig groß
    const step = Math.max(1, Math.floor(points.length / 400));
    d = xs.filter((_, i) => i % step === 0 || i === xs.length - 1)
      .map((x, i) => {
        const j = Math.min(points.length - 1, i * step);
        return `${i ? 'L' : 'M'}${(ox + (xs[j] - minX) * k).toFixed(1)} ${(oy + (ys[j] - minY) * k).toFixed(1)}`;
      }).join(' ');
  } else {
    // Noch keine Spur: eine Abfahrt als Platzhalter
    d = 'M40 30 C 200 50, 80 110, 220 130 S 120 200, 260 200';
  }
  // Linie und Punkt laufen mit derselben Uhr (SMIL): Die Linie entsteht genau hinter dem Punkt,
  // vor ihm ist noch nichts gezeichnet. Schleife: 85 % fahren, kurz stehen, von vorn.
  const timing = loop
    ? 'dur="4s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.85;1"'
    : 'dur="2s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 .05 .4 1"';
  const draw = `<animate attributeName="stroke-dashoffset" ${timing} values="${loop ? '1;0;0' : '1;0'}"/>`;
  const motion = `<animateMotion ${timing} keyPoints="${loop ? '0;1;1' : '0;1'}" path="${d}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}">
    <path d="${d}" class="trace-shadow" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1">${draw}</path>
    <path d="${d}" class="trace-line" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" stroke="#ff6a2b">${draw}</path>
    <circle r="${loop ? 9 : 6}" class="trace-dot" cx="0" cy="0">${motion}</circle>
  </svg>`;
}

/**
 * „Übersicht downloaden“ + darunter klein Format und Dateiname, daneben „Teilen“.
 * Das Video wird beim ersten Tipp erstellt (~9 s) und dann gemerkt.
 * iPhone: Nach dem Erstellen ist der Tipp „verbraucht“ – dann steht „Jetzt speichern“ da und
 * ein zweiter Tipp öffnet das Teilen-Menü („Video sichern“). Android/PC: lädt gleich herunter.
 */
function downloadBlock(day) {
  const fmt = filmFormat();
  const fileName = `${filmName(day)}.${fmt.ext}`;
  let file = null;
  let busy = false;

  const saveLabel = h('span', {});
  const shareLabel = h('span', {});
  const saveBtn = h('button', { class: 'btn btn-big btn-block recap-download', onclick: () => run('save') }, icon('download'), saveLabel);
  const shareBtn = h('button', { class: 'btn btn-quiet btn-block', onclick: () => run('share') }, icon('share'), shareLabel);
  const reset = () => {
    saveLabel.textContent = t('recap.download');
    shareLabel.textContent = t('day.share');
    saveBtn.classList.remove('is-ready');
    shareBtn.classList.remove('is-ready');
  };
  reset();

  async function run(how) {
    if (busy) return;
    if (file) {
      await finish(how);
      return;
    }
    busy = true;
    saveBtn.disabled = true;
    shareBtn.disabled = true;
    const label = how === 'save' ? saveLabel : shareLabel;
    file = await recordFilm(day, skimap(), (f) => {
      label.textContent = t('recap.making', { pct: Math.round(f * 100) });
    });
    busy = false;
    saveBtn.disabled = false;
    shareBtn.disabled = false;
    reset();
    if (how === 'save' && !isIOS()) {
      await finish('save');
      return;
    }
    // Neuer Tipp nötig (iPhone / Teilen-Menü)
    const btn = how === 'save' ? saveBtn : shareBtn;
    label.textContent = t(how === 'save' ? 'recap.readySave' : 'recap.readyShare');
    btn.classList.add('is-ready');
  }

  async function finish(how) {
    const res = await saveFile(file, how === 'share' ? { preferShare: true } : undefined);
    if (res === 'saved') toast(t('day.saved'), { icon: 'check' });
    reset();
  }

  return h('div', { class: 'recap-actions' },
    saveBtn,
    h('p', { class: 'recap-file' }, t(fmt.video ? 'recap.asVideo' : 'recap.asImage', { ext: fmt.ext.toUpperCase() }), ' · ', h('span', { class: 'num' }, fileName)),
    shareBtn);
}

function tile(key, value, unit = '') {
  return h('div', { class: 'stat' }, h('dt', {}, t(key)), h('dd', {}, h('span', { class: 'num' }, String(value)), h('small', {}, unit)));
}

/** Meistgefahrene Lifte */
function favouriteLifts(day) {
  const list = Object.entries(day.liftsUsed || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!list.length) return null;
  return h('section', { class: 'card' },
    h('h3', { class: 'card-title' }, t('day.favLifts')),
    h('ul', { class: 'fav-lifts' },
      list.map(([lift, n]) => h('li', {}, icon('gondola'), h('span', {}, lift), h('b', { class: 'num' }, `${n}×`)))));
}

