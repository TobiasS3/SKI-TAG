// Gäste-Ansicht: Karte + Kopfleiste + Suche + Bereich mit Tabs (Mein Tag, Route, Gruppe),
// dazu SOS-Knopf und Kartenfilter (alles / nur Route / nur gefahrene Strecke).
// Lifte und Wetter öffnen sich als Fenster über die Knöpfe in der Kopfleiste.

import { h, reducedMotion, isWide } from '../../js/utils/dom.js';
import { t, toggleLang, translate, getLang } from '../../js/core/i18n.js';
import { on, emit } from '../../js/core/events.js';
import { endSession } from '../../js/core/session.js';
import { go } from '../../js/core/router.js';
import { load, save, clearAll } from '../../js/core/storage.js';
import { api } from '../../js/services/api.js';
import { loadSkimap, setClosedLifts, setClosedPistes } from '../../js/services/slopes.js';
import { createMap, limitToArea } from '../../js/map/map.js';
import { bearing, distance as geoDistance } from '../../js/map/geo.js';
import { drawSkimap } from '../../js/map/layers.js';
import { meMarker, meetMarker } from '../../js/map/markers.js';
import { todayAt, isoDay, now as clockNow } from '../../js/utils/time.js';
import { temp } from '../../js/utils/format.js';
import { config } from '../../js/config.js';
import { icon, iconHTML, liftIcon } from '../../js/components/icons.js';
import { createSheet } from '../../js/components/panel.js';
import { confirmModal, infoModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { createSearch } from './search.js';
import { mountTracking } from './tracking.js';
import { mountRoutePanel, pisteName } from './slopes-panel.js';
import { mountWeather, mountainStation, AVAL_COLORS } from './weather-panel.js';
import { mountGroup } from './group-panel.js';
import { mountLifts, liftList, liftState, isRunning, pisteList, pisteState } from './lifts-panel.js';
import { mountSOS } from './sos.js';
import { showChipConnect } from './chip-connect.js';
import { showDayEnd } from './day-end.js';
import { mountLastLift } from './last-lift.js';
import { setMedia } from './place-media.js';

export async function mountGuest(root, session) {
  const cleanups = [];

  // --- Gerüst -------------------------------------------------------------------
  const mapEl = h('div', { class: 'map' });
  // Groß oben: wie lange das Skigebiet noch offen hat
  const leftLabel = h('span', { class: 'top-left-label' });
  const leftValue = h('span', { class: 'num top-left-value' });
  const timeBox = h('div', { class: 'top-time' }, leftLabel, leftValue);
  const liftsBtn = h('button', { class: 'pill pill-lifts', onclick: () => openInfo('lifts', liftsBtn) });
  const weatherBtn = h('button', { class: 'pill pill-weather', onclick: () => openInfo('weather', weatherBtn) });
  // Chip-Knopf: Akku sofort sichtbar, antippen öffnet Chip, Zugang und Sprache
  const menuBtn = h('button', { class: 'pill pill-chip', 'aria-expanded': 'false', 'aria-haspopup': 'menu' });
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
      { id: 'group', label: 'tab.group', icon: 'users', badge: true },
    ],
  });

  const locateBtn = h('button', { class: 'icon-btn locate-btn', 'data-i18n-label': 'map.locate', onclick: () => follow(true) }, icon('locate'));
  const focusBtn = h('button', { class: 'icon-btn style-btn focus-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    icon('eye'), h('span', { class: 'style-name' }));
  const focusMenu = h('div', { class: 'focus-menu', role: 'menu', hidden: true });

  // Gibt es eine Route, steht dieser Knopf auf der Karte (wie der Kartenfilter: Auge + was gerade zu sehen ist).
  // Route anzeigen → automatisch „Nur Route“; antippen zeigt wieder alles.
  const routeChip = h('button', {
    class: 'icon-btn style-btn route-chip',
    hidden: true,
    onclick: () => {
      const turnOn = focus !== 'route';
      setFocus(turnOn ? 'route' : 'all');
      if (turnOn) routePanel.showOnMap();
    },
  }, icon('eye'), h('span', { class: 'style-name' }));

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
    h('div', { class: 'map-controls' }, routeChip, h('div', { class: 'focus-wrap' }, focusMenu, focusBtn), locateBtn),
    sheet.el,
  );
  root.append(page);

  // Chip-Verbindung sofort zeigen – überdeckt auch die Ladezeit
  let groupName = null;
  let ctx = null;
  const connecting = showChipConnect(page, session, () => ({ pos: ctx?.me.pos, battery: ctx?.me.battery, group: groupName }));

  // --- Karte --------------------------------------------------------------------
  const map = createMap(mapEl, { painted: true });
  const [skimap, media] = await Promise.all([loadSkimap(), api.getMedia()]);
  setMedia(media);
  const area = limitToArea(map, skimap);

  let following = false;
  let shownBattery; // zuletzt im Chip-Knopf gezeigter Akkustand
  let menuReady = false; // Chip-Knopf erst zeichnen, wenn das Menü steht
  ctx = {
    connected: connecting, // Promise: Chip-Verbindungs-Bildschirm ist weg (Meldungen erst danach)
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
    /** Karte sanft mitziehen, sodass pos in der Mitte des sichtbaren Teils bleibt */
    panTo(pos) {
      map.panTo(centerFor(pos, map.getZoom()), { animate: true, duration: 0.8 });
    },
  };

  function mapPadding() {
    const r = visibleRect();
    return { paddingTopLeft: [r.left + 30, r.top + 20], paddingBottomRight: [innerWidth - r.right + 30, innerHeight - r.bottom + 20] };
  }

  /** Der Teil der Karte, der gerade wirklich zu sehen ist (ohne Kopfleiste, Suche und Bereich) */
  function visibleRect() {
    const desktop = isWide();
    const topEl = ['.search', '.topbar']
      .map((s) => page.querySelector(s)?.getBoundingClientRect())
      .find((b) => b && b.height > 0);
    const bottom = desktop ? innerHeight : innerHeight - sheet.visibleHeight();
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
    closeInfo?.();
    search?.closeGroup(); // eine Route ersetzt die markierte Gruppe
    sheet.open('route'); // Bereich sofort auf, dann erst die Karte bewegen
    routePanel.setTarget(place);
  };
  ctx.choose = choose;
  /** Antippen: Bereich auf, Karte fliegt hin, Ort zeigen. Route erst auf Knopfdruck. */
  const show = (place) => {
    closeInfo?.();
    sheet.open(sheet.current()); // Bereich auf, aber im selben Tab bleiben
    routePanel.showPlace(place);
  };
  ctx.show = show;

  // Lifte + Wetter: Inhalt bleibt bestehen, das Fenster hängt ihn nur ein
  const infoBodies = { lifts: h('section', { class: 'sheet-pane' }), weather: h('section', { class: 'sheet-pane' }) };
  let closeInfo = null;
  function openInfo(id, from) {
    closeInfo?.();
    closeInfo = infoModal({
      from,
      body: infoBodies[id],
      label: t(id === 'lifts' ? 'tab.status' : 'tab.weather'),
      closeLabel: t('close'),
      onClose: () => { closeInfo = null; },
    });
  }
  cleanups.push(() => closeInfo?.());

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
    routeChip.hidden = !hasRoute;
    routeChip.classList.toggle('is-on', focus === 'route');
    routeChip.setAttribute('aria-pressed', String(focus === 'route'));
    routeChip.querySelector('.style-name').textContent = t(focus === 'route' ? 'focus.route' : 'focus.all');
    focusBtn.parentElement.hidden = hasRoute;
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
  let focusBeforeRoute = null;
  ctx.routeShown = (on) => {
    const was = hasRoute;
    hasRoute = on;
    mapEl.classList.toggle('has-route', on); // Während einer Route stehen nur ihre eigenen Schilder da
    if (on && !was) {
      search.closeGroup(); // markierte Gruppe aus der Schnellsuche weicht der Route
      // Neue Route: Karte zeigt gleich nur die Route
      focusBeforeRoute = focus;
      setFocus('route', { quiet: true });
    } else if (!on && was) {
      setFocus(focusBeforeRoute === 'track' ? 'track' : 'all', { quiet: true });
      focusBeforeRoute = null;
    } else {
      renderFocus();
    }
  };

  // Antippen auf der Karte
  const skiHandlers = {
    refined: true, // ohne Stationen, Lift-Schilder zum Antippen, weiche Pistenübergänge
    towns: [['Kitzbühel', [47.4467, 12.3919]], ['Kirchberg', [47.4433, 12.3167]], ['Aurach', [47.4089, 12.4136]], ['Jochberg', [47.3772, 12.4203]], ['Mittersill', [47.2817, 12.4817]]],
    // Kabinen fahren nur auf Liften, die wirklich laufen
    liftRuns: (lift) => !ctx.liftStatus || isRunning(liftState(ctx.liftStatus, lift.name, clockNow())),
    onHut: (hut) => show({ type: 'hut', name: hut.name, pos: hut.pos, node: hut.node, hut }),
    onParking: (p) => show({ type: 'parking', name: p.name, sub: `${p.station} · ${p.town}`, pos: p.pos, node: p.node, parking: p }),
    onLift: (lift, e) => show({ type: 'lift', name: lift.name, sub: lift.typeName, pos: skimap.nodes[e.a], node: e.a, lift }),
    onPiste: (piste, e) => show({
      type: 'piste', name: pisteName(piste), ref: piste.ref, diff: piste.diff,
      pos: skimap.nodes[e.a], node: skimap.coreSet.has(e.a) ? e.a : e.b, piste,
    }),
  };
  const skiLayers = drawSkimap(map, skimap, skiHandlers);
  cleanups.push(() => skiLayers.destroy());

  // Suche oben
  // Vorschlag-Gruppe (z. B. alle Talabfahrten) leuchtet auf der Karte auf
  let groupLayer = null;
  let groupDeclutter = () => {};
  const DIFF_COLOR = { easy: '#1f66d1', intermediate: '#e0242f', advanced: '#0e0e10', expert: '#0e0e10', freeride: '#f08a24' };
  function showGroup(items, sg, all = [], { filter = null, focus = false } = {}) {
    groupLayer?.remove();
    groupLayer = null;
    mapEl.classList.toggle('has-group', !!items);
    if (!items) return;
    // Neue Gruppe: ein offener Ort und der große Bereich gehen weg, damit man die Karte sieht
    routePanel.closePreview();
    sheet.collapse();
    const layers = [];
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const sign = (pos, cls, html, z = 0) => L.marker(pos, {
      pane: 'routeSigns', interactive: false, keyboard: false, zIndexOffset: z,
      icon: L.divIcon({ className: `mk-rsign ${cls}`, html: `<span>${html}</span>`, iconSize: [0, 0] }),
    });
    if (!map.getPane('routeSigns')) map.createPane('routeSigns').style.zIndex = 445;
    // P-Schild für einen Parkplatz, Name immer daneben, antippen öffnet ihn
    const parkSign = (p) => L.marker(p.pos, {
      pane: 'routeSigns', zIndexOffset: 550, keyboard: false,
      icon: L.divIcon({ className: 'mk-gpark', html: `<span class="mk-park-badge">P</span><b>${esc(p.name)}</b>`, iconSize: [0, 0] }),
    }).on('click', () => show(p));
    const parks = new Set(); // jeden Parkplatz nur einmal
    for (const x of items) {
      if (x.type === 'parking') {
        parks.add(x.parking.osm);
        layers.push(parkSign(x));
        continue;
      }
      if (x.type === 'hut') {
        // Hütte: dasselbe Holzschild wie auf der Karte, Name immer daneben, antippen öffnet sie
        layers.push(L.marker(x.pos, {
          pane: 'routeSigns', zIndexOffset: 600, keyboard: false,
          icon: L.divIcon({ className: 'mk-ghut', html: `<span class="mk-ghut-pin"></span><b>${esc(x.name)}</b>`, iconSize: [0, 0] }),
        }).on('click', () => show(x)));
        continue;
      }
      if (x.type === 'lift') {
        // Lift: dunkle Linie mit weißen Punkten, Schild in der Mitte
        layers.push(
          L.polyline(x.lift.coords, { pane: 'route', color: '#fff', weight: 11, interactive: false }),
          L.polyline(x.lift.coords, { pane: 'route', color: '#0e1530', weight: 7, interactive: false }),
          L.polyline(x.lift.coords, { pane: 'route', color: '#fff', weight: 2.5, dashArray: '1 8', lineCap: 'round', interactive: false }),
          sign(x.lift.coords[Math.floor(x.lift.coords.length / 2)], 'is-lift is-always',
            `${x.lift.code ? `<i>${esc(x.lift.code)}</i>` : iconHTML(liftIcon(x.lift.type))}<b>${esc(x.name)}</b>`, 500),
        );
        continue;
      }
      if (!x.lines) continue;
      layers.push(
        L.polyline(x.lines, { pane: 'route', color: '#fff', weight: 12, opacity: 1, lineCap: 'round', interactive: false }),
        L.polyline(x.lines, { pane: 'route', color: DIFF_COLOR[x.diff] || '#1f66d1', weight: 7, lineCap: 'round', interactive: false }),
      );
      // Unten: Punkt, wo man im Tal ankommt, mit Nummer und Name
      if (x.loPos) {
        layers.push(L.circleMarker(x.loPos, { pane: 'route', radius: 7, color: '#fff', weight: 3, fillColor: '#0b1226', fillOpacity: 1, interactive: false }));
        layers.push(sign(x.loPos, `is-piste is-end${items.length === 1 ? ' is-always' : ''}`, `<i class="diff-${x.diff}">${esc(x.ref || '')}</i><b>${esc(x.name)}</b>`, 400));
      }
      // Ziel Parkplatz: unten das P-Schild dazu (bei einer einzelnen Abfahrt immer)
      if (x.park && (filter === 'park' || focus) && !parks.has(x.park.parking.osm)) {
        parks.add(x.park.parking.osm);
        layers.push(parkSign(x.park));
      }
    }
    // Talabfahrten: dazu die Gondeln, die unten wieder hinauffahren
    // (nicht beim Ziel Parkplatz/Kassa – da will man heim, nicht wieder hinauf)
    if (sg?.id === 'valley' && filter !== 'park' && filter !== 'kassa') {
      const ends = items.map((x) => x.loPos).filter(Boolean);
      const lifts = all.filter((l) => l.type === 'lift' && l.low && ends.some((e) => geoDistance(e, l.low) < 300));
      for (const l of lifts) {
        layers.push(
          L.polyline(l.lift.coords, { pane: 'route', color: '#0e1530', weight: 6, interactive: false }),
          L.polyline(l.lift.coords, { pane: 'route', color: '#fff', weight: 2.2, dashArray: '1 7', lineCap: 'round', interactive: false }),
        );
        const mid = l.lift.coords[Math.floor(l.lift.coords.length / 2)];
        layers.push(sign(mid, 'is-lift', `${l.lift.code ? `<i>${esc(l.lift.code)}</i>` : iconHTML(liftIcon(l.lift.type))}<b>${esc(l.name)}</b>`, 500));
      }
    }
    // Ziel Kassa: Schild an der Talstation, wo der Chip zurückgegeben wird
    let kassaPos = null;
    if (sg?.id === 'valley' && filter === 'kassa' && rental) {
      const st = all.find((l) => l.type === 'lift' && l.name === rental);
      kassaPos = st?.low || null;
      if (st?.low) layers.push(sign(st.low, 'is-kassa is-always', `${iconHTML('flag')}<b>${esc(t('search.kassaSign', { name: rental }))}</b>`, 600));
    }
    groupLayer = L.layerGroup(layers).addTo(map);
    // Namen dürfen sich nicht überdecken: was zuerst in der Liste steht, gewinnt
    const declutter = () => {
      const placed = [];
      // Kassa-Schild gewinnt immer, dann die Reihenfolge der Liste
      [...mapEl.querySelectorAll('.mk-rsign.is-kassa span'), ...mapEl.querySelectorAll('.mk-ghut b, .mk-gpark b, .mk-rsign:not(.is-kassa) span')].forEach((label) => {
        label.style.visibility = '';
        const r = label.getBoundingClientRect();
        if (placed.some((q) => r.left < q.right + 4 && r.right > q.left - 4 && r.top < q.bottom + 2 && r.bottom > q.top - 2)) label.style.visibility = 'hidden';
        else placed.push(r);
      });
    };
    map.off('zoomend', groupDeclutter);
    groupDeclutter = declutter;
    map.on('zoomend', declutter);
    setTimeout(declutter, 1000);
    const bounds = L.latLngBounds(items.flatMap((x) => [
      ...(x.lines ? x.lines.flat() : x.type === 'lift' ? x.lift.coords : [x.pos]),
      ...(x.park && (filter === 'park' || focus) ? [x.park.pos] : []),
    ]));
    if (kassaPos) bounds.extend(L.latLng(kassaPos).toBounds(500)); // Kassa-Schild mit Platz fürs Schild
    if (!bounds.isValid()) return;
    // Liste bleibt oben offen: Karte zeigt die Pisten im freien Teil darunter
    requestAnimationFrame(() => {
      const top = search.el.querySelector('.search-results')?.getBoundingClientRect().bottom || 200;
      follow(false);
      // Einzelner Ort: mehr Rand, damit Namensschilder und SOS-Knopf nichts verdecken
      const side = focus ? 70 : 30;
      map.flyToBounds(bounds, {
        paddingTopLeft: [side, top + 16],
        paddingBottomRight: [side, sheet.visibleHeight() + (focus ? 80 : 24)],
        maxZoom: focus ? 16 : 15, // ein einzelner Ort darf näher ran
        duration: reducedMotion() ? 0 : 0.9,
      });
    });
  }
  cleanups.push(() => groupLayer?.remove());
  /** Aus der Schnellsuche: Ort öffnen (Infos, Route), die Gruppe bleibt markiert */
  const showFromSearch = (item) => show(item);
  // Wo wurde der Chip gemietet? Dort ist am Abend die Kassa für die Rückgabe
  const rental = session.rental || (config.fakeData ? 'Hahnenkammbahn' : null);
  const search = createSearch({ onPick: choose, onShow: showFromSearch, onGroup: showGroup, getPos: () => ctx.me.pos, rental });
  page.querySelector('.topbar').after(search.el);
  cleanups.push(() => search.destroy());

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
    if (p.battery !== shownBattery && menuReady) renderChip();
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
    closeInfo?.();
    routePanel.stop();
    dayEnd?.destroy();
    dayEnd = showDayEnd(page, { day, skimap, animate, name: session.name, onLogout: logout, onReset: config.fakeData ? resetDay : null });
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
  ctx.liftStatus = liftStatus; // Route-Tab zeigt bei jedem Lift, ob und bis wann er fährt
  ctx.pisteStatus = pisteStatus; // … und bei Pisten, ob sie offen sind

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
      .on('click', () => show(ctx.meetingPlace()))
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
  const weatherPanel = mountWeather(infoBodies.weather, weather);
  const groupPanel = mountGroup(sheet.body('group'), ctx, group);
  const liftsPanel = mountLifts(infoBodies.lifts, ctx, liftStatus, pisteStatus);
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
      liftsBtn.replaceChildren(
        h('span', { class: 'pill-label' }, t('tab.status')),
        h('span', { class: 'pill-row' }, icon('gondola'), h('span', { class: 'num' }, String(running)), h('small', { class: 'num' }, `/${lifts.length}`)),
        icon('maximize', 'pill-more'));
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
    weatherBtn.replaceChildren(
      h('span', { class: 'pill-label' }, t('tab.weather')),
      h('span', { class: 'pill-row' }, icon(top.condition), h('span', { class: 'num' }, temp(top.temp)),
        lvl ? h('span', { class: 'aval-mini num', style: { '--c': AVAL_COLORS[lvl] }, title: t('aval.title') }, lvl) : null),
      icon('maximize', 'pill-more'));
    weatherBtn.setAttribute('aria-label', `${t('weather.title')}: ${temp(top.temp)}, ${t(`cond.${top.condition}`)}. `
      + (lvl ? `${t('aval.title')}: ${lvl}, ${t(`aval.level.${lvl}`)}` : `${t('aval.title')}: ${t('aval.noReport')}`));
  }
  renderTop();
  const clockTimer = setInterval(renderTop, 10000);
  cleanups.push(() => clearInterval(clockTimer));

  // --- Chip-Knopf und Menü ---------------------------------------------------------------
  function renderChip() {
    shownBattery = ctx.me.battery;
    const bat = shownBattery;
    menuBtn.classList.toggle('is-low', bat != null && bat <= 20);
    // Nur die Batterie, ungefähr gefüllt – die genaue Zahl steht im Menü
    menuBtn.replaceChildren(
      h('span', { class: 'bat', style: { '--lvl': String((bat ?? 0) / 100) }, 'aria-hidden': 'true' }),
      icon('maximize', 'pill-more'));
    menuBtn.setAttribute('aria-label', t('top.chipAria', { bat: bat ?? '–' }));
    if (!menu.hidden) renderMenu();
  }

  function renderMenu() {
    const bat = ctx.me.battery;
    // Bis Mitternacht: so lange gilt der Code
    const left = Math.max(0, (todayAt('24:00') - clockNow()) / 60000);
    menu.replaceChildren(
      h('div', { class: 'menu-chip' },
        h('span', { class: 'menu-chip-art', 'aria-hidden': 'true' }),
        h('span', { class: 'menu-chip-text' },
          h('strong', { class: 'num' }, session.chip),
          h('small', {}, h('i', { class: 'menu-live' }), t('chip.connected'))),
        bat != null ? h('span', { class: 'menu-chip-bat' },
          h('strong', { class: 'num' }, `${bat} %`),
          h('span', { class: 'menu-bat-bar' }, h('i', { style: { width: `${bat}%` } }))) : null),
      h('div', { class: 'menu-access' },
        icon('clock'),
        h('span', {},
          h('strong', {}, t('top.accessFor', { name: session.name })),
          h('small', {}, t('top.accessLeft', { h: Math.floor(left / 60), m: String(Math.floor(left % 60)).padStart(2, '0') })))),
      h('div', { class: 'menu-lang', role: 'group', 'aria-label': t('top.language') },
        ['de', 'en'].map((code) => h('button', {
          class: 'menu-lang-btn',
          'aria-pressed': String(getLang() === code),
          onclick: () => { if (getLang() !== code) toggleLang(); renderMenu(); },
        }, code === 'de' ? 'Deutsch' : 'English'))),
      // Nur im Test-Modus: aufgezeichneten Tag löschen, um alles nochmal auszuprobieren
      config.fakeData ? h('button', { class: 'menu-item menu-test', role: 'menuitem', onclick: resetDay }, icon('today'), t('test.resetDay')) : null,
    );
  }
  menuReady = true;
  renderChip();
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

  /** Test: alles zurück auf Anfang – Tag, Alarm, Meldungen, Anmeldung. Nur die Sprache bleibt. */
  function resetDay() {
    clearAll(['lang']);
    // Ganz neu laden, ohne vorher die Ansicht abzubauen – sonst speichert „Mein Tag“ beim
    // Abbauen den alten Tag gleich wieder
    location.replace(location.pathname + location.search);
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
    renderChip();
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
