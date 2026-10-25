// Echtes Wetter (Open-Meteo) und Lawinenbericht (Lawinenwarndienst Tirol).
// Beide Dienste: frei, ohne Schlüssel, ohne Cookies. Wird nur von api.js benutzt.

// Messpunkte vom Tal bis zum Gipfel – Open-Meteo rechnet auf genau diese Höhe um
export const STATIONS = [
  { id: 'valley', name: 'Kitzbühel', lat: 47.4467, lng: 12.3925, ele: 762 },
  { id: 'hahnenkamm', name: 'Hahnenkamm', lat: 47.4268, lng: 12.3725, ele: 1712 },
  { id: 'resterhoehe', name: 'Resterhöhe', lat: 47.3130, lng: 12.3862, ele: 1894 },
  { id: 'pengelstein', name: 'Pengelstein', lat: 47.3906, lng: 12.3480, ele: 1938 },
  { id: 'horn', name: 'Kitzbüheler Horn', lat: 47.4752, lng: 12.4293, ele: 1996 },
];
const MOUNTAIN = 1; // Hahnenkamm: Referenz für Wind, Schnee, Stundenwerte

// Lawinen-Regionen um Kitzbühel (EUREGIO-Mikroregionen)
const AVAL_REGIONS = ['AT-07-17-02', 'AT-07-18'];
const LEVELS = { low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5 };

/** WMO-Wettercode → unsere Symbole */
export function condition(code) {
  if (code <= 1) return 'sun';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloud';
}

const hhmm = (iso) => iso.slice(11, 16);
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

export async function loadLiveWeather() {
  const params = new URLSearchParams({
    latitude: STATIONS.map((s) => s.lat).join(','),
    longitude: STATIONS.map((s) => s.lng).join(','),
    elevation: STATIONS.map((s) => s.ele).join(','),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,snow_depth,visibility',
    hourly: 'temperature_2m,weather_code,snowfall,freezing_level_height,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,sunrise,sunset,uv_index_max',
    timezone: 'Europe/Vienna',
    past_days: 1,
    forecast_days: 4,
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Wetter: ${res.status}`);
  const all = await res.json();
  const list = Array.isArray(all) ? all : [all];
  const mountain = list[MOUNTAIN];
  const cur = mountain.current;

  // Stunde „jetzt“ in den Stundenwerten finden
  const hours = mountain.hourly.time;
  const nowIdx = Math.max(0, hours.findIndex((t) => t.slice(0, 13) === cur.time.slice(0, 13)));

  // Neuschnee = Schneefall der letzten 24 Stunden
  const fresh = mountain.hourly.snowfall.slice(Math.max(0, nowIdx - 24), nowIdx + 1).reduce((a, b) => a + (b || 0), 0);
  const todayIdx = mountain.daily.time.findIndex((d) => d === cur.time.slice(0, 10));

  return {
    source: 'Open-Meteo',
    updatedAt: `${cur.time}:00`,
    stations: STATIONS.map((s, i) => ({
      id: s.id,
      name: s.name,
      ele: s.ele,
      temp: Math.round(list[i].current.temperature_2m),
      feels: Math.round(list[i].current.apparent_temperature),
      condition: condition(list[i].current.weather_code),
    })),
    wind: {
      speed: Math.round(cur.wind_speed_10m),
      gusts: Math.round(cur.wind_gusts_10m),
      dir: DIRS[Math.round(cur.wind_direction_10m / 45) % 8],
    },
    snow: {
      mountain: Math.round((cur.snow_depth || 0) * 100),
      valley: Math.round((list[0].current.snow_depth || 0) * 100),
      fresh: Math.round(fresh),
    },
    visibility: cur.visibility,
    freezingLevel: Math.round((mountain.hourly.freezing_level_height[nowIdx] || 0) / 50) * 50,
    sunrise: hhmm(mountain.daily.sunrise[todayIdx]),
    sunset: hhmm(mountain.daily.sunset[todayIdx]),
    uv: mountain.daily.uv_index_max[todayIdx],
    // Die nächsten Stunden im 2-Stunden-Takt
    hourly: Array.from({ length: 6 }, (_, k) => nowIdx + 1 + k * 2).filter((i) => i < hours.length).map((i) => ({
      time: hhmm(hours[i]),
      temp: Math.round(mountain.hourly.temperature_2m[i]),
      condition: condition(mountain.hourly.weather_code[i]),
      precip: mountain.hourly.precipitation_probability[i],
      snow: mountain.hourly.snowfall[i],
    })),
    // Heute + die nächsten 3 Tage
    days: mountain.daily.time.slice(todayIdx, todayIdx + 4).map((date, k) => ({
      date,
      min: Math.round(mountain.daily.temperature_2m_min[todayIdx + k]),
      max: Math.round(mountain.daily.temperature_2m_max[todayIdx + k]),
      condition: condition(mountain.daily.weather_code[todayIdx + k]),
      snow: Math.round(mountain.daily.snowfall_sum[todayIdx + k] || 0),
    })),
  };
}

/**
 * Lawinenbericht Tirol (CAAML). Gibt es keinen gültigen Bericht (Sommer, Herbst),
 * kommt { current: false, last: … } zurück – die App zeigt dann keinen alten Wert als aktuell an.
 */
export async function loadAvalanche(lang = 'de') {
  const res = await fetch(`https://static.avalanche.report/bulletins/latest/AT-07_${lang}_CAAMLv6.json`);
  if (!res.ok) throw new Error(`Lawinen: ${res.status}`);
  const { bulletins } = await res.json();
  const ours = bulletins.filter((b) => b.regions.some((r) => AVAL_REGIONS.includes(r.regionID)));
  if (!ours.length) return null;

  let level = 0;
  let levelAbove = 0;
  let treeline = null;
  const problems = new Set();
  for (const b of ours) {
    for (const r of b.dangerRatings) {
      const v = LEVELS[r.mainValue] || 0;
      if (r.elevation?.lowerBound) {
        levelAbove = Math.max(levelAbove, v);
        treeline = r.elevation.lowerBound;
      } else if (r.elevation?.upperBound) {
        level = Math.max(level, v);
        treeline = r.elevation.upperBound;
      } else {
        level = Math.max(level, v);
        levelAbove = Math.max(levelAbove, v);
      }
    }
    (b.avalancheProblems || []).forEach((p) => problems.add(p.problemType));
  }
  const valid = ours[0].validTime;
  return {
    level,
    levelAbove: levelAbove || level,
    treeline: treeline && /^\d+$/.test(treeline) ? Number(treeline) : null,
    problems: [...problems],
    publishedAt: ours[0].publicationTime,
    validUntil: valid.endTime,
    current: new Date(valid.endTime) > new Date(),
    region: ours[0].regions.find((r) => AVAL_REGIONS.includes(r.regionID))?.name,
    source: 'https://lawinen.report',
  };
}
