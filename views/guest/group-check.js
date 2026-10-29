// Meldung oben direkt nach dem Einloggen: „Passt Ihre Gruppe?“ – mit allen Personen, die dabei sind.
// „Prüfen“ öffnet die Gruppe beim Reichweiten-Alarm. Kommt nach JEDEM Einloggen einmal
// (beim bloßen Neuladen nicht nochmal).

import { h } from '../../js/utils/dom.js';
import { t } from '../../js/core/i18n.js';
import { load, save } from '../../js/core/storage.js';
import { topNote } from './top-note.js';

const DELAY_MS = 1200; // nach dem Chip-Bildschirm kurz die Karte ankommen lassen

export function mountGroupCheck(ctx, people, alarm, { onCheck }) {
  const KEY = `groupcheck-${ctx.session.startedAt}`; // startedAt = Zeitpunkt des Einloggens
  let note = null;
  let timer = null;
  let gone = false;

  ctx.connected.then(() => {
    if (!gone) timer = setTimeout(show, DELAY_MS);
  });

  function show() {
    if (load(KEY, false) || !people.length) return;
    note = topNote(ctx.page, {
      lead: people.slice(0, 4).map((m) => h('span', { class: 'avatar', style: { '--c': m.color } }, m.name[0])),
      title: t('groupcheck.title'),
      text: t('groupcheck.text', { names: people.map((m) => m.name).join(', ') }),
      action: t('groupcheck.ok'),
      onAction: () => { done(); onCheck(); },
      onClose: done,
    });
  }

  function done() {
    save(KEY, true);
    note?.close();
  }

  return {
    /** Sobald jemand angehakt wird, ist die Gruppe geprüft */
    update() {
      if (alarm.count() > 0) done();
    },
    destroy() {
      gone = true;
      clearTimeout(timer);
      note?.close();
    },
  };
}
