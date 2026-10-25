# data/ – Daten

`fake/` enthält Testdaten, bis der Chip und der Server fertig sind.
Später kommen die Daten vom Server (Chip → Empfänger → Server → App).

| Datei | Inhalt |
|---|---|
| `codes.json` | Zugangscodes und welche Ansicht sie öffnen |
| `chips.json` | Vermietete Chips (Mietbeleg, Kind/Erwachsen, Mietstelle) |
| `staff.json` | Mitarbeiter mit Position |
| `alarms.json` | Beispiel-Einsätze für die Bergbahn + ein Alarm, der kurz nach dem Login kommt |
| `school.json` | Skischule mit Gruppen, Kindern, Eltern-Telefon, Tagesplan |
| `groups.json` | Gruppen/Familien |
| `weather.json` | Wetter |
| `slopes.geojson` | Pisten und Lifte als Linien |

Wie die Daten aufgebaut sind, steht in `docs/datenformat.md`.
