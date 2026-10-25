// Punkte auf der Karte: du selbst, deine Gruppe, Hütten, Ziel-Fahne – und für Bergbahn/Skischule:
// Einsätze (roter Punkt), Mitarbeiter, Kinder im Skikurs.

import { iconHTML } from '../components/icons.js';

/** Du: großer blauer Punkt mit Richtungspfeil, Puls und Funk-Ring bei jedem Signal. */
export function meMarker(pos, initial = '') {
  return L.marker(pos, {
    icon: L.divIcon({
      className: 'mk-me',
      html: `<span class="mk-me-ping"></span><span class="mk-me-pulse"></span>
             <span class="mk-me-arrow"></span><span class="mk-me-dot">${escape(initial)}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    }),
    zIndexOffset: 1000,
    keyboard: false,
  });
}

/** Jemand aus der Gruppe: Anfangsbuchstabe in eigener Farbe. */
export function friendMarker(pos, member) {
  return L.marker(pos, {
    icon: L.divIcon({
      className: `mk-friend${member.kid ? ' is-kid' : ''}`,
      html: `<span style="--c:${member.color}">${member.name[0]}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    }),
    zIndexOffset: 900,
    title: member.name,
  });
}

/** Hütte: Logo (oder Haus-Symbol), Name ab Zoom 15. */
export function hutMarker(hut, logo = '') {
  return L.marker(hut.pos, {
    icon: L.divIcon({
      className: `sk mk-hut${logo ? ' has-logo' : ''}`,
      html: `<span class="mk-hut-badge">${logo || iconHTML('hut')}</span><span class="mk-label">${escape(hut.name)}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
    title: hut.name,
    riseOnHover: true,
  });
}

/** Pistennummer wie auf den Schildern: runde Scheibe in Pistenfarbe. */
export function pisteDisc(pos, piste) {
  return L.marker(pos, {
    icon: L.divIcon({
      className: `sk mk-disc diff-${piste.diff}`,
      html: `<span>${escape(piste.ref)}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    interactive: false,
    keyboard: false,
  });
}

/** Treffpunkt der Gruppe: grüne Fahne mit Schild „Treffpunkt · 12:30“. */
export function meetMarker(pos, label) {
  return L.marker(pos, {
    icon: L.divIcon({
      className: 'mk-meet',
      html: `<span class="mk-meet-pin">${iconHTML('flag')}</span><b>${escape(label)}</b>`,
      iconSize: [40, 48],
      iconAnchor: [20, 46],
    }),
    zIndexOffset: 850,
    keyboard: false,
  });
}

/** Ziel einer Route. */
export function goalMarker(pos) {
  return L.marker(pos, {
    icon: L.divIcon({
      className: 'mk-goal',
      html: `<span>${iconHTML('flag')}</span>`,
      iconSize: [40, 48],
      iconAnchor: [20, 46],
    }),
    zIndexOffset: 800,
    interactive: false,
  });
}

/**
 * Einsatz: großer roter Punkt mit Wellen (SOS) oder orange (Suche). label = „SOS · 3 min“.
 * Zustand über Klassen: is-new (pulsiert stark), is-accepted, is-onsite, is-mine.
 */
export function alarmMarker(alarm, label) {
  return L.marker(alarm.pos, {
    icon: L.divIcon({
      className: `mk-alarm is-${alarm.type}`,
      html: `<span class="mk-alarm-wave"></span><span class="mk-alarm-wave"></span>
             <span class="mk-alarm-dot">${iconHTML(alarm.type === 'search' ? 'search' : 'siren')}</span>
             <b class="mk-alarm-label">${escape(label)}</b>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    }),
    zIndexOffset: 2000,
    title: alarm.id,
  });
}

/** Mitarbeiter: dunkles Quadrat mit Anfangsbuchstaben, Ring in Statusfarbe (frei / Einsatz / Pause). */
export function staffMarker(pos, staff, { me = false } = {}) {
  return L.marker(pos, {
    icon: L.divIcon({
      className: `mk-staff${me ? ' is-me' : ''}`,
      html: `<span class="mk-staff-dot">${escape(staff.name[0])}</span><b class="mk-staff-name">${escape(me ? staff.meLabel || staff.name : staff.name)}</b>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    }),
    zIndexOffset: me ? 1500 : 1100,
    title: staff.name,
  });
}

/** Kind im Skikurs: Punkt in eigener Farbe mit Namen. */
export function kidMarker(pos, kid) {
  return L.marker(pos, {
    icon: L.divIcon({
      className: 'mk-kid',
      html: `<span class="mk-kid-dot" style="--c:${kid.color}">${escape(kid.name[0])}</span><b class="mk-kid-name">${escape(kid.name)}</b>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
    zIndexOffset: 950,
    title: kid.name,
  });
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
