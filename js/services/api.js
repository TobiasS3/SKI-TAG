// Die EINZIGE Stelle, die weiß, woher die Daten kommen: Fake-Dateien oder echter Server.
// Wenn der Chip-Server fertig ist, wird nur diese Datei angepasst.

import { config } from '../config.js';
import { load, save, remove } from '../core/storage.js';

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** Name säubern: „  noah   b “ → „Noah B“ */
const cleanName = (s) => s.trim().replace(/\s+/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// Fake-Chips brauchen das Pistennetz – erst laden, wenn wirklich gebraucht.
const fakeChip = () => import('./fake-chip.js');
const fakeSims = new Map(); // chipId → laufender Fake-Chip
const fakeLast = new Map(); // chipId → letzte Position (für Fake-Kinder, die jemandem hinterherfahren)
const fakeOps = () => import('./fake-ops.js'); // Fake-Server für Bergbahn und Skischule

export const api = {
  /**
   * Code + Name prüfen → { role, name, chip, group }, 'name' (Code gibt's, Name passt nicht) oder null
   */
  async login(code, name) {
    if (config.fakeData) {
      const codes = await getJSON('data/fake/codes.json');
      const user = codes.find((c) => c.code === code);
      // Test-Codes nehmen jeden Namen – so heißt man beim Testen, wie man will (z. B. „Noah B“).
      // Der echte Server prüft den Namen gegen den Mietbeleg.
      return user ? { ...user, name: cleanName(name) } : null;
    }
    const res = await fetch(`${config.serverUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    });
    if (res.status === 403) return 'name';
    return res.ok ? res.json() : null;
  },

  /** Pisten, Lifte, Hütten + Netz (aus OpenStreetMap, siehe tools/build-skimap.py) */
  getSkimap: () => getJSON('data/skimap/kitzski.json'),

  /**
   * Wetter: live von Open-Meteo, Lawinen live vom Lawinenwarndienst Tirol.
   * Ohne Internet → Fake-Wetter mit Hinweis „Beispieldaten“.
   */
  async getWeather() {
    if (config.liveWeather) {
      try {
        const { loadLiveWeather, loadAvalanche } = await import('./weather.js');
        const [weather, avalanche] = await Promise.all([
          loadLiveWeather(),
          loadAvalanche().catch(() => null),
        ]);
        return { ...weather, avalanche };
      } catch {
        /* weiter mit Fake-Daten */
      }
    }
    const fake = await getJSON('data/fake/weather.json');
    return { ...fake, fallback: true };
  },

  async getGroup(id) {
    if (config.fakeData) {
      const group = (await getJSON('data/fake/groups.json'))[id];
      if (!group) return null;
      // Unterwegs dazugekommene Freunde (im Browser gespeichert)
      return { ...group, members: [...group.members, ...load(`gextra-${id}`, [])] };
    }
    return getJSON(`${config.serverUrl}/groups/${id}`);
  },

  /** Eigener Freundes-Code (4 Ziffern) – den gibt man weiter, wenn man sich am Berg trifft */
  async getFriendCode(chipId) {
    if (config.fakeData) {
      const codes = await getJSON('data/fake/friends.json');
      return Object.keys(codes).find((c) => codes[c].chip === chipId) || String(1000 + (Math.abs(hash(chipId)) % 9000));
    }
    return (await getJSON(`${config.serverUrl}/chips/${chipId}/friend-code`)).code;
  },

  /**
   * Freund per Code zur Gruppe holen. → { ok, member } oder { ok: false, error: 'unknown' | 'already' }
   * Echt: Der andere muss die Anfrage am eigenen Handy/Chip bestätigen.
   */
  async addFriend(groupId, code, members) {
    if (config.fakeData) {
      await wait(900);
      const found = (await getJSON('data/fake/friends.json'))[code];
      if (!found) return { ok: false, error: 'unknown' };
      if (members.some((m) => m.chip === found.chip)) return { ok: false, error: 'already' };
      const extra = load(`gextra-${groupId}`, []);
      save(`gextra-${groupId}`, [...extra, found]);
      return { ok: true, member: found };
    }
    const res = await fetch(`${config.serverUrl}/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    return res.ok ? { ok: true, member: await res.json() } : { ok: false, error: res.status === 409 ? 'already' : 'unknown' };
  },

  /**
   * Position eines Chips laufend verfolgen. cb({ lat, lng, speed, kind, time })
   * Gibt eine Funktion zum Beenden zurück.
   */
  watchChip(chipId, cb, options = {}) {
    if (config.fakeData) {
      let sim = null;
      let stopped = false;
      Promise.all([fakeChip(), getJSON('data/fake/groups.json')]).then(([{ simulateChip, simulateFollower }, groups]) => {
        if (stopped) return;
        const emit = (p) => {
          fakeLast.set(chipId, p);
          cb(p);
        };
        // In groups.json z. B. "fake": { "follows": "CHIP-0042" } → fährt dieser Person hinterher
        const follows = Object.values(groups).flatMap((g) => g.members).find((m) => m.chip === chipId)?.fake?.follows;
        sim = follows
          ? simulateFollower({ seed: hash(chipId), lead: () => fakeLast.get(follows) }, emit)
          : simulateChip({ seed: hash(chipId), ...options }, emit);
        fakeSims.set(chipId, sim);
      });
      return () => {
        stopped = true;
        sim?.stop();
        if (fakeSims.get(chipId) === sim) fakeSims.delete(chipId);
      };
    }
    // Später: Server-Sent Events oder WebSocket vom Server
    const source = new EventSource(`${config.serverUrl}/chips/${chipId}/stream`);
    source.onmessage = (msg) => cb(JSON.parse(msg.data));
    return () => source.close();
  },

  /** Mitarbeiter der Bergbahn mit Position */
  getStaff: () =>
    config.fakeData ? getJSON('data/fake/staff.json') : getJSON(`${config.serverUrl}/staff`),

  /**
   * NOTRUF absetzen. Der Server schickt den Alarm an den nächsten Mitarbeiter.
   * Ergebnis: { id, sentAt, staff: { name, role, station, lat, lng }, distance (m), eta (s) }
   */
  async sendSOS(chipId, pos) {
    if (config.fakeData) {
      // Landet im Fake-Einsatz-Speicher → ein Bergbahn-Tab im selben Browser bekommt den Alarm
      const { createAlarm } = await fakeOps();
      const { alarm, staff } = await createAlarm({ type: 'sos', source: 'app', chip: chipId, pos });
      await wait(900); // Server braucht kurz
      const distance = staff ? (await import('../map/geo.js')).distance(pos, [staff.lat, staff.lng]) : 0;
      return {
        id: alarm.id,
        sentAt: Date.now(),
        staff,
        distance,
        // Pistenrettung mit Skidoo/Ski: ca. 20 km/h + 2 min Start
        eta: 120 + distance / 5.5,
      };
    }
    const res = await fetch(`${config.serverUrl}/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chip: chipId, lat: pos[0], lng: pos[1] }),
    });
    if (!res.ok) throw new Error('SOS fehlgeschlagen');
    return res.json();
  },

  /** Notruf zurücknehmen („Mir geht's gut“). */
  async cancelSOS(id) {
    if (config.fakeData) {
      const { updateAlarm } = await fakeOps();
      await updateAlarm(id, 'done', { outcome: 'cancelled' });
      await wait(400);
      return { ok: true };
    }
    const res = await fetch(`${config.serverUrl}/sos/${id}`, { method: 'DELETE' });
    return { ok: res.ok };
  },

  /**
   * Navigation läuft zu diesem Ziel (Knoten im Pistennetz), null = beendet.
   * Echter Chip: nichts zu tun – der Gast fährt selbst. Fake-Chip: fährt jetzt dorthin.
   */
  guide(chipId, node, mode = 'fast') {
    if (config.fakeData) fakeSims.get(chipId)?.goTo(node, mode);
  },

  /**
   * Liftstatus: je Lift Öffnungszeiten und ob er läuft.
   * { updatedAt, default: { open, close }, lifts: { "Name": { open?, close?, status?, reason?, note? } } }
   * status: fehlt = nach Uhrzeit, "hold" = kurz gestoppt, "closed" = heute zu
   */
  async getLiftStatus() {
    if (!config.fakeData) return getJSON(`${config.serverUrl}/lifts`);
    // Von der Bergbahn umgeschaltete Lifte (im Browser gespeichert) gehen vor
    const status = await getJSON('data/fake/lift-status.json');
    const lifts = { ...status.lifts };
    for (const [name, entry] of Object.entries(load('lift-override', {}))) lifts[name] = { ...lifts[name], ...entry };
    return { ...status, lifts };
  },

  /**
   * Bergbahn schaltet einen Lift um: { status: 'hold' | 'closed', reason } oder null = läuft normal.
   */
  async setLiftStatus(name, entry) {
    if (config.fakeData) {
      const changed = load('lift-override', {});
      // null = läuft wieder normal nach Uhrzeit
      changed[name] = entry ? { ...entry, by: 'staff' } : { status: null, reason: null, by: 'staff' };
      save('lift-override', changed);
      return { ok: true };
    }
    const res = await fetch(`${config.serverUrl}/lifts/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return { ok: res.ok };
  },

  /**
   * Treffpunkt der Gruppe: { name, pos, node, time ("12:30" oder null), by (Name) } oder null.
   * Fake: im Browser gespeichert. Später: Server verteilt ihn an alle in der Gruppe.
   */
  async getMeeting(groupId) {
    if (config.fakeData) return load(`meet-${groupId}`, null);
    return getJSON(`${config.serverUrl}/groups/${groupId}/meeting`);
  },

  async setMeeting(groupId, meeting) {
    if (config.fakeData) {
      if (meeting) save(`meet-${groupId}`, meeting);
      else remove(`meet-${groupId}`);
      return { ok: true };
    }
    const res = await fetch(`${config.serverUrl}/groups/${groupId}/meeting`, {
      method: meeting ? 'PUT' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: meeting ? JSON.stringify(meeting) : undefined,
    });
    return { ok: res.ok };
  },

  /**
   * Pistenstatus: { updatedAt, groomedAt, pistes: { "Name": { status?, reason?, groomed?, note? } } }
   * Pisten ohne Eintrag: offen und präpariert. status "closed" = zu (reason: race | snow | season | wind)
   * note: moguls (Buckelpiste) | route (Skiroute, nicht präpariert) | icy (eisig)
   */
  getPisteStatus: () =>
    config.fakeData ? getJSON('data/fake/piste-status.json') : getJSON(`${config.serverUrl}/pistes`),

  /** Bilder/Logos zu Hütten und Bahnen (siehe tools/fetch-place-media.py) */
  getMedia: () => getJSON('data/skimap/media.json').catch(() => ({})),

  /** Vibrationssignal an die Chips der Gruppe (kein Notruf!) */
  async signalGroup(groupId, chipId) {
    if (config.fakeData) return { ok: true };
    const res = await fetch(`${config.serverUrl}/groups/${groupId}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chip: chipId }),
    });
    return { ok: res.ok };
  },

  // --- Bergbahn & Skischule ------------------------------------------------------------

  /** Alle vermieteten Chips heute: [{ id, rental, kind: 'adult' | 'kid', point, since }] */
  getChips: () =>
    config.fakeData ? getJSON('data/fake/chips.json') : getJSON(`${config.serverUrl}/chips`),

  /** Alle Chips am Berg live. cb([{ chip, lat, lng, alt, speed, kind, ref, battery, time }]) */
  watchFleet(chips, cb) {
    if (config.fakeData) return stopLater(fakeOps().then(({ watchFleet }) => watchFleet(chips, cb)));
    const source = new EventSource(`${config.serverUrl}/chips/stream`);
    source.onmessage = (msg) => cb(JSON.parse(msg.data));
    return () => source.close();
  },

  /**
   * Einsätze (SOS + Suchaufträge) live. cb({ alarms, staffState, staffPos })
   * alarm: { id, type: 'sos' | 'search', source, chip, pos, at, status: 'new' | 'accepted' | 'onsite' | 'done',
   *          staff, offered, offeredAt, acceptedAt, onsiteAt, doneAt, eta (s), outcome, log: [{ at, key, vars }] }
   */
  watchAlarms(cb, options = {}) {
    if (config.fakeData) return stopLater(fakeOps().then(({ watchAlarms }) => watchAlarms(cb, options)));
    const source = new EventSource(`${config.serverUrl}/alarms/stream`);
    source.onmessage = (msg) => cb(JSON.parse(msg.data));
    return () => source.close();
  },

  /** Einsatz weiterbringen: action = 'accept' | 'pass' | 'onsite' | 'done' | 'note' */
  async alarmAction(id, action, extra = {}) {
    if (config.fakeData) {
      const { updateAlarm } = await fakeOps();
      await wait(250);
      return updateAlarm(id, action, extra);
    }
    const res = await fetch(`${config.serverUrl}/alarms/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra),
    });
    return res.ok ? res.json() : null;
  },

  /**
   * Skischule bittet die Bergbahn, ein Kind zu suchen. Kein Notruf – ein Suchauftrag (orange).
   * data: { chip, name, pos, by, phone, group }
   */
  async requestSearch(data) {
    if (config.fakeData) {
      const { createAlarm } = await fakeOps();
      return (await createAlarm({ type: 'search', source: 'school', ...data })).alarm;
    }
    const res = await fetch(`${config.serverUrl}/alarms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'search', ...data }),
    });
    return res.ok ? res.json() : null;
  },

  /** Mitarbeiter im Dienst oder in Pause ('free' | 'break') – in Pause bekommt man keine Alarme */
  async setStaffState(id, value) {
    if (config.fakeData) return (await fakeOps()).setStaffState(id, value);
    return fetch(`${config.serverUrl}/staff/${id}/state`, { method: 'PUT', body: value });
  },

  /** Vibrationssignal an einzelne Chips (Skischule: „Anpiepsen“, Bergbahn: Chip finden) */
  async signalChips(chips) {
    if (config.fakeData) {
      (await fakeOps()).signal(chips);
      return { ok: true };
    }
    const res = await fetch(`${config.serverUrl}/chips/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chips }),
    });
    return { ok: res.ok };
  },

  /** Skischule mit Gruppen, Kindern, Tagesplan */
  async getSchool(id) {
    if (config.fakeData) return (await getJSON('data/fake/school.json'))[id] || null;
    return getJSON(`${config.serverUrl}/schools/${id}`);
  },

  /** Skikurs live: cb({ teacher, kids: [...], others: { gruppe: pos } }) */
  watchCourse(school, groupId, cb) {
    if (config.fakeData) return stopLater(fakeOps().then(({ watchCourse }) => watchCourse(school, groupId, cb)));
    const source = new EventSource(`${config.serverUrl}/schools/groups/${groupId}/stream`);
    source.onmessage = (msg) => cb(JSON.parse(msg.data));
    return () => source.close();
  },

  /** Nachricht an alle Eltern der Gruppe (SMS/Push) */
  async messageParents(groupId, text) {
    if (config.fakeData) {
      await wait(700);
      return { ok: true };
    }
    const res = await fetch(`${config.serverUrl}/schools/groups/${groupId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return { ok: res.ok };
  },
};

/** Für Fake-Module, die erst geladen werden: Stopp-Funktion sofort zurückgeben, Stopp später ausführen. */
function stopLater(promise) {
  let stop = null;
  let stopped = false;
  promise.then((fn) => {
    if (stopped) fn();
    else stop = fn;
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function hash(text) {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
