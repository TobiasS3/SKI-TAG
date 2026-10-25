// Skischul-Ansicht: der Skilehrer sieht seine Kursgruppe live – jedes Kind trägt einen Chip.
// Kreis um den Lehrer = „Gruppe beisammen“. Wer länger draußen ist, wird orange und gemeldet.
// Tabs: Gruppe (Durchzählen, Kinder, Eltern), Kurs (Tagesplan, Abholung, Nachricht an Eltern), Skischule.
//
// Kein Notruf aus Versehen: Hängt ein Kind hinten, wird es zuerst nur angepiepst (Vibration am Chip).
// Erst wenn das nicht hilft, kann die Bergbahn um eine Suche gebeten werden.

import { h, reducedMotion, isWide } from '../../js/utils/dom.js';
import { t, translate, getLang } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { endSession } from '../../js/core/session.js';
import { go } from '../../js/core/router.js';
import { load } from '../../js/core/storage.js';
import { api } from '../../js/services/api.js';
import { loadSkimap, chipPlace } from '../../js/services/slopes.js';
import { createMap, setMapStyle, limitToArea } from '../../js/map/map.js';
import { drawSkimap } from '../../js/map/layers.js';
import { meMarker, kidMarker, alarmMarker } from '../../js/map/markers.js';
import { distance as geoDistance, bearing, compass } from '../../js/map/geo.js';
import { distance } from '../../js/utils/format.js';
import { todayAt, now as clockNow } from '../../js/utils/time.js';
import { icon, iconHTML } from '../../js/components/icons.js';
import { createSheet } from '../../js/components/panel.js';
import { createUserMenu } from '../../js/components/user-menu.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { mountKids } from './kids-panel.js';
import { mountCourse } from './course-panel.js';
import { mountSchoolPanel } from './school-panel.js';

const AWAY_AFTER_S = 6; // so lange außerhalb des Kreises, bis das Kind als „hängt hinten“ gilt

