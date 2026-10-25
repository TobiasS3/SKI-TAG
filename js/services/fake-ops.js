// Fake-Server für Bergbahn und Skischule: Einsätze (SOS, Suche), alle Miet-Chips, Skikurs-Gruppen.
// Wird NUR von api.js benutzt. Sobald der echte Server läuft, fällt diese Datei weg.
//
// Einsätze liegen im Browser (localStorage) – so sieht ein zweiter Tab sie auch:
// Gast drückt SOS in Tab 1 → Bergbahn bekommt den Alarm in Tab 2.

import { config } from '../config.js';
import { load, save } from '../core/storage.js';
import { emit, on } from '../core/events.js';
import { now, isoDay } from '../utils/time.js';
import { distance } from '../map/geo.js';
import { nearestNode } from './slopes.js';
import { simulateChip } from './fake-chip.js';

const OFFER_S = 60;          // so lange hat ein Mitarbeiter Zeit zum Annehmen, dann der Nächste
const COLLEAGUE_ACCEPT_S = 7; // Kollegen (nicht du) nehmen nach ein paar Sekunden an
const COLLEAGUE_DONE_S = 60;  // … und sind nach einer Minute vor Ort fertig
const RESCUE_SPEED = 5.5;     // m/s – Pistenrettung mit Skidoo/Ski
const RESCUE_START = 120;     // s – bis der Helfer losfährt

const key = () => `ops-${isoDay()}`;
const getJSON = (path) => fetch(path).then((r) => r.json());

// --- Einsätze -------------------------------------------------------------------------

let staffList = null;
let state = null;          // { alarms: [], staffState: { id: 'break' }, incomingDone }
const tickStart = Date.now();

async function ready() {
  if (!staffList) staffList = await getJSON('data/fake/staff.json');
  if (!state) state = load(key(), null);
  if (!state) {
    const seed = await getJSON('data/fake/alarms.json');
    const t = now().getTime();
    const ago = (m) => (m == null ? null : t - m * 60000);
    state = {
      alarms: seed.today.map((a) => {
        const staff = staffById(a.staff);
        const alarm = {
          id: a.id, type: a.type, source: a.source, chip: a.chip, pos: a.pos, battery: a.battery,
          at: ago(a.ago), status: a.status, staff: a.staff, offered: [a.staff], offeredAt: ago(a.ago),
          acceptedAt: ago(a.acceptedAgo), onsiteAt: ago(a.onsiteAgo), doneAt: ago(a.doneAgo), outcome: a.outcome || null,
          log: [],
        };
        alarm.eta = eta(staff, alarm.pos);
        alarm.log.push(entry(alarm.at, 'created'), entry(alarm.at, 'offered', { name: staff.name }));
        if (alarm.acceptedAt) alarm.log.push(entry(alarm.acceptedAt, 'accepted', { name: staff.name }));
        if (alarm.onsiteAt) alarm.log.push(entry(alarm.onsiteAt, 'onsite', { name: staff.name }));
        if (alarm.doneAt) alarm.log.push(entry(alarm.doneAt, 'done', { outcome: alarm.outcome }));
        return alarm;
      }),
      staffState: {},
      incoming: seed.incoming,
      incomingDone: false,
    };
    persist();
  }
  return state;
}

const staffById = (id) => staffList.find((s) => s.id === id);
const entry = (at, k, vars = {}) => ({ at, key: k, vars });
const eta = (staff, pos) => RESCUE_START + distance([staff.lat, staff.lng], pos) / RESCUE_SPEED;

function persist() {
  save(key(), state);
  emit('ops:changed');
}

// Anderer Tab hat etwas geändert → neu laden
addEventListener('storage', (e) => {
  if (e.key !== `skitag.${key()}`) return;
  state = load(key(), state);
  emit('ops:changed');
});

/** Hat dieser Mitarbeiter gerade einen Einsatz? */
const busy = (id) => state.alarms.some((a) => a.staff === id && (a.status === 'accepted' || a.status === 'onsite'));

/** Nächster freier Mitarbeiter (nicht in Pause, nicht im Einsatz, noch nicht gefragt). Pistenrettung zuerst. */
function nearestFree(pos, skip = []) {
  const free = staffList.filter((s) => !skip.includes(s.id) && !busy(s.id) && state.staffState[s.id] !== 'break');
  const rank = (s) => distance(pos, [s.lat, s.lng]) * (s.role === 'Pistenrettung' ? 1 : 1.6);
  return free.sort((a, b) => rank(a) - rank(b))[0] || null;
}

/** Wo ist ein Mitarbeiter gerade? Unterwegs zum Einsatz → dazwischen, vor Ort → beim Einsatz. */
export function staffPosition(id) {
  const s = staffById(id);
  const a = state?.alarms.find((x) => x.staff === id && (x.status === 'accepted' || x.status === 'onsite'));
  if (!a) return { pos: [s.lat, s.lng], f: 0 };
  if (a.status === 'onsite') return { pos: a.pos, f: 1, alarm: a.id };
  const f = Math.min(1, (((now().getTime() - a.acceptedAt) / 1000) * config.simSpeed) / a.eta);
  return { pos: [s.lat + (a.pos[0] - s.lat) * f, s.lng + (a.pos[1] - s.lng) * f], f, alarm: a.id };
}

