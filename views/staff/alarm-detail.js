// Ein einzelner Einsatz: wer, wo, seit wann, wer ist zuständig – und was als Nächstes zu tun ist.
// Dazu das Vollbild „Neuer Notruf für dich“ mit Ton, Vibration und 60-Sekunden-Countdown.

import { h, reducedMotion } from '../../js/utils/dom.js';
import { t, getLang } from '../../js/core/i18n.js';
import { distance as geoDistance, bearing, compass } from '../../js/map/geo.js';
import { distance, number } from '../../js/utils/format.js';
import { clock, now } from '../../js/utils/time.js';
import { placeAt } from '../../js/services/slopes.js';
import { icon } from '../../js/components/icons.js';

export const OFFER_S = 60;
const RING = 2 * Math.PI * 46;
export const OUTCOMES = { sos: ['transport', 'treated', 'false'], search: ['found', 'handedOver', 'false'] };

export const isOpen = (a) => a.status !== 'done';
export const minutesSince = (at) => Math.max(0, Math.floor((now().getTime() - at) / 60000));

/** „gerade eben“ / „4 min“ / „1 h 05“ */
export function sinceText(at) {
  const s = (now().getTime() - at) / 1000;
  if (s < 60) return t('ops.justNow');
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Wie weit ist der Helfer? f = 0…1, left = Minuten (Simulationszeit wie beim Gast) */
export function progress(a, ctx) {
  const f = a.status === 'onsite' ? 1 : (ctx.staffPos[a.staff]?.f ?? 0);
  return { f, left: Math.max(0, Math.ceil(((1 - f) * (a.eta || 0)) / 60)) };
}

/** Von mir aus: Entfernung, Richtung, geschätzte Zeit (Skidoo/Ski ~20 km/h + 2 min Start) */
export function fromMe(a, ctx) {
  const d = geoDistance(ctx.myPos(), a.pos);
  return { dist: d, dir: compass(bearing(ctx.myPos(), a.pos), getLang()), eta: Math.ceil((120 + d / 5.5) / 60) };
}

/** Status in einem Satz: „Wartet auf Markus“, „Sandra unterwegs · noch 2 min“, „Lukas vor Ort seit 9 min“ */
export function statusLine(a, ctx) {
  const name = ctx.staffName(a.staff);
  if (a.status === 'new') return a.staff ? t('ops.status.waiting', { name }) : t('ops.status.nobody');
  if (a.status === 'accepted') {
    const { f, left } = progress(a, ctx);
    if (f >= 1 && a.staff === ctx.me.id) return t('ops.status.arrivedMe');
    return t('ops.status.enroute', { name, min: left });
  }
  if (a.status === 'onsite') {
    return now().getTime() - a.onsiteAt < 60000
      ? t('ops.status.onsiteNow', { name })
      : t('ops.status.onsite', { name, since: sinceText(a.onsiteAt) });
  }
  return t(`ops.outcome.${a.outcome}`);
}

/** Wer trägt den Chip? Miet-Chips haben keinen Namen (DSGVO) – nur Kind/Erwachsen und Mietstelle. */
export function personLine(a, ctx) {
  if (a.type === 'search') return t('ops.person.search', { name: a.name, by: a.by });
  const info = ctx.chipInfo.get(a.chip);
  if (!info) return a.source === 'app' ? t('ops.person.app') : t('ops.person.unknown');
  return t(`ops.person.${info.kind}`, { rental: info.rental, point: info.point, since: info.since });
}

/**
 * Detail-Karte eines Einsatzes (im Tab „Einsätze“, aufgeklappt).
 * act: { accept, pass, onsite, finish, takeOver, signal, route, closing (id oder null), setClosing }
 */
export function renderDetail(a, ctx, act) {
  const mine = a.staff === ctx.me.id;
  const place = placeAt(a.pos);
  const me = fromMe(a, ctx);
  const info = ctx.chipInfo.get(a.chip);

  // Ablauf: Eingang → Angenommen → Vor Ort → Erledigt
  const steps = [
    ['created', a.at],
    ['accepted', a.acceptedAt],
    ['onsite', a.onsiteAt],
    ['done', a.doneAt],
  ];
  const stepper = h('ol', { class: 'ops-steps' },
    steps.map(([k, at], i) => h('li', {
      class: at ? 'is-done' : steps.findIndex(([, x]) => !x) === i ? 'is-now' : '',
    }, h('i'), h('span', {}, t(`ops.step.${k}`)), h('small', { class: 'num' }, at ? clock(new Date(at)) : '–'))));

  const facts = h('dl', { class: 'ops-facts' },
    fact('locate', t('ops.fact.where'), ctx.where(a.pos)),
    fact('mountain', t('ops.fact.ele'), place ? `${number(place.ele)} m` : '–'),
    fact('route', t('ops.fact.fromMe'), me.dist < 50 ? t('ops.here') : `${distance(me.dist)} ${me.dir} · ~${me.eta} min`),
    fact('battery', t('ops.fact.battery'), a.battery != null ? `${a.battery} %` : '–'),
    fact('vibrate', t('ops.fact.chip'), a.chip, info?.rental),
    fact('siren', t('ops.fact.source'), t(`ops.source.${a.source}`)),
  );

  const coords = `${a.pos[0].toFixed(5)}, ${a.pos[1].toFixed(5)}`;
  const actions = h('div', { class: 'ops-actions' });
  if (act.closing === a.id) {
    actions.append(
      h('p', { class: 'ops-actions-q' }, t('ops.finish.q')),
      ...OUTCOMES[a.type].map((o) => h('button', { class: 'ops-outcome', onclick: () => act.finish(a, o) },
        icon(o === 'false' ? 'check' : o === 'transport' ? 'heart' : o === 'found' || o === 'handedOver' ? 'users' : 'shield'),
        h('span', {}, h('strong', {}, t(`ops.outcome.${o}`)), h('small', {}, t(`ops.outcome.${o}.hint`))))),
      h('button', { class: 'btn btn-quiet btn-small', onclick: () => act.setClosing(null) }, t('cancel')),
    );
  } else if (mine && a.status === 'new') {
    actions.append(
      h('button', { class: 'btn btn-danger btn-block', onclick: () => act.accept(a) }, icon('check'), t('ops.accept')),
      h('button', { class: 'btn btn-quiet btn-block', onclick: () => act.pass(a) }, icon('forward'), t('ops.pass')),
    );
  } else if (mine && a.status === 'accepted') {
    actions.append(
      h('button', { class: 'btn btn-danger btn-block', onclick: () => act.onsite(a) }, icon('flag'), t('ops.onsite')),
      h('button', { class: 'btn btn-quiet', onclick: () => act.route(a) }, icon('route'), t('ops.showRoute')),
    );
  } else if (mine && a.status === 'onsite') {
    actions.append(h('button', { class: 'btn btn-block', onclick: () => act.setClosing(a.id) }, icon('check'), t('ops.finish')));
  } else if (a.status === 'new') {
    actions.append(h('button', { class: 'btn btn-danger btn-block', onclick: () => act.takeOver(a) }, icon('check'), t('ops.takeOver')));
  }

  const extra = h('div', { class: 'ops-tools' },
    h('button', { class: 'ops-tool', onclick: () => act.signal(a) }, icon('vibrate'), t('ops.signal')),
    h('a', { class: 'ops-tool is-red', href: 'tel:140' }, icon('phone'), t('ops.call140')),
    a.phone ? h('a', { class: 'ops-tool', href: `tel:${a.phone.replace(/\s/g, '')}` }, icon('phone'), a.by) : null,
    h('button', {
      class: 'ops-tool',
      onclick: () => navigator.clipboard?.writeText(coords).then(() => act.copied()),
    }, icon('copy'), h('span', { class: 'num' }, coords)),
  );

  const log = h('ol', { class: 'ops-log' },
    [...a.log].reverse().map((e) => h('li', {},
      h('span', { class: 'num' }, clock(new Date(e.at))),
      h('span', {}, t(`ops.log.${e.key}`, { ...e.vars, outcome: e.vars.outcome ? t(`ops.outcome.${e.vars.outcome}`) : '' })))));

  return h('div', { class: 'ops-detail' },
    stepper,
    h('p', { class: 'ops-person' }, icon(info?.kind === 'kid' || a.type === 'search' ? 'users' : 'vibrate'), personLine(a, ctx)),
    a.status !== 'done' ? actions : null,
    facts,
    extra,
    h('details', { class: 'ops-log-wrap' }, h('summary', {}, t('ops.log.title')), log),
  );
}

function fact(name, label, value, sub) {
  return h('div', { class: 'ops-fact' },
    icon(name),
    h('dt', {}, label),
    h('dd', {}, value, sub ? h('small', {}, ` · ${sub}`) : null));
}

/**
 * Vollbild bei neuem Alarm für mich. check() nach jedem Update aufrufen.
 * Nach 60 s ohne Antwort geht der Alarm automatisch an den Nächsten (macht der Server).
 */
export function createIncoming(page, ctx, { onAccept, onPass }) {
  const el = h('div', { class: 'ops-incoming', hidden: true, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'inc-title' });
  page.append(el);
  const handled = new Set();
  const siren = createSiren();
  let current = null;
  let shownAt = 0;
  let ring = null;
  let countEl = null;

  function check() {
    const a = ctx.alarms.find((x) => x.status === 'new' && x.staff === ctx.me.id && !handled.has(`${x.id}:${x.offeredAt}`));
    if (current && (!a || a.id !== current.id)) close();
    if (a && !current) show(a);
    if (current) tick();
  }

  function show(a) {
    current = a;
    shownAt = Date.now();
    const me = fromMe(a, ctx);
    const place = placeAt(a.pos);
    const search = a.type === 'search';
    ring = h('span', {
      class: 'inc-ring',
      'aria-hidden': 'true',
      html: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="ring-bg"/><circle cx="50" cy="50" r="46" class="ring-bar" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>`,
    });
    countEl = h('span', { class: 'inc-count num' }, String(OFFER_S));
    const accept = h('button', { class: 'btn btn-big inc-accept', onclick: () => answer(onAccept) }, icon('check'), t('ops.accept'));
    el.classList.toggle('is-search', search);
    el.replaceChildren(
      h('div', { class: 'inc-card' },
        h('div', { class: 'inc-top' },
          h('span', { class: 'inc-kicker' }, h('i'), t(search ? 'ops.inc.searchKicker' : 'ops.inc.kicker')),
          h('button', {
            class: 'inc-mute', 'aria-label': t(ctx.muted ? 'ops.sound.on' : 'ops.sound.off'),
            onclick: (e) => {
              ctx.muted = !ctx.muted;
              if (ctx.muted) siren.stop(); else siren.start();
              e.currentTarget.replaceChildren(icon(ctx.muted ? 'mute' : 'sound'));
            },
          }, icon(ctx.muted ? 'mute' : 'sound'))),
        h('p', { class: 'inc-id num' }, `${a.id} · ${clock(new Date(a.at))}`),
        h('h2', { class: 'inc-title', id: 'inc-title' }, ctx.where(a.pos)),
        h('p', { class: 'inc-person' }, personLine(a, ctx)),
        h('div', { class: 'inc-facts' },
          incFact(distance(me.dist), t('ops.inc.away', { dir: me.dir })),
          incFact(`~${me.eta}`, t('ops.inc.minutes')),
          incFact(place ? number(place.ele) : '–', t('ops.inc.ele')),
          incFact(a.battery != null ? `${a.battery}%` : '–', t('ops.fact.battery'))),
        h('div', { class: 'inc-timer' }, h('div', { class: 'inc-ring-wrap' }, ring, countEl), h('p', {}, t('ops.inc.timer'))),
        accept,
        h('button', { class: 'btn btn-big inc-pass', onclick: () => answer(onPass) }, icon('forward'), t('ops.pass')),
      ),
    );
    el.hidden = false;
    page.classList.add('has-incoming');
    accept.focus();
    if (!ctx.muted) siren.start();
    // Karte im Hintergrund zeigt den Ort schon mal
    ctx.focus(a.pos, 15.5);
  }

  function tick() {
    const left = Math.max(0, OFFER_S - (Date.now() - shownAt) / 1000);
    countEl.textContent = String(Math.ceil(left));
    const bar = ring.querySelector('.ring-bar');
    bar.style.transition = reducedMotion() ? 'none' : 'stroke-dashoffset 1s linear';
    bar.style.strokeDashoffset = String(RING * (1 - left / OFFER_S));
    el.classList.toggle('is-late', left < 15);
  }

  function answer(fn) {
    const a = current;
    handled.add(`${a.id}:${a.offeredAt}`);
    close();
    fn(a);
  }

  function close() {
    if (current) handled.add(`${current.id}:${current.offeredAt}`);
    current = null;
    siren.stop();
    el.hidden = true;
    page.classList.remove('has-incoming');
  }

  const onKey = (e) => {
    if (current && e.key === 'Enter' && e.target === document.body) answer(onAccept);
  };
  addEventListener('keydown', onKey);

  return {
    check,
    destroy() {
      siren.stop();
      removeEventListener('keydown', onKey);
    },
  };
}

function incFact(value, label) {
  return h('div', { class: 'inc-fact' }, h('strong', { class: 'num' }, value), h('small', {}, label));
}

/** Zweiton-Sirene über den Lautsprecher (Web Audio) + Vibration. Kein Audio-File nötig. */
function createSiren() {
  let audio = null;
  let timer = 0;
  function beep() {
    const t0 = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(960, t0);
    osc.frequency.setValueAtTime(720, t0 + 0.22);
    osc.frequency.setValueAtTime(960, t0 + 0.44);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
    gain.gain.setValueAtTime(0.25, t0 + 0.62);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.72);
    navigator.vibrate?.([300, 120, 300]);
  }
  return {
    start() {
      if (timer) return;
      try {
        audio ||= new (window.AudioContext || window.webkitAudioContext)();
        audio.resume?.();
        beep();
        timer = setInterval(beep, 1500);
      } catch {
        /* Kein Ton möglich (z. B. vor dem ersten Antippen) – Bild reicht */
      }
    },
    stop() {
      clearInterval(timer);
      timer = 0;
    },
  };
}

