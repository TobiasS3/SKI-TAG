// Gruppe/Familie: Wer ist wo? Radar, Live-Status, Spuren auf der Karte.
// „Vibrieren“ statt Notruf, wenn jemand verloren gegangen ist.
// Person antippen (Karte, Radar, „Zeigen“) → Karte zoomt nah ran, unten eine Karte mit
// „Hinfahren“ und „Vibrieren“.

import { h, replace, isWide } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { api } from '../../js/services/api.js';
import { skimap, nearestNode, route } from '../../js/services/slopes.js';
import { distance as geoDistance, bearing, compass } from '../../js/map/geo.js';
import { distance, duration } from '../../js/utils/format.js';
import { todayAt, now as clockNow } from '../../js/utils/time.js';
import { icon, iconHTML } from '../../js/components/icons.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';
import { pisteName } from './slopes-panel.js';
import { mountRace } from './group-race.js';
import { mountRangeAlarm } from './range-alarm.js';
import { mountGroupCheck } from './group-check.js';

const TRAIL = 50;             // so viele Punkte Spur pro Person
const STALE_S = 60;           // kein Signal seit … Sekunden → „kein Signal“

export function mountGroup(el, ctx, group) {
  const session = ctx.session;
  if (!group) {
    replace(el, h('div', { class: 'empty' }, icon('users'), h('p', { class: 'muted' }, t('group.none'))));
    return { destroy() {} };
  }

  // Sie selbst heißen in der Gruppe so, wie Sie sich angemeldet haben
  const members = group.members.map((m) => (m.chip === session.chip ? { ...m, name: session.name || m.name, me: true } : { ...m, me: false }));
  const others = members.filter((m) => !m.me); // wird länger, wenn Freunde dazukommen
  const live = new Map();      // chip → { p, receivedAt }
  const mapItems = new Map();  // chip → { marker, trail, coords }
  let selected = null;
  let link = null;             // gestrichelte Linie du → ausgewählte Person
  let carded = null;           // Person mit offener Karte (Hinfahren / Vibrieren)
  let tracking = false;        // Karte folgt ihr, bis du selbst die Karte verschiebst
  let trackFrom = 0;

  // --- Positionen empfangen ---------------------------------------------------------
  const race = mountRace(ctx, session.group, members);
  const alarm = mountRangeAlarm(session.group, session.chip, others, {
    onChange: () => {
      groupCheck.update();
      schedule();
    },
  });
  // Meldung oben: „Passt Ihre Gruppe?“ → Gruppe beim Reichweiten-Alarm öffnen
  const groupCheck = mountGroupCheck(ctx, others, alarm, {
    onCheck: () => {
      ctx.sheet.open('group');
      requestAnimationFrame(() => alarm.el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
  });
  const stops = others.map((m) => watch(m));

  function watch(m) {
    return api.watchChip(m.chip, (p) => onSignal(m, p));
  }

  function onSignal(m, p) {
    live.set(m.chip, { p, receivedAt: Date.now() });
    race.onPoint(m.chip, p);
    const pos = [p.lat, p.lng];
    let item = mapItems.get(m.chip);
    if (!item) {
      item = createMapItem(m, pos);
      mapItems.set(m.chip, item);
    }
    item.marker.setLatLng(pos);
    item.coords.push(pos);
    if (item.coords.length > TRAIL) item.coords.shift();
    item.trail.setLatLngs(item.coords);
    const markerEl = item.marker.getElement();
    if (markerEl) {
      markerEl.classList.toggle('is-lift', p.kind === 'lift' && p.speed > 0.5);
      markerEl.classList.toggle('is-moving', p.kind === 'piste' && p.speed > 0.5);
    }
    // Ausgewählte Person in der Mitte halten (erst wenn der Hinflug fertig ist)
    if (tracking && carded?.chip === m.chip && Date.now() > trackFrom) ctx.panTo(pos);
    schedule();
  }

  // --- Freund dazuholen (zufällig am Berg getroffen) ----------------------------------------
  const friendCard = h('section', { class: 'friend-card' });
  let friendOpen = false;
  let myCode = null;
  api.getFriendCode(session.chip).then((c) => { myCode = c; renderFriend(); });

  function renderFriend() {
    if (!friendOpen) {
      replace(friendCard, h('button', { class: 'btn btn-quiet btn-block', onclick: () => { friendOpen = true; renderFriend(); } },
        icon('users'), t('friend.add')));
      return;
    }
    const input = h('input', {
      class: 'friend-input num', inputmode: 'numeric', maxlength: '4', autocomplete: 'off', placeholder: '0000', 'aria-label': t('friend.code'),
    });
    const error = h('p', { class: 'friend-error', role: 'alert' });
    const send = h('button', { class: 'btn', type: 'submit' }, t('friend.send'));
    replace(friendCard,
      h('div', { class: 'friend-mine' },
        h('small', {}, t('friend.mine')),
        h('strong', { class: 'num' }, myCode || '····'),
        h('span', { class: 'muted small' }, t('friend.mineHint'))),
      h('form', {
        class: 'friend-form',
        onsubmit: async (e) => {
          e.preventDefault();
          const code = input.value.replace(/\D/g, '');
          if (code.length !== 4) { error.textContent = t('friend.error.format'); return; }
          send.disabled = true;
          send.textContent = t('friend.sending');
          const res = await api.addFriend(session.group, code, members);
          if (!res.ok) {
            send.disabled = false;
            send.textContent = t('friend.send');
            error.textContent = t(`friend.error.${res.error}`);
            return;
          }
          addMember(res.member);
          friendOpen = false;
          toast(t('friend.added', { name: res.member.name }), { icon: 'users' });
          render();
        },
      },
      h('label', { class: 'small', for: 'friend-code' }, t('friend.code')),
      h('div', { class: 'friend-row' }, Object.assign(input, { id: 'friend-code' }), send),
      error),
      h('button', { class: 'btn btn-quiet btn-small', onclick: () => { friendOpen = false; renderFriend(); } }, t('cancel')));
    input.focus();
  }

  function addMember(raw) {
    const m = { ...raw, me: false, added: true };
    members.push(m);
    others.push(m);
    stops.push(watch(m));
  }

  function createMapItem(m, pos) {
    const trail = L.polyline([pos], {
      pane: 'track', color: m.color, weight: 4, opacity: 0.55, lineCap: 'round', interactive: false, className: 'friend-trail',
    }).addTo(ctx.map);
    const marker = L.marker(pos, {
      icon: L.divIcon({
        className: `mk-friend${m.kid ? ' is-kid' : ''}`,
        html: `<span class="mk-friend-pulse" style="--c:${m.color}"></span>
               <span class="mk-friend-dot" style="--c:${m.color}">${m.name[0]}</span>
               <span class="mk-friend-name">${m.name}</span>
               <span class="mk-friend-act">${iconHTML('gondola')}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
      zIndexOffset: 900,
      title: m.name,
    }).addTo(ctx.map);
    marker.on('click', () => select(m.chip, true));
    return { marker, trail, coords: [pos] };
  }

  // --- Radar: wer ist wo, von mir aus gesehen (Norden oben) -----------------------------
  // Wurzel-Maßstab: nahe Leute rücken nicht in die Mitte, weit entfernte passen trotzdem drauf.
  const radarSvg = h('div', { class: 'radar-svg' });
  const radar = h('div', { class: 'radar', role: 'img' }, radarSvg);
  // Ein Listener für alle Punkte (Punkte werden laufend neu gezeichnet)
  radar.addEventListener('pointerdown', (e) => {
    const dot = e.target.closest('.radar-dot');
    if (dot) select(dot.dataset.chip, true);
  });
  const radarScale = h('span', { class: 'radar-scale' });
  const radarTitle = h('h3', { class: 'card-title' });
  const radarCard = h('section', { class: 'card radar-card' },
    h('div', { class: 'radar-head' }, radarTitle, radarScale),
    radar);

  function renderRadar() {
    const me = ctx.me.pos;
    const R = 112; // äußerer Ring in SVG-Einheiten
    radarTitle.textContent = t('group.radar');
    const points = others.map((m) => {
      const l = live.get(m.chip);
      if (!l || !me) return null;
      const pos = [l.p.lat, l.p.lng];
      return { m, d: geoDistance(me, pos), b: bearing(me, pos) };
    }).filter(Boolean);
    const limit = alarm.on() ? alarm.range() : 0;
    const max = niceScale(Math.max(300, limit * 1.2, ...points.map((p) => p.d)));
    const rOf = (d) => Math.sqrt(Math.min(1, d / max)) * R;
    radarScale.textContent = t('group.radarScale', { dist: distance(max) });

    // Ringe bei 1/16, 1/4 und ganzer Reichweite → im Wurzel-Maßstab gleichmäßig verteilt
    const rings = [max / 16, max / 4, max].map(niceRound);
    const ringsSvg = rings.map((d, k) => {
      const r = rOf(d);
      return `<circle r="${r.toFixed(1)}" class="radar-ring${k === 2 ? ' is-outer' : ''}"/>
        <text x="${(r * 0.71 + 3).toFixed(1)}" y="${(r * 0.71 + 10).toFixed(1)}" class="radar-ring-label">${distance(d)}</text>`;
    }).join('');
    // Alarm-Grenze als orange gestrichelter Kreis
    const rangeSvg = limit ? (() => {
      const r = rOf(limit);
      return `<circle r="${r.toFixed(1)}" class="radar-range"/>
        <text y="${(-r - 4).toFixed(1)}" class="radar-range-label">${t('range.ring', { dist: distance(limit) })}</text>`;
    })() : '';
    const compassSvg = [['N', 0, -1], [getLang() === 'de' ? 'O' : 'E', 1, 0], ['S', 0, 1], ['W', -1, 0]]
      .map(([c, x, y]) => `<text x="${x * (R + 13)}" y="${y * (R + 13) + 4}" class="radar-compass${c === 'N' ? ' is-n' : ''}">${c}</text>`).join('');

    const lines = points.map(({ m, d, b }) => {
      const r = rOf(d);
      const x = Math.sin((b * Math.PI) / 180) * r;
      const y = -Math.cos((b * Math.PI) / 180) * r;
      return `<line x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-line" style="--c:${m.color}"/>`;
    }).join('');
    const dots = points.map(({ m, d, b }) => {
      const r = rOf(d);
      const x = Math.sin((b * Math.PI) / 180) * r;
      const y = -Math.cos((b * Math.PI) / 180) * r;
      return `<g class="radar-dot${selected === m.chip ? ' is-selected' : ''}${alarm.isOut(m.chip) ? ' is-out' : ''}" data-chip="${m.chip}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" style="--c:${m.color}">
        <circle r="22" class="radar-dot-hit"/>
        <circle r="15" class="radar-dot-ring"/>
        <circle r="12" class="radar-dot-core"/>
        <text dy="4.5" class="radar-dot-initial">${m.name[0]}</text>
        <text dy="29" class="radar-dot-name">${m.name} · ${distance(d)}</text>
      </g>`;
    }).join('');

    radar.setAttribute('aria-label', points.map((p) => `${p.m.name}: ${distance(p.d)} ${compass(p.b, getLang())}`).join(', '));
    radarSvg.innerHTML = `
      <svg viewBox="-135 -135 270 270">
        <circle r="${R}" class="radar-bg"/>
        ${ringsSvg}
        ${rangeSvg}
        <line x1="-${R}" x2="${R}" class="radar-axis"/><line y1="-${R}" y2="${R}" class="radar-axis"/>
        ${compassSvg}
        ${lines}
        <circle r="16" class="radar-me-halo"/>
        <circle r="7" class="radar-me"/>
        ${dots}
      </svg>`;
  }

  // --- Personen-Karten ----------------------------------------------------------------
  const list = h('ul', { class: 'members' });
  const rows = new Map();
  // Hinweis, wenn jemand außer Reichweite ist – „Zeigen“ springt auf der Karte hin
  // (Knopf bleibt bestehen, nur der Text ändert sich)
  let warnTargets = [];
  const warningText = h('span');
  const warningBtn = h('button', { class: 'btn btn-small btn-sun', onclick: () => warnTargets.length && select(warnTargets[0].chip, true) });
  const warning = h('div', { class: 'note note-alert', hidden: true }, icon('avalanche'), warningText, warningBtn);

  function buildList() {
    rows.clear();
    replace(list, ...members.map((m) => {
      const status = h('span', { class: 'member-status' });
      const meta = h('span', { class: 'member-meta' });
      const battery = h('span', { class: 'chip-battery' });
      const actions = m.me ? null : h('div', { class: 'member-actions' },
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => select(m.chip, true) }, icon('locate'), t('group.show')),
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => routeTo(m) }, icon('route'), t('group.routeTo')),
        h('button', { class: 'btn btn-sun btn-small', onclick: () => signal([m]) }, icon('vibrate'), t('group.signal')));
      const li = h('li', {
        class: `member${m.me ? ' is-me' : ''}`,
        style: { '--c': m.color },
        onclick: (e) => !m.me && !e.target.closest('button') && select(m.chip, false),
      },
        h('span', { class: `avatar${m.kid ? ' is-kid' : ''}` }, m.name[0], h('i', { class: 'avatar-signal' })),
        h('div', { class: 'member-text' },
          h('div', { class: 'member-name' },
            h('strong', {}, m.me ? `${m.name} (${t('group.you')})` : m.name),
            m.kid ? h('span', { class: 'tag tag-kid' }, t('group.kid')) : null,
            battery),
          status,
          meta),
        actions);
      rows.set(m.chip, { li, status, meta, battery });
      return li;
    }));
  }

  function activity(p) {
    const map = skimap();
    if (!p) return { icon: 'clock', text: t('group.waitingSignal') };
    if (p.kind === 'lift' && p.ref != null && p.speed > 0.5) return { icon: 'gondola', text: t('day.onLift', { name: map.lifts[p.ref].name }) };
    if (p.kind === 'lift' && p.ref != null) return { icon: 'clock', text: t('group.queue', { name: map.lifts[p.ref].name }) };
    if (p.kind === 'piste' && p.ref != null && p.speed > 0.5) return { icon: 'piste', text: t('day.onPiste', { name: pisteName(map.pistes[p.ref]) }) };
    return { icon: 'flag', text: t('group.still') };
  }

  /** Nur wenn der Gruppen-Tab offen ist, lohnt sich Liste, Radar und Rangliste neu zu zeichnen */
  const shown = () => ctx.sheet.current() === 'group' && (ctx.sheet.isExpanded() || isWide());

  function update() {
    renderMeeting(); // rechnet auch die Erinnerung „jetzt losfahren“ – läuft daher immer
    updateLink();
    if (carded && personCard.isConnected) renderCard();
    const me = ctx.me.pos;
    // Reichweiten-Alarm läuft immer – auch wenn der Gruppen-Tab zu ist
    const far = alarm.check(others.map((m) => {
      const l = live.get(m.chip);
      return l && me ? { m, d: geoDistance(me, [l.p.lat, l.p.lng]) } : null;
    }).filter(Boolean));
    if (!shown()) return;
    rows.forEach(({ li, status, meta, battery }, chip) => {
      const m = members.find((x) => x.chip === chip);
      const l = m.me
        ? (me ? { p: { ...ctx.me, lat: me[0], lng: me[1] }, receivedAt: Date.now() } : null)
        : live.get(chip);
      const p = l?.p;
      const act = activity(p);
      status.replaceChildren(icon(act.icon), h('span', {}, act.text));
      li.classList.toggle('is-moving', !!p && p.speed > 0.5);
      li.classList.toggle('is-selected', selected === chip);

      const parts = [];
      if (!m.me && p && me) {
        const pos = [p.lat, p.lng];
        const d = geoDistance(me, pos);
        parts.push(`${distance(d)} ${compass(bearing(me, pos), getLang())}`);
      }
      if (p && p.speed > 0.5) parts.push(`${Math.round(p.speed * 3.6)} km/h`);
      if (l && !m.me) {
        const ago = Math.round((Date.now() - l.receivedAt) / 1000);
        parts.push(ago > STALE_S ? t('group.noSignal') : ago < 5 ? t('group.liveNow') : t('group.ago', { s: ago }));
        li.classList.toggle('is-stale', ago > STALE_S);
      }
      meta.replaceChildren(...parts.map((part) => h('span', {}, part)));
      const bat = p?.battery ?? null;
      battery.replaceChildren(...(bat == null ? [] : [batteryIcon(bat), `${bat}%`]));
      battery.classList.toggle('is-low', bat != null && bat < 20);
    });

    warnTargets = far.map((f) => f.m);
    warning.hidden = !far.length;
    if (far.length === 1) warningText.textContent = t('range.far', { name: far[0].m.name, dist: distance(far[0].d) });
    if (far.length > 1) warningText.textContent = t('range.farMany', { names: far.map((f) => f.m.name).join(', ') });
    warningBtn.replaceChildren(icon('locate'), t('group.show'));
    renderRadar();
    if (++raceTick % 3 === 0) race.render(); // Rangliste nicht bei jedem Signal neu zeichnen
  }
  let raceTick = 0;

  // --- Auswahl: Linie zur Person + Karte hinfliegen -----------------------------------
  function select(chip, fly) {
    selected = selected === chip && !fly ? null : chip;
    const l = live.get(chip);
    if (fly && l) {
      // Karte mit Aktionen unten, Bereich einklappen – dann nah an die Person ran
      if (ctx.sheet.current() !== 'group') ctx.sheet.select('group');
      showCard(members.find((x) => x.chip === chip));
      ctx.sheet.collapse();
      ctx.focus([l.p.lat, l.p.lng], 17);
    }
    mapItems.forEach((item, c) => item.marker.getElement()?.classList.toggle('is-selected', c === selected));
    update();
  }

  // --- Personen-Karte unten: Hinfahren + Vibrieren ------------------------------------
  const personCard = h('div', { class: 'person-card' });

  function showCard(m) {
    // Während einer Route bleibt unten das Schild stehen – dann nur hinzoomen
    if (ctx.page.classList.contains('route-running')) return;
    carded = m;
    tracking = true;
    trackFrom = Date.now() + 1200;
    renderCard();
    ctx.sheet.setTop(personCard);
  }

  function hideCard() {
    if (!carded) return;
    carded = null;
    tracking = false;
    if (personCard.isConnected) ctx.sheet.setTop(null);
    selected = null;
    mapItems.forEach((item) => item.marker.getElement()?.classList.remove('is-selected'));
    updateLink();
  }

  function renderCard() {
    const m = carded;
    const p = live.get(m.chip)?.p;
    const act = activity(p);
    const where = p && ctx.me.pos ? (() => {
      const pos = [p.lat, p.lng];
      return `${distance(geoDistance(ctx.me.pos, pos))} ${compass(bearing(ctx.me.pos, pos), getLang())}`;
    })() : null;
    replace(personCard,
      h('div', { class: 'person-card-head', style: { '--c': m.color } },
        h('span', { class: `avatar${m.kid ? ' is-kid' : ''}` }, m.name[0]),
        h('span', { class: 'person-card-text' },
          h('strong', {}, m.name),
          h('small', {}, icon(act.icon), h('span', {}, where ? `${act.text} · ${where}` : act.text))),
        h('button', { class: 'person-card-close', 'aria-label': t('close'), onclick: hideCard }, icon('close'))),
      h('div', { class: 'person-card-actions' },
        h('button', { class: 'btn btn-quiet', onclick: () => { hideCard(); routeTo(m); } }, icon('route'), t('group.routeTo')),
        h('button', { class: 'btn btn-sun', onclick: () => signal([m]) }, icon('vibrate'), t('group.signal'))));
  }
  const stopTracking = () => { tracking = false; };
  ctx.map.on('click', hideCard);
  ctx.map.on('dragstart', stopTracking);

  function updateLink() {
    const l = selected && live.get(selected);
    if (!l || !ctx.me.pos) {
      link?.remove();
      link = null;
      return;
    }
    const m = members.find((x) => x.chip === selected);
    const coords = [ctx.me.pos, [l.p.lat, l.p.lng]];
    if (!link) {
      link = L.polyline(coords, {
        pane: 'route', color: m.color, weight: 3, dashArray: '4 10', lineCap: 'round', interactive: false, className: 'friend-link',
      }).addTo(ctx.map);
    } else {
      link.setLatLngs(coords);
      link.setStyle({ color: m.color });
    }
  }

  // --- Treffpunkt: wo, wann, wer schafft es rechtzeitig ------------------------------------
  const meetCard = h('section', { class: 'meet-card' });
  let etaCache = { at: 0, list: [] };
  let reminded = null; // Treffpunkt, für den „jetzt losfahren“ schon kam

  /** Fahrzeit jeder Person zum Treffpunkt (höchstens alle 10 s neu – die Suche kostet etwas) */
  function etas(m) {
    if (Date.now() - etaCache.at < 10000 && etaCache.key === m.name) return etaCache.list;
    const list = members.map((x) => {
      const pos = x.me ? ctx.me.pos : (live.get(x.chip) && [live.get(x.chip).p.lat, live.get(x.chip).p.lng]);
      if (!pos) return { m: x, eta: null };
      if (geoDistance(pos, m.pos) < 60) return { m: x, eta: 0 };
      const r = route(pos, m.node, 'fast');
      return { m: x, eta: r && !r.unreachable ? r.time : null };
    });
    // Fehlt noch jemandes Position, beim nächsten Mal gleich neu rechnen
    etaCache = { at: list.some((x) => x.eta == null) ? 0 : Date.now(), key: m.name, list };
    return list;
  }

  function renderMeeting() {
    const m = ctx.meeting;
    if (!m) {
      replace(meetCard, h('p', { class: 'meet-empty' }, icon('flag'), h('span', {}, t('meet.hint'))));
      meetCard.classList.remove('is-set');
      return;
    }
    meetCard.classList.add('is-set');
    const nowT = clockNow();
    const at = m.time ? todayAt(m.time) : null;
    const left = at ? (at - nowT) / 1000 : null;
    const list = etas(m);

    // Für dich: rechtzeitig erinnern
    const mine = list.find((x) => x.m.me);
    if (at && mine?.eta && reminded !== `${m.name}${m.time}` && left - mine.eta < 120 && left > 0) {
      reminded = `${m.name}${m.time}`;
      toast(t('meet.leaveNow', { name: m.name, eta: duration(mine.eta) }), { icon: 'flag', ms: 7000 });
      navigator.vibrate?.([60, 40, 60]);
    }

    replace(meetCard,
      h('div', { class: 'meet-head' },
        h('span', { class: 'meet-pin' }, icon('flag')),
        h('span', { class: 'meet-title' },
          h('small', {}, t('meet.title')),
          h('strong', {}, m.name)),
        m.time ? h('span', { class: 'meet-time' },
          h('strong', { class: 'num' }, m.time),
          h('small', {}, left > 0 ? t('meet.in', { time: duration(left) }) : t('meet.now'))) : null),
      h('ul', { class: 'meet-list' }, list.map(({ m: x, eta }) => {
        let state = '';
        if (eta != null && left != null) state = eta <= left ? 'is-ok' : eta <= left + 300 ? 'is-tight' : 'is-late';
        if (eta === 0) state = 'is-there';
        return h('li', { class: state, style: { '--c': x.color } },
          h('span', { class: 'avatar' }, x.name[0]),
          h('span', { class: 'meet-who' }, x.me ? t('group.you') : x.name),
          h('span', { class: 'meet-eta' },
            eta === 0 ? t('meet.there') : eta == null ? '–' : t('meet.eta', { time: duration(eta) }),
            state && state !== 'is-there' ? h('em', {}, t(`meet.state.${state.slice(3)}`)) : null));
      })),
      h('div', { class: 'meet-actions' },
        h('button', { class: 'btn btn-small', onclick: () => ctx.choose(ctx.meetingPlace()) }, icon('route'), t('meet.route')),
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => ctx.setMeeting(null) }, icon('close'), t('meet.clear'))));
  }

  function routeTo(m) {
    const l = live.get(m.chip);
    if (!l) return;
    const pos = [l.p.lat, l.p.lng];
    ctx.choose({ type: 'person', name: m.name, pos, node: nearestNode(pos), member: m });
  }

  async function signal(targets) {
    if (!targets.length) return;
    const all = targets.length > 1;
    const ok = await confirmModal({
      title: all ? t('group.signalAll.title') : t('group.signal.title', { name: targets[0].name }),
      text: t('group.signal.text'),
      ok: t('group.signal.ok'),
      cancel: t('cancel'),
    });
    if (!ok) return;
    const results = await Promise.all(targets.map((m) => api.signalGroup(session.group, m.chip)));
    if (!results.every((r) => r.ok)) return;
    navigator.vibrate?.([120, 80, 120]);
    toast(all ? t('group.signalAll.sent') : t('group.signal.sent', { name: targets[0].name }), { icon: 'vibrate' });
    targets.forEach((m) => {
      const markerEl = mapItems.get(m.chip)?.marker.getElement();
      const row = rows.get(m.chip)?.li;
      [markerEl, row].forEach((node) => {
        node?.classList.add('is-buzzing');
        setTimeout(() => node?.classList.remove('is-buzzing'), 2400);
      });
    });
  }

  function showAll() {
    const pts = [...live.values()].map((l) => [l.p.lat, l.p.lng]);
    if (ctx.me.pos) pts.push(ctx.me.pos);
    if (!pts.length) return;
    ctx.sheet.collapse();
    ctx.fit(L.latLngBounds(pts), 16);
  }

  // --- Aufbau ------------------------------------------------------------------------------
  function render() {
    buildList();
    renderFriend();
    race.render();
    alarm.render();
    replace(el,
      h('header', { class: 'group-head' },
        h('div', {},
          h('h2', { class: 'title' }, group.name),
          h('p', { class: 'muted small' }, t('group.lead', { n: members.length }))),
        h('button', { class: 'btn btn-quiet btn-small', onclick: showAll }, icon('map'), t('group.showAll'))),
      meetCard,
      radarCard,
      warning,
      alarm.el,
      list,
      friendCard,
      race.el,
      h('div', { class: 'group-call' },
        h('button', { class: 'btn btn-block btn-sun', onclick: () => signal(others) }, icon('vibrate'), t('group.signalAll')),
        h('p', { class: 'muted small' }, t('group.signalExplain'))),
    );
    update();
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      update();
    });
  }

  const offs = [on('lang', render), on('me', schedule), on('sheet:tab', schedule), on('sheet:expanded', schedule), on('meeting', () => {
    etaCache.at = 0;
    renderMeeting();
  })];
  const ticker = setInterval(update, 5000); // „vor … s“ weiterzählen
  render();

  return {
    destroy() {
      race.destroy();
      groupCheck.destroy();
      stops.forEach((stop) => stop());
      offs.forEach((off) => off());
      clearInterval(ticker);
      mapItems.forEach((item) => {
        item.marker.remove();
        item.trail.remove();
      });
      link?.remove();
      ctx.map.off('click', hideCard);
      ctx.map.off('dragstart', stopTracking);
    },
  };
}

/** Runde Radar-Skala: 300 m, 500 m, 1 km, 2 km, 5 km … */
/** Ringabstand runden: 187 → 200 m, 3120 → 3 km */
function niceRound(m) {
  return m < 1000 ? Math.max(50, Math.round(m / 50) * 50) : Math.round(m / 500) * 500;
}

function niceScale(m) {
  const steps = [300, 500, 1000, 2000, 3000, 5000, 8000, 12000];
  return steps.find((s) => s >= m) || steps[steps.length - 1];
}

/** Kleines Akku-Symbol, Füllung nach Prozent. */
function batteryIcon(pct) {
  const w = Math.max(1, Math.round((pct / 100) * 12));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 10');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<rect x=".75" y=".75" width="16" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="18" y="3.5" width="1.5" height="3" rx=".5" fill="currentColor"/>
    <rect x="2.5" y="2.5" width="${w}" height="5" rx="1" fill="currentColor"/>`;
  return svg;
}
