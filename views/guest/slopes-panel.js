// Route-Tab: Ziel wählen, Einstellung (schwarze Pisten meiden/bevorzugen …), Route anzeigen.
// Im Mittelpunkt steht die Wegbeschreibung mit Liftnamen und Pistennummern – den Schildern folgen.
//
// „Route starten“: Karte folgt dir, unten statt der Tabs eine Leiste mit dem aktuellen Schild
// und „Route beenden“. Hochziehen zeigt alle Schilder, das aktuelle ist markiert.

import { h, replace, reducedMotion } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { api } from '../../js/services/api.js';
import { route, routeToAny, skimap } from '../../js/services/slopes.js';
import { liftState, isRunning, pisteState } from '../../js/services/lift-status.js';
import { openingState } from '../../js/utils/hours.js';
import { drawRoute } from '../../js/map/layers.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { distance, duration } from '../../js/utils/format.js';
import { clock, todayAt, now } from '../../js/utils/time.js';
import { icon, liftIcon } from '../../js/components/icons.js';
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

  function calculate() {
    layer?.remove();
    layer = null;
    result = !target || !ctx.me.pos ? null
      : target.nodes ? routeToAny(ctx.me.pos, target.nodes, target.pos, mode) // Parkplatz: schnellster Zugang
        : route(ctx.me.pos, target.node, mode);
    if (result && !result.unreachable && result.coords.length > 1) {
      layer = drawRoute(ctx.map, result.coords, result.steps, { color: '#ff5b22', flow: '#fff' });
      if (animateNext) {
        drawIn(layer);
        el.classList.add('route-enter');
        setTimeout(() => el.classList.remove('route-enter'), 1100);
      }
      const bounds = L.latLngBounds(result.coords).extend(ctx.me.pos);
      if (animateNext) {
        // Neue Route: Bereich klappt runter, Karte zeigt die ganze Route von weit oben.
        // Antippen auf „Route“ holt die Details wieder hoch.
        ctx.sheet.collapse();
        setTimeout(() => ctx.fit(bounds, 14), 380);
      } else {
        ctx.fit(bounds);
      }
    } else if (target) {
      ctx.fit(L.latLngBounds([target.pos, target.pos]), 15);
    }
    animateNext = false;
    ctx.routeShown?.(!!layer);
    render();
  }

  function clearRoute() {
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
    api.guide(ctx.session.chip, target.node, mode);
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

  /** Neue Position: welcher Schritt ist dran? Angekommen? */
  function track() {
    if (!running || !ctx.me.pos) return;
    if (geoDistance(ctx.me.pos, target.pos) < ARRIVE_M) return stop({ arrived: true });
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
      h('div', { class: 'choice-row', role: 'group', 'aria-label': t('tab.route') },
        MODES.map((m) => h('button', {
          class: 'choice',
          'aria-pressed': String(m === mode),
          onclick: () => { mode = m; calculate(); },
        }, m === 'easyOnly' ? h('i', { class: 'dot diff-easy' }) : null,
        m === 'avoidBlack' || m === 'preferBlack' ? h('i', { class: 'dot diff-advanced' }) : null,
        t(`route.mode.${m}`)))),
      result?.unreachable
        ? h('div', { class: 'note note-area', role: 'note' }, icon('mountain'),
          h('div', {},
            h('strong', {}, t('route.otherAreaTitle')),
            h('span', {}, t('route.otherArea', { area: result.area }))))
        : ok ? summary(result) : h('p', { class: 'note note-warn' }, t('route.none')),
      ok ? h('h3', { class: 'steps-title' }, t('route.follow')) : null,
      ok && ctx.liftStatus ? h('p', { class: 'small muted steps-note' }, icon('check'), t('route.statusIncluded')) : null,
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

  function emptyState() {
    // Einzelne Ziele zum Antippen: zurück zum Start/Auto, ins Tal, Streif, 3S Bahn.
    // Gruppen (alle Talabfahrten, Parkplätze, Hütten …) gibt es oben in der Suche.
    const rental = ctx.session.rental || (config.fakeData ? 'Hahnenkammbahn' : null);
    const list = destinations({ getPos: () => ctx.me.pos, rental });
    return h('div', { class: 'stack' },
      h('h2', { class: 'title' }, t('route.title')),
      list.length ? h('ul', { class: 'quick-list dest-list' }, list.map((d) => h('li', {},
        h('button', { class: `quick-item dest-item${d.primary ? ' is-primary' : ''}`, onclick: () => setTarget(d.item) },
          h('span', { class: `search-sg-icon sg-${d.id}` }, icon(d.icon)),
          h('span', { class: 'quick-text' }, h('strong', {}, t(`dest.${d.id}`)), h('small', {}, d.sub)),
          icon('chevron'))))) : null,
      h('p', { class: 'muted small' }, t('route.lead')),
    );
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
      r.blacks && mode !== 'preferBlack' ? h('p', { class: 'note' }, h('i', { class: 'dot diff-advanced' }), t('route.blackWarn')) : null,
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
        return h('li', { class: `step step-${s.kind}${state}` },
          stepIcon(s),
          h('span', { class: 'step-text' },
            h('strong', {}, s.kind === 'lift' ? s.item.name : pisteName(s.item)),
            h('small', {}, `${t(s.kind === 'lift' ? 'route.verbUp' : 'route.verbDown')} · ${distance(s.len)} · ${duration(s.time)}`, liftNote(s))));
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
    // Route nur angeschaut, nicht gestartet: anderer Tab → Route verschwindet von der Karte
    on('sheet:tab', (id) => { if (id !== 'route' && target && !running) clearRoute(); }),
    on('focus', () => target && render()),
    on('meeting', () => { renderOver(); if (target) render(); }),
  ];
  render();

  return {
    setTarget,
    showPlace,
    closePreview,
    /** Die ganze Route ins Bild holen */
    showOnMap: () => { if (layer && result?.coords) ctx.fit(L.latLngBounds(result.coords).extend(ctx.me.pos)); },
    refresh: () => { if (!target) render(); },
    stop: () => stop(),
    destroy() {
      ctx.map.off('click', onMapClick);
      over.remove();
      if (running) api.guide(ctx.session.chip, null);
      offs.forEach((off) => off());
      layer?.remove();
    },
  };
}

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

const stat = (label, value) => h('div', {}, h('dt', {}, label), h('dd', { class: 'num' }, String(value)));

export function pisteName(p) {
  if (p.name && p.ref) return `${p.ref} ${p.name}`;
  // Manche Pisten haben in OpenStreetMap weder Name noch Nummer → „Blaue Piste“, nie „Piste null“
  return p.name || (p.ref ? `Piste ${p.ref}` : t(`piste.unnamed.${p.diff}`));
}
