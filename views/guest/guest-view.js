// Gäste-Ansicht: Karte + Kopfleiste + Suche + Bereich mit Tabs (Mein Tag, Route, Lifte, Wetter, Gruppe),
// dazu SOS-Knopf, Navigation und Kartenfilter (alles / nur Route / nur gefahrene Strecke).

import { h, reducedMotion, isWide } from '../../js/utils/dom.js';
import { t, toggleLang, translate } from '../../js/core/i18n.js';
import { on, emit } from '../../js/core/events.js';
import { endSession } from '../../js/core/session.js';
import { go } from '../../js/core/router.js';
import { load, save, remove } from '../../js/core/storage.js';
import { api } from '../../js/services/api.js';
import { loadSkimap, setClosedLifts, setClosedPistes } from '../../js/services/slopes.js';
import { createMap, setMapStyle, limitToArea } from '../../js/map/map.js';
import { bearing, distance as geoDistance } from '../../js/map/geo.js';
import { drawSkimap } from '../../js/map/layers.js';
import { meMarker, meetMarker } from '../../js/map/markers.js';
import { todayAt, isoDay, now as clockNow } from '../../js/utils/time.js';
import { temp } from '../../js/utils/format.js';
import { config } from '../../js/config.js';
import { icon } from '../../js/components/icons.js';
import { createSheet } from '../../js/components/panel.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { createSearch } from './search.js';
import { mountTracking } from './tracking.js';
import { mountRoutePanel } from './slopes-panel.js';
import { mountWeather, mountainStation, AVAL_COLORS } from './weather-panel.js';
import { mountGroup } from './group-panel.js';
import { mountLifts, liftList, liftState, isRunning, pisteList, pisteState } from './lifts-panel.js';
import { mountSOS } from './sos.js';
import { showChipConnect } from './chip-connect.js';
import { startNavigation } from './navigation.js';
import { showDayEnd } from './day-end.js';
import { mountLastLift } from './last-lift.js';
import { setMedia, logoHTML } from './place-media.js';

