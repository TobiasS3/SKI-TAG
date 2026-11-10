// Ausklappbarer Bereich mit Tabs (unten am Handy, links am großen Bildschirm).
//
//   const sheet = createSheet({ tabs: [{ id: 'day', label: 'tab.day', icon: 'today' }, …] });
//   sheet.body('day').append(…);  sheet.open('route');
//   sheet.setTop(el)  – eigene Leiste über den Tabs (z. B. während einer Route), null = weg
//
// Am Handy zwei Stufen: klein (nur Griff + Tabs) · offen (so hoch wie openHeight() erlaubt –
// darüber bleiben Kopfleiste, Suche, SOS und Kartenknöpfe frei).
// Ziehen geht am Griff, an der Tab-Leiste und im Inhalt (zu nur, wenn die Liste oben ist).
// Die aktuelle Höhe steht als CSS-Variable --sheet-h am Eltern-Element – SOS- und Kartenknöpfe
// gleiten damit mit, höchstens bis --sheet-cap (= offen).

import { h, isWide, slideIn, reducedMotion } from '../utils/dom.js';
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
  let order = tabs.map((tab) => tab.id); // sichtbare Tabs in ihrer Reihenfolge (setTabs)

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

  const ink = tabBar.querySelector('.sheet-tab-ink');
  const handle = h('button', { class: 'sheet-handle', 'data-i18n-label': 'sheet.toggle' }, h('span'));
  const top = h('div', { class: 'sheet-top', hidden: true });
  const el = h('aside', { class: 'sheet', style: { '--tabs': tabs.length } }, handle, top, tabBar, content);

  // --- Höhe -------------------------------------------------------------------------
  const isDesktop = isWide;

  function measure() {
    const safe = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    // klein = genau Griff + eigene Leiste + Tab-Leiste, nichts vom Inhalt
    const peek = handle.offsetHeight + top.offsetHeight + tabBar.offsetHeight + 10 + safe;
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
    const from = order.indexOf(current);
    const to = order.indexOf(id);
    const first = current === null;
    current = id;
    // Tab rechts → kommt von rechts; kam der alte Tab weg (andere Ansicht) → sanft von unten
    if (to >= 0 && !first) slideIn(bodies[id], from >= 0 ? (to > from ? 1 : -1) : 0);
    tabs.forEach((tab) => {
      const active = tab.id === id;
      buttons[tab.id].setAttribute('aria-selected', String(active));
      if (bodies[tab.id].parentElement === content) bodies[tab.id].hidden = !active; // ausgeliehen → nicht anfassen
      if (active) el.style.setProperty('--tab-index', Math.max(0, to));
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
    setTop(node) {
      top.replaceChildren(...(node ? [node] : []));
      top.hidden = !node;
      measure();
      show(heights[stage]);
    },
    destroy,
    /**
     * Nur diese Tabs zeigen, in dieser Reihenfolge (z. B. ['group', 'route']).
     * Ist der aktuelle Tab nicht mehr dabei, kommt der erste.
     */
    setTabs(ids, { animate = false } = {}) {
      // Für den Effekt: die alten Tabs als Kopie an ihrer alten Stelle festhalten
      const flip = animate && !reducedMotion() && tabBar.animate;
      const bar = tabBar.getBoundingClientRect();
      const old = flip ? order.map((id) => {
        const r = buttons[id].getBoundingClientRect();
        const ghost = buttons[id].cloneNode(true);
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.classList.add('sheet-tab-ghost');
        Object.assign(ghost.style, {
          position: 'absolute', left: `${r.left - bar.left}px`, top: `${r.top - bar.top}px`,
          width: `${r.width}px`, height: `${r.height}px`, margin: '0', pointerEvents: 'none',
        });
        return ghost;
      }) : [];
      order = ids.filter((id) => buttons[id]);
      tabs.forEach((tab) => { buttons[tab.id].hidden = !order.includes(tab.id); });
      order.forEach((id) => tabBar.insertBefore(buttons[id], ink));
      el.style.setProperty('--tabs', order.length);
      if (!order.includes(current)) select(order[0]);
      else el.style.setProperty('--tab-index', order.indexOf(current));
      requestAnimationFrame(() => {
        measure();
        show(heights[stage]);
      });
      // Ansicht gewechselt – wie eine Anzeigetafel: die alten Tabs klappen nach hinten weg,
      // die neuen klappen von unten hoch (z. B. „Mein Tag“ wird zu „Gruppe“)
      if (flip) {
        if (getComputedStyle(tabBar).position === 'static') tabBar.style.position = 'relative';
        const ease = 'cubic-bezier(.2,.8,.2,1)';
        old.forEach((ghost, i) => {
          tabBar.append(ghost);
          ghost.animate([
            { transform: 'perspective(500px) rotateX(0deg)', opacity: 1 },
            { transform: 'perspective(500px) rotateX(88deg)', opacity: 0 },
          ], { duration: 260, delay: i * 50, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })
            .onfinish = () => ghost.remove();
        });
        order.forEach((id, i) => buttons[id].animate([
          { transform: 'perspective(500px) rotateX(-88deg)', opacity: 0 },
          { transform: 'perspective(500px) rotateX(8deg)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 },
        ], { duration: 460, delay: 230 + i * 70, easing: ease, fill: 'backwards' }));
        ink.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 260, fill: 'backwards' });
      }
    },
    /** Inhalt eines Tabs woanders zeigen (z. B. in einem Fenster) – bis reclaim(id) */
    lend(id) {
      bodies[id].hidden = false;
      return bodies[id];
    },
    /** Ausgeliehenen Inhalt zurückholen */
    reclaim(id) {
      if (bodies[id].parentElement !== content) content.append(bodies[id]);
      bodies[id].hidden = current !== id;
    },
    /** Kleiner Punkt am Tab (z. B. „Aufzeichnung läuft“) */
    badge(id, on) {
      const dot = buttons[id].querySelector('.sheet-badge');
      if (dot) dot.hidden = !on;
    },
  };
}
