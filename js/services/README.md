# js/services/ – Woher die Daten kommen

**Wichtig:** Nur `api.js` weiß, ob die Daten aus `data/fake/` oder vom echten Server kommen.
Wenn der Chip-Server fertig ist, wird nur `api.js` angepasst.

| Datei | Inhalt |
|---|---|
| `api.js` | Holt Daten – Fake oder Server |
| `chips.js` | Positionen der Chips |
| `alarms.js` | SOS-Alarme |
| `staff.js` | Mitarbeiter und ihre Positionen |
| `group.js` | Gruppen/Familien, Vibrationssignal bei „verloren“ |
| `weather.js` | Wetter |
| `slopes.js` | Pisten und Lifte |
| `export.js` | Tag als Datei speichern und teilen |
