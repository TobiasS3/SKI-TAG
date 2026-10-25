# Datenformat

So sehen die Daten aus, die die App bekommt. Aktuell aus `data/fake/`, später vom Server.
Nur `js/services/api.js` weiß, woher sie kommen.

## Login – `codes.json`

```json
{ "code": "K7M2X9", "role": "guest", "chip": "CHIP-0042", "name": "Tobias", "group": "FAM-STROBL" }
```

- `role`: `guest` | `staff` | `school` – bestimmt die Ansicht
- Codes: 6 Zeichen, Großbuchstaben + Zahlen. Zugang gilt bis Mitternacht.

## Chip-Position (laufend)

```json
{ "lat": 47.4469, "lng": 12.3920, "alt": 1712, "speed": 8.3, "kind": "piste", "ref": 12, "time": 1792310400000, "battery": 91 }
```

- `alt`: Höhe in Metern (für Tiefenmeter und Höhenprofil)
- `battery`: Akku des Chips in Prozent

- `speed` in m/s
- `kind`: `piste` | `lift` | `walk` – wo der Chip gerade ist
- `ref`: Index der Piste/des Lifts in `kitzski.json` (oder `null`)
- `time`: Millisekunden seit 1970 (JavaScript-Zeit)

## Gruppe – `groups.json`

```json
{ "FAM-STROBL": { "name": "Familie Strobl", "members": [ { "chip": "CHIP-0043", "name": "Lena", "color": "#f2a33a", "kid": true } ] } }
```

## Wetter

Live von Open-Meteo (`js/services/weather.js`), Fake nur ohne Internet (`data/fake/weather.json`).

Stationen mit Höhe/Temperatur, Wind, Schnee, Stundenwerte und Lawinengefahr (`level` 1–5 unter,
`levelAbove` über der Waldgrenze `treeline`). `condition`: `sun` | `partly` | `cloud` | `snow`.

## Liftstatus – `data/fake/lift-status.json`

Bis die Bergbahn echte Daten liefert: Beispieldaten. Später `GET /lifts` vom Server, gleiches Format.

```json
{
  "updatedAt": "2026-10-22T08:15:00+02:00",
  "default": { "open": "08:30", "close": "16:30" },
  "lifts": {
    "3S Bahn": { "open": "08:45", "close": "16:00" },
    "Talsen": { "status": "hold", "reason": "wind" },
    "Bichlalmlift": { "status": "closed", "reason": "season" }
  }
}
```

- Lifte ohne Eintrag haben die Zeiten aus `default`
- `status` fehlt = läuft nach Uhrzeit · `hold` = kurz gestoppt · `closed` = heute zu
- `reason`: `wind` | `snow` | `season` | `revision`, `note`: freier Text (z. B. „Talfahrt bis 17:00“)

## Skigebiet – `data/skimap/kitzski.json`

Kein Fake: echte Pisten, Lifte und Hütten aus OpenStreetMap, erzeugt mit
`python3 tools/build-skimap.py` (Rohdaten: `tools/kitzski-osm.json`).

- `areas`: Teilgebiete (Hahnenkamm–Resterhöhe, Horn, Gaisberg, Bichlalm) – untereinander nur per Skibus
- `nodes`: Punkte `[lat, lng]` – Kreuzungen und Stationen
- `ele`: Höhe je Punkt in Metern, `nodeArea`: Teilgebiet je Punkt
- `edges`: Verbindungen `{ a, b, kind, ref, len, coords }` – `piste` (bergab), `lift` (bergauf), `walk` (kurzer Fußweg).
  Verbindungsbahnen, die man in beide Richtungen fährt (3S-Bahn), haben zwei `lift`-Kanten (`BOTH_WAYS` im Skript).
- `core`: Punkte, von denen man überall hin und zurück kommt (für die Routenplanung)
- `pistes`, `lifts`, `huts`: Namen, Nummern, Schwierigkeit, Webseite/Telefon der Hütten

Daten © OpenStreetMap-Mitwirkende (ODbL).

## Bilder – `data/skimap/media.json`

```json
{ "Hahnenkammbahn": { "photo": "assets/places/commons/hahnenkammbahn.jpg", "credit": { "artist": "…", "license": "CC BY 2.0", "source": "…" } } }
```

Siehe `docs/bildnachweis.md`.