/** Neuer Einsatz (SOS vom Chip/aus der App, Suche von der Skischule). Geht an den nächsten freien Mitarbeiter. */
export async function createAlarm(data) {
  await ready();
  const t = now().getTime();
  const staff = nearestFree(data.pos);
  const alarm = {
    id: `${data.type === 'search' ? 'SUCHE' : 'SOS'}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    status: 'new', at: t, offeredAt: t, offered: staff ? [staff.id] : [], staff: staff?.id ?? null,
    outcome: null, log: [entry(t, 'created')], ...data,
  };
  alarm.eta = staff ? eta(staff, alarm.pos) : null;
  if (staff) alarm.log.push(entry(t, 'offered', { name: staff.name }));
  state.alarms.unshift(alarm);
  persist();
  return { alarm, staff };
}

export async function updateAlarm(id, action, extra = {}) {
  await ready();
  const a = state.alarms.find((x) => x.id === id);
  if (!a) return null;
  const t = now().getTime();
  const name = (sid) => staffById(sid)?.name ?? '–';
  if (action === 'accept') {
    if (extra.staff && extra.staff !== a.staff) {
      a.staff = extra.staff;
      a.offered.push(extra.staff);
      a.eta = eta(staffById(extra.staff), a.pos);
    }
    a.status = 'accepted';
    a.acceptedAt = t;
    a.log.push(entry(t, 'accepted', { name: name(a.staff) }));
  } else if (action === 'pass' || action === 'timeout') {
    const from = a.staff;
    const next = nearestFree(a.pos, a.offered);
    a.log.push(entry(t, action === 'pass' ? 'passed' : 'timeout', { name: name(from) }));
    a.staff = next?.id ?? null;
    a.status = 'new';
    a.offeredAt = t;
    if (next) {
      a.offered.push(next.id);
      a.eta = eta(next, a.pos);
      a.log.push(entry(t, 'offered', { name: next.name }));
    }
  } else if (action === 'onsite') {
    a.status = 'onsite';
    a.onsiteAt = t;
    a.log.push(entry(t, 'onsite', { name: name(a.staff) }));
  } else if (action === 'done') {
    a.status = 'done';
    a.doneAt = t;
    a.outcome = extra.outcome;
    a.note = extra.note || null;
    a.log.push(entry(t, 'done', { outcome: extra.outcome }));
  } else if (action === 'note') {
    a.log.push(entry(t, 'note', { text: extra.text }));
  }
  persist();
  return a;
}

export async function setStaffState(id, value) {
  await ready();
  if (value === 'free') delete state.staffState[id];
  else state.staffState[id] = value;
  persist();
}

/**
 * Einsätze beobachten. cb({ alarms, staffState, staffPos }) bei jeder Änderung und jede Sekunde.
 * me = eigene Mitarbeiter-ID: dein Alarm wartet auf dich (60 s), Kollegen nehmen von selbst an.
 * Ohne me (Skischule) wird nur zugeschaut.
 */
export function watchAlarms(cb, { me = null } = {}) {
  let stopped = false;
  const send = () => {
    if (stopped || !state) return;
    const staffPos = Object.fromEntries(staffList.map((s) => [s.id, staffPosition(s.id)]));
    cb({ alarms: state.alarms, staffState: state.staffState, staffPos });
  };
  const off = on('ops:changed', send);
  let timer = 0;
  ready().then(() => {
    if (stopped) return;
    send();
    timer = setInterval(() => {
      // „Server“ läuft nur im Bergbahn-Tab – sonst nehmen Skischul- oder Gäste-Tabs Alarme an
      if (me) simulate(me);
      send();
    }, 1000);
  });
  return () => {
    stopped = true;
    off();
    clearInterval(timer);
  };
}

/** „Der Server“: Kollegen reagieren, Helfer kommen an, nicht angenommene Alarme gehen weiter. */
function simulate(me) {
  const t = now().getTime();
  const since = (at) => (t - Math.max(at, t - (Date.now() - tickStart))) / 1000; // Zeit seit at, frühestens ab Seitenstart
  // Beispiel-Alarm kurz nach dem Login (einmal pro Tag)
  if (state.incoming && !state.incomingDone && me && (Date.now() - tickStart) / 1000 > state.incoming.afterSec) {
    state.incomingDone = true;
    const { afterSec, ...data } = state.incoming;
    createAlarm(data);
    return;
  }
  for (const a of state.alarms) {
    if (a.status === 'new' && a.staff) {
      const waited = since(a.offeredAt);
      if (a.staff === me) {
        if (waited > OFFER_S) updateAlarm(a.id, 'timeout');
      } else if (waited > COLLEAGUE_ACCEPT_S) {
        updateAlarm(a.id, 'accept');
      }
    } else if (a.status === 'new' && !a.staff) {
      // Alle waren beschäftigt – nochmal versuchen
      const next = nearestFree(a.pos, []);
      if (next) updateAlarm(a.id, 'pass');
    } else if (a.status === 'accepted' && a.staff !== me && staffPosition(a.staff).f >= 1) {
      updateAlarm(a.id, 'onsite');
    } else if (a.status === 'onsite' && a.staff !== me && a.type === 'sos' && a.source === 'chip' && since(a.onsiteAt) > COLLEAGUE_DONE_S) {
      updateAlarm(a.id, 'done', { outcome: 'treated' });
    }
  }
}

// --- Alle Miet-Chips am Berg ----------------------------------------------------------

/** Alle Miet-Chips fahren herum. cb([{ chip, lat, lng, alt, speed, kind, ref, battery, time }]) jede Sekunde. */
export function watchFleet(chips, cb) {
  const latest = new Map();
  const sims = chips.map((c) => simulateChip({ seed: hash(c.id) }, (p) => latest.set(c.id, { chip: c.id, ...p })));
  const timer = setInterval(() => cb([...latest.values()]), 1000);
  setTimeout(() => cb([...latest.values()]), 50);
  return () => {
    clearInterval(timer);
    sims.forEach((s) => s.stop());
  };
}

// --- Skikurs ----------------------------------------------------------------------------

const recalls = new Map(); // chip → Zeitpunkt „angepiepst“

/** Vibration am Chip. Fake: Ein Kind, das hinterherhängt, kommt danach zurück. */
export function signal(chips) {
  chips.forEach((c) => recalls.set(c, Date.now()));
  emit('ops:signal', chips);
}

/**
 * Skikurs live: Lehrer fährt, Kinder fahren in einer Schlange hinterher (gleiche Spur, etwas versetzt).
 * Ein Kind (drifter) fällt nach einer Weile zurück – bis es angepiepst wird.
 * cb({ teacher, kids: [{ chip, lat, lng, … }], others: { gruppenId: { lat, lng, … } } })
 */
export function watchCourse(school, groupId, cb) {
  const group = school.groups[groupId];
  const history = []; // Positionen des Lehrers, eine pro Sekunde
  let teacher = null;
  const others = {};
  const started = Date.now();
  const lag = new Map(group.kids.map((k, i) => [k.chip, 0.25 + i * 0.12])); // Abstand in Sekunden-Schritten

  const sims = [simulateChip({ seed: hash(group.teacherChip), start: nearestNode(group.start), mode: group.mode }, (p) => {
    teacher = { chip: group.teacherChip, ...p };
    history.push(teacher);
    if (history.length > 40) history.shift();
  })];
  for (const [id, g] of Object.entries(school.groups)) {
    if (id === groupId) continue;
    sims.push(simulateChip({ seed: hash(g.teacherChip), start: nearestNode(g.start), mode: g.mode }, (p) => {
      others[id] = { chip: g.teacherChip, ...p };
    }));
  }

  function kidAt(kid, i) {
    // Hängt das Kind hinterher? Nach 35 s fällt der „drifter“ zurück, nach dem Anpiepsen holt er auf.
    let l = lag.get(kid.chip);
    const target = kid.drifter && (Date.now() - started) / 1000 > 35 && !(recalls.get(kid.chip) > started + 35000)
      ? 8.5
      : 0.25 + i * 0.12;
    l += (target - l) * (target > l ? 0.06 : 0.12);
    lag.set(kid.chip, l);
    // Position auf der Spur des Lehrers, l Schritte zurück
    const idx = Math.max(0, history.length - 1 - l);
    const a = history[Math.floor(idx)];
    const b = history[Math.min(history.length - 1, Math.floor(idx) + 1)];
    const f = idx - Math.floor(idx);
    const t = Date.now() / 1000;
    // Jedes Kind hat seinen Platz in der Gruppe (bis ~35 m daneben) und wackelt etwas hin und her
    const angle = i * 2.4;
    const wob = [
      Math.sin(angle) * 0.00022 + Math.sin(t * 0.7 + i * 1.9) * 0.00006,
      Math.cos(angle) * 0.0003 + Math.cos(t * 0.6 + i * 2.3) * 0.00008,
    ];
    return {
      chip: kid.chip,
      lat: a.lat + (b.lat - a.lat) * f + wob[0],
      lng: a.lng + (b.lng - a.lng) * f + wob[1],
      alt: Math.round(a.alt + (b.alt - a.alt) * f),
      speed: a.speed,
      kind: a.kind,
      ref: a.ref,
      time: teacher.time,
      battery: 60 + (Math.abs(hash(kid.chip)) % 38),
    };
  }

  const timer = setInterval(() => {
    if (!teacher) return;
    cb({ teacher, kids: group.kids.map(kidAt), others: { ...others } });
  }, 1000);
  return () => {
    clearInterval(timer);
    sims.forEach((s) => s.stop());
  };
}

function hash(text) {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
