// Tagesrückblick: Zahlen, Höhenprofil, Abfahrten, Abzeichen – und „Übersicht downloaden“:
// der Tagesfilm als Video (MP4), das auf iPhone, Samsung und PC einfach aufgeht.

import { h } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { duration, number } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { saveFile, isIOS } from '../../js/services/export.js';
import { skimap } from '../../js/services/slopes.js';
import { speedColor } from '../../js/map/layers.js';
import { altitudeChart, difficultyBar, runList, badgeRow } from './day-stats.js';
import { recordFilm, filmFormat, filmName } from './day-film.js';

export function renderSummary(day, { onNew } = {}) {
  const date = new Date(day.startedAt).toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const pisteTime = day.points.filter((p) => p.kind === 'piste' && p.speed > 1).length;
  const avg = pisteTime ? day.points.filter((p) => p.kind === 'piste' && p.speed > 1).reduce((s, p) => s + p.speed * 3.6, 0) / pisteTime : 0;

  return h('div', { class: 'recap' },
    // Kopf: großer Wert auf Schwarz
    h('section', { class: 'instrument recap-hero' },
      h('div', { class: 'instrument-head' }, h('span', {}, date), h('span', { class: 'day-chip' }, t('day.recap'))),
      h('div', { class: 'recap-big' },
        h('span', { class: 'num recap-km' }, number(day.km, 1)),
        h('span', { class: 'recap-unit' }, t('day.km'))),
      speedProfile(day.points),
      h('dl', { class: 'day-stats' },
        tile('day.runs', day.runs.length),
        tile('day.descent', number(day.descent), 'm'),
        tile('day.top', Math.round(day.top), 'km/h'),
        tile('day.avg', Math.round(avg), 'km/h'),
        tile('day.maxAlt', number(day.maxAlt), 'm'),
        tile('day.time', duration(day.elapsed || 0)))),

    h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.profile')), altitudeChart(day.points)),
    difficultyBar(day) ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.byColor')), difficultyBar(day)) : null,
    day.runs.length ? h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.runList')), runList(day)) : null,
    favouriteLifts(day),
    h('section', { class: 'card' }, h('h3', { class: 'card-title' }, t('day.badges')), badgeRow(day)),

    downloadBlock(day),
    onNew ? h('button', { class: 'btn btn-quiet btn-block', onclick: onNew }, icon('play'), t('day.again')) : null,
  );
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

/** Tempo über den Tag als farbige Balken – jeder Balken ein Zeitabschnitt. */
function speedProfile(points) {
  const BARS = 48;
  if (points.length < 2) return null;
  const per = Math.ceil(points.length / BARS);
  const bars = [];
  for (let i = 0; i < points.length; i += per) {
    const slice = points.slice(i, i + per).filter((p) => p.kind === 'piste');
    bars.push(slice.length ? Math.max(...slice.map((p) => p.speed * 3.6)) : 0);
  }
  const max = Math.max(60, ...bars);
  return h('div', { class: 'profile', 'aria-hidden': 'true' },
    bars.map((kmh, i) => h('span', {
      style: { height: `${Math.max(4, (kmh / max) * 100)}%`, background: kmh ? speedColor(kmh) : 'var(--night-3)', animationDelay: `${i * 18}ms` },
    })));
}
