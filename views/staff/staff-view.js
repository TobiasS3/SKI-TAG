// Bergbahn-Ansicht (Leitstand): Karte mit allen Chips, Mitarbeitern und Einsätzen (roter Punkt).
// Tabs: Einsätze, Team, Lifte, Chips. Neuer Alarm für dich → Vollbild mit Annehmen / Weitergeben,
// sonst geht er nach 60 s automatisch an den nächsten freien Mitarbeiter.

import { h, reducedMotion, isWide } from '../../js/utils/dom.js';
import { t, translate } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { endSession } from '../../js/core/session.js';
import { go } from '../../js/core/router.js';
import { load, save, remove } from '../../js/core/storage.js';
import { api } from '../../js/services/api.js';
import { loadSkimap, nearestNode, route, placeLabel } from '../../js/services/slopes.js';
import { createMap, setMapStyle, limitToArea } from '../../js/map/map.js';
import { drawSkimap, drawRoute } from '../../js/map/layers.js';
import { alarmMarker, staffMarker } from '../../js/map/markers.js';
import { clock, isoDay, now as clockNow } from '../../js/utils/time.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { createSheet } from '../../js/components/panel.js';
import { createUserMenu } from '../../js/components/user-menu.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { mountAlarmList } from './alarm-list.js';
import { createIncoming, minutesSince, isOpen } from './alarm-detail.js';
import { mountTeam } from './team-panel.js';
import { mountLiftControl } from './lift-control.js';
import { mountChipList } from './chip-list.js';

const LOW_BATTERY = 20;

