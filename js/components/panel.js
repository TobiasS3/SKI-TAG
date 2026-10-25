// Ausklappbarer Bereich mit Tabs (unten am Handy, links am großen Bildschirm).
//
//   const sheet = createSheet({ tabs: [{ id: 'day', label: 'tab.day', icon: 'today' }, …] });
//   sheet.body('day').append(…);  sheet.open('route');
//
// Am Handy zwei Stufen: klein (nur Griff + Tabs) · offen (so hoch wie openHeight() erlaubt –
// darüber bleiben Kopfleiste, Suche, SOS und Kartenknöpfe frei).
// Ziehen geht am Griff, an der Tab-Leiste und im Inhalt (zu nur, wenn die Liste oben ist).
// Die aktuelle Höhe steht als CSS-Variable --sheet-h am Eltern-Element – SOS- und Kartenknöpfe
// gleiten damit mit, höchstens bis --sheet-cap (= offen).

import { h, isWide } from '../utils/dom.js';
import { icon } from './icons.js';
import { emit } from '../core/events.js';

const FLICK = 0.45;    // px/ms – schneller Wisch springt eine Stufe weiter

export function createSheet({ tabs, initial = tabs[0].id, openHeight = () => Math.min(innerHeight * 0.6, 600) }) {
  const bodies = {};
  const buttons = {};
  let current = null;
  let stage = 'peek';
  let heights = { peek: 96, half: 96 };
  let suppressClick = false; // nach einem Ziehen an der Tab-Leiste keinen Tab auslösen

  const tabBar = h('div', { class: 'sheet-tabs', role: 'tablist' },
    tabs.map((tab) => {
      buttons[tab.id] = h('button', {
        class: 'sheet-tab',
        role: 'tab',
        id: `tab-${tab.id}`,
        'aria-controls': `pane-${tab.id}`,
        onclick: () => {
          if (suppressClick) return;
          if (current === tab.id && stage !== 'peek') setStage('peek');
          else open(tab.id);
        },
      }, icon(tab.icon), h('span', { 'data-i18n': tab.label }), tab.badge ? h('i', { class: 'sheet-badge', hidden: true }) : null);
      return buttons[tab.id];
    }),
    h('span', { class: 'sheet-tab-ink', 'aria-hidden': 'true' }),
  );

  const content = h('div', { class: 'sheet-content' },
    tabs.map((tab) => {
      bodies[tab.id] = h('section', {
        class: 'sheet-pane', role: 'tabpanel', id: `pane-${tab.id}`, 'aria-labelledby': `tab-${tab.id}`, hidden: true,
      });
      return bodies[tab.id];
    }),
  );

  const handle = h('button', { class: 'sheet-handle', 'data-i18n-label': 'sheet.toggle' }, h('span'));
  const el = h('aside', { class: 'sheet', style: { '--tabs': tabs.length } }, handle, tabBar, content);

  // --- Höhe -------------------------------------------------------------------------
  const isDesktop = isWide;

  function measure() {
    const safe = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    // klein = genau Griff + Tab-Leiste, nichts vom Inhalt
    const peek = handle.offsetHeight + tabBar.offsetHeight + 10 + safe;
    heights = {
      peek,
      half: Math.max(peek + 120, Math.round(openHeight()) + safe),
    };
    el.parentElement?.style.setProperty('--sheet-cap', `${heights.half}px`);
  }

  function show(px) {
    const host = el.parentElement;
    if (!host) return;
    host.style.setProperty('--sheet-h', `${Math.round(px)}px`);
  }

  function setStage(next) {
    const was = stage !== 'peek';
    stage = next;
    el.dataset.stage = next;
    el.classList.toggle('is-expanded', next !== 'peek');
    show(heights[next]);
    if (was !== (next !== 'peek')) emit('sheet:expanded', next !== 'peek');
    emit('sheet:stage', next);
  }

  function select(id) {
    if (current === id) return;
    current = id;
    tabs.forEach((tab, i) => {
      const active = tab.id === id;
      buttons[tab.id].setAttribute('aria-selected', String(active));
      bodies[tab.id].hidden = !active;
      if (active) el.style.setProperty('--tab-index', i);
    });
    content.scrollTop = 0;
    emit('sheet:tab', id);
  }

  function open(id) {
    select(id);
    if (stage === 'peek') setStage('half');
  }

  // --- Ziehen -----------------------------------------------------------------------
  let drag = null; // { startY, startH, lastY, lastT, v }

  function dragStart(y) {
    measure();
    drag = { startY: y, startH: heights[stage], lastY: y, lastT: performance.now(), v: 0 };
    el.classList.add('is-dragging');
    el.parentElement?.classList.add('sheet-dragging');
  }

  function dragMove(y) {
    if (!drag) return;
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    drag.v = 0.7 * drag.v + 0.3 * ((drag.lastY - y) / dt); // nach oben = positiv
    drag.lastY = y;
    drag.lastT = now;
    // Über die Grenzen hinaus nur zäh nachgeben
    let px = drag.startH + (drag.startY - y);
    if (px > heights.half) px = heights.half + (px - heights.half) * 0.2;
    if (px < heights.peek) px = heights.peek - (heights.peek - px) * 0.25;
    show(px);
  }

  function dragEnd() {
    if (!drag) return;
    const px = parseFloat(el.parentElement.style.getPropertyValue('--sheet-h')) || heights[stage];
    // Schneller Wisch entscheidet nach Richtung, sonst die nähere Stufe
    const next = Math.abs(drag.v) > FLICK
      ? (drag.v > 0 ? 'half' : 'peek')
      : (px > (heights.peek + heights.half) / 2 ? 'half' : 'peek');
    drag = null;
    el.classList.remove('is-dragging');
    el.parentElement?.classList.remove('sheet-dragging');
    setStage(next);
  }

  // Griff: ziehen, oder antippen = auf/zu
  let moved = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (isDesktop()) return;
    handle.setPointerCapture(e.pointerId);
    moved = 0;
    dragStart(e.clientY);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moved = Math.max(moved, Math.abs(e.clientY - drag.startY));
    dragMove(e.clientY);
  });
  const handleUp = () => {
    if (!drag) return;
    if (moved < 6) {
      drag = null;
      el.classList.remove('is-dragging');
      el.parentElement?.classList.remove('sheet-dragging');
      setStage(stage === 'peek' ? 'half' : 'peek');
      return;
    }
    dragEnd();
  };
  handle.addEventListener('pointerup', handleUp);
  handle.addEventListener('pointercancel', handleUp);

  // Tab-Leiste: erst ab 8 px senkrecht wird gezogen, sonst ist es ein normaler Tipp
  let tabStart = null;
  tabBar.addEventListener('pointerdown', (e) => {
    if (isDesktop()) return;
    tabStart = { y: e.clientY, id: e.pointerId };
    suppressClick = false;
  });
  tabBar.addEventListener('pointermove', (e) => {
    if (!tabStart) return;
    if (!drag && Math.abs(e.clientY - tabStart.y) > 8) {
      tabBar.setPointerCapture(tabStart.id);
      dragStart(tabStart.y);
      suppressClick = true;
    }
    if (drag) dragMove(e.clientY);
  });
  const tabUp = () => {
    tabStart = null;
    if (drag) dragEnd();
    setTimeout(() => { suppressClick = false; }, 0);
  };
  tabBar.addEventListener('pointerup', tabUp);
  tabBar.addEventListener('pointercancel', tabUp);

  // Inhalt (Touch): klein → nach oben ziehen klappt auf; offen → nach unten klappt zu,
  // wenn die Liste ganz oben ist. Sonst scrollt die Liste normal.
  let touch = null;
  content.addEventListener('touchstart', (e) => {
    if (isDesktop() || e.touches.length !== 1) return;
    touch = { y: e.touches[0].clientY, decided: false, dragging: false };
  }, { passive: true });
  content.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const y = e.touches[0].clientY;
    const dy = y - touch.y;
    if (!touch.decided && Math.abs(dy) > 6) {
      touch.decided = true;
      touch.dragging = (dy < 0 && stage === 'peek') || (dy > 0 && content.scrollTop <= 0);
      if (touch.dragging) dragStart(touch.y);
    }
    if (touch.dragging) {
      e.preventDefault();
      dragMove(y);
    }
  }, { passive: false });
  const touchEnd = () => {
    if (touch?.dragging) dragEnd();
    touch = null;
  };
  content.addEventListener('touchend', touchEnd);
  content.addEventListener('touchcancel', touchEnd);

  // Größe geändert (Drehen, Fenster) → Stufen neu berechnen
  const onResize = () => {
    measure();
    show(heights[stage]);
  };
  addEventListener('resize', onResize);
  const destroy = () => removeEventListener('resize', onResize);
  // Erst messen, wenn der Bereich im Dokument hängt
  requestAnimationFrame(() => {
    measure();
    setStage(stage);
  });

  select(initial);

  return {
    el,
    body: (id) => bodies[id],
    open,
    select,
    current: () => current,
    isExpanded: () => stage !== 'peek',
    /** Sichtbare Höhe in px (für den Kartenrand) */
    visibleHeight: () => (isDesktop() ? 0 : heights[stage]),
    collapse: () => setStage('peek'),
    destroy,
    /** Kleiner Punkt am Tab (z. B. „Aufzeichnung läuft“) */
    badge(id, on) {
      const dot = buttons[id].querySelector('.sheet-badge');
      if (dot) dot.hidden = !on;
    },
  };
}
