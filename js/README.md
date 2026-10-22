# js/ – Gemeinsame Logik

Alles, was **mehrere Ansichten** brauchen. Start der App ist `app.js`.

| Ordner/Datei | Inhalt |
|---|---|
| `app.js` | Startpunkt – verbindet alles |
| `config.js` | Einstellungen (Fake-Daten an/aus, Startpunkt der Karte …) |
| `core/` | Das Gerüst: Router, Login-Prüfung, Tagesablauf, Speicher |
| `services/` | Woher die Daten kommen (Chips, Alarme, Wetter …) |
| `map/` | Alles rund um die Karte (Leaflet) |
| `components/` | Wiederverwendbare UI-Bausteine (Popup, Hinweis, Navigation) |
| `utils/` | Kleine Helfer ohne App-Wissen (Datum formatieren usw.) |