export async function mountSchool(root, session) {
  const cleanups = [];

  // --- Gerüst -------------------------------------------------------------------
  const mapEl = h('div', { class: 'map' });
  const groupLabel = h('span', { class: 'top-left-label' });
  const countValue = h('span', { class: 'num top-left-value' });
  const countBox = h('button', { class: 'top-time school-count', onclick: () => sheet.open('kids') }, groupLabel, countValue);
  const pickupBtn = h('button', { class: 'pill pill-pickup', onclick: () => sheet.open('course') });
  const gatherBtn = h('button', { class: 'pill pill-gather', 'data-i18n-label': 'school.gather', onclick: () => gather() }, icon('vibrate'));

  const sheet = createSheet({
    openHeight: () => {
      const top = page.querySelector('.away-banner:not([hidden])')?.getBoundingClientRect().bottom
        || page.querySelector('.topbar')?.getBoundingClientRect().bottom || 80;
      return Math.min(innerHeight - top - 12 - 46 - 14, 680);
    },
    tabs: [
      { id: 'kids', label: 'school.tab.kids', icon: 'users', badge: true },
      { id: 'course', label: 'school.tab.course', icon: 'clock' },
      { id: 'school', label: 'school.tab.school', icon: 'cap' },
    ],
  });

  const groupBtn = h('button', { class: 'icon-btn style-btn', onclick: () => fitGroup() }, icon('headcount'), h('span', { class: 'style-name', 'data-i18n': 'school.showGroup' }));
  const styleBtn = h('button', { class: 'icon-btn style-btn', 'data-i18n-label': 'map.style', onclick: () => toggleStyle() },
    icon('layers'), h('span', { class: 'style-name' }));
  const locateBtn = h('button', { class: 'icon-btn locate-btn', 'data-i18n-label': 'map.locate', onclick: () => follow(true) }, icon('locate'));

  const awayBanner = h('div', { class: 'away-banner', hidden: true, role: 'status', 'aria-live': 'polite' });
  const sosBanner = h('div', { class: 'school-sos', hidden: true, role: 'alert' });

  const menu = createUserMenu({
    initial: (session.name || '?')[0],
    head: () => [
      h('p', { class: 'menu-who' }, h('strong', {}, `${session.name} · ${ctx.group.name}`), h('small', {}, ctx.school.name)),
    ],
    items: () => [
      ['phone', t('school.callOffice'), () => { location.href = `tel:${ctx.school.phone.replace(/\s/g, '')}`; }],
    ],
    onLogout: logout,
  });

  const page = h('main', { class: 'ops school' },
    mapEl,
    h('header', { class: 'topbar' },
      h('img', { class: 'top-logo', src: 'assets/images/logo.svg', alt: 'Ski Tag', width: 34, height: 34 }),
      countBox,
      h('span', { class: 'spacer' }),
      pickupBtn,
      gatherBtn,
      menu.el,
    ),
    awayBanner,
    sosBanner,
    h('div', { class: 'map-controls' }, groupBtn, styleBtn, locateBtn),
    sheet.el,
  );
  root.append(page);
  cleanups.push(() => menu.destroy(), () => sheet.destroy());

  // --- Daten + Karte --------------------------------------------------------------
  const map = createMap(mapEl);
  const [skimap, school] = await Promise.all([loadSkimap(), api.getSchool(session.school)]);
  const area = limitToArea(map, skimap);
  const group = school.groups[session.group];

  const ctx = {
    session, page, map, sheet, skimap, school, group,
    groupId: session.group,
    kids: group.kids,
    live: new Map(),       // chip → letzte Position
    teacher: null,         // eigene Position
    others: {},            // andere Gruppen: id → Position des Lehrers
    away: new Map(),       // chip → seit wann außerhalb (ms)
    alarms: [],
    selected: null,
    headcounts: [],        // { at, present, total, missing: [Namen] }
    distTo: (chip) => {
      const p = ctx.live.get(chip);
      return p && ctx.teacher ? geoDistance([p.lat, p.lng], [ctx.teacher.lat, ctx.teacher.lng]) : null;
    },
    isAway: (chip) => ctx.away.has(chip) && Date.now() - ctx.away.get(chip) > AWAY_AFTER_S * 1000,
    where: (p) => (p ? chipPlace(p) || t('ops.offPiste') : '–'),
    focus(pos, zoom = 16) {
      following = false;
      locateBtn.classList.remove('is-on');
      map.flyToBounds(L.latLngBounds([pos, pos]), { ...mapPadding(), maxZoom: zoom, duration: reducedMotion() ? 0 : 0.9 });
    },
    selectKid: (chip) => {
      ctx.selected = chip;
      sheet.open('kids');
      kidsPanel.update(true);
      drawKids();
      const p = ctx.live.get(chip);
      if (p) ctx.focus([p.lat, p.lng], 16.5);
    },
    signal: async (chips) => {
      await api.signalChips(chips);
      navigator.vibrate?.(60);
    },
    requestSearch: (kid) => requestSearch(kid),
  };

  function mapPadding() {
    const desktop = isWide();
    const top = (page.querySelector('.away-banner:not([hidden])') || page.querySelector('.topbar')).getBoundingClientRect().bottom + 8;
    const bottom = desktop ? 8 : sheet.visibleHeight() + 8;
    return { paddingTopLeft: [(desktop ? 452 : 0) + 40, top + 30], paddingBottomRight: [40, bottom + 30] };
  }

  const skiLayers = drawSkimap(map, skimap, {});
  cleanups.push(() => skiLayers.destroy());

  let mapStyle = setMapStyle(mapEl, load('mapStyle', 'winter'));
  function toggleStyle() {
    mapStyle = setMapStyle(mapEl, mapStyle === 'winter' ? 'terrain' : 'winter');
    renderButtons();
  }
  function renderButtons() {
    styleBtn.querySelector('.style-name').textContent = t(`map.style.${mapStyle === 'winter' ? 'terrain' : 'winter'}`);
  }
  renderButtons();

  // --- Lehrer, Kreis, Kinder, andere Gruppen --------------------------------------------
  let following = true;
  locateBtn.classList.add('is-on');
  map.on('dragstart', () => {
    following = false;
    locateBtn.classList.remove('is-on');
  });
  function follow(onOff) {
    following = onOff;
    locateBtn.classList.toggle('is-on', onOff);
    if (onOff) fitGroup();
  }

  /** Lehrer + alle Kinder ins Bild */
  function fitGroup() {
    const pts = [...ctx.live.values()].map((p) => [p.lat, p.lng]);
    if (ctx.teacher) pts.push([ctx.teacher.lat, ctx.teacher.lng]);
    if (!pts.length) return;
    map.flyToBounds(L.latLngBounds(pts), { ...mapPadding(), maxZoom: 16.5, duration: reducedMotion() ? 0 : 0.9 });
  }

  let meMk = null;
  const ring = L.circle(group.start, {
    radius: group.radius, color: '#2f6dff', weight: 2, dashArray: '6 8', fillColor: '#2f6dff', fillOpacity: 0.06, interactive: false,
  }).addTo(map);
  const kidMarkers = new Map();
  const kidLines = L.layerGroup().addTo(map);
  const otherMarkers = new Map();

  function drawKids() {
    for (const kid of ctx.kids) {
      const p = ctx.live.get(kid.chip);
      if (!p) continue;
      let m = kidMarkers.get(kid.chip);
      if (!m) {
        m = kidMarker([p.lat, p.lng], kid).on('click', () => ctx.selectKid(kid.chip)).addTo(map);
        kidMarkers.set(kid.chip, m);
      }
      m.setLatLng([p.lat, p.lng]);
      const el = m.getElement();
      el?.classList.toggle('is-away', ctx.isAway(kid.chip));
      el?.classList.toggle('is-selected', ctx.selected === kid.chip);
    }
    // Wer weit weg ist: gestrichelte Linie vom Lehrer zum Kind
    kidLines.clearLayers();
    if (!ctx.teacher) return;
    for (const kid of ctx.kids) {
      const p = ctx.live.get(kid.chip);
      if (!p || !ctx.isAway(kid.chip)) continue;
      L.polyline([[ctx.teacher.lat, ctx.teacher.lng], [p.lat, p.lng]], {
        color: '#ff8a00', weight: 3, dashArray: '2 9', lineCap: 'round', interactive: false,
      }).addTo(kidLines);
    }
  }

  function drawOthers() {
    for (const [id, p] of Object.entries(ctx.others)) {
      const g = school.groups[id];
      let m = otherMarkers.get(id);
      if (!m) {
        m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: 'mk-group',
            html: `<span style="--c:${g.color}">${iconHTML('cap')}</span><b>${escapeHTML(g.name)} · ${escapeHTML(g.teacher)}</b>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          zIndexOffset: 700,
        }).on('click', () => {
          sheet.open('school');
          ctx.focus([ctx.others[id].lat, ctx.others[id].lng], 15);
        }).addTo(map);
        otherMarkers.set(id, m);
      }
      m.setLatLng([p.lat, p.lng]);
    }
  }

  // --- Live-Daten ------------------------------------------------------------------------
  let lastAwayKey = '';
  cleanups.push(api.watchCourse(school, session.group, ({ teacher, kids, others }) => {
    ctx.teacher = teacher;
    ctx.others = others;
    const tp = [teacher.lat, teacher.lng];
    if (!meMk) meMk = meMarker(tp, (session.name || '')[0]).addTo(map);
    else meMk.setLatLng(tp);
    ring.setLatLng(tp);

    for (const p of kids) {
      ctx.live.set(p.chip, p);
      const out = geoDistance([p.lat, p.lng], tp) > group.radius;
      if (out && !ctx.away.has(p.chip)) ctx.away.set(p.chip, Date.now());
      if (!out) ctx.away.delete(p.chip);
    }
    const awayKids = ctx.kids.filter((k) => ctx.isAway(k.chip));
    ring.setStyle(awayKids.length
      ? { color: '#ff8a00', fillColor: '#ff8a00', fillOpacity: 0.08 }
      : { color: '#2f6dff', fillColor: '#2f6dff', fillOpacity: 0.06 });

    // Neu abgehängt → Vibration + Banner
    const key = awayKids.map((k) => k.chip).join();
    if (key !== lastAwayKey) {
      if (awayKids.some((k) => !lastAwayKey.includes(k.chip))) navigator.vibrate?.([200, 100, 200]);
      lastAwayKey = key;
      kidsPanel.update(true);
    }
    renderAway(awayKids);
    drawKids();
    drawOthers();
    renderTop();
    kidsPanel.update(false);
    schoolPanel.update();
    // Mitfahren: nur nachführen, wenn jemand aus dem Bild zu fahren droht
    if (following) {
      const pts = L.latLngBounds([tp, ...kids.map((p) => [p.lat, p.lng])]);
      if (!map.getBounds().pad(-0.2).contains(pts)) {
        map.fitBounds(pts, { ...mapPadding(), maxZoom: 16.5, animate: true, duration: 0.8 });
      }
    }
  }));

  // SOS am Chip eines Kindes, eigene Suchaufträge
  const alarmLayer = L.layerGroup().addTo(map);
  cleanups.push(api.watchAlarms(({ alarms }) => {
    const chips = new Set(ctx.kids.map((k) => k.chip));
    ctx.alarms = alarms.filter((a) => chips.has(a.chip) && a.status !== 'done');
    alarmLayer.clearLayers();
    ctx.alarms.forEach((a) => alarmMarker(a, a.type === 'search' ? t('ops.search') : 'SOS').addTo(alarmLayer));
    renderSOS();
    kidsPanel.update(false);
  }));

  // --- Banner -----------------------------------------------------------------------------
  function renderAway(awayKids) {
    const was = !awayBanner.hidden;
    awayBanner.hidden = !awayKids.length;
    page.classList.toggle('has-away', awayKids.length > 0);
    if (!awayKids.length) return;
    const far = awayKids
      .map((k) => ({ k, d: ctx.distTo(k.chip), p: ctx.live.get(k.chip) }))
      .sort((a, b) => b.d - a.d)[0];
    const dir = compass(bearing([ctx.teacher.lat, ctx.teacher.lng], [far.p.lat, far.p.lng]), getLang());
    awayBanner.replaceChildren(
      h('span', { class: 'away-icon' }, icon('alert')),
      h('span', { class: 'away-text' },
        h('strong', {}, awayKids.length > 1
          ? t('school.away.many', { name: far.k.name, n: awayKids.length - 1 })
          : t('school.away.one', { name: far.k.name })),
        h('small', {}, t('school.away.where', { dist: distance(far.d), dir, place: ctx.where(far.p) }))),
      h('button', { class: 'away-btn', onclick: () => beep(awayKids) }, icon('vibrate'), h('span', {}, t('school.beep'))),
      h('button', { class: 'away-btn is-quiet', 'aria-label': t('school.show'), onclick: () => ctx.selectKid(far.k.chip) }, icon('locate')));
    if (!was) sheet.badge('kids', true);
  }

  function renderSOS() {
    const a = ctx.alarms.find((x) => x.type === 'sos');
    sosBanner.hidden = !a;
    if (!a) return;
    const kid = ctx.kids.find((k) => k.chip === a.chip);
    sosBanner.replaceChildren(
      h('span', { class: 'school-sos-live' }, h('i'), 'SOS'),
      h('span', { class: 'away-text' },
        h('strong', {}, t('school.sos.title', { name: kid.name })),
        h('small', {}, a.status === 'new' ? t('school.sos.new') : t('school.sos.coming'))),
      h('button', { class: 'away-btn', onclick: () => ctx.selectKid(kid.chip) }, icon('locate'), h('span', {}, t('school.show'))));
  }

  async function beep(kids) {
    await ctx.signal(kids.map((k) => k.chip));
    toast(kids.length > 1 ? t('school.beeped.many', { n: kids.length }) : t('school.beeped', { name: kids[0].name }), { icon: 'vibrate' });
  }

  async function gather() {
    await ctx.signal(ctx.kids.map((k) => k.chip));
    toast(t('school.gathered'), { icon: 'vibrate' });
  }

  async function requestSearch(kid) {
    const ok = await confirmModal({
      title: t('school.search.title', { name: kid.name }), text: t('school.search.text'),
      ok: t('school.search.ok'), cancel: t('cancel'),
    });
    if (!ok) return;
    const p = ctx.live.get(kid.chip);
    await api.requestSearch({
      chip: kid.chip, name: kid.name, pos: [p.lat, p.lng], by: `${session.name} (${group.name})`,
      phone: group.phone || school.phone, battery: p.battery,
    });
    toast(t('school.search.sent'), { icon: 'search', ms: 5000 });
  }

  // --- Kopfleiste ------------------------------------------------------------------------
  function renderTop() {
    const total = ctx.kids.length;
    const near = ctx.kids.filter((k) => ctx.live.has(k.chip) && !ctx.isAway(k.chip)).length;
    groupLabel.textContent = group.name;
    countValue.replaceChildren(String(near), h('small', {}, `/${total}`));
    countBox.classList.toggle('is-open', near === total);
    countBox.classList.toggle('is-missing', near < total);
    countBox.setAttribute('aria-label', t('school.aria.count', { n: near, total }));
    sheet.badge('kids', near < total);

    const now = clockNow();
    const pickup = todayAt(group.pickup.time);
    const left = (pickup - now) / 60000;
    pickupBtn.replaceChildren(icon('clock'),
      left > 0
        ? h('span', { class: 'num' }, left >= 60 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : `${Math.ceil(left)}′`)
        : h('span', {}, t('school.pickup.now')));
    pickupBtn.setAttribute('aria-label', t('school.pickup.aria', { time: group.pickup.time, place: group.pickup.place }));
    pickupBtn.title = t('school.pickup.aria', { time: group.pickup.time, place: group.pickup.place });
    pickupBtn.classList.toggle('is-soon', left > 0 && left < 30);
  }

  // --- Tabs -----------------------------------------------------------------------------
  const kidsPanel = mountKids(sheet.body('kids'), ctx);
  const course = mountCourse(sheet.body('course'), ctx);
  const schoolPanel = mountSchoolPanel(sheet.body('school'), ctx);
  cleanups.push(() => kidsPanel.destroy(), () => course.destroy(), () => schoolPanel.destroy());

  async function logout() {
    const ok = await confirmModal({ title: t('logout.title'), text: t('school.logout.text'), ok: t('logout.ok'), cancel: t('cancel') });
    if (!ok) return;
    endSession();
    go('login');
  }

  cleanups.push(on('sheet:expanded', () => setTimeout(() => map.invalidateSize(), 650)));
  cleanups.push(on('lang', () => {
    translate(page);
    renderTop();
    renderButtons();
    kidsPanel.update(true);
    course.update();
    schoolPanel.update(true);
  }));
  translate(page);
  renderTop();

  setTimeout(() => {
    if (!ctx.teacher) map.flyToBounds(area.main, { ...mapPadding(), duration: reducedMotion() ? 0 : 0.9 });
  }, 150);

  return () => {
    cleanups.forEach((fn) => fn());
    map.remove();
  };
}

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
