// Route-Tab: Ziel wählen, Einstellung (schwarze Pisten meiden/bevorzugen …), Route anzeigen.
// Keine Live-Navigation: Die Route einmal anschauen, dann den Schildern folgen –
// deshalb steht die Wegbeschreibung mit Liftnamen und Pistennummern im Mittelpunkt.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { on } from '../../js/core/events.js';
import { api } from '../../js/services/api.js';
import { route, skimap } from '../../js/services/slopes.js';
import { drawRoute } from '../../js/map/layers.js';
import { distance as geoDistance } from '../../js/map/geo.js';
import { distance, duration } from '../../js/utils/format.js';
import { clock, todayAt, now } from '../../js/utils/time.js';
import { icon } from '../../js/components/icons.js';
import { config } from '../../js/config.js';
import { placeLogo, placeCover, mediaFor } from './place-media.js';

const MODES = ['fast', 'avoidBlack', 'preferBlack', 'easyOnly'];

export function mountRoutePanel(el, ctx) {
  let target = null;
  let mode = 'fast';
  let result = null;
  let layer = null;
  let picking = false;  // Uhrzeit für den Treffpunkt wird gerade gewählt

  function setTarget(place) {
    target = place;
    picking = false;
    calculate();
  }

  function calculate() {
    layer?.remove();
    layer = null;
    result = target && ctx.me.pos ? route(ctx.me.pos, target.node, mode) : null;
    if (result && !result.unreachable && result.coords.length > 1) {
      layer = drawRoute(ctx.map, result.coords);
      ctx.fit(L.latLngBounds(result.coords).extend(ctx.me.pos));
      // Fake-Chip fährt die Route ab (echter Chip: der Gast fährt selbst)
      api.guide(ctx.session.chip, target.node, mode);
    } else if (target) {
      ctx.fit(L.latLngBounds([target.pos, target.pos]), 15);
    }
    ctx.routeShown?.(!!layer);
    render();
  }

  function clearRoute() {
    target = null;
    result = null;
    layer?.remove();
    layer = null;
    api.guide(ctx.session.chip, null);
    ctx.routeShown?.(false);
    render();
  }

  function render() {
    if (!target) return replace(el, emptyState());
    const ok = result && !result.unreachable;
    replace(el,
      h('button', { class: 'back-btn', onclick: clearRoute }, icon('back'), t('route.back')),
      placeCard(target),
      meetRow(target),
      h('div', { class: 'choice-row', role: 'group', 'aria-label': t('tab.route') },
        MODES.map((m) => h('button', {
          class: 'choice',
          'aria-pressed': String(m === mode),
          onclick: () => { mode = m; calculate(); },
        }, m === 'easyOnly' ? h('i', { class: 'dot diff-easy' }) : null,
        m === 'avoidBlack' || m === 'preferBlack' ? h('i', { class: 'dot diff-advanced' }) : null,
        t(`route.mode.${m}`)))),
      result?.unreachable
        ? h('p', { class: 'note note-warn' }, icon('mountain'), t('route.otherArea', { area: result.area }))
        : ok ? summary(result) : h('p', { class: 'note note-warn' }, t('route.none')),
      ok ? h('h3', { class: 'steps-title' }, icon('route'), t('route.follow')) : null,
      ok ? steps(result, target) : null,
    );
  }

  function emptyState() {
    // Hütten in der Nähe als schneller Einstieg
    const near = ctx.me.pos
      ? [...skimap().huts].sort((a, b) => geoDistance(ctx.me.pos, a.pos) - geoDistance(ctx.me.pos, b.pos)).slice(0, 5)
      : [];
    return h('div', { class: 'stack' },
      h('h2', { class: 'title' }, t('route.title')),
      h('p', { class: 'muted' }, t('route.lead')),
      near.length ? h('ul', { class: 'quick-list' }, near.map((hut) => {
        const place = { type: 'hut', name: hut.name, pos: hut.pos, node: hut.node, hut };
        return h('li', {},
          h('button', { class: 'quick-item', onclick: () => setTarget(place) },
            placeLogo(place),
            h('span', { class: 'quick-text' }, h('strong', {}, hut.name),
              h('small', {}, t('place.away', { dist: distance(geoDistance(ctx.me.pos, hut.pos)) }), hut.ele ? `, ${hut.ele} m` : '')),
            icon('chevron')));
      })) : null,
    );
  }

  /** Karte mit Foto (oder gezeichneter Szene), Logo, Infos und großen Knöpfen. */
  function placeCard(place) {
    const sub = {
      piste: () => t(`diff.${place.diff}`),
      lift: () => place.sub,
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
    } else if (place.type === 'hut' || place.type === 'lift') {
      const q = encodeURIComponent(`${place.name} Kitzbühel`);
      actions.push(action('search', t('place.searchWeb'), t('place.searchWebSub'), `https://duckduckgo.com/?q=${q}`, true));
    }
    const facts = [];
    if (ctx.me.pos) facts.push(fact('walk', t('place.away', { dist: distance(geoDistance(ctx.me.pos, place.pos)) })));
    const ele = place.hut?.ele ?? (place.node != null ? skimap().ele[place.node] : null);
    if (ele) facts.push(fact('mountain', `${ele} m`));
    if (place.hut?.hours) facts.push(fact('clock', place.hut.hours));

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
      facts.length ? h('ul', { class: 'place-facts' }, facts) : null,
      actions.length ? h('div', { class: `place-actions n-${actions.length}` }, actions) : null,
    );
  }

  function summary(r) {
    const arrival = new Date(now().getTime() + r.time * 1000);
    const late = arrival > todayAt(config.resort.liftsClose) && r.lifts > 0;
    return h('div', { class: 'route-summary' },
      h('div', { class: 'route-time' },
        h('span', { class: 'num route-big' }, duration(r.time)),
        h('span', { class: 'route-eta' }, t('route.arrival', { time: clock(arrival) }))),
      h('dl', { class: 'route-stats' },
        stat(t('route.distance'), distance(r.dist)),
        stat(t('route.pistes'), r.pistes),
        stat(t('route.lifts'), r.lifts),
        stat(t('route.down'), `${Math.round(r.down)} m`)),
      focusToggle(),
      late ? h('p', { class: 'note note-warn' }, icon('clock'), t('route.afterClose')) : null,
      r.blacks && mode !== 'preferBlack' ? h('p', { class: 'note' }, h('i', { class: 'dot diff-advanced' }), t('route.blackWarn')) : null,
    );
  }

  /** Treffpunkt für die Gruppe: hier treffen wir uns (mit Uhrzeit) */
  function meetRow(place) {
    if (!ctx.session.group || !ctx.setMeeting || (place.type !== 'hut' && place.type !== 'lift')) return null;
    const m = ctx.meeting;
    if (m && m.name === place.name && !picking) {
      return h('div', { class: 'meet-here' }, icon('flag'),
        h('span', {}, h('strong', {}, t('meet.isHere')), h('small', {}, m.time ? t('meet.at', { time: m.time }) : t('meet.noTime'))),
        h('button', { class: 'btn btn-quiet btn-small', onclick: () => { picking = true; render(); } }, t('meet.change')),
        h('button', { class: 'meet-delete', 'aria-label': t('meet.delete'), title: t('meet.delete'), onclick: () => ctx.setMeeting(null) }, icon('close')));
    }
    if (!picking) {
      return h('button', { class: 'btn btn-quiet btn-block meet-btn', onclick: () => { picking = true; render(); } },
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
      h('button', { class: 'btn btn-quiet btn-small', onclick: () => { picking = false; render(); } }, t('cancel')));

    async function pick(time) {
      picking = false;
      await ctx.setMeeting(place, time);
      render();
    }
  }

  /** Vorschläge: die nächsten vier halben Stunden, frühestens in 15 min */
  function meetSlots() {
    const step = 30 * 60000;
    const first = Math.ceil((now().getTime() + 15 * 60000) / step) * step;
    return [0, 1, 2, 3].map((k) => clock(new Date(first + k * step)));
  }

  /** Schalter „Nur Route zeigen“ – blendet alle anderen Pisten, Lifte und Hütten aus */
  function focusToggle() {
    const on = ctx.mapFocus?.() === 'route';
    return h('button', {
      class: `switch-row${on ? ' is-on' : ''}`,
      role: 'switch',
      'aria-checked': String(on),
      onclick: () => {
        ctx.setFocus(on ? 'all' : 'route');
        render();
      },
    }, icon('eye'), h('span', {}, h('strong', {}, t('focus.routeOnly')), h('small', {}, t('focus.route.hint'))), h('i', { class: 'switch' }));
  }

  function action(ic, label, sub, href, external = false) {
    return h('a', { class: 'place-action', href, target: external ? '_blank' : null, rel: external ? 'noopener' : null },
      h('span', { class: 'place-action-icon' }, icon(ic)),
      h('span', { class: 'place-action-text' }, h('strong', {}, label), h('small', {}, sub)));
  }

  function fact(ic, text) {
    return h('li', {}, icon(ic), h('span', {}, text));
  }

  function steps(r, place) {
    return h('ol', { class: 'steps' },
      r.steps.map((s) => {
        const isLift = s.kind === 'lift';
        const name = isLift ? s.item.name : pisteName(s.item);
        return h('li', { class: `step step-${s.kind}` },
          isLift
            ? h('span', { class: 'step-icon' }, icon('gondola'))
            : h('span', { class: `step-icon disc diff-${s.item.diff}` }, h('span', {}, s.item.ref || '')),
          h('span', { class: 'step-text' },
            h('strong', {}, t(isLift ? 'route.stepLift' : 'route.stepPiste', { name })),
            h('small', {}, `${distance(s.len)}, ${duration(s.time)}`)));
      }),
      h('li', { class: 'step step-goal' },
        h('span', { class: 'step-icon' }, icon('flag')),
        h('span', { class: 'step-text' }, h('strong', {}, t('route.arrive', { name: place.name })))),
    );
  }

  const offs = [
    on('lang', render),
    on('focus', () => target && render()),
    on('meeting', () => target && render()),
  ];
  render();

  return {
    setTarget,
    refresh: () => { if (!target) render(); },
    destroy() {
      offs.forEach((off) => off());
      layer?.remove();
    },
  };
}

const stat = (label, value) => h('div', {}, h('dt', {}, label), h('dd', { class: 'num' }, String(value)));

export function pisteName(p) {
  if (p.name && p.ref) return `${p.ref} ${p.name}`;
  return p.name || (p.ref ? `Piste ${p.ref}` : t(`diff.${p.diff}`));
}
