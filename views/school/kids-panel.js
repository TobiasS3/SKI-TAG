// Tab „Gruppe“: Durchzählen auf einen Blick, alle anpiepsen, jedes Kind mit Abstand, Akku,
// Eltern-Telefon und wichtigen Hinweisen (Allergie, Abholung …).

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { distance } from '../../js/utils/format.js';
import { clock, now as clockNow } from '../../js/utils/time.js';
import { reducedMotion } from '../../js/utils/dom.js';
import { icon } from '../../js/components/icons.js';
import { toast } from '../../js/components/toast.js';

const LOW = 20;

export function mountKids(el, ctx) {
  let live = [];
  let counting = false;

  function build() {
    live = [];
    replace(el, hero(), h('div', { class: 'kid-list' }, ctx.kids.map(row)));
  }

  // --- Oben: Durchzählen ---------------------------------------------------------------
  function hero() {
    const big = h('strong', { class: 'num kc-big' });
    const sub = h('span', { class: 'kc-sub' });
    const last = h('small', { class: 'kc-last' });
    const faces = ctx.kids.map((k) => h('span', { class: 'kc-face', style: { '--c': k.color }, title: k.name }, k.name[0], h('i', {})));
    const card = h('section', { class: 'kc' },
      h('div', { class: 'kc-top' },
        h('div', { class: 'kc-count' }, big, h('span', {}, sub, last))),
      h('div', { class: 'kc-faces' }, faces),
      h('div', { class: 'kc-actions' },
        h('button', { class: 'btn kc-btn', onclick: () => count(card, faces) }, icon('headcount'), t('school.count')),
        h('button', { class: 'btn btn-quiet kc-btn', onclick: () => gatherAll() }, icon('vibrate'), t('school.gather'))));
    live.push(() => {
      const near = ctx.kids.filter((k) => ctx.live.has(k.chip) && !ctx.isAway(k.chip)).length;
      const total = ctx.kids.length;
      big.replaceChildren(String(near), h('small', {}, `/${total}`));
      card.classList.toggle('is-missing', near < total);
      sub.textContent = near === total
        ? t('school.allHere', { m: ctx.group.radius })
        : t('school.someAway', { n: total - near, m: ctx.group.radius });
      const lc = ctx.headcounts[ctx.headcounts.length - 1];
      last.textContent = lc ? t('school.lastCount', { time: clock(new Date(lc.at)), n: lc.present, total: lc.total }) : t('school.neverCounted');
      if (!counting) {
        ctx.kids.forEach((k, i) => faces[i].classList.toggle('is-away', ctx.isAway(k.chip)));
      }
    });
    return card;
  }

  /** Durchzählen: Kind für Kind abhaken – wer außerhalb vom Kreis ist, bekommt ein Ausrufezeichen */
  function count(card, faces) {
    if (counting) return;
    counting = true;
    card.classList.add('is-counting');
    faces.forEach((f) => f.classList.remove('is-ok', 'is-missing'));
    const step = reducedMotion() ? 0 : 160;
    const missing = [];
    ctx.kids.forEach((k, i) => {
      setTimeout(() => {
        const ok = ctx.live.has(k.chip) && ctx.distTo(k.chip) <= ctx.group.radius;
        if (!ok) missing.push(k);
        faces[i].classList.add(ok ? 'is-ok' : 'is-missing');
        navigator.vibrate?.(ok ? 15 : [60, 40, 60]);
      }, step * (i + 1));
    });
    setTimeout(() => {
      counting = false;
      card.classList.remove('is-counting');
      const present = ctx.kids.length - missing.length;
      ctx.headcounts.push({ at: clockNow().getTime(), present, total: ctx.kids.length, missing: missing.map((k) => k.name) });
      toast(missing.length
        ? t('school.count.missing', { names: missing.map((k) => `${k.name} (${distance(ctx.distTo(k.chip) ?? 0)})`).join(', ') })
        : t('school.count.ok', { n: present }), { icon: missing.length ? 'alert' : 'check', ms: 5000 });
      live.forEach((fn) => fn());
      setTimeout(() => faces.forEach((f) => f.classList.remove('is-ok', 'is-missing')), 4000);
    }, step * (ctx.kids.length + 2));
  }

  async function gatherAll() {
    await ctx.signal(ctx.kids.map((k) => k.chip));
    toast(t('school.gathered'), { icon: 'vibrate' });
  }

  // --- Liste --------------------------------------------------------------------------
  function row(kid) {
    const open = ctx.selected === kid.chip;
    const status = h('small', { class: 'kid-status' });
    const bat = h('span', { class: 'kid-bat num' });
    const item = h('article', { class: `kid${open ? ' is-open' : ''}`, style: { '--c': kid.color } },
      h('button', {
        class: 'kid-head',
        'aria-expanded': String(open),
        onclick: () => {
          if (open) {
            ctx.selected = null;
            build();
            run();
          } else {
            ctx.selectKid(kid.chip);
          }
        },
      },
      h('span', { class: 'kid-avatar' }, kid.name[0]),
      h('span', { class: 'kid-text' },
        h('strong', {}, kid.name, h('span', { class: 'kid-age' }, t('school.age', { n: kid.age })), kid.note ? icon('alert') : null),
        status),
      bat),
      open ? detail(kid) : null);

    live.push(() => {
      const p = ctx.live.get(kid.chip);
      const away = ctx.isAway(kid.chip);
      const alarm = ctx.alarms.find((a) => a.chip === kid.chip);
      item.classList.toggle('is-away', away);
      item.classList.toggle('has-alarm', alarm?.type === 'sos');
      item.classList.toggle('has-search', alarm?.type === 'search');
      if (!p) {
        status.textContent = t('ops.chips.noSignal');
        return;
      }
      const d = distance(ctx.distTo(kid.chip) ?? 0);
      const doing = alarm ? t(`school.alarm.${alarm.type}.${alarm.status}`)
        : away ? t('school.kid.away')
          : p.kind === 'lift' ? t('school.kid.lift')
            : p.speed > 1 ? t('school.kid.skiing') : t('school.kid.standing');
      status.textContent = `${d} · ${doing}`;
      bat.textContent = `${p.battery}%`;
      bat.classList.toggle('is-low', p.battery < LOW);
    });
    return item;
  }

  function detail(kid) {
    const where = h('span', {});
    live.push(() => {
      where.textContent = ctx.where(ctx.live.get(kid.chip));
    });
    return h('div', { class: 'kid-detail' },
      kid.note ? h('p', { class: `kid-note${/allerg/i.test(kid.note) ? ' is-medical' : ''}` }, icon(/allerg/i.test(kid.note) ? 'heart' : 'alert'), kid.note) : null,
      h('dl', { class: 'kid-facts' },
        h('div', {}, h('dt', {}, t('school.level')), h('dd', {}, kid.level)),
        h('div', {}, h('dt', {}, t('ops.fact.where')), h('dd', {}, where)),
        h('div', {}, h('dt', {}, t('ops.fact.chip')), h('dd', { class: 'num' }, kid.chip))),
      h('a', { class: 'kid-parent', href: `tel:${kid.parent.phone.replace(/\s/g, '')}` },
        h('span', { class: 'kid-parent-icon' }, icon('phone')),
        h('span', {}, h('strong', {}, kid.parent.name), h('small', {}, `${t('school.parent')} · ${kid.parent.phone}`))),
      h('div', { class: 'ops-tools' },
        h('button', { class: 'ops-tool', onclick: () => beep(kid) }, icon('vibrate'), t('school.beep')),
        h('button', {
          class: 'ops-tool',
          onclick: () => {
            const p = ctx.live.get(kid.chip);
            if (p) ctx.focus([p.lat, p.lng], 17);
          },
        }, icon('locate'), t('school.show')),
        h('button', { class: 'ops-tool is-orange', onclick: () => ctx.requestSearch(kid) }, icon('search'), t('school.search.btn'))),
      h('p', { class: 'ops-foot' }, t('school.search.hint')));
  }

  async function beep(kid) {
    await ctx.signal([kid.chip]);
    toast(t('school.beeped', { name: kid.name }), { icon: 'vibrate' });
  }

  const run = () => live.forEach((fn) => fn());
  build();
  run();

  return {
    update(rebuild) {
      if (rebuild) build();
      if (!counting || rebuild) run();
    },
    destroy() {},
  };
}