export async function mountGuest(root, session) {
  const cleanups = [];

  // --- Gerüst -------------------------------------------------------------------
  const mapEl = h('div', { class: 'map' });
  // Groß oben: wie lange das Skigebiet noch offen hat
  const leftLabel = h('span', { class: 'top-left-label' });
  const leftValue = h('span', { class: 'num top-left-value' });
  const timeBox = h('div', { class: 'top-time' }, leftLabel, leftValue);
  const liftsBtn = h('button', { class: 'pill pill-lifts', onclick: () => sheet.open('lifts') });
  const weatherBtn = h('button', { class: 'pill pill-weather', onclick: () => sheet.open('weather') });
  const menuBtn = h('button', { class: 'avatar-btn', 'data-i18n-label': 'top.menu', 'aria-expanded': 'false' }, (session.name || '?')[0]);
  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' });

  const sheet = createSheet({
    // Offen: so hoch, dass darüber Suche + eine Reihe Kartenknöpfe frei bleiben
    openHeight: () => {
      const search = page.querySelector('.search')?.getBoundingClientRect().bottom || 140;
      return Math.min(innerHeight - search - 12 - 46 - 14, 640);
    },
    tabs: [
      { id: 'day', label: 'tab.day', icon: 'today', badge: true },
      { id: 'route', label: 'tab.route', icon: 'route' },
      { id: 'lifts', label: 'tab.status', icon: 'gondola' },
      { id: 'weather', label: 'tab.weather', icon: 'sun' },
      { id: 'group', label: 'tab.group', icon: 'users' },
    ],
  });

  const locateBtn = h('button', { class: 'icon-btn locate-btn', 'data-i18n-label': 'map.locate', onclick: () => follow(true) }, icon('locate'));
  const styleBtn = h('button', { class: 'icon-btn style-btn', 'data-i18n-label': 'map.style', onclick: () => toggleStyle() },
    icon('layers'), h('span', { class: 'style-name' }));
  const focusBtn = h('button', { class: 'icon-btn style-btn focus-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    icon('eye'), h('span', { class: 'style-name' }));
  const focusMenu = h('div', { class: 'focus-menu', role: 'menu', hidden: true });

  const page = h('main', { class: 'guest' },
    mapEl,
    h('header', { class: 'topbar' },
      h('img', { class: 'top-logo', src: 'assets/images/logo.svg', alt: 'Ski Tag', width: 34, height: 34 }),
      timeBox,
      h('span', { class: 'spacer' }),
      liftsBtn,
      weatherBtn,
      h('div', { class: 'menu-wrap' }, menuBtn, menu),
    ),
    h('div', { class: 'map-controls' }, h('div', { class: 'focus-wrap' }, focusMenu, focusBtn), styleBtn, locateBtn),
    sheet.el,
  );
  root.append(page);

  // Chip-Verbindung sofort zeigen – überdeckt auch die Ladezeit
  let groupName = null;
  let ctx = null;
  const connecting = showChipConnect(page, session, () => ({ pos: ctx?.me.pos, battery: ctx?.me.battery, group: groupName }));

  // --- Karte --------------------------------------------------------------------
  const map = createMap(mapEl);
  const [skimap, media] = await Promise.all([loadSkimap(), api.getMedia()]);
  setMedia(media);
  const area = limitToArea(map, skimap);

  let following = false;
  ctx = {
    session,
    page,
    map,
    sheet,
    skimap,
    me: { pos: null, speed: 0, kind: 'walk', ref: null, time: null },
    focus(pos, zoom = 16) {
      ctx.fit(L.latLngBounds([pos, pos]), zoom);
    },
    /** Bereich zeigen, ohne dass er unter dem Sheet verschwindet */
    fit(bounds, maxZoom = 15.5) {
      follow(false);
      map.flyToBounds(bounds, { ...mapPadding(), maxZoom, duration: reducedMotion() ? 0 : 0.9 });
    },
    follow: (on, zoom) => follow(on, zoom),
  };

  function mapPadding() {
    const r = visibleRect();
    return { paddingTopLeft: [r.left + 30, r.top + 20], paddingBottomRight: [innerWidth - r.right + 30, innerHeight - r.bottom + 20] };
  }

  /** Der Teil der Karte, der gerade wirklich zu sehen ist (ohne Kopfleiste, Suche, Bereich, Navigation) */
  function visibleRect() {
    const desktop = isWide();
    const topEl = ['.nav-hud', '.nav-pill', '.search', '.topbar']
      .map((s) => page.querySelector(s)?.getBoundingClientRect())
      .find((b) => b && b.height > 0);
    let bottom = innerHeight;
    const navBar = page.querySelector('.nav-bar')?.getBoundingClientRect();
    if (navBar?.height) bottom = navBar.top;
    else if (!desktop) bottom = innerHeight - sheet.visibleHeight();
    return { left: desktop ? 452 : 0, right: innerWidth, top: (topEl?.bottom ?? 80) + 8, bottom: bottom - 8 };
  }

  /** Mittelpunkt für die Karte, damit pos genau in der Mitte des sichtbaren Teils liegt */
  function centerFor(pos, zoom) {
    const r = visibleRect();
    const half = map.getSize().divideBy(2);
    const offset = half.subtract(L.point((r.left + r.right) / 2, (r.top + r.bottom) / 2));
    return map.unproject(map.project(pos, zoom).add(offset), zoom);
  }

  const routePanel = mountRoutePanel(sheet.body('route'), ctx);
  const choose = (place) => {
    routePanel.setTarget(place);
    sheet.open('route');
  };
  ctx.choose = choose;
  ctx.navigateTo = (place) => routePanel.navigate(place);

  // Navigation
  let nav = null;
  ctx.startNavigation = ({ target, mode, onEnd }) => {
    nav?.stop();
    nav = startNavigation(ctx, {
      target, mode,
      onEnd: () => {
        nav = null;
        onEnd?.();
      },
    });
  };
  ctx.stopNavigation = () => nav?.stop(true);
  cleanups.push(() => nav?.stop());

  // Kartenstil: Schnee ↔ Gelände
  let mapStyle = setMapStyle(mapEl, load('mapStyle', 'winter'));
  const renderStyleBtn = () => {
    styleBtn.querySelector('.style-name').textContent = t(`map.style.${mapStyle === 'winter' ? 'terrain' : 'winter'}`);
  };
  function toggleStyle() {
    mapStyle = setMapStyle(mapEl, mapStyle === 'winter' ? 'terrain' : 'winter');
    renderStyleBtn();
  }
  renderStyleBtn();

  // Kartenfilter: alles / nur die Route / nur was ich heute gefahren bin
  const FOCUS = ['all', 'route', 'track'];
  let focus = 'all';
  let hasRoute = false;
  function setFocus(mode, { quiet = false } = {}) {
    if (mode === 'route' && !hasRoute) {
      if (!quiet) toast(t('focus.needRoute'), { icon: 'route' });
      return;
    }
    if (mode === 'track' && !tracking?.hasPoints() && !quiet) toast(t('focus.noTrack'), { icon: 'today' });
    focus = mode;
    FOCUS.forEach((f) => mapEl.classList.toggle(`focus-${f}`, f === focus && f !== 'all'));
    if (focus !== 'route') save('mapFocus', focus);
    renderFocus();
    emit('focus', focus);
  }
  function renderFocus() {
    focusBtn.querySelector('.style-name').textContent = t(`focus.${focus}`);
    focusBtn.classList.toggle('is-on', focus !== 'all');
    focusMenu.replaceChildren(...FOCUS.map((f) => h('button', {
      class: 'focus-item',
      role: 'menuitemradio',
      'aria-checked': String(f === focus),
      disabled: f === 'route' && !hasRoute ? true : null,
      onclick: () => { setFocus(f); closeFocus(); },
    }, icon({ all: 'map', route: 'route', track: 'today' }[f]),
    h('span', {}, h('strong', {}, t(`focus.${f}`)), h('small', {}, t(f === 'route' && !hasRoute ? 'focus.needRoute' : `focus.${f}.hint`))),
    f === focus ? icon('check') : null)));
  }
  const closeFocus = () => {
    focusMenu.hidden = true;
    focusBtn.setAttribute('aria-expanded', 'false');
  };
  focusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderFocus();
    focusMenu.hidden = !focusMenu.hidden;
    focusBtn.setAttribute('aria-expanded', String(!focusMenu.hidden));
  });
  ctx.setFocus = setFocus;
  ctx.mapFocus = () => focus;
  /** Route-Tab meldet: gibt es gerade eine Route auf der Karte? */
  ctx.routeShown = (on) => {
    hasRoute = on;
    if (!on && focus === 'route') setFocus('all');
    else renderFocus();
  };

  const skiLayers = drawSkimap(map, skimap, {
    onHut: (hut) => choose({ type: 'hut', name: hut.name, pos: hut.pos, node: hut.node, hut }),
    onLift: (lift, e) => choose({ type: 'lift', name: lift.name, sub: lift.typeName, pos: skimap.nodes[e.a], node: e.a, lift }),
    onPiste: (piste, e) => choose({
      type: 'piste', name: piste.name || `Piste ${piste.ref}`, ref: piste.ref, diff: piste.diff,
      pos: skimap.nodes[e.a], node: skimap.coreSet.has(e.a) ? e.a : e.b, piste,
    }),
    hutLogo: (hut) => logoHTML(hut.name),
  });
  cleanups.push(() => skiLayers.destroy());

  // Suche oben
  const search = createSearch({ onPick: choose });
  page.querySelector('.topbar').after(search.el);

  // --- Eigener Chip ---------------------------------------------------------------
  let marker = null;
  map.on('dragstart', () => follow(false));

  function follow(onOff, zoom) {
    following = onOff;
    locateBtn.classList.toggle('is-on', onOff);
    if (onOff && ctx.me.pos) {
      const z = zoom || Math.max(map.getZoom(), 16);
      map.flyTo(centerFor(ctx.me.pos, z), z, { duration: reducedMotion() ? 0 : 0.8 });
    }
  }

  // Start an der Talstation der Hahnenkammbahn (nur für den Fake-Chip)
  const valley = skimap.edges.find((e) => e.kind === 'lift' && skimap.lifts[e.ref].name === 'Hahnenkammbahn');
  let first = true;
  let lastPos = null;
  cleanups.push(api.watchChip(session.chip, (p) => {
    ctx.me = { pos: [p.lat, p.lng], alt: p.alt, speed: p.speed, kind: p.kind, ref: p.ref, time: p.time, battery: p.battery };
    if (!marker) marker = meMarker(ctx.me.pos, (session.name || '')[0]).addTo(map);
    else marker.setLatLng(ctx.me.pos);
    signalPing(p);
    if (first) {
      first = false;
      routePanel.refresh();
    }
    if (following) map.panTo(centerFor(ctx.me.pos, map.getZoom()), { animate: true, duration: 0.8 });
    emit('me', p);
  }, { start: valley?.a }));

  /** Neues Signal vom Chip: Funk-Ring + Richtungspfeil aus der Bewegung */
  function signalPing(p) {
    const el = marker?.getElement();
    if (!el) return;
    const pos = [p.lat, p.lng];
    if (lastPos && geoDistance(lastPos, pos) > 3) {
      el.style.setProperty('--heading', `${bearing(lastPos, pos)}deg`);
      el.classList.add('has-heading');
    } else if (p.speed < 0.5) {
      el.classList.remove('has-heading');
    }
    lastPos = pos;
    el.classList.remove('ping');
    void el.offsetWidth;
    el.classList.add('ping');
  }

  // --- Mein Tag: Vollbild und Tagesende ------------------------------------------------
  ctx.dayFullscreen = (on) => {
    if (page.classList.contains('day-full') === on) return;
    page.classList.toggle('day-full', on);
    if (on) sheet.select('day');
    emit('dayfull', on);
  };
  let dayEnd = null;
  /** Tag beendet → ab jetzt nur noch die Übersicht */
  ctx.endDay = (day, { animate = false } = {}) => {
    nav?.stop();
    dayEnd?.destroy();
    dayEnd = showDayEnd(page, { day, skimap, animate, onLogout: logout, onReset: config.fakeData ? resetDay : null });
  };
  cleanups.push(() => dayEnd?.destroy());

  // --- Tabs füllen -----------------------------------------------------------------
  const tracking = mountTracking(sheet.body('day'), ctx);
  cleanups.push(() => tracking.destroy(), () => routePanel.destroy());
  if (load('mapFocus', 'all') === 'track') setFocus('track', { quiet: true });

  const [weather, group, liftStatus, pisteStatus] = await Promise.all([
    api.getWeather().catch(() => null),
    session.group ? api.getGroup(session.group).catch(() => null) : null,
    api.getLiftStatus().catch(() => null),
    api.getPisteStatus().catch(() => null),
  ]);
  // Gesperrte Pisten meidet jede Route
  if (pisteStatus) {
    const shut = new Set();
    pisteList(skimap).forEach((x) => !pisteState(pisteStatus, x.piste).open && x.refs.forEach((r) => shut.add(r)));
    setClosedPistes([...shut]);
  }
  groupName = group?.name ?? null;

  // --- Treffpunkt der Gruppe ----------------------------------------------------------
  let meetLayer = null;
  ctx.meeting = session.group ? await api.getMeeting(session.group).catch(() => null) : null;
  /** Gespeicherten Treffpunkt wieder zu einem Ort machen (für die Ortskarte im Route-Tab) */
  ctx.meetingPlace = (m = ctx.meeting) => m && {
    type: m.type, name: m.name, pos: m.pos, node: m.node, sub: m.sub,
    hut: m.type === 'hut' ? skimap.huts.find((x) => x.name === m.name) : undefined,
    lift: m.type === 'lift' ? skimap.lifts.find((x) => x.name === m.name) : undefined,
  };
  function drawMeeting() {
    meetLayer?.remove();
    meetLayer = null;
    const m = ctx.meeting;
    if (!m) return;
    meetLayer = meetMarker(m.pos, m.time ? `${t('meet.title')} · ${m.time}` : t('meet.title'))
      .on('click', () => choose(ctx.meetingPlace()))
      .addTo(map);
  }
  /** Treffpunkt setzen (place + Uhrzeit) oder mit null aufheben */
  ctx.setMeeting = async (place, time = null) => {
    const m = place && {
      type: place.type, name: place.name, pos: place.pos, node: place.node, sub: place.sub ?? null, time, by: session.name,
    };
    await api.setMeeting(session.group, m);
    ctx.meeting = m;
    drawMeeting();
    emit('meeting', m);
    toast(m ? t('meet.set', { name: m.name }) : t('meet.cleared'), { icon: 'flag' });
  };
  drawMeeting();
  cleanups.push(() => meetLayer?.remove(), on('lang', drawMeeting));
  const weatherPanel = mountWeather(sheet.body('weather'), weather);
  const groupPanel = mountGroup(sheet.body('group'), ctx, group);
  const liftsPanel = mountLifts(sheet.body('lifts'), ctx, liftStatus, pisteStatus);
  const lifts = liftList(skimap);
  const lastLift = mountLastLift(page, ctx, liftStatus);
  cleanups.push(() => liftsPanel.destroy(), () => lastLift.destroy());
  const sos = mountSOS(page, ctx);
  cleanups.push(() => weatherPanel.destroy(), () => groupPanel.destroy(), () => sos.destroy());

  // --- Kopfleiste: Restzeit, Lifte, Wetter + Lawinen ---------------------------------
  function renderTop() {
    const now = clockNow();
    const opens = todayAt(config.resort.liftsOpen);
    const closes = todayAt(config.resort.liftsClose);
    const state = now < opens ? 'before' : now < closes ? 'open' : 'after';
    timeBox.className = `top-time is-${state}`;
    leftLabel.textContent = t(`top.left.${state}`);
    const rest = (state === 'before' ? opens - now : closes - now) / 60000;
    if (state === 'after') {
      leftValue.replaceChildren(t('top.closedShort'));
    } else if (rest >= 60) {
      leftValue.replaceChildren(`${Math.floor(rest / 60)}:${String(Math.floor(rest % 60)).padStart(2, '0')}`, h('small', {}, ' h'));
    } else {
      leftValue.replaceChildren(String(Math.max(1, Math.ceil(rest))), h('small', {}, ' min'));
    }
    timeBox.setAttribute('title', t('top.liftsUntil', { time: config.resort.liftsClose }));

    // Lifte: wie viele laufen gerade – Routen meiden die, die zu sind
    // (kurz gestoppt wegen Wind zählt nicht als zu – der fährt gleich wieder)
    if (liftStatus) {
      const passable = (l) => {
        const st = liftState(liftStatus, l.name, now);
        return isRunning(st) || st.state === 'hold';
      };
      setClosedLifts(skimap.lifts.map((l, i) => (passable(l) ? null : i)).filter((i) => i != null));
      const running = lifts.filter((x) => isRunning(liftState(liftStatus, x.lift.name, now))).length;
      liftsBtn.replaceChildren(icon('gondola'), h('span', { class: 'num' }, String(running)), h('small', { class: 'num' }, `/${lifts.length}`));
      liftsBtn.setAttribute('aria-label', t('lifts.aria', { n: running, total: lifts.length }));
      liftsBtn.classList.toggle('is-off', running === 0);
    } else {
      liftsBtn.hidden = true;
    }

    if (!weather) {
      weatherBtn.hidden = true;
      return;
    }
    const top = mountainStation(weather);
    const a = weather.avalanche;
    const lvl = a?.current ? a.levelAbove : null;
    weatherBtn.replaceChildren(icon(top.condition), h('span', { class: 'num' }, temp(top.temp)),
      h('span', { class: 'aval-mini num', style: { '--c': AVAL_COLORS[lvl || 0] }, title: t('aval.title') }, lvl ?? '–'));
    weatherBtn.setAttribute('aria-label', `${t('weather.title')}: ${temp(top.temp)}, ${t(`cond.${top.condition}`)}. `
      + (lvl ? `${t('aval.title')}: ${lvl}, ${t(`aval.level.${lvl}`)}` : `${t('aval.title')}: ${t('aval.noReport')}`));
  }
  renderTop();
  const clockTimer = setInterval(renderTop, 10000);
  cleanups.push(() => clearInterval(clockTimer));

  // --- Menü -------------------------------------------------------------------------
  function renderMenu() {
    menu.replaceChildren(
      h('p', { class: 'menu-who' }, h('strong', {}, session.name), h('small', {}, t('top.validUntil'))),
      h('div', { class: 'menu-chip' },
        h('span', { class: 'menu-chip-art', 'aria-hidden': 'true' }),
        h('span', {}, h('strong', { class: 'num' }, session.chip), h('small', {}, t('chip.connected'))),
        ctx.me.battery != null ? h('span', { class: 'menu-chip-bat num' }, `${ctx.me.battery}%`) : null),
      h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { toggleLang(); closeMenu(); } }, icon('globe'), t('lang.switch')),
      h('button', { class: 'menu-item', role: 'menuitem', onclick: logout }, icon('logout'), t('top.logout')),
      // Nur im Test-Modus: aufgezeichneten Tag löschen, um alles nochmal auszuprobieren
      config.fakeData ? h('button', { class: 'menu-item menu-test', role: 'menuitem', onclick: resetDay }, icon('today'), t('test.resetDay')) : null,
    );
  }
  const closeMenu = () => {
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderMenu();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  const onDocClick = (e) => {
    if (!menu.contains(e.target)) closeMenu();
    if (!focusMenu.contains(e.target)) closeFocus();
  };
  document.addEventListener('click', onDocClick);
  cleanups.push(() => document.removeEventListener('click', onDocClick));

  function resetDay() {
    remove(`day-${isoDay()}`);
    location.reload();
  }

  async function logout() {
    closeMenu();
    const ok = await confirmModal({ title: t('logout.title'), text: t('logout.text'), ok: t('logout.ok'), cancel: t('cancel') });
    if (!ok) return;
    endSession();
    go('login');
  }

  // Sheet auf/zu → Karte neu vermessen
  cleanups.push(on('sheet:expanded', () => setTimeout(() => map.invalidateSize(), 650)), () => sheet.destroy());

  cleanups.push(on('lang', () => {
    translate(page);
    renderTop();
    renderStyleBtn();
    renderFocus();
  }));
  renderFocus();
  translate(page);

  // Chip verbinden (einmal pro Login), danach Flug übers Skigebiet
  await connecting;
  setTimeout(() => ctx.fit(area.main, 14), reducedMotion() ? 0 : 150);

  return () => {
    cleanups.forEach((fn) => fn());
    map.remove();
  };
}
