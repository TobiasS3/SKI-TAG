# Ski Tag – App

Miet-Chip fürs Skigebiet mit SOS-Knopf und Ortung. Eine App für Gäste, Bergbahn-Mitarbeiter und Skischulen.
Reines HTML, CSS, JavaScript – keine Frameworks.

## Wo finde ich was?

```
SKI-TAG/
├── index.html           Die einzige HTML-Seite – hier startet alles
├── manifest.json        PWA: Name, Icon, Farben der App
├── service-worker.js    PWA: Offline-Funktion
│
├── views/               DIE ANSICHTEN – was der Nutzer sieht
│   ├── login/           Code-Eingabe
│   ├── staff/           Mitarbeiter (Bergbahn / Skischule)
│   └── guest/           Gäste
│
├── js/                  GEMEINSAME LOGIK – von allen Ansichten genutzt
├── css/                 GEMEINSAMES AUSSEHEN – Farben, Buttons, Karte
├── data/                Daten (aktuell Fake-Daten)
├── lib/                 Fremde Bibliotheken (z. B. Leaflet)
├── assets/              Logos, Icons, Bilder, Töne
└── docs/                Dokumentation, Konzept, Änderungen
```

## Die wichtigste Regel

> **Betrifft es nur eine Ansicht?** → `views/<ansicht>/`
> **Brauchen es mehrere Ansichten?** → `js/` bzw. `css/`

In jedem Ordner liegt eine `README.md`, die erklärt, was dort hineingehört.

## Testen

VS Code → Rechtsklick auf `index.html` → **Open with Live Server**.
