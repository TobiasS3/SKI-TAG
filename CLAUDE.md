# Ski Tag – App

Projekt von Tobias Strobl (früher "Projekt LVS"). Kommunikation auf Deutsch, locker.

## Worum es geht
Ski Tag ist ein **Miet-Chip fürs Skigebiet** mit **SOS-Knopf** und Ortung übers ganze Skigebiet,
plus eine App für Gäste, Bergbahn-Mitarbeiter und Skischulen.
Kein Lawinen-Suchgerät mehr – keine cm-genaue Suche, sondern Notruf + Ortung.

- Chip wird an der Kassa / am Automaten gemietet (kein Kauf)
- Gäste brauchen keine App – der Chip allein reicht
- Bergbahn-Mitarbeiter müssen die App haben
- Skischulen (z. B. Element3) bekommen Zugang per Abo
- **Keine Fehlalarme** – SOS muss sauber abgesichert sein
- Geht jemand verloren: zuerst nur **Vibrationssignal an die eigene Gruppe**, kein sofortiger Notruf
- **Keine Pisten-Statistik** für die Bergbahn (nicht jeder hat einen Chip)

## Die App
Eine App für alle, Zugang per **Code** – der Code bestimmt die Ansicht.
Die App ist nur ein Werkzeug fürs Mieten: **Zugang läuft am Tagesende aus**,
der Tag wird als **Datei zum Herunterladen, Anschauen und Teilen** gespeichert.

**Gäste-Ansicht (optional):** eigenes Tracking, Wetter, Strecken/Pisten, Freunde/Gruppe
(z. B. Eltern sehen, wo das Kind ist).

**Mitarbeiter-Ansicht (Bergbahn / Skischule):** SOS-Alarme als **roter Punkt** auf der Karte,
Alarm geht an den **nächsten Mitarbeiter**.

Zielgruppen: Familien mit Kindern, schnelle Fahrer, die ohne teure Uhr tracken wollen.
Mögliche Partner-Bergbahn: KitzSki.

## Technik
- **PWA** (Progressive Web App) mit **reinem HTML, CSS, JavaScript** – keine Frameworks, kein CMS
- Für die Stores später mit **Capacitor** als native App verpackt (Push, Hintergrund-GPS, Vibration) –
  **zuerst iOS**, danach Android. Web-Code bleibt derselbe.
- Karten: **Leaflet + OpenStreetMap**, später auf eigenen Servern gehostet
- DSGVO-freundlich: keine externen Fonts, keine Google-Dienste
- Positionsdaten kommen später vom Server als JSON (Chip → Empfänger → Server → App)
- **Aktuell: Fake-Daten**, bis die Chip-Technik steht
- Entwicklung auf MacBook Pro, VS Code, lokal mit Live Server

## Ordnerstruktur
- `index.html`, `manifest.json`, `service-worker.js` – Einstieg + PWA (Service Worker muss im Root liegen)
- `views/login|staff|guest/` – **alles, was nur eine Ansicht betrifft** (JS + CSS zusammen)
- `css/` – gemeinsames Aussehen: `main.css` importiert alles; `base/` (Variablen, Reset), `components/`
- `js/` – gemeinsame Logik (ES-Module), Start in `app.js`
  - `core/` – Router, Code-Login (`auth`), Ablauf am Tagesende (`session`), State, Events, Storage
  - `services/` – Datenquellen; **nur `api.js` weiß, ob Fake-JSON oder echter Server**
  - `map/` – Leaflet-Karte, Marker, Pisten-Layer, Distanz/nächster Mitarbeiter (`geo`)
  - `components/` – wiederverwendbare UI (Modal, Toast, Nav, Panel)
  - `utils/` – kleine Helfer ohne App-Wissen
- `data/fake/` – Fake-Daten bis der Chip steht
- `lib/leaflet/` – Leaflet selbst gehostet (DSGVO, kein CDN)
- `assets/` – Icons, Bilder, Sounds (SOS-Ton); `docs/` – Konzept, Datenformat, Changelog

## Aktueller Stand
- Start mit der **Mitarbeiter-Ansicht** (Karte, Chips, roter Punkt bei SOS, nächster Mitarbeiter)
- Danach Gäste-Ansicht

## Arbeitsweise
- Lieber bestehenden Code schrittweise erweitern statt alles neu schreiben
- Neue Konzepte (JSON, Service Worker usw.) kurz und mit konkretem Beispiel erklären
- Zeitplan: Chip und App bis Winter 2026/27, Test im Schnee im Februar 2027
