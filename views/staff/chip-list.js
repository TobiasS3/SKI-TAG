// Tab „Chips“: alle vermieteten Chips am Berg. Suchen nach Chip-Nummer oder Mietbeleg –
// z. B. wenn Eltern an der Kassa stehen und ihr Kind nicht finden.
// Ausgewählter Chip: wo, Tempo, Akku, Spur der letzten Minuten, anpiepsen, Suche starten.

import { h, replace } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { api } from '../../js/services/api.js';
import { chipPlace } from '../../js/services/slopes.js';
import { speed as fmtSpeed, number } from '../../js/utils/format.js';
import { icon } from '../../js/components/icons.js';
import { confirmModal } from '../../js/components/modal.js';
import { toast } from '../../js/components/toast.js';

const LOW = 20;

export function mountChipList(el, ctx) {
  let query = '';
  let selected = null;
  let following = false;
  let trail = null;
  const rows = new Map(); // chip → { el, where, bat }
  let detailLive = () => {};

  const input = h('input', {
    class: 'ops-filter-input', type: 'search', inputmode: 'search', autocomplete: 'off',
    oninput: (e) => {
      query = e.target.value.trim().toLowerCase().replace(/^chip-?/, '');
      buildList();
      update();
    },
  });
  const stats = h('div', { class: 'ops-stats' });
  const detail = h('div', { class: 'chip-detail-wrap' });
  const list = h('div', { class: 'chip-list' });
  replace(el, stats, h('div', { class: 'chip-search' }, icon('search'), input), detail, list);

  const matches = (c) => !query || c.id.toLowerCase().includes(query) || c.rental.toLowerCase().includes(query);

  function buildList() {
    rows.clear();
    const shown = ctx.chips.filter(matches);
    replace(list, shown.length ? shown.map((c) => {
      const where = h('small', {});
      const bat = h('span', { class: 'chip-bat num' });
      const row = h('button', { class: `chip-row${c.id === selected ? ' is-selected' : ''}`, onclick: () => select(c.id) },
        h('span', { class: `chip-dot is-${c.kind}` }),
        h('span', { class: 'chip-text' },
          h('strong', {}, h('span', { class: 'num' }, c.id), h('span', { class: 'tag' }, t(`ops.kind.${c.kind}`))),
          where),
        bat);
      rows.set(c.id, { el: row, where, bat });
      return row;
    }) : h('p', { class: 'muted chip-none' }, t('ops.chips.none')));
  }

  function whereText(p) {
    if (!p) return t('ops.chips.noSignal');
    const place = chipPlace(p) || t('ops.offPiste');
    if (p.kind === 'lift') return t('ops.chips.onLift', { place });
    return p.speed > 1 ? `${place} · ${fmtSpeed(p.speed)}` : `${place} · ${t('day.standing')}`;
  }

  function select(id) {
    selected = id;
    following = false;
    query = '';
    input.value = '';
    buildList();
    buildDetail();
    update();
    const p = ctx.fleet.get(id);
    if (p) ctx.focus([p.lat, p.lng], 16);
  }

  function buildDetail() {
    trail?.remove();
    trail = null;
    if (!selected) {
      replace(detail);
      detailLive = () => {};
      return;
    }
    const c = ctx.chips.find((x) => x.id === selected);
    const where = h('strong', {});
    const facts = h('div', { class: 'chip-facts' });
    const followBtn = h('button', { class: 'ops-tool', onclick: () => { following = !following; followBtn.classList.toggle('is-on', following); } },
      icon('locate'), t('ops.chips.follow'));
    replace(detail, h('section', { class: 'chip-detail' },
      h('div', { class: 'chip-detail-head' },
        h('span', { class: `chip-dot is-${c.kind} is-big` }),
        h('span', { class: 'chip-text' },
          h('strong', { class: 'num' }, c.id),
          h('small', {}, t(`ops.person.${c.kind}`, { rental: c.rental, point: c.point, since: c.since }))),
        h('button', { class: 'chip-close', 'aria-label': t('cancel'), onclick: () => { selected = null; buildList(); buildDetail(); } }, icon('close'))),
      h('p', { class: 'chip-where' }, icon('locate'), where),
      facts,
      h('div', { class: 'ops-tools' },
        h('button', { class: 'ops-tool', onclick: () => signal(c) }, icon('vibrate'), t('ops.signal')),
        followBtn,
        h('button', { class: 'ops-tool is-orange', onclick: () => startSearch(c) }, icon('search'), t('ops.chips.search'))),
      h('p', { class: 'ops-foot' }, t('ops.chips.privacy'))));

    trail = L.polyline([], { pane: 'track', color: '#2f6dff', weight: 4, opacity: 0.85, lineCap: 'round', interactive: false }).addTo(ctx.map);
    detailLive = () => {
      const p = ctx.fleet.get(selected);
      where.textContent = whereText(p);
      trail.setLatLngs(ctx.trails.get(selected) || []);
      if (!p) return;
      replace(facts,
        fact(fmtSpeed(p.speed), t('day.speed')),
        fact(`${number(p.alt || 0)} m`, t('ops.fact.ele')),
        fact(`${p.battery}%`, t('ops.fact.battery'), p.battery < LOW ? 'is-low' : ''),
        fact(t(`ops.chips.kind.${p.kind}`), t('ops.chips.mode')));
      if (following) ctx.map.panTo([p.lat, p.lng], { animate: true, duration: 0.8 });
    };
  }

  async function signal(c) {
    await api.signalChips([c.id]);
    toast(t('ops.signal.toast', { chip: c.id }), { icon: 'vibrate' });
  }

  /** Kein Notruf – ein Suchauftrag (orange), geht an den nächsten freien Mitarbeiter */
  async function startSearch(c) {
    const p = ctx.fleet.get(c.id);
    if (!p) return;
    const ok = await confirmModal({ title: t('ops.chips.search.title'), text: t('ops.chips.search.text'), ok: t('ops.chips.search'), cancel: t('cancel') });
    if (!ok) return;
    await api.requestSearch({ chip: c.id, name: t(`ops.kind.${c.kind}`), pos: [p.lat, p.lng], by: ctx.me.name, battery: p.battery });
    toast(t('ops.chips.search.toast'), { icon: 'search' });
  }

  function update() {
    const list = [...ctx.fleet.values()];
    replace(stats,
      fact(String(list.length), t('ops.chips.onMountain')),
      fact(String(ctx.chips.filter((c) => c.kind === 'kid').length), t('ops.chips.kids')),
      fact(String(list.filter((p) => p.battery < LOW).length), t('ops.chips.low'), list.some((p) => p.battery < LOW) ? 'is-low' : ''));
    input.placeholder = t('ops.chips.filter');
    for (const [id, r] of rows) {
      const p = ctx.fleet.get(id);
      r.where.textContent = whereText(p);
      r.bat.textContent = p ? `${p.battery}%` : '–';
      r.bat.classList.toggle('is-low', p?.battery < LOW);
    }
    detailLive();
  }

  buildList();
  update();

  return {
    select,
    update(rebuild) {
      if (rebuild) {
        buildList();
        buildDetail();
      }
      if (ctx.sheet.current() === 'chips' || following) update();
    },
    destroy() {
      trail?.remove();
    },
  };
}

function fact(value, label, cls = '') {
  return h('div', { class: `ops-stat ${cls}` }, h('strong', { class: 'num' }, value), h('small', {}, label));
}
