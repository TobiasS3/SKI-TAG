// Route-Tab: Ziel wählen, Einstellung (schwarze Pisten meiden/bevorzugen …), Route anzeigen.
// Im Mittelpunkt steht die Wegbeschreibung mit Liftnamen und Pistennummern – den Schildern folgen.
//
// „Route starten“: Karte folgt dir, unten statt der Tabs eine Leiste mit dem aktuellen Schild
// und „Route beenden“. Hochziehen zeigt alle Schilder, das aktuelle ist markiert.

import { h, replace, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { api } from '../../js/services/api.js';
import { route, routeToAny, routeVia, skimap } from '../../js/services/slopes.js';
import { liftState, isRunning, pisteState } from '../../js/services/lift-status.js';
import { openingState } from '../../js/utils/hours.js';
import { drawRoute } from '../../js/map/layers.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { distance, duration } from '../../js/utils/format.js';
import { clock, todayAt, now } from '../../js/utils/time.js';
import { icon, iconHTML, liftIcon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';
import { config } from '../../js/config.js';
import { placeLogo, placeCover, mediaFor } from './place-media.js';
import { destinations } from './search.js';

const MODES = ['fast', 'avoidBlack', 'preferBlack', 'easyOnly'];

export function mountRoutePanel(el, ctx) {
  let target = null;
  let mode = 'fast';
  let result = null;
  let layer = null;
  let running = null;   // { cur, idx, flat } – laufende Route
  let focusBefore = 'all'; // Kartenfilter vor dem Start – danach wieder herstellen
  let picking = false;  // Uhrzeit für den Treffpunkt wird gerade gewählt

  let preview = null;   // Ort ist offen, liegt über dem aktuellen Tab. Keine Route, kein Tab-Wechsel.
  let fromPlace = null; // { place, tab }: „Zurück“ aus der Route führt wieder dorthin
  let shownAt = 0;
  let animateNext = false; // nächste Route zeichnet sich auf der Karte
  const over = h('section', { class: 'place-over', hidden: true });
  ctx.sheet.el.append(over);

  /** Direkt zur Route (Suche, „Hinfahren“) */
  function setTarget(place) {
    if (running) stop();
    closePreview();
    target = place;
    picking = false;
    fromPlace = null;
    animateNext = true;
    calculate();
    toTop(); // neues Ziel: oben anfangen („Zurück“ und Name), egal wie weit die Liste vorher gescrollt war
  }

  /** Nur zeigen: Karte fliegt hin, der Ort legt sich über den aktuellen Tab */
  function showPlace(place) {
    preview = place;
    picking = false;
    shownAt = Date.now();
    ctx.fit(L.latLngBounds([place.pos, place.pos]), 15);
    renderOver();
    over.scrollTop = 0;
  }

  function closePreview() {
    if (!preview) return;
    preview = null;
    ctx.map.getContainer().querySelectorAll('.mk-chip.is-open').forEach((x) => x.classList.remove('is-open'));
    renderOver();
  }

  function renderOver() {
    over.hidden = !preview;
    if (!preview) return replace(over);
    replace(over,
      h('button', { class: 'place-over-close', 'aria-label': t('close'), onclick: closePreview }, icon('close')),
      placeCard(preview),
      h('button', { class: 'btn btn-sun btn-big btn-block', onclick: routeFromPreview }, icon('route'), t('route.show')),
      meetRow(preview));
  }

  /** „Route anzeigen“: erst jetzt geht es in den Route-Tab */
  function routeFromPreview() {
    const place = preview;
    const tab = ctx.sheet.current();
    ctx.sheet.open('route'); // erst den Tab, dann die Route – die klappt den Bereich zum Anschauen runter
    setTarget(place);
    fromPlace = { place, tab };
    render();
  }

  /** Die Linie zeichnet sich auf der Karte, sobald die Karte angekommen ist */
  function drawIn(group) {
    if (reducedMotion()) return;
    const paths = group.getLayers().map((x) => x._path).filter((p) => p && !p.classList.contains('route-flow'));
    const flow = group.getLayers().map((x) => x._path).find((p) => p?.classList.contains('route-flow'));
    [...paths, flow].forEach((p) => { if (p) p.style.opacity = 0; });
    const go = () => {
      clearTimeout(timer);
      ctx.map.off('moveend', go);
      if (layer !== group) return;
      paths.forEach((p) => {
        p.style.opacity = '';
        const len = p.getTotalLength();
        p.animate([{ strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0 }], { duration: 800, easing: 'cubic-bezier(.3,.7,.2,1)' });
      });
      setTimeout(() => { if (flow) flow.style.opacity = ''; }, 800);
    };
    const timer = setTimeout(go, 1300);
    ctx.map.once('moveend', go);
  }

  function calculate({ preview = false } = {}) {
    cancelPeek();
    layer?.remove();
    layer = null;
    result = !target || !ctx.me.pos ? null
      : target.nodes ? routeToAny(ctx.me.pos, target.nodes, target.pos, mode) // Parkplatz: schnellster Zugang
        : target.via ? routeVia(ctx.me.pos, target.node, target.via, 'fast') // Streif: zum Start, dann runter
          : route(ctx.me.pos, target.node, mode);
    if (result && !result.unreachable && result.coords.length > 1) {
      layer = drawRoute(ctx.map, result.coords, result.steps, { color: '#ff5b22', flow: '#fff' });
      const course = courseLines(target);
      if (course) addCourse(layer, course, target);
      if (target.via) addStreifLook(layer, result);
      if (animateNext) {
        drawIn(layer);
        el.classList.add('route-enter');
        setTimeout(() => el.classList.remove('route-enter'), 1100);
      }
      const bounds = minSize(L.latLngBounds(result.coords).extend(ctx.me.pos));
      if (course) bounds.extend(L.latLngBounds(course.flat()));
      if (animateNext) {
        // Neue Route: Bereich klappt runter, Karte zeigt die ganze Route, Countdown läuft,
        // dann geht der Bereich oben bei „Route starten“ wieder auf
        peekRoute(bounds, { title: target.name, seconds: PEEK_NEW_S, force: true });
      } else if (preview) {
        peekRoute(bounds);
      } else {
        ctx.fit(bounds, FIT_ZOOM);
      }
    } else if (target) {
      ctx.fit(L.latLngBounds([target.pos, target.pos]), 15);
    }
    animateNext = false;
    ctx.routeShown?.(!!layer);
    render();
  }

  /**
   * Ziel ist eine Piste (z. B. die Streif): die Route führt zum Start, die Piste selbst
   * steht in ihrer Farbe bis ganz unten auf der Karte, mit Ziel-Schild.
   */
  function courseLines(place) {
    if (place?.type !== 'piste') return null;
    if (place.via) return []; // Streif: die Route fährt sie selbst ab, nur die Schilder kommen dazu
    const lines = place.course?.length ? place.course : place.lines;
    // Talabfahrt „… ins Tal“: die Route fährt die Piste schon ab
    if (!lines?.length || (place.loNode != null && place.node === place.loNode)) return null;
    return lines;
  }

  function addCourse(group, lines, place) {
    if (!lines.length) return addSections(group, place);
    const color = { easy: '#1f66d1', intermediate: '#e0242f', freeride: '#f08a24' }[place.diff] || '#0e0e10';
    group.addLayer(L.polyline(lines, { pane: 'route', color: '#fff', weight: 12, lineCap: 'round', interactive: false }));
    group.addLayer(L.polyline(lines, { pane: 'route', color, weight: 7, lineCap: 'round', interactive: false, className: 'route-course' }));
    group.addLayer(L.polyline(lines, { pane: 'route', color: '#fff', weight: 1.6, dashArray: '1 9', lineCap: 'round', opacity: 0.8, interactive: false }));
    addSections(group, place);
    const end = place.course?.length ? place.course[0].at(-1) : place.loPos;
    if (end) group.addLayer(finishSign(end, place));
  }

  function finishSign(end, place) {
    return L.marker(end, {
      pane: 'routeSigns', interactive: false, keyboard: false, zIndexOffset: 700,
      icon: L.divIcon({ className: 'mk-rsign is-piste is-always is-finish', html: `<span>${iconHTML('flag')}<b>${esc(t('route.finish', { name: place.name }))}</b></span>`, iconSize: [0, 0] }),
    });
  }

  /**
   * Streif angeklickt: die Rennstrecke leuchtet orange, eine weiße Linie läuft den Hang hinunter,
   * Start- und Zieltor mit Zielflaggen-Karos. Nur bei der Streif – sonst sieht die Route normal aus.
   */
  function addStreifLook(group, r) {
    const line = r.steps.find((x) => x.key === 'via')?.coords;
    if (!line?.length) return;
    const opts = { pane: 'route', interactive: false, lineCap: 'round', lineJoin: 'round' };
    group.addLayer(L.polyline(line, { ...opts, color: '#ff5b22', weight: 26, opacity: 0.22, className: 'streif-glow' }));
    group.addLayer(L.polyline(line, { ...opts, color: '#fff', weight: 14 }));
    group.addLayer(L.polyline(line, { ...opts, color: '#ff5b22', weight: 9 }));
    group.addLayer(L.polyline(line, { ...opts, color: '#fff', weight: 2.6, dashArray: '10 16', className: 'streif-flow' }));
    const gate = (pos, text, cls) => L.marker(pos, {
      pane: 'routeSigns', interactive: false, keyboard: false, zIndexOffset: 800,
      icon: L.divIcon({ className: `mk-streif-gate ${cls}`, html: `<span><i></i><b>${esc(text)}</b></span>`, iconSize: [0, 0] }),
    });
    group.addLayer(gate(line[0], t('streif.start'), 'is-start'));
    group.addLayer(gate(line[line.length - 1], t('streif.finish'), 'is-finish'));
  }

  /** Passagen der Streif (Mausefalle, Steilhang …): kleine Schilder an der Linie */
  function addSections(group, place) {
    for (const sec of place.sections || []) {
      group.addLayer(L.marker(sec.pos, {
        pane: 'routeSigns', interactive: false, keyboard: false, zIndexOffset: 300,
        icon: L.divIcon({ className: 'mk-rsign is-section', html: `<span><i></i><b>${esc(sec.name)}</b></span>`, iconSize: [0, 0] }),
      }));
    }
  }

  // --- Andere Einstellung (z. B. „Schwarze meiden“): Karte kurz zeigen -----------------
  // Bereich klappt runter, die Karte zeigt die geänderte Route so groß wie möglich,
  // ein Countdown läuft 3 Sekunden, dann geht der Bereich wieder auf. Antippen = sofort zurück,
  // Karte verschieben = Countdown weg, man schaut selbst weiter.
  let peek = null; // { timer, el, off }

  function peekRoute(bounds, { title = t(`route.mode.${mode}`), seconds = PEEK_S, force = false } = {}) {
    // Breiter Bildschirm: Bereich liegt neben der Karte, die Route ist sowieso zu sehen
    if (!ctx.sheet.visibleHeight() || (!force && !ctx.sheet.isExpanded())) return ctx.fit(bounds, FIT_ZOOM);
    ctx.sheet.collapse();
    setTimeout(() => { if (peek) ctx.fit(bounds, FIT_ZOOM); }, 380);
    let left = seconds;
    const count = h('span', { class: 'route-peek-count num' }, String(left));
    const pill = h('button', { class: 'route-peek', type: 'button', onclick: () => endPeek(true) },
      h('span', { class: 'route-peek-ring', style: { '--peek-s': `${seconds}s` } }, count),
      h('span', { class: 'route-peek-text' },
        h('strong', {}, title),
        h('small', {}, t('route.peek.sub'))));
    ctx.sheet.el.parentElement.append(pill);
    const onDrag = () => endPeek(false);
    ctx.map.once('dragstart', onDrag);
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) return endPeek(true);
      count.textContent = String(left);
    }, 1000);
    peek = { timer, el: pill, off: () => ctx.map.off('dragstart', onDrag), bounds };
  }

  /** back: Bereich wieder auf und die Route im freien Teil der Karte zeigen */
  function endPeek(back) {
    if (!peek) return;
    const { bounds } = peek;
    cancelPeek();
    if (!back) return;
    toTop();
    ctx.sheet.open('route');
    // Nicht neu einpassen: über dem offenen Bereich ist nur ein schmaler Streifen frei, die ganze
    // Route passt dort nur weit rausgezoomt hinein. Zoom bleibt, die Route rückt in den freien Teil.
    setTimeout(() => { if (layer) ctx.panTo(bounds.getCenter()); }, 380);
  }

  /** Bereich oben anfangen lassen: Route-Name und „Route starten“, nicht mitten im Weg */
  function toTop() {
    const scroller = el.closest('.sheet-content');
    if (scroller) scroller.scrollTop = 0;
  }

  function cancelPeek() {
    if (!peek) return;
    clearInterval(peek.timer);
    peek.off();
    peek.el.remove();
    peek = null;
  }

  function clearRoute() {
    cancelPeek();
    target = null;
    result = null;
    layer?.remove();
    layer = null;
    ctx.routeShown?.(false);
    render();
  }

  // --- Route läuft ------------------------------------------------------------------
  const bar = h('div', { class: 'route-bar' });

  function start() {
    if (!result || result.unreachable) return;
    // Alle Punkte der Route mit ihrem Schritt – daran erkennen wir, wo du gerade bist
    const flat = result.steps.flatMap((st, k) => st.coords.map((c) => ({ c, k })));
    running = { cur: 0, idx: 0, flat };
    // Fake-Chip fährt die Route ab (echter Chip: der Gast fährt selbst)
    api.guide(ctx.session.chip, target.node, target.via ? 'fast' : mode, target.via || null);
    ctx.page.classList.add('route-running');
    renderBar(); // erst befüllen, dann misst der Bereich die richtige Höhe
    ctx.sheet.setTop(bar);
    ctx.sheet.collapse();
    // Karte zeigt sofort nur noch die Route
    focusBefore = ctx.mapFocus?.() || 'all';
    ctx.setFocus?.('route', { quiet: true });
    ctx.follow(true, 16);
    if (layer) drawIn(layer);
    render();
  }

  function stop({ arrived = false } = {}) {
    if (!running) return;
    running = null;
    api.guide(ctx.session.chip, null);
    ctx.page.classList.remove('route-running');
    ctx.sheet.setTop(null);
    toast(arrived ? t('route.arrived', { name: target.name }) : t('route.stopped'), { icon: arrived ? 'flag' : 'route' });
    clearRoute();
    if (focusBefore === 'track') ctx.setFocus?.('track', { quiet: true });
  }

  // Auf der Streif: einmal pro Abfahrt melden (erst der nächste Lift setzt das zurück)
  let onStreif = false;
  function streifNote(p) {
    const piste = p.kind === 'piste' && p.ref != null ? skimap().pistes[p.ref] : null;
    const isStreif = /^streif-rennstrecke/i.test(piste?.name || '');
    if (isStreif && !onStreif) {
      streifBanner();
      navigator.vibrate?.([60, 60, 60, 60, 160]);
    }
    if (isStreif) onStreif = true;
    else if (p.kind === 'lift') onStreif = false;
  }

  /** Großes oranges Banner: man ist auf der Streif. Antippen oder nach ein paar Sekunden weg. */
  function streifBanner() {
    ctx.page.querySelector('.streif-banner')?.remove();
    const close = () => {
      el2.classList.add('is-leaving');
      setTimeout(() => el2.remove(), 400);
    };
    const el2 = h('button', { class: 'streif-banner', type: 'button', role: 'status', onclick: close },
      h('span', { class: 'streif-banner-flag', 'aria-hidden': 'true' }),
      h('span', { class: 'streif-banner-text' },
        h('strong', {}, 'Streif'),
        h('span', {}, t('streif.on')),
        h('small', {}, t('streif.sub'))),
      h('span', { class: 'streif-banner-num num', 'aria-hidden': 'true' }, '21'));
    ctx.page.append(el2);
    setTimeout(close, 6500);
  }

  /** Wo die Route endet: bei der Streif unten im Ziel, sonst am Ort selbst */
  const goalPos = () => (target.via && result?.coords?.length ? result.coords[result.coords.length - 1] : target.pos);

  /** Neue Position: welcher Schritt ist dran? Angekommen? */
  function track() {
    if (!running || !ctx.me.pos) return;
    if (geoDistance(ctx.me.pos, goalPos()) < ARRIVE_M) return stop({ arrived: true });
    // Nur vorwärts suchen – zurück auf der Route springt die Anzeige nicht
    let best = running.idx;
    let bestD = Infinity;
    for (let i = running.idx; i < running.flat.length; i++) {
      const d = geoDistance(ctx.me.pos, running.flat[i].c);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > OFF_ROUTE_M) return;
    running.idx = best;
    const cur = running.flat[best].k;
    if (cur !== running.cur) {
      running.cur = cur;
      navigator.vibrate?.(40);
      render();
    }
  }

  function renderBar() {
    const st = result.steps[running.cur];
    const next = result.steps[running.cur + 1];
    replace(bar,
      h('button', { class: 'route-bar-now', onclick: () => ctx.sheet.open('route') },
        stepIcon(st),
        h('span', { class: 'route-bar-text' },
          h('strong', {}, stepText(st)),
          h('small', {}, next ? `${t('route.then')}: ${stepText(next)}` : t('route.arrive', { name: target.name })))),
      h('button', { class: 'route-bar-stop', 'aria-label': t('route.stop'), onclick: () => stop() }, icon('close')));
  }

  function runningView() {
    return h('div', { class: 'stack' },
      h('div', { class: 'route-run-head' },
        h('span', { class: 'route-run-live' }, h('i'), t('route.running')),
        h('h2', { class: 'title' }, target.name)),
      h('h3', { class: 'steps-title' }, t('route.follow')),
      steps(result, target, running.cur),
      h('button', { class: 'btn btn-quiet btn-block', onclick: () => stop() }, icon('close'), t('route.stop')));
  }

  function render() {
    if (running) {
      renderBar();
      return replace(el, runningView());
    }
    if (!target) return replace(el, emptyState());
    const ok = result && !result.unreachable;
    replace(el,
      h('button', { class: 'back-btn', onclick: goBack }, icon('back'), t('route.back')),
      h('h2', { class: 'title route-name' }, target.name),
      ok ? routeHero(result) : null,
      ok ? h('button', { class: 'btn btn-sun btn-big btn-block route-start', onclick: start }, icon('nav'), t('route.start')) : null,
      // Streif: selbst schwarz – „Schwarze meiden“ / „Nur blaue“ ergeben keinen Sinn
      target.via ? h('p', { class: 'small muted steps-note' }, h('i', { class: 'dot diff-advanced' }), t('route.streifModes')) : null,
      target.via || result?.unreachable ? null : h('div', { class: 'choice-row', role: 'group', 'aria-label': t('tab.route') },
        MODES.map((m) => h('button', {
          class: 'choice',
          'aria-pressed': String(m === mode),
          onclick: () => { if (m === mode) return; mode = m; calculate({ preview: true }); },
        }, m === 'easyOnly' ? h('i', { class: 'dot diff-easy' }) : null,
        m === 'avoidBlack' || m === 'preferBlack' ? h('i', { class: 'dot diff-advanced' }) : null,
        t(`route.mode.${m}`)))),
      result?.unreachable
        ? h('div', { class: 'stack' },
          h('div', { class: 'note note-area', role: 'note' }, icon('mountain'),
            h('div', {},
              h('strong', {}, t('route.otherAreaTitle')),
              h('span', {}, t('route.otherArea', { area: result.area })))),
          h('figure', { class: 'bus-scene', 'aria-hidden': 'true', html: busScene(shortArea(result.area), nearestLiftType(ctx.me.pos), target.lift?.type || 'gondola') }))
        : ok ? summary(result) : h('p', { class: 'note note-warn' }, t('route.none')),
      ok ? h('h3', { class: 'steps-title' }, t('route.follow')) : null,
      ok && ctx.liftStatus ? h('p', { class: 'small muted steps-note' }, icon('check'), t('route.statusIncluded')) : null,
      ok && courseLines(target) ? h('p', { class: 'small muted steps-note' }, icon('flag'), t(target.via ? 'route.courseRide' : 'route.courseNote', { name: target.name })) : null,
      ok ? steps(result, target) : null,
    );
  }

  function goBack() {
    const back = fromPlace;
    fromPlace = null;
    clearRoute();
    if (!back) return;
    ctx.sheet.select(back.tab);
    showPlace(back.place);
  }

  let emptyAt = 0; // wann „Wohin möchten Sie?“ zuletzt gezeichnet wurde
  function emptyState() {
    emptyAt = Date.now();
    // Oben das Praktische (zurück zum Start/Auto, ins Tal) groß mit Fahrzeit,
    // darunter die Erlebnisse als Bild-Kacheln. Gruppen (Talabfahrten, Parkplätze, Hütten) stehen in der Suche.
    const rental = ctx.session.rental || (config.fakeData ? 'Hahnenkammbahn' : null);
    const list = destinations({ getPos: () => ctx.me.pos, rental });
    const main = list.filter((d) => d.primary);
    const fun = list.filter((d) => !d.primary);
    return h('div', { class: 'stack dest' },
      h('h2', { class: 'title' }, t('route.title')),
      main.length ? null : dayHint(),
      main.length ? h('ul', { class: 'dest-main' }, main.map((d) => h('li', {},
        h('button', { class: 'dest-go', onclick: () => setTarget(d.item) },
          h('span', { class: `dest-go-icon sg-${d.id}` }, icon(d.icon)),
          h('span', { class: 'dest-go-text' }, h('strong', {}, t(`dest.${d.id}`)), h('small', {}, d.lead || d.sub)),
          d.eta != null ? h('span', { class: 'dest-go-eta' }, h('b', { class: 'num' }, duration(d.eta))) : icon('chevron'))))) : null,
      fun.length ? h('h3', { class: 'dest-head' }, t('route.highlights')) : null,
      fun.length ? h('ul', { class: `dest-tiles n-${fun.length}` }, fun.map((d) => h('li', {},
        h('button', { class: 'dest-tile', onclick: () => setTarget(d.item), 'aria-label': `${t(`dest.${d.id}`)}, ${d.sub}` },
          placeCover(d.item, [
            h('span', { class: 'dest-tile-name' }, h('strong', {}, t(`dest.${d.id}`)), h('small', {}, d.lead || d.sub)),
          ]),
          d.eta != null ? h('span', { class: 'dest-tile-eta num' }, icon('route'), duration(d.eta))
            // Keine Fahrzeit trotz Position: eigenes Skigebiet ohne Pistenverbindung (Kitzbüheler Horn)
            : d.otherArea ? h('span', { class: 'dest-tile-eta is-area' }, icon('mountain'), t('route.ownArea')) : null)))) : null,
      // Statt Hinweistext: gleich ins Suchfeld
      h('button', { class: 'dest-search', onclick: focusSearch },
        icon('search'),
        h('span', {}, h('strong', {}, t('route.searchBtn')), h('small', {}, t('route.searchSub'))),
        icon('chevron')),
    );
  }

  /**
   * Noch kein „Zurück zum Start“ / „Ins Tal“: vor dem Start des Tages sagen, warum –
   * und gleich den Knopf dazu. Ist der Tag schon gestartet, steht man gerade unten am Start.
   */
  function dayHint() {
    const status = ctx.dayStatus?.() || 'idle';
    if (status === 'idle') {
      return h('div', { class: 'dest-hint' },
        h('span', { class: 'dest-hint-icon' }, icon('play')),
        h('span', { class: 'dest-hint-text' },
          h('strong', {}, t('route.dayFirst')),
          h('small', {}, t('route.dayFirstText'))),
        h('button', { class: 'btn btn-sun btn-small', onclick: () => ctx.sheet.open('day') }, t('day.start')));
    }
    if (status !== 'running') return null;
    return h('div', { class: 'dest-hint' },
      h('span', { class: 'dest-hint-icon' }, icon('home')),
      h('span', { class: 'dest-hint-text' },
        h('strong', {}, t('route.atStart')),
        h('small', {}, t('route.atStartText'))));
  }

  function focusSearch() {
    const input = ctx.page.querySelector('.search-input');
    if (!input) return;
    ctx.sheet.collapse();
    input.focus();
    input.click();
  }

  /** Karte mit Foto (oder gezeichneter Szene), Logo, Infos und großen Knöpfen. */
  function placeCard(place) {
    const sub = {
      piste: () => t(`diff.${place.diff}`),
      lift: () => place.sub,
      parking: () => t('search.parking'),
      person: () => t('search.person'),
    }[place.type]?.() ?? t('search.hut');
    const m = mediaFor(place.name);
    const website = place.hut?.website || place.lift?.website || m?.website;
    const phone = place.hut?.phone || m?.phone;
    const actions = [];
    if (phone) {
      actions.push(action('phone', t('place.call'), phone, `tel:${phone.replace(/[^\d+]/g, '')}`));
    }
    if (website) {
      const url = website.startsWith('http') ? website : `https://${website}`;
      actions.push(action('globe', t('place.website'), new URL(url).hostname.replace(/^www\./, ''), url, true));
    }
    const facts = [];
    if (ctx.me.pos) facts.push(fact('walk', t('place.away', { dist: distance(geoDistance(ctx.me.pos, place.pos)) })));
    const ele = place.type === 'parking' ? null : place.hut?.ele ?? (place.node != null ? skimap().ele[place.node] : null);
    if (ele) facts.push(fact('mountain', `${ele} m`));
    if (place.hut?.hours) facts.push(fact('clock', place.hut.hours));
    // Parkplatz: kostenlos?, wie weit zur Talstation, Parkhaus/Tiefgarage
    const park = place.parking;
    if (park) {
      if (park.fee != null) facts.push(fact('parking', t(park.fee ? 'park.fee' : 'park.free')));
      facts.push(fact('gondola', t('park.toStation', { dist: distance(park.walk), name: park.station })));
      if (park.kind !== 'surface') facts.push(fact('parking', t(`park.kind.${park.kind}`)));
      if (park.capacity) facts.push(fact('users', t('park.spaces', { n: park.capacity })));
    }
    // Lift: wie viele passen rein, wie viele schafft er pro Stunde
    const seats = Number(place.lift?.occupancy);
    if (seats) facts.push(fact('users', t(seats === 1 ? 'place.seat' : 'place.seats', { n: seats })));
    const perHour = Number(place.lift?.capacity);
    if (perHour) facts.push(fact('gondola', t('place.perHour', { n: perHour.toLocaleString('de-AT') })));

    if (place.type === 'person') {
      return h('article', { class: 'place place-plain' },
        h('div', { class: 'place-head' }, placeLogo(place, 'big'),
          h('div', { class: 'place-text' }, h('h2', { class: 'title' }, place.name), h('p', { class: 'place-kind' }, sub))),
        facts.length ? h('ul', { class: 'place-facts' }, facts) : null);
    }
    return h('article', { class: 'place' },
      placeCover(place, [
        placeLogo(place, 'big'),
        h('span', { class: 'place-cover-name' }, h('small', {}, sub), h('strong', {}, place.name)),
      ]),
      statusRow(place),
      facts.length ? h('ul', { class: 'place-facts' }, facts) : null,
      actions.length ? h('div', { class: `place-actions n-${actions.length}` }, actions) : null,
    );
  }

  /** Geöffnet / Geschlossen – für Lift, Piste und Hütte, gleich unter dem Foto */
  function statusRow(place) {
    const s = placeStatus(place);
    if (!s) return null;
    return h('p', { class: `place-status ${s.open ? 'is-open' : 'is-closed'}` },
      h('i'),
      h('strong', {}, t(s.open ? 'status.open' : 'status.closed')),
      s.detail ? h('span', {}, s.detail) : null);
  }

  function placeStatus(place) {
    const nowD = now();
    const liftsOpen = nowD >= todayAt(config.resort.liftsOpen) && nowD < todayAt(config.resort.liftsClose);
    if (place.type === 'lift') {
      const st = liftState(ctx.liftStatus, place.name, nowD);
      const why = st.reason ? t(`lifts.reason.${st.reason}`) : null;
      if (isRunning(st)) return { open: true, detail: t('status.until', { time: st.close }) };
      if (st.state === 'later') return { open: false, detail: t('status.opensAt', { time: st.open }) };
      if (st.state === 'hold') return { open: false, detail: why || t('lifts.state.hold') };
      return { open: false, detail: why || t('status.today') };
    }
    if (place.type === 'piste' && place.piste) {
      const ps = pisteState(ctx.pisteStatus, place.piste);
      if (!ps.open) return { open: false, detail: ps.reason ? t(`pistes.reason.${ps.reason}`) : null };
      if (!liftsOpen) return { open: false, detail: t('status.withLifts', { from: config.resort.liftsOpen, to: config.resort.liftsClose }) };
      return { open: true, detail: t('status.until', { time: config.resort.liftsClose }) };
    }
    if (place.type === 'hut') {
      const o = openingState(place.hut?.hours, nowD);
      if (o.known) {
        if (o.open) return { open: true, detail: t('status.until', { time: o.until }) };
        return { open: false, detail: o.from ? t('status.opensAt', { time: o.from }) : t('status.today') };
      }
      // Keine Zeiten bekannt: Hütten am Berg haben meist offen, solange die Lifte fahren
      return liftsOpen
        ? { open: true, detail: t('status.hutTypical', { time: config.resort.liftsClose }) }
        : { open: false, detail: t('status.hutTypicalClosed') };
    }
    return null;
  }

  function routeHero(r) {
    const arrival = new Date(now().getTime() + r.time * 1000);
    return h('section', { class: 'route-hero' },
      h('div', { class: 'route-hero-top' },
        h('span', { class: 'num route-hero-time' }, duration(r.time)),
        h('span', { class: 'route-hero-eta' }, t('route.arrival', { time: clock(arrival) }))),
      // Der ganze Weg auf einen Blick: Pisten in ihrer Farbe, bei Liften laufen die Striche
      h('div', { class: 'route-strip', 'aria-hidden': 'true' }, r.steps.map((s) => h('i', {
        class: s.kind === 'lift' ? 'seg-lift' : `diff-${s.item.diff}`,
        style: { flex: `${Math.max(1, s.time)} 1 0` },
      }))),
      h('dl', { class: 'route-hero-stats' },
        stat(t('route.distance'), distance(r.dist)),
        stat(t('route.pistes'), r.pistes),
        stat(t('route.lifts'), r.lifts),
        stat(t('route.down'), `${Math.round(r.down)} m`)));
  }

  function summary(r) {
    const arrival = new Date(now().getTime() + r.time * 1000);
    const late = arrival > todayAt(config.resort.liftsClose) && r.lifts > 0;
    return h('div', { class: 'stack' },
      late ? h('p', { class: 'note note-warn' }, icon('clock'), t('route.afterClose')) : null,
      r.blacks && mode !== 'preferBlack' && !target.via ? h('p', { class: 'note' }, h('i', { class: 'dot diff-advanced' }), t('route.blackWarn')) : null,
    );
  }

  /** Treffpunkt für die Gruppe: hier treffen wir uns (mit Uhrzeit) */
  function meetRow(place) {
    if (!ctx.session.group || !ctx.setMeeting || (place.type !== 'hut' && place.type !== 'lift')) return null;
    const m = ctx.meeting;
    // Der Knopf steht im Ortsfenster: das muss sich neu zeichnen, nicht nur der Route-Tab
    const redraw = () => { renderOver(); render(); };
    if (m && m.name === place.name && !picking) {
      return h('div', { class: 'meet-here' }, icon('flag'),
        h('span', {}, h('strong', {}, t('meet.isHere')), h('small', {}, m.time ? t('meet.at', { time: m.time }) : t('meet.noTime'))),
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => { picking = true; redraw(); } }, t('meet.change')),
        h('button', { class: 'meet-delete', 'aria-label': t('meet.delete'), title: t('meet.delete'), onclick: () => ctx.setMeeting(null) }, icon('close')));
    }
    if (!picking) {
      return h('button', { class: 'btn btn-quiet btn-block meet-btn', onclick: () => { picking = true; redraw(); } },
        icon('flag'), t('meet.setHere'));
    }
    // Eigene Uhrzeit: vorbelegt mit dem ersten Vorschlag
    const slots = meetSlots();
    const own = h('input', { class: 'meet-time-input num', type: 'time', value: ctx.meeting?.time || slots[0], 'aria-label': t('meet.ownTime') });
    return h('div', { class: 'meet-pick' },
      h('p', { class: 'small muted' }, t('meet.when')),
      h('div', { class: 'choice-row' },
        slots.map((time) => h('button', { class: 'choice', onclick: () => pick(time) }, time)),
        h('button', { class: 'choice', onclick: () => pick(null) }, t('meet.noTime'))),
      h('form', {
        class: 'meet-own',
        onsubmit: (e) => {
          e.preventDefault();
          if (/^\d{2}:\d{2}$/.test(own.value)) pick(own.value);
        },
      },
      h('label', { class: 'small muted' }, t('meet.ownTime')),
      h('div', { class: 'meet-own-row' }, own, h('button', { class: 'btn btn-small', type: 'submit' }, icon('check'), t('meet.ok')))),
      h('button', { class: 'btn btn-quiet btn-small', onclick: () => { picking = false; redraw(); } }, t('cancel')));

    async function pick(time) {
      picking = false;
      await ctx.setMeeting(place, time);
      redraw();
    }
  }

  /** Vorschläge: die nächsten vier halben Stunden, frühestens in 15 min */
  function meetSlots() {
    const step = 30 * 60000;
    const first = Math.ceil((now().getTime() + 15 * 60000) / step) * step;
    return [0, 1, 2, 3].map((k) => clock(new Date(first + k * step)));
  }

  /** Bei Liften: fährt er (bis wann) – Wind-Stopp und „schließt bald“ hervorgehoben */
  function liftNote(s) {
    if (s.kind !== 'lift' || !ctx.liftStatus) return null;
    const st = liftState(ctx.liftStatus, s.item.name);
    const text = {
      open: () => t('route.liftUntil', { time: st.close }),
      closing: () => t('lifts.state.closing', { time: duration((todayAt(st.close) - now()) / 1000) }),
      hold: () => (st.reason ? t(`lifts.reason.${st.reason}`) : t('lifts.state.hold')),
    }[st.state]?.() ?? t(`lifts.state.${st.state}`);
    return h('span', { class: `step-liftstate is-${st.state}` }, ` · ${text}`);
  }

  function action(ic, label, sub, href, external = false) {
    return h('a', { class: 'place-action', href, target: external ? '_blank' : null, rel: external ? 'noopener' : null },
      h('span', { class: 'place-action-icon' }, icon(ic)),
      h('span', { class: 'place-action-text' }, h('strong', {}, label), h('small', {}, sub)));
  }

  function fact(ic, text) {
    return h('li', {}, icon(ic), h('span', {}, text));
  }

  function steps(r, place, current = -1) {
    return h('ol', { class: 'steps' },
      r.steps.map((s, i) => {
        const state = current < 0 ? '' : i < current ? ' is-done' : i === current ? ' is-current' : '';
        return h('li', { class: `step step-${s.kind}${state}${s.key === 'via' ? ' is-streif' : ''}` },
          stepIcon(s),
          h('span', { class: 'step-text' },
            h('strong', {}, s.kind === 'lift' ? s.item.name : pisteName(s.item)),
            h('small', {}, `${t(s.kind === 'lift' ? 'route.verbUp' : 'route.verbDown')} · ${distance(s.len)} · ${duration(s.time)}`, liftNote(s)),
            // Streif: die Passagen der Reihe nach, mit Abstand vom Start
            s.key === 'via' && place.sections?.length
              ? h('ol', { class: 'step-sections' }, place.sections.map((x) => h('li', {},
                h('b', {}, x.name), h('span', { class: 'num' }, distance(x.at)))))
              : null));
      }),
      h('li', { class: 'step step-goal' },
        h('span', { class: 'step-icon' }, icon('flag')),
        h('span', { class: 'step-text' }, h('strong', {}, t('route.arrive', { name: place.name })))),
    );
  }

  const onMapClick = () => { if (Date.now() - shownAt > 300) closePreview(); };
  ctx.map.on('click', onMapClick);

  const offs = [
    on('lang', () => { render(); renderOver(); }),
    on('me', track),
    on('me', streifNote),
    // „Wohin möchten Sie?“ mitziehen: Fahrzeiten und „ins Tal“ passen sonst nach ein paar Minuten nicht mehr
    on('me', () => {
      if (target || running || Date.now() - emptyAt < EMPTY_REFRESH_MS) return;
      if (ctx.sheet.current() === 'route') render();
    }),
    // Route nur angeschaut, nicht gestartet: anderer Tab → Route verschwindet von der Karte
    on('sheet:tab', (id) => { if (id !== 'route' && target && !running) clearRoute(); }),
    on('focus', () => target && render()),
    // Bereich selbst wieder aufgezogen: Countdown nicht mehr nötig
    on('sheet:stage', (st) => { if (st !== 'peek' && peek) { cancelPeek(); toTop(); } }),
    on('meeting', () => { renderOver(); if (target) render(); }),
    on('daystatus', () => { if (!target && !running) render(); }),
  ];
  render();

  return {
    setTarget,
    showPlace,
    closePreview,
    /** Die ganze Route ins Bild holen */
    showOnMap: () => { if (layer && result?.coords) ctx.fit(L.latLngBounds(result.coords).extend(ctx.me.pos), FIT_ZOOM); },
    refresh: () => { if (!target) render(); },
    stop: () => stop(),
    destroy() {
      cancelPeek();
      ctx.map.off('click', onMapClick);
      over.remove();
      if (running) api.guide(ctx.session.chip, null);
      offs.forEach((off) => off());
      layer?.remove();
    },
  };
}

