// Wetter am Berg (live von Open-Meteo) + Lawinenbericht (Lawinenwarndienst Tirol).

import { h, replace } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { temp, distance } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';

export const AVAL_COLORS = ['#d9d9de', '#c8e66d', '#ffe33b', '#ff9a1f', '#f2351e', '#7a1414'];

/** Station, die als „Am Berg“ gilt (Hahnenkamm), sonst die höchste. */
export function mountainStation(weather) {
  return weather.stations.find((s) => s.id === 'hahnenkamm')
    || [...weather.stations].sort((a, b) => b.ele - a.ele)[0];
}

export function mountWeather(el, weather) {
  const locale = () => (getLang() === 'de' ? 'de-AT' : 'en-GB');

  function render() {
    if (!weather) {
      replace(el, h('div', { class: 'empty' }, icon('cloud'), h('p', {}, t('weather.unavailable'))));
      return;
    }
    const top = mountainStation(weather);
    const valley = weather.stations.find((s) => s.id === 'valley') || weather.stations[0];
    const temps = weather.stations.map((s) => s.temp);
    const tMin = Math.min(...temps) - 2;
    const tMax = Math.max(...temps) + 2;

    replace(el,
      // --- Großer Kopf: so ist es gerade am Berg -----------------------------------
      h('section', { class: `wx-hero wx-${top.condition}` },
        weatherFx(top.condition),
        h('div', { class: 'wx-hero-text' },
          h('p', { class: 'wx-where' }, icon('mountain'), `${top.name}, ${top.ele} m`),
          h('span', { class: 'num wx-temp' }, temp(top.temp)),
          h('p', { class: 'wx-cond' }, t(`cond.${top.condition}`)),
          h('p', { class: 'wx-feels' },
            h('span', {}, t('weather.feels', { t: temp(top.feels ?? top.temp) })),
            h('span', {}, t('weather.valleyTemp', { t: temp(valley.temp) })))),
        h('div', { class: 'wx-hero-icon' }, icon(top.condition)),
        h('div', { class: 'wx-hero-hills', 'aria-hidden': 'true', html: HILLS })),

      // --- Höhenprofil: jede Station mit Temperaturbalken -------------------------
      h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, t('weather.byAltitude')),
        h('ol', { class: 'wx-alt' },
          [...weather.stations].sort((a, b) => b.ele - a.ele).map((s) => {
            const f = (s.temp - tMin) / Math.max(1, tMax - tMin);
            return h('li', {},
              h('span', { class: 'wx-alt-ele num' }, `${s.ele}`),
              h('span', { class: 'wx-alt-name' }, s.name),
              icon(s.condition),
              h('span', { class: 'wx-alt-bar' }, h('i', { style: { width: `${Math.round(18 + f * 82)}%`, background: tempColor(s.temp) } })),
              h('span', { class: 'num wx-alt-t' }, temp(s.temp)));
          }))),

      // --- Nächste Stunden -------------------------------------------------------
      weather.hourly?.length ? h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, t('weather.hourly')),
        h('div', { class: 'wx-hours' },
          weather.hourly.map((hr) => h('div', { class: 'wx-hour' },
            h('small', {}, hr.time),
            icon(hr.condition),
            h('span', { class: 'num' }, temp(hr.temp)),
            hr.precip != null ? h('em', { class: hr.precip >= 40 ? 'is-wet' : '' }, `${hr.precip}%`) : null)))) : null,

      // --- Nächste Tage ------------------------------------------------------------
      weather.days?.length ? h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, t('weather.days')),
        h('ul', { class: 'wx-days' },
          weather.days.map((d, i) => h('li', {},
            h('span', { class: 'wx-day' }, i === 0 ? t('weather.today') : new Date(`${d.date}T12:00`).toLocaleDateString(locale(), { weekday: 'short' })),
            icon(d.condition),
            d.snow > 0 ? h('span', { class: 'wx-day-snow' }, icon('snowflake'), `${d.snow} cm`) : h('span', { class: 'wx-day-snow' }),
            h('span', { class: 'wx-day-range num' }, h('b', {}, temp(d.max)), ' ', h('small', {}, temp(d.min))))))) : null,

      // --- Fakten ----------------------------------------------------------------------
      h('dl', { class: 'wx-facts' },
        fact('wind', t('weather.wind'), `${weather.wind.speed} km/h ${weather.wind.dir}`, t('weather.gusts', { speed: weather.wind.gusts })),
        fact('snowflake', t('weather.snow'), `${weather.snow.mountain} cm`, t('weather.valley', { cm: weather.snow.valley })),
        fact('snow', t('weather.fresh'), `${weather.snow.fresh} cm`, t('weather.last24h')),
        fact('thermo', t('weather.freezing'), `${weather.freezingLevel} m`, ''),
        weather.visibility != null ? fact('eye', t('weather.visibility'), weather.visibility >= 10000 ? '> 10 km' : distance(weather.visibility), '') : null,
        fact('sun', t('weather.sun'), t('weather.sunTimes', { rise: weather.sunrise, set: weather.sunset }), weather.uv != null ? `UV ${Math.round(weather.uv)}` : '')),

      avalancheCard(weather.avalanche),

      h('p', { class: 'wx-source' },
        weather.fallback ? t('weather.fallback') : t('weather.source', {
          source: weather.source,
          time: new Date(weather.updatedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
        })),
    );
  }

  function avalancheCard(a) {
    const head = h('div', { class: 'aval-head' },
      h('h3', { class: 'card-title' }, t('aval.title')),
      h('a', { class: 'link-pill', href: a?.source || 'https://lawinen.report', target: '_blank', rel: 'noopener' }, icon('link'), t('aval.link')));

    if (!a || !a.current) {
      return h('section', { class: 'card aval aval-off', id: 'avalanche' },
        head,
        h('div', { class: 'aval-none' },
          h('span', { class: 'aval-badge', style: { '--c': AVAL_COLORS[0] } }, h('span', { class: 'num' }, '–')),
          h('p', {},
            h('strong', {}, t('aval.noReport')),
            h('small', {}, a
              ? t('aval.lastReport', { date: new Date(a.publishedAt).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) })
              : t('aval.unreachable')))),
        h('p', { class: 'muted small' }, t('aval.note')));
    }
    return h('section', { class: 'card aval', id: 'avalanche' },
      head,
      h('div', { class: 'aval-levels' },
        avalLevel(a.levelAbove, a.treeline ? t('aval.above', { m: a.treeline }) : t('aval.all')),
        a.treeline ? avalLevel(a.level, t('aval.below', { m: a.treeline })) : null),
      h('div', { class: 'aval-scale', 'aria-hidden': 'true' },
        [1, 2, 3, 4, 5].map((n) => h('span', { class: n === a.levelAbove ? 'is-on' : '', style: { background: AVAL_COLORS[n] } }))),
      a.problems.length ? h('p', { class: 'aval-problems' }, a.problems.map((p) => h('span', { class: 'tag' }, t(`aval.problem.${p}`)))) : null,
      h('p', { class: 'muted small' }, a.region ? `${a.region}. ` : '', t('aval.note')));
  }

  const off = on('lang', render);
  render();
  return { destroy: off };
}