export async function mountStaff(root, session) {
  const cleanups = [];

  // --- Gerüst -------------------------------------------------------------------
  const mapEl = h('div', { class: 'map' });
  const clockLabel = h('span', { class: 'top-left-label', 'data-i18n': 'ops.live' });
  const clockValue = h('span', { class: 'num top-left-value' });
  const alarmBtn = h('button', { class: 'pill pill-alarms', onclick: () => sheet.open('alarms') });
  const windBtn = h('button', { class: 'pill pill-wind', hidden: true, onclick: () => sheet.open('lifts') });

  const sheet = createSheet({
    openHeight: () => {
      const top = page.querySelector('.topbar')?.getBoundingClientRect().bottom || 80;
      return Math.min(innerHeight - top - 12 - 46 - 14, 680);
    },
    tabs: [
      { id: 'alarms', label: 'ops.tab.alarms', icon: 'siren', badge: true },
      { id: 'team', label: 'ops.tab.team', icon: 'users' },
      { id: 'lifts', label: 'ops.tab.lifts', icon: 'gondola' },
      { id: 'chips', label: 'ops.tab.chips', icon: 'search' },
    ],
  });

  const fleetBtn = h('button', { class: 'icon-btn style-btn', onclick: () => toggleFleet() }, icon('eye'), h('span', { class: 'style-name' }));
  const styleBtn = h('button', { class: 'icon-btn style-btn', 'data-i18n-label': 'map.style', onclick: () => toggleStyle() },
    icon('layers'), h('span', { class: 'style-name' }));
  const locateBtn = h('button', { class: 'icon-btn locate-btn', 'data-i18n-label': 'ops.locateMe', onclick: () => ctx.focus(ctx.myPos(), 15) }, icon('locate'));

  const menu = createUserMenu({
    initial: (session.name || '?')[0],
    head: () => [
      h('p', { class: 'menu-who' }, h('strong', {}, `${ctx.me.name} · ${ctx.me.role}`), h('small', {}, ctx.me.station)),
      h('div', { class: 'menu-duty' },
        ['free', 'break'].map((s) => h('button', {
          class: 'seg-btn', 'aria-pressed': String((ctx.staffState[ctx.me.id] || 'free') === s),
          onclick: () => setDuty(s),
        }, icon(s === 'free' ? 'shield' : 'pause'), t(`ops.duty.${s}`)))),
    ],
    items: () => [
      ['sound', t(ctx.muted ? 'ops.sound.on' : 'ops.sound.off'), () => { ctx.muted = !ctx.muted; save('opsMuted', ctx.muted); }],
      ...(config.fakeData ? [
        ['siren', t('ops.test.alarm'), testAlarm],
        ['today', t('ops.test.reset'), resetDay],
      ] : []),
    ],
    onLogout: logout,
  });

  const page = h('main', { class: 'ops staff' },
    mapEl,
    h('header', { class: 'topbar' },
      h('img', { class: 'top-logo', src: 'assets/images/logo.svg', alt: 'Ski Tag', width: 34, height: 34 }),
      h('div', { class: 'top-time is-open' }, clockLabel, clockValue),
      h('span', { class: 'spacer' }),
      alarmBtn,
      windBtn,
      menu.el,
    ),
    h('div', { class: 'map-controls' }, fleetBtn, styleBtn, locateBtn),
    sheet.el,
  );
  root.append(page);
  cleanups.push(() => menu.destroy(), () => sheet.destroy());

  // --- Karte --------------------------------------------------------------------
  const map = createMap(mapEl);
  const [skimap, staffList, chips] = await Promise.all([loadSkimap(), api.getStaff(), api.getChips()]);
  const area = limitToArea(map, skimap);
  const me = staffList.find((s) => s.id === session.staff) || staffList[0];

  const ctx = {
    session, page, map, sheet, skimap,
    me,
    staff: staffList,
    chips,
    chipInfo: new Map(chips.map((c) => [c.id, c])),
    alarms: [],
    staffState: {},
    staffPos: {},
    fleet: new Map(),     // chip → letzte Position
    trails: new Map(),    // chip → letzte Positionen (für „Spur“)
    selected: null,       // ausgewählter Einsatz
    muted: load('opsMuted', false),
    myPos: () => ctx.staffPos[me.id]?.pos || [me.lat, me.lng],
    staffName: (id) => staffList.find((s) => s.id === id)?.name ?? '–',
    where: (pos) => placeLabel(pos) || t('ops.offPiste'),
    focus(pos, zoom = 16) {
      ctx.fit(L.latLngBounds([pos, pos]), zoom);
    },
    fit(bounds, maxZoom = 15.5) {
      map.flyToBounds(bounds, { ...mapPadding(), maxZoom, duration: reducedMotion() ? 0 : 0.9 });
    },
    selectAlarm: (id, opts) => selectAlarm(id, opts),
    selectChip: (id) => {
      sheet.open('chips');
      chipList.select(id);
    },
  };

  function mapPadding() {
    const desktop = isWide();
    const top = (page.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 80) + 8;
    const bottom = desktop ? 8 : sheet.visibleHeight() + 8;
    return { paddingTopLeft: [(desktop ? 452 : 0) + 30, top + 20], paddingBottomRight: [30, bottom + 20] };
  }

  const skiLayers = drawSkimap(map, skimap, {});
  cleanups.push(() => skiLayers.destroy());

  // Kartenstil: Schnee ↔ Gelände
  let mapStyle = setMapStyle(mapEl, load('mapStyle', 'winter'));
  function toggleStyle() {
    mapStyle = setMapStyle(mapEl, mapStyle === 'winter' ? 'terrain' : 'winter');
    renderButtons();
  }

  // --- Alle Chips als kleine Punkte -----------------------------------------------------
  map.createPane('fleet').style.zIndex = 440;
  const fleetCanvas = L.canvas({ pane: 'fleet', padding: 0.3, tolerance: 8 });
  const fleetLayer = L.layerGroup().addTo(map);
  const dots = new Map();
  let showFleet = load('opsFleet', true);
  if (!showFleet) fleetLayer.remove();

  function toggleFleet() {
    showFleet = !showFleet;
    save('opsFleet', showFleet);
    if (showFleet) fleetLayer.addTo(map);
    else fleetLayer.remove();
    renderButtons();
  }

  function renderButtons() {
    styleBtn.querySelector('.style-name').textContent = t(`map.style.${mapStyle === 'winter' ? 'terrain' : 'winter'}`);
    fleetBtn.querySelector('.style-name').textContent = t(showFleet ? 'ops.fleet.hide' : 'ops.fleet.show');
    fleetBtn.classList.toggle('is-on', !showFleet);
  }
  renderButtons();

  cleanups.push(api.watchFleet(chips, (list) => {
    const inAlarm = new Set(ctx.alarms.filter(isOpen).map((a) => a.chip));
    for (const p of list) {
      const pos = [p.lat, p.lng];
      ctx.fleet.set(p.chip, p);
      const trail = ctx.trails.get(p.chip) || [];
      trail.push(pos);
      if (trail.length > 150) trail.shift();
      ctx.trails.set(p.chip, trail);

      let dot = dots.get(p.chip);
      const kid = ctx.chipInfo.get(p.chip)?.kind === 'kid';
      const low = p.battery < LOW_BATTERY;
      if (!dot) {
        dot = L.circleMarker(pos, {
          renderer: fleetCanvas, radius: kid ? 4.5 : 5, weight: 2, color: '#fff', fillOpacity: 1,
        }).on('click', () => ctx.selectChip(p.chip)).addTo(fleetLayer);
        dot.bindTooltip(p.chip, { className: 'map-tip', direction: 'top', offset: [0, -6] });
        dots.set(p.chip, dot);
      }
      dot.setLatLng(pos);
      dot.setStyle({
        fillColor: low ? '#ff8a00' : kid ? '#8a5cf6' : '#2f6dff',
        opacity: inAlarm.has(p.chip) ? 0 : 1,
        fillOpacity: inAlarm.has(p.chip) ? 0 : 1,
      });
    }
    chipList.update();
  }));

  // --- Einsätze + Mitarbeiter auf der Karte ----------------------------------------------
  const alarmLayer = L.layerGroup().addTo(map);
  const alarmItems = new Map(); // id → { marker, line }
  const staffLayer = L.layerGroup().addTo(map);
  const staffMarkers = new Map();
  let routeLayer = null;
  let routeFor = null;

  function drawAlarms() {
    const open = ctx.alarms.filter(isOpen);
    const ids = new Set(open.map((a) => a.id));
    for (const [id, item] of alarmItems) {
      if (ids.has(id)) continue;
      item.marker.remove();
      item.line?.remove();
      alarmItems.delete(id);
    }
    for (const a of open) {
      let item = alarmItems.get(a.id);
      if (!item) {
        item = { marker: alarmMarker(a, '').on('click', () => selectAlarm(a.id, { fly: false })).addTo(alarmLayer), line: null };
        alarmItems.set(a.id, item);
      }
      item.marker.setLatLng(a.pos);
      const el = item.marker.getElement();
      if (el) {
        el.classList.toggle('is-new', a.status === 'new');
        el.classList.toggle('is-accepted', a.status === 'accepted');
        el.classList.toggle('is-onsite', a.status === 'onsite');
        el.classList.toggle('is-selected', ctx.selected === a.id);
        el.querySelector('.mk-alarm-label').textContent = markerLabel(a);
      }
      // Helfer unterwegs: gestrichelte Linie zum Einsatz
      if (a.status === 'accepted' && ctx.staffPos[a.staff]) {
        const from = ctx.staffPos[a.staff].pos;
        if (!item.line) {
          item.line = L.polyline([from, a.pos], {
            color: a.type === 'search' ? '#ff8a00' : '#e5322d', weight: 3, dashArray: '2 10', lineCap: 'round', interactive: false,
          }).addTo(alarmLayer);
        } else {
          item.line.setLatLngs([from, a.pos]);
        }
      } else if (item.line) {
        item.line.remove();
        item.line = null;
      }
    }
  }

  function markerLabel(a) {
    const kind = a.type === 'search' ? t('ops.search') : 'SOS';
    if (a.status === 'new') return `${kind} · ${minutesSince(a.at)} min`;
    if (a.status === 'onsite') return t('ops.mk.onsite', { name: ctx.staffName(a.staff) });
    return t('ops.mk.enroute', { name: ctx.staffName(a.staff) });
  }

  function drawStaff() {
    for (const s of staffList) {
      const pos = ctx.staffPos[s.id]?.pos || [s.lat, s.lng];
      let m = staffMarkers.get(s.id);
      if (!m) {
        m = staffMarker(pos, { ...s, meLabel: t('map.me') }, { me: s.id === me.id })
          .on('click', () => {
            sheet.open('team');
            ctx.focus(ctx.staffPos[s.id]?.pos || pos, 15);
          })
          .addTo(staffLayer);
        staffMarkers.set(s.id, m);
      }
      m.setLatLng(pos);
      const el = m.getElement();
      if (!el) continue;
      const busy = ctx.alarms.some((a) => a.staff === s.id && (a.status === 'accepted' || a.status === 'onsite'));
      el.classList.toggle('is-busy', busy);
      el.classList.toggle('is-break', !busy && ctx.staffState[s.id] === 'break');
    }
  }

  /** Eigene Route zum Einsatz (über Pisten und Lifte), sonst Luftlinie */
  function drawMyRoute() {
    const a = ctx.alarms.find((x) => x.staff === me.id && x.status === 'accepted');
    if (!a) {
      routeLayer?.remove();
      routeLayer = null;
      routeFor = null;
      return;
    }
    if (routeFor === a.id) return;
    routeLayer?.remove();
    routeFor = a.id;
    const r = route(ctx.myPos(), nearestNode(a.pos));
    const coords = r?.coords?.length ? [...r.coords, a.pos] : [ctx.myPos(), a.pos];
    routeLayer = drawRoute(map, coords);
  }

  function selectAlarm(id, { fly = true } = {}) {
    ctx.selected = id;
    sheet.open('alarms');
    alarmList.update(true);
    drawAlarms();
    const a = ctx.alarms.find((x) => x.id === id);
    if (!a || !fly) return;
    const helper = a.staff && isOpen(a) ? ctx.staffPos[a.staff]?.pos : null;
    if (helper) ctx.fit(L.latLngBounds([a.pos, helper]), 16);
    else ctx.focus(a.pos, 16);
  }

  // --- Tabs -----------------------------------------------------------------------------
  const alarmList = mountAlarmList(sheet.body('alarms'), ctx);
  const team = mountTeam(sheet.body('team'), ctx, { setDuty });
  const liftControl = mountLiftControl(sheet.body('lifts'), ctx);
  const chipList = mountChipList(sheet.body('chips'), ctx);
  cleanups.push(() => alarmList.destroy(), () => team.destroy(), () => liftControl.destroy(), () => chipList.destroy());

  // --- Neuer Alarm für mich: Vollbild -------------------------------------------------------
  const incoming = createIncoming(page, ctx, {
    onAccept: async (a) => {
      await api.alarmAction(a.id, 'accept', { staff: me.id });
      toast(t('ops.accepted.toast'), { icon: 'check' });
      selectAlarm(a.id);
    },
    onPass: async (a) => {
      await api.alarmAction(a.id, 'pass');
      toast(t('ops.passed.toast'), { icon: 'forward' });
    },
  });
  cleanups.push(() => incoming.destroy());

  // --- Einsätze live ----------------------------------------------------------------------
  let lastSig = '';
  const arrived = new Set();
  cleanups.push(api.watchAlarms(({ alarms, staffState, staffPos }) => {
    const before = new Map(ctx.alarms.map((a) => [a.id, a]));
    ctx.alarms = alarms;
    ctx.staffState = staffState;
    ctx.staffPos = staffPos;
    notifyChanges(before);
    // Selbst angekommen → erinnern, „Bin vor Ort“ zu drücken
    const mine = alarms.find((a) => a.staff === me.id && a.status === 'accepted');
    if (mine && staffPos[me.id]?.f >= 1 && !arrived.has(mine.id)) {
      arrived.add(mine.id);
      navigator.vibrate?.([120, 80, 120]);
      toast(t('ops.arrived.toast'), { icon: 'flag', ms: 6000 });
    }
    incoming.check();
    drawAlarms();
    drawStaff();
    drawMyRoute();
    // Listen nur neu bauen, wenn sich etwas geändert hat – sonst nur Zeiten nachziehen
    const sig = JSON.stringify(alarms.map((a) => [a.id, a.status, a.staff, a.log.length]).concat([staffState]));
    alarmList.update(sig !== lastSig);
    team.update(sig !== lastSig);
    lastSig = sig;
    renderTop();
  }, { me: me.id }));

  /** Kurze Meldungen, wenn sich bei fremden Einsätzen etwas tut */
  function notifyChanges(before) {
    for (const a of ctx.alarms) {
      const old = before.get(a.id);
      if (!old || before.size === 0) {
        if (before.size && a.staff !== me.id) toast(t('ops.toast.new', { id: a.id, name: ctx.staffName(a.staff) }), { icon: 'siren', ms: 5000 });
        continue;
      }
      if (old.status === a.status && old.staff === a.staff) continue;
      if (a.status === 'new' && old.staff === me.id && a.staff !== me.id) {
        toast(t('ops.toast.timeout', { name: ctx.staffName(a.staff) }), { icon: 'forward', ms: 6000 });
      } else if (a.staff !== me.id && a.status === 'onsite') {
        toast(t('ops.toast.onsite', { name: ctx.staffName(a.staff), id: a.id }), { icon: 'check' });
      } else if (a.status === 'done' && a.outcome === 'cancelled') {
        toast(t('ops.toast.cancelled', { id: a.id }), { icon: 'check', ms: 5000 });
      }
    }
  }

  // --- Kopfleiste ------------------------------------------------------------------------
  let wind = null;
  api.getWeather().then((w) => {
    wind = w?.wind || null;
    ctx.wind = wind;
    renderTop();
    liftControl.update();
  }).catch(() => {});

  function renderTop() {
    clockValue.textContent = clock(clockNow());
    const open = ctx.alarms.filter(isOpen);
    const waiting = open.filter((a) => a.status === 'new').length;
    alarmBtn.replaceChildren(icon('siren'), h('span', { class: 'num' }, String(open.length)));
    alarmBtn.classList.toggle('is-hot', waiting > 0);
    alarmBtn.classList.toggle('is-active', open.length > 0);
    alarmBtn.setAttribute('aria-label', t('ops.aria.alarms', { n: open.length }));
    sheet.badge('alarms', waiting > 0);
    if (wind) {
      windBtn.hidden = false;
      windBtn.classList.toggle('is-warn', wind.gusts >= 50);
      windBtn.replaceChildren(icon('wind'), h('span', { class: 'num' }, String(wind.gusts)), h('small', {}, 'km/h'));
      windBtn.setAttribute('aria-label', t('ops.aria.wind', { speed: wind.speed, gusts: wind.gusts, dir: wind.dir }));
      windBtn.title = t('ops.aria.wind', { speed: wind.speed, gusts: wind.gusts, dir: wind.dir });
    }
  }
  renderTop();

  // --- Menü-Aktionen ---------------------------------------------------------------------
  async function setDuty(value) {
    menu.close();
    await api.setStaffState(me.id, value);
    toast(t(value === 'break' ? 'ops.duty.breakToast' : 'ops.duty.freeToast'), { icon: value === 'break' ? 'pause' : 'shield' });
  }

  async function testAlarm() {
    // Irgendwo auf einer Piste im großen Gebiet
    const edges = skimap.edges.filter((e) => e.kind === 'piste' && skimap.nodeArea[e.a] === 0 && e.len > 300);
    const e = edges[Math.floor(Math.random() * edges.length)];
    const chip = chips[Math.floor(Math.random() * chips.length)].id;
    await api.sendSOS(chip, e.coords[Math.floor(e.coords.length / 2)]);
  }

  function resetDay() {
    remove(`ops-${isoDay()}`);
    remove('lift-override');
    location.reload();
  }

  async function logout() {
    const ok = await confirmModal({ title: t('logout.title'), text: t('ops.logout.text'), ok: t('logout.ok'), cancel: t('cancel') });
    if (!ok) return;
    endSession();
    go('login');
  }

  cleanups.push(on('sheet:expanded', () => setTimeout(() => map.invalidateSize(), 650)));
  cleanups.push(on('lang', () => {
    translate(page);
    renderTop();
    renderButtons();
    alarmList.update(true);
    team.update(true);
    liftControl.update();
    chipList.update(true);
  }));
  translate(page);

  setTimeout(() => ctx.fit(area.main, 14), reducedMotion() ? 0 : 150);

  return () => {
    cleanups.forEach((fn) => fn());
    map.remove();
  };
}