/** Kurze Wege (z. B. „Zurück zum Start“ aus 100 m) nicht riesig zeigen: mindestens ~700 m im Bild */
function minSize(bounds) {
  const c = bounds.getCenter();
  if (c.distanceTo(bounds.getNorthEast()) >= 350) return bounds;
  return bounds.extend(c.toBounds(700));
}

/**
 * Skibus zum eigenen Skigebiet: links der Berg, an dem man ist, rechts der andere (mit Namen) – beide mit Gondel.
 * Der Bus fährt einmal langsam von der linken Talstation zur rechten und bleibt dort stehen.
 */
function busScene(toName, leftType, rightType) {
  // Was am Seil hängt – Gondel, Sessel oder Schlepplift (Seilbahnen als Gondel). Aufhängung genau auf dem Seil (x, y)
  const carrier = (type, x, y) => {
    const t = {
      chair_lift: `<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M0 0v9M-8 9h16M-8 9v10M8 9v10M-9 15h18"/></g><rect x="-9" y="18" width="18" height="4" rx="2" fill="#e5450d" stroke="#fff" stroke-width="1.5"/>`,
      't-bar': `<path d="M0 0v20" stroke="#fff" stroke-width="2"/><path d="M-7 20h14" stroke="#e5450d" stroke-width="3.5" stroke-linecap="round"/>`,
      platter: `<path d="M0 0v18" stroke="#fff" stroke-width="2"/><circle cy="21" r="4" fill="#e5450d" stroke="#fff" stroke-width="1.5"/>`,
    }[type] || `<path d="M0 0v6" stroke="#fff" stroke-width="2"/><rect x="-9" y="6" width="18" height="16" rx="4" fill="#fff"/><rect x="-6" y="9" width="12" height="6" rx="1.5" fill="#2a4380"/><rect x="-9" y="18" width="18" height="2.5" fill="#e5450d"/>`;
    return `<g transform="translate(${x} ${y})">${t}</g>`;
  };
  const station = (x) => `<g transform="translate(${x} 150)"><rect x="-13" y="-12" width="26" height="14" rx="2" fill="#c9d3e6"/><path d="M-16 -12 L0 -22 L16 -12Z" fill="#8fa3c9"/></g>`;
  return `<svg viewBox="0 0 360 200" role="img">
  <defs><linearGradient id="bus-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1668e3"/><stop offset=".6" stop-color="#4e9dfa"/><stop offset="1" stop-color="#b8dcff"/></linearGradient></defs>
  <rect width="360" height="200" fill="url(#bus-sky)"/>
  <g fill="#fff">
    <path d="M118 40 a9 9 0 0 1 17 -4 a8 8 0 0 1 14 5 a6 6 0 0 1 -1 12 h-28 a7 7 0 0 1 -2 -13z" opacity=".92"/>
    <path d="M212 26 a7 7 0 0 1 13 -3 a6 6 0 0 1 11 4 a5 5 0 0 1 -1 9 h-21 a5 5 0 0 1 -2 -10z" opacity=".8"/>
  </g>
  <path d="M-10 160 L78 50 L150 150Z" fill="#5b78b8"/><path d="M62 70 L78 50 L96 72 L82 76Z" fill="#fff"/>
  <path d="M210 150 L284 46 L370 160Z" fill="#5b78b8"/><path d="M268 68 L284 46 L302 70 L286 74Z" fill="#fff"/>
  <path d="M40 150 L84 62" stroke="#fff" stroke-width="1.6"/><path d="M320 150 L278 60" stroke="#fff" stroke-width="1.6"/>
  ${carrier(leftType, 60, 110)}${carrier(rightType, 301, 109)}
  <path d="M0 150 C 90 138, 270 138, 360 150 V200 H0Z" fill="#fff"/>
  ${station(40)}${station(320)}
  <path d="M0 176 H360" stroke="#c3cfe4" stroke-width="10"/>
  <path d="M0 176 H360" stroke="#fff" stroke-width="1.5" stroke-dasharray="10 10"/>
  <g class="bus"><g transform="scale(.55)">
    <rect x="18" y="-6" width="120" height="6" rx="3" fill="#c9d3e6"/>
    <rect x="0" y="0" width="168" height="50" rx="12" fill="#0b1226" stroke="#fff" stroke-width="3"/>
    <rect x="0" y="30" width="168" height="7" fill="#e5450d"/>
    <rect x="12" y="8" width="26" height="16" rx="4" fill="#9ec0f2"/><rect x="44" y="8" width="26" height="16" rx="4" fill="#9ec0f2"/>
    <rect x="76" y="8" width="26" height="16" rx="4" fill="#9ec0f2"/><rect x="108" y="8" width="26" height="16" rx="4" fill="#9ec0f2"/>
    <path d="M140 8 h18 a4 4 0 0 1 4 4 v16 h-22z" fill="#9ec0f2"/>
    <circle cx="36" cy="52" r="11" fill="#1b2747" stroke="#fff" stroke-width="3"/><circle cx="134" cy="52" r="11" fill="#1b2747" stroke="#fff" stroke-width="3"/>
    <rect x="160" y="34" width="8" height="6" rx="2" fill="#ffd66b"/>
  </g></g>
  <text x="16" y="28" fill="#fff" font-family="system-ui, sans-serif" font-weight="800" font-size="12" letter-spacing=".08em">SKIBUS</text>
  <text x="348" y="196" fill="#435070" font-family="system-ui, sans-serif" font-weight="700" font-size="11" text-anchor="end">${escapeXml(toName)}</text>
</svg>`;
}
/** Art des Lifts, der einem gerade am nächsten ist (für die linke Seite der Skibus-Szene) */
function nearestLiftType(pos) {
  const net = skimap();
  if (!pos || !net) return 'chair_lift';
  let best = null;
  let bestD = Infinity;
  for (const l of net.lifts) {
    if (l.type === 'magic_carpet') continue;
    const d = geoDistance(pos, l.coords[0]);
    if (d < bestD) { bestD = d; best = l; }
  }
  return best?.type || 'chair_lift';
}

