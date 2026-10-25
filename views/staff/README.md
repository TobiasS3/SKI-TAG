# views/staff/ – Bergbahn-Ansicht (Leitstand)

Für Bergbahn-Mitarbeiter. SOS-Alarme erscheinen als **roter Punkt** auf der Karte, der Alarm geht an den
**nächsten freien Mitarbeiter**. Wer nicht innerhalb von 60 s annimmt, wird übersprungen.

| Datei | Inhalt |
|---|---|
| `staff-view.js` | Hauptseite: Karte (alle Chips, Mitarbeiter, Einsätze), Kopfleiste, Tabs |
| `alarm-list.js` | Tab „Einsätze“: offene Alarme, heute erledigt, Protokoll als CSV |
| `alarm-detail.js` | Ein Einsatz (Ablauf, Ort, Aktionen) + Vollbild „Notruf für dich“ mit Ton und Countdown |
| `team-panel.js` | Tab „Team“: Dienst/Pause, Kollegen frei / im Einsatz / Pause |
| `lift-control.js` | Tab „Lifte“: Lifte umschalten (läuft / Wind-Stopp / zu) – Gäste sehen es sofort |
| `chip-list.js` | Tab „Chips“: Chip suchen (Nummer oder Mietbeleg), Spur, anpiepsen, Suche starten |
| `staff.css` | Aussehen (auch Listen-Bausteine, die die Skischule mitbenutzt) |

**Ablauf eines Einsatzes:** Eingang → Angenommen (Route auf der Karte) → Vor Ort → Abgeschlossen
(Abtransport / vor Ort versorgt / kein Notfall). Suchaufträge der Skischule sind **orange**, kein Notruf.

**Zum Testen** (Code `BERG27`): Nach ~14 s kommt ein Notruf für dich. Im Menü: „Test: Alarm auslösen“.
Gast-SOS in einem zweiten Tab (Code `K7M2X9`) landet ebenfalls hier.
