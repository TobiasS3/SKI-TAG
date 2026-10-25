// Tagesrückblick: Zahlen, Höhenprofil, Abfahrten, Abzeichen, Datei herunterladen und teilen.

import { h } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { duration, number, distance } from '../../js/utils/format.js';
import { isoDay } from '../../js/utils/time.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { toGPX, download, share } from '../../js/services/export.js';
import { speedColor } from '../../js/map/layers.js';
import { altitudeChart, difficultyBar, runList, badgeRow } from './day-stats.js';

export function renderSummary(day, { onNew } = {}) {
  const name = `Ski Tag ${config.resort.name} ${isoDay(new Date(day.startedAt))}`;
  const file = `skitag-${isoDay(new Date(day.startedAt))}`;
  const date = new Date(day.startedAt).toLocaleDateString(getLang() === 'de' ? 'de-AT' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const pisteTime = day.points.filter((p) => p.kind === 'piste' && p.speed > 1).length;
  const avg = pisteTime ? day.points.filter((p) => p.kind === 'piste' && p.speed > 1).reduce((s, p) => s + p.speed * 3.6, 0) / pisteTime : 0;

  const shareText = t('day.shareText', {
    resort: config.resort.name,
    km: distance(day.km * 1000),
    runs: day.runs.length,
    top: `${Math.round(day.top)} km/h`,
    vert: `${number(day.descent)} m`,
  });

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

    h('div', { class: 'recap-actions' },
      h('button', {
        class: 'btn btn-big btn-block',
        onclick: () => {
          download(`${file}.gpx`, toGPX(day, name), 'application/gpx+xml');
          toast(t('day.saved'), { icon: 'check' });
        },
      }, icon('download'), t('day.download')),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn btn-quiet',
          style: { flex: 1 },
          onclick: () => {
            download(`${file}.json`, JSON.stringify(day, null, 2), 'application/json');
            toast(t('day.saved'), { icon: 'check' });
          },
        }, t('day.downloadJson')),
        h('button', {
          class: 'btn btn-sun',
          style: { flex: 1 },
          onclick: async () => {
            const res = await share({
              title: name, text: shareText, filename: `${file}.gpx`, content: toGPX(day, name), type: 'application/gpx+xml',
            });
            if (res === 'copied') toast(shareText, { icon: 'check', ms: 5000 });
          },
        }, icon('share'), t('day.share'))),
      onNew ? h('button', { class: 'btn btn-quiet btn-block', onclick: onNew }, icon('play'), t('day.again')) : null,
    ),
  );
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
