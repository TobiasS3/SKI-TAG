# views/guest/ – Gäste-Ansicht

Optional für Gäste: eigenes Tracking, Gruppe/Familie, Wetter, Pisten. Zugang läuft am Tagesende aus.

| Datei | Inhalt |
|---|---|
| `guest-view.js` | Hauptseite: Karte, Kopfleiste, Tabs je nach Ansicht (Mein Tag, Route, Gruppe); Lifte + Wetter als Fenster |
| `guest-mode.js` | Drei Ansichten: Solo-Fahrt (Mein Tag + Route), Familie & Gruppe (Gruppe + Route, Mein Tag als Knopf oben neben der Suche), Alles im Blick (alle drei). Auswahl nach dem Login, Umschalten im Chip-Menü. Daten laufen immer weiter |
| `tracking.js` | Eigene Strecke des Tages |
| `day-coach.js` | Info nach dem Einloggen mit Pfeil auf den Chip-Knopf: Tag starten / später hier oben / am Abend hier beenden |
| `group-panel.js` | Gruppe/Familie – z. B. Eltern sehen, wo das Kind ist |
| `range-alarm.js` | Reichweiten-Alarm unterm Radar: Regler + pro Person anhaken, Handy vibriert |
| `top-note.js` | Meldung oben mit Knopf und × (Gruppe prüfen, „Tag noch nicht gestartet“) |
| `day-start.js` | „Tag starten“ wie am Drehkreuz (rot → piep → grün) |
| `weather-panel.js` | Wetter am Berg |
| `slopes-panel.js` | Route-Tab: Ziel, Route auf der Karte, Wegbeschreibung zum Schilder-Folgen |
| `lifts-panel.js` | Lift- und Pistenstatus (Fenster über die Kopfleiste) |
| `day-summary.js` | Tagesrückblick als Datei zum Herunterladen/Teilen |
| `day-film.js` | Tagesfilm (MP4, Hochformat): Fahrt mit Zahlen → Endkarte → Bericht scrollt durch → Ski Tag. iPhone: Teilen → „Video sichern“ = Fotos |
| `film-report.js` | Bericht „Ihr Tag im Detail“ fürs Video (Höhenprofil, Pisten nach Farbe, Hüttenpass, Abfahrten, Abzeichen, Lifte) |
| `day-stop.js` | Rückfrage „Tag beenden?“ mit den Zahlen des Tages |
| `guest.css` | Aussehen nur dieser Ansicht |
