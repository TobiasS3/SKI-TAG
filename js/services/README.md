# js/services/ – Woher die Daten kommen

**Wichtig:** Nur `api.js` weiß, ob die Daten aus `data/fake/` oder vom echten Server kommen.
Wenn der Chip-Server fertig ist, wird nur `api.js` angepasst.

| Datei | Inhalt |
|---|---|
| `api.js` | Holt Daten – Fake oder Server |
| `chips.js` | Positionen der Chips |
| `alarms.js` | SOS-Alarme (aktuell in `api.js` → `watchAlarms`, `alarmAction`) |
| `staff.js` | Mitarbeiter und ihre Positionen |
| `group.js` | Gruppen/Familien, Vibrationssignal bei „verloren“ |
| `weather.js` | Wetter |
| `slopes.js` | Pisten und Lifte, Routen, „Wo ist das?“ (`placeAt`, `chipPlace`) |
| `lift-status.js` | Zustand von Liften/Pisten (offen, Wind-Stopp, zu) – für Gast und Bergbahn |
| `fake-chip.js` | Simulierter Chip (nur mit Fake-Daten) |
| `fake-ops.js` | Fake-Server für Bergbahn und Skischule: Einsätze, alle Chips, Skikurs (nur mit Fake-Daten) |
| `export.js` | Tag als Datei speichern und teilen |
