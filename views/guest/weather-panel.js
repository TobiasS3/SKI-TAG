// Wetter am Berg (live von Open-Meteo) + Lawinenbericht (Lawinenwarndienst Tirol).

import { h, replace } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { temp, distance, number } from '../../js/utils/format.js';
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
        // Die Berge mit ihren Temperaturen – gleich oben, groß
        mountainChart(weather.stations),
        // Die nächsten Stunden gehören direkt zum Jetzt
        weather.hourly?.length ? h('div', { class: 'wx-hours' },
          weather.hourly.map((hr) => h('div', { class: 'wx-hour' },
            h('small', {}, hr.time),
            icon(hr.condition),
            h('span', { class: 'num' }, temp(hr.temp)),
            hr.precip != null ? h('em', { class: hr.precip >= 40 ? 'is-wet' : '' }, `${hr.precip}%`) : null))) : null,
        weather.hourly?.length ? h('p', { class: 'wx-hint' }, t('weather.precipHint')) : null),

      // --- Nächste Tage ------------------------------------------------------------
      weather.days?.length ? h('section', { class: 'card' },
        h('h3', { class: 'card-title' }, t('weather.days')),
        h('ul', { class: 'wx-days' },
          weather.days.map((d, i) => h('li', {},
            h('span', { class: 'wx-day' }, i === 0 ? t('weather.today') : new Date(`${d.date}T12:00`).toLocaleDateString(locale(), { weekday: 'short' })),
            icon(d.condition),
            h('span', { class: 'wx-day-snow' }, d.snow > 0 ? [icon('snowflake'), `${d.snow} cm`] : null),
            h('small', { class: 'num wx-range-t' }, temp(d.min)),
            rangeBar(d, weather.days),
            h('b', { class: 'num wx-range-t' }, temp(d.max)))))) : null,

      // --- Fakten ----------------------------------------------------------------------
      h('dl', { class: 'wx-facts' },
        fact('wind', t('weather.wind'), `${weather.wind.speed} km/h`, `${t('weather.gusts', { speed: weather.wind.gusts })} · ${t('weather.windFrom', { dir: weather.wind.dir })}`, windArrow(weather.wind.dir)),
        // Schneehöhe genau benannt: an welcher Station, auf welcher Höhe – und im Tal zum Vergleich
        fact('snowflake', t('weather.snowAt', { name: top.name }), `${weather.snow.mountain} cm`,
          t('weather.snowWhere', { m: top.ele.toLocaleString(locale()), valley: valley.name, cm: weather.snow.valley })),
        fact('snow', t('weather.fresh'), `${weather.snow.fresh} cm`, t('weather.last24h')),
        fact('thermo', t('weather.freezing'), `${weather.freezingLevel} m`, t('weather.freezingHint')),
        weather.visibility != null ? fact('eye', t('weather.visibility'), weather.visibility >= 10000 ? '> 10 km' : distance(weather.visibility), '') : null,
        fact('sun', t('weather.sun'), t('weather.sunTimes', { rise: weather.sunrise, set: weather.sunset }), weather.uv != null ? t('weather.uv', { n: Math.round(weather.uv) }) : '')),

      h('p', { class: 'wx-section' }, icon('mountain'), t('aval.section')),
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

// Reihenfolge von West nach Ost, so wie man die Berge von Kitzbühel aus sieht; das Tal liegt dazwischen
const RIDGE_ORDER = ['pengelstein', 'hahnenkamm', 'resterhoehe', 'valley', 'horn'];
const SHORT_NAME = { 'Kitzbüheler Horn': 'Horn' };

/**
 * Bergkette: jeder Hauptberg ist eine echte Spitze (Höhe passt zueinander),
 * oben drauf steht seine Temperatur. Das Tal ist die Senke dazwischen.
 */
