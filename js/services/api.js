// Die EINZIGE Stelle, die weiß, woher die Daten kommen: Fake-Dateien oder echter Server.
// Wenn der Chip-Server fertig ist, wird nur diese Datei angepasst.

import { config } from '../config.js';
import { load, save, remove } from '../core/storage.js';

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// Fake-Chips brauchen das Pistennetz – erst laden, wenn wirklich gebraucht.
const fakeChip = () => import('./fake-chip.js');
const fakeSims = new Map(); // chipId → laufender Fake-Chip

export const api = {
  /** Code prüfen → { role, name, chip, group } oder null */
  async login(code) {
    if (config.fakeData) {
      const codes = await getJSON('data/fake/codes.json');
      return codes.find((c) => c.code === code) || null;
    }
    const res = await fetch(`${config.serverUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
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
      fakeChip().then(({ simulateChip }) => {
        if (stopped) return;
        sim = simulateChip({ seed: hash(chipId), ...options }, cb);
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
      const staff = await getJSON('data/fake/staff.json');
      const { distance } = await import('../map/geo.js');
      const ranked = staff
        .map((s) => ({ ...s, distance: distance(pos, [s.lat, s.lng]) }))
        .sort((a, b) => a.distance - b.distance);
      const nearest = ranked[0];
      await wait(900); // Server braucht kurz
      return {
        id: `SOS-${Date.now().toString(36).toUpperCase()}`,
        sentAt: Date.now(),
        staff: nearest,
        distance: nearest.distance,
        // Pistenrettung mit Skidoo/Ski: ca. 20 km/h + 2 min Start
        eta: 120 + nearest.distance / 5.5,
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
  getLiftStatus: () =>
    config.fakeData ? getJSON('data/fake/lift-status.json') : getJSON(`${config.serverUrl}/lifts`),

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
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function hash(text) {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