/** „Hahnenkamm · Pengelstein · Resterhöhe“ → „Hahnenkamm“ (passt unter den Berg) */
const shortArea = (a) => String(a || '').split(' · ')[0];
const escapeXml = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const FIT_ZOOM = 16;     // Route ins Bild: höchstens so nah – kurze Wege nicht unnötig klein
const EMPTY_REFRESH_MS = 20000; // „Wohin möchten Sie?“ höchstens so oft neu rechnen
const PEEK_S = 3;        // so lange zeigt die Karte eine geänderte Route
const PEEK_NEW_S = 4;    // neue Route: Karte fliegt erst hin, die Linie zeichnet sich – etwas länger
const ARRIVE_M = 45;     // so nah am Ziel = angekommen
const OFF_ROUTE_M = 120; // weiter weg = nicht auf der Route, Anzeige bleibt stehen

/** Schild-Symbol: Lift = Gondel, Piste = farbige Scheibe mit Nummer */
function stepIcon(s) {
  return s.kind === 'lift'
    ? h('span', { class: 'step-icon' }, icon(liftIcon(s.item.type)))
    : h('span', { class: `step-icon disc diff-${s.item.diff}` }, h('span', {}, s.item.ref || ''));
}

function stepText(s) {
  return s.kind === 'lift'
    ? t('route.stepLift', { name: s.item.name })
    : t('route.stepPiste', { name: pisteName(s.item) });
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const stat = (label, value) => h('div', {}, h('dt', {}, label), h('dd', { class: 'num' }, String(value)));

export function pisteName(p) {
  if (p.name && p.ref) return `${p.ref} ${p.name}`;
  // Manche Pisten haben in OpenStreetMap weder Name noch Nummer → „Blaue Piste“, nie „Piste null“
  return p.name || (p.ref ? `Piste ${p.ref}` : t(`piste.unnamed.${p.diff}`));
}