function mountainChart(stations) {
  const rank = (s) => (RIDGE_ORDER.includes(s.id) ? RIDGE_ORDER.indexOf(s.id) : 99);
  const town = stations.find((s) => s.id === 'valley');
  const list = stations.filter((s) => s !== town).sort((a, b) => rank(a) - rank(b));
  const W = 360;
  const H = 230;
  const n = list.length;
  const lo = Math.min(...list.map((s) => s.ele)) - 700;
  const hi = Math.max(...list.map((s) => s.ele));
  const yOf = (ele) => 196 - ((ele - lo) / Math.max(1, hi - lo)) * 124;
  const peaks = list.map((s, i) => ({ s, x: (W * (i + 0.5)) / n, y: yOf(s.ele) }));

  // Vorne: Spitze – Sattel – Spitze, mit ein paar Zacken, damit es nach Fels aussieht
  const jag = [0.6, -0.8, 0.9, -0.5, 0.7, -0.9, 0.4];
  const pts = [[0, peaks[0].y + 58]];
  peaks.forEach((p, i) => {
    const prev = peaks[i - 1];
    if (!prev) pts.push([p.x * 0.5, p.y + 30 + jag[2] * 4]);
    pts.push([p.x, p.y]);
    const next = peaks[i + 1];
    if (!next) return;
    const deep = Math.max(p.y, next.y) + 40;
    const mx = (p.x + next.x) / 2;
    pts.push([p.x + (mx - p.x) * 0.42, p.y + (deep - p.y) * 0.5 + jag[i % 7] * 4]);
    pts.push([mx, deep]);
    pts.push([mx + (next.x - mx) * 0.58, next.y + (deep - next.y) * 0.5 + jag[(i + 3) % 7] * 4]);
  });
  const last = peaks[n - 1];
  pts.push([last.x + (W - last.x) * 0.5, last.y + 32]);
  pts.push([W, last.y + 60]);
  const path = (list2) => list2.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  const ridge = `M0 ${H} L${path(pts)} L${W} ${H}Z`;
  // Hinten: blassere Gipfel genau in den Lücken der vorderen Kette
  const backPts = [[0, peaks[0].y + 20]];
  peaks.forEach((p, i) => {
    const next = peaks[i + 1];
    backPts.push([p.x, p.y + 30]);
    if (next) backPts.push([(p.x + next.x) / 2, (p.y + next.y) / 2 + 6]);
  });
  backPts.push([W, last.y + 18]);
  const back = `M0 ${H} L${path(backPts)} L${W} ${H}Z`;
  // Schneekappe auf jedem Gipfel
  const caps = peaks.map((p) => {
    const d = 24;
    return `M${p.x - 44} 0 L${p.x + 44} 0 L${p.x + 44} ${p.y + d - 6} L${p.x + 24} ${p.y + d} L${p.x + 11} ${p.y + d - 8} L${p.x} ${p.y + d + 2} L${p.x - 12} ${p.y + d - 7} L${p.x - 26} ${p.y + d + 1} L${p.x - 44} ${p.y + d - 6}Z`;
  }).join(' ');

  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="wx-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2a5a"/><stop offset="1" stop-color="#0b1226"/></linearGradient>
      <clipPath id="wx-clip"><path d="${ridge}"/></clipPath>
    </defs>
    <path d="${back}" fill="#4a68ad" opacity=".75"/>
    <path d="${ridge}" fill="url(#wx-m)"/>
    <path d="${caps}" fill="#fff" clip-path="url(#wx-clip)"/>
    <path d="M${path(pts)}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" opacity=".85"/>
  </svg>`;

  return h('figure', { class: 'wx-ridge' },
    h('div', { class: 'wx-ridge-art', html: svg }),
    peaks.map((p) => h('div', {
      class: 'wx-ridge-peak',
      style: { left: `${Math.min(88, Math.max(12, (p.x / W) * 100))}%`, top: `${(p.y / H) * 100}%` },
    },
    h('span', { class: 'wx-ridge-t' }, icon(p.s.condition || 'sun'), h('b', { class: 'num' }, temp(p.s.temp))),
    h('span', { class: 'wx-ridge-name' }, SHORT_NAME[p.s.name] || p.s.name),
    h('small', { class: 'num' }, `${number(p.s.ele)} m`))),
    // Unten im Tal: der Ort
    town ? h('div', { class: 'wx-ridge-town' },
      icon(town.condition || 'sun'),
      h('span', {}, h('strong', {}, `${town.name} `), h('small', { class: 'num' }, `${number(town.ele)} m`)),
      h('b', { class: 'num' }, temp(town.temp))) : null);
}

/** Tagesspanne auf einer gemeinsamen Skala: von kalt (blau) bis warm (orange) */
function rangeBar(d, days) {
  const lo = Math.min(...days.map((x) => x.min));
  const hi = Math.max(...days.map((x) => x.max));
  const span = Math.max(1, hi - lo);
  return h('span', { class: 'wx-range' }, h('i', { style: { left: `${((d.min - lo) / span) * 100}%`, right: `${((hi - d.max) / span) * 100}%` } }));
}


function fact(ic, label, value, sub, extra = null) {
  return h('div', { class: `wx-fact wx-fact-${ic}` },
    h('span', { class: 'wx-fact-icon' }, icon(ic)),
    h('dt', {}, label),
    h('dd', {}, h('strong', {}, value), sub ? h('small', {}, sub) : null),
    extra);
}

const DIR_DEG = { N: 0, NO: 45, NE: 45, O: 90, E: 90, SO: 135, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** Kleiner Kompass: Pfeil zeigt, wohin der Wind weht */
function windArrow(dir) {
  const deg = DIR_DEG[dir];
  if (deg == null) return null;
  return h('span', { class: 'wx-compass', title: t('weather.windFrom', { dir }) },
    h('i', { style: { transform: `rotate(${deg + 180}deg)` } }, icon('arrowUp')),
    h('small', {}, 'N'));
}

function avalLevel(level, label) {
  return h('div', { class: 'aval-level' },
    h('span', { class: 'aval-badge', style: { '--c': AVAL_COLORS[level] } }, h('span', { class: 'num' }, level)),
    h('span', {}, h('strong', {}, t(`aval.level.${level}`)), h('small', {}, label)));
}
