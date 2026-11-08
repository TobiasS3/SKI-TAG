# Ski Tag – App

Projekt von Tobias Strobl (früher "Projekt LVS"). Kommunikation auf Deutsch, locker.

## Worum es geht
Dieser Ordner ist **nur die App-Entwicklung**. Geschäftsplan, Zeitplan, Partner, Chip-Hardware und Kosten
liegen im eigenen Plan-Projekt (`Ski Tag Plan.html`) – hier nicht wieder anlegen.

Die App gehört zum Ski-Tag-Miet-Chip (SOS-Knopf + Ortung übers Skigebiet) – für Gäste, Bergbahn-Mitarbeiter
und Skischulen. Notruf + Ortung, keine cm-genaue Suche.

- Gäste brauchen keine App – der Chip allein reicht
- Bergbahn-Mitarbeiter müssen die App haben
- **Keine Fehlalarme** – SOS muss sauber abgesichert sein
- Geht jemand verloren: zuerst nur **Vibrationssignal an die eigene Gruppe**, kein sofortiger Notruf
- **Keine Pisten-Statistik** für die Bergbahn (nicht jeder hat einen Chip)
- App spricht Gäste und Mitarbeiter mit **„Sie“** an (deutsche Texte in `js/core/i18n.js`)
- **Keine Tempo-Abzeichen** („60 km/h geknackt“) – passt nicht zu Sicherheit; Abzeichen belohnen Erlebnisse
  (erste Abfahrt, schwarze Piste, Streif, lange Abfahrt …)

## Die App
Eine App für alle, Zugang per **Vorname + Code** (wie auf dem Mietbeleg) – der Code bestimmt die Ansicht.
Die App ist nur ein Werkzeug fürs Mieten: **Zugang läuft am Tagesende aus**,
der Tag wird als **Datei zum Herunterladen, Anschauen und Teilen** gespeichert –
als **MP4-Video** („Übersicht downloaden“), weil das auf iPhone, Samsung und PC aufgeht (kein GPX/JSON).

**Gäste-Ansicht (optional):** eigenes Tracking, Wetter, Strecken/Pisten, Freunde/Gruppe
(z. B. Eltern sehen, wo das Kind ist).

**Mitarbeiter-Ansicht (Bergbahn / Skischule):** SOS-Alarme als **roter Punkt** auf der Karte,
Alarm geht an den **nächsten Mitarbeiter**.

Kartendaten aktuell: Skigebiet KitzSki (`data/skimap/kitzski.json`).

## Technik
- **PWA** (Progressive Web App) mit **reinem HTML, CSS, JavaScript** – keine Frameworks, kein CMS
- Für die Stores später mit **Capacitor** als native App verpackt (Push, Hintergrund-GPS, Vibration) –
  **zuerst iOS**, danach Android. Web-Code bleibt derselbe.
- Karten: **Leaflet + OpenStreetMap** (2D, nur Winter-Stil), später auf eigenen Servern gehostet
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
- `assets/` – Icons, Bilder, Sounds (SOS-Ton); `docs/` – Datenformat, Changelog, Bildnachweis

## Aktueller Stand
- Alle drei Ansichten laufen mit Fake-Daten: **Gast** (`views/guest/`), **Bergbahn-Leitstand** (`views/staff/`),
  **Skischule** (`views/school/`)
- **Gast-Ansicht ist fertig** (Stand 8.11.2026, vom Nutzer abgenommen) – nur noch Fehler beheben, nichts Großes umbauen
- Lehre aus der Gast-Ansicht: keine Effekte, die dauernd laufen oder bei jedem Bild neu zeichnen (Akku/Lag am iPhone);
  Änderungen immer mit iPhone-Simulation + Touch testen, nicht nur mit Mausklicks
- Fake-Server für Einsätze/Chips/Skikurs: `js/services/fake-ops.js` (Einsätze im localStorage → Tabs teilen sie)

## Arbeitsweise
- Lieber bestehenden Code schrittweise erweitern statt alles neu schreiben
- Neue Konzepte (JSON, Service Worker usw.) kurz und mit konkretem Beispiel erklären