/**
 * Bewegung im Wetter-Kopf: Flocken, Tropfen, Nebel, Wolken.
 * Zufallswerte als CSS-Variablen – die Animation selbst steht in guest.css.
 */
function weatherFx(condition) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const many = (n, make) => Array.from({ length: n }, make);
  const parts = {
    snow: () => many(26, () => h('i', {
      class: 'wx-flake',
      style: { '--x': `${rnd(0, 100)}%`, '--s': `${rnd(3, 7)}px`, '--d': `${rnd(5, 10)}s`, '--delay': `${rnd(-10, 0)}s`, '--sway': `${rnd(-30, 30)}px` },
    })),
    rain: () => many(34, () => h('i', {
      class: 'wx-drop',
      style: { '--x': `${rnd(0, 115)}%`, '--d': `${rnd(0.7, 1.1)}s`, '--delay': `${rnd(-1.2, 0)}s` },
    })),
    fog: () => [28, 70, 120].map((y, i) => h('i', { class: 'wx-fog-band', style: { '--y': `${y}px`, '--d': `${7 + i * 3}s` } })),
    cloud: () => many(4, (_, i) => h('i', {
      class: 'wx-puff',
      style: { '--y': `${10 + i * 34}px`, '--w': `${rnd(110, 180)}px`, '--o': rnd(0.25, 0.45).toFixed(2), '--d': `${rnd(28, 45)}s`, '--delay': `${rnd(-45, 0)}s` },
    })),
  };
  parts.storm = () => [...parts.rain(), h('i', { class: 'wx-flash' })];
  parts.partly = () => parts.cloud().slice(0, 2);
  const make = parts[condition];
  return make ? h('div', { class: 'wx-fx', 'aria-hidden': 'true' }, make()) : null;
}

/** Freundliche Farbe je Temperatur: kalt = blau, um 0 = türkis, warm = sanftes Orange */
function tempColor(c) {
  if (c <= -10) return '#3d6fe0';
  if (c < 0) return '#5b9bff';
  if (c < 6) return '#45c4d6';
  return '#ffb35c';
}

// Verschneite Berge unten im Wetter-Kopf
const HILLS = `<svg viewBox="0 0 400 80" preserveAspectRatio="none">
  <path d="M0 60 L60 28 L95 46 L150 12 L210 50 L250 32 L300 52 L350 22 L400 44 V80 H0Z" fill="rgba(255,255,255,.35)"/>
  <path d="M0 70 C80 48 140 58 200 62 S320 50 400 60 V80 H0Z" fill="#fff"/>
</svg>`;

function fact(ic, label, value, sub) {
  return h('div', { class: 'wx-fact' },
    icon(ic),
    h('dt', {}, label),
    h('dd', {}, h('strong', {}, value), sub ? h('small', {}, sub) : null));
}

function avalLevel(level, label) {
  return h('div', { class: 'aval-level' },
    h('span', { class: 'aval-badge', style: { '--c': AVAL_COLORS[level] } }, h('span', { class: 'num' }, level)),
    h('span', {}, h('strong', {}, t(`aval.level.${level}`)), h('small', {}, label)));
}
