---
name: Ski Tag
description: Nachtblau und Schnee: der Startfilm zieht sich durch die App, Karte hell, Orange als Aktionsfarbe.
colors:
  surface: "#edf2fa"
  surface-raised: "#ffffff"
  line: "#dde5f2"
  text: "#0b1226"
  text-2: "#435070"
  text-3: "#5f6c8c"
  action: "#0b1226"
  route: "#e5450d"
  track: "#ff5b22"
  sos: "#ff2d2d"
  ok: "#16b46b"
  piste-easy: "#1f66d1"
  piste-intermediate: "#e0242f"
  piste-advanced: "#0e0e10"
  piste-freeride: "#f08a24"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, Inter, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Inter, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  s: "10px"
  m: "13px"
  l: "24px"
  xl: "32px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "#ffffff"
    rounded: "{rounded.m}"
    height: "48px"
  button-route:
    backgroundColor: "{colors.route}"
    textColor: "#ffffff"
    rounded: "{rounded.m}"
    height: "48px"
  button-quiet:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.m}"
    height: "48px"
---

## Overview

Eine Mischung statt Hell oder Dunkel: Der nachtblaue Startfilm zieht sich als Kopfleiste, Navigation und Hauptkarten mit echten Pistenlinien durch die App. Inhalte liegen hell auf Eisblau, die Eingabe im Login ist weiß, die Karte bleibt hell. Die Karte ist vorgemalt (`tools/bake-terrain.py`) mit echtem Wald, Wasser, Straßen, Häusern, Höhenlinien und Gipfeln aus OpenStreetMap. Referenz für die Machart: Flighty.

## Colors

Nachtblau für Marke und Hauptaktion. Orange sparsam und nie als blasse Fläche: aktiver Tab, Route starten, Gruppe rufen, Hütten, Route auf der Karte. Geschaffte Challenges und Abzeichen sind grün. Das Ziel auf der Karte ist kräftiges Gelb. Schatten und Overlays sind blau getönt, nie grau. Rot nur für den Notruf und rote Pisten. Die eigene Spur ist Orange mit weißem Rand, dünner als die Route. Grün heißt offen oder geschafft. Sonst kein Gelb.

## Typography

Bricolage Grotesque, selbst gehostet (DSGVO, OFL), für Überschriften und Zahlen, Systemschrift für Fließtext. Die Restzeit oben ist die größte Zahl.

## Layout

Handy zuerst: Kopfleiste oben, Karte, ausziehbarer Bereich unten. Ab 900 px steht der Bereich links.

## Elevation & Depth

Karten mit weichem, mehrlagigem Schatten. Knöpfe wirken körperlich: Schatten plus heller Innenrand, beim Drücken sinken sie ein.

## Components

So wenig Klicks wie möglich: nichts Wichtiges wird eingeklappt, Aktionen je Person liegen direkt in der Zeile. Fenster wachsen aus dem Knopf, von dem sie kommen. Alle Lifte haben dieselbe weiße Kabine, die nur bergauf fährt. Ganz weit draußen zeigt die Karte nur Orte, große Gipfel und Menschen. Lift-Schilder erscheinen ab Zoom 13 und zeigen zuerst den Code, Antippen zoomt hin und legt den Ort über den aktuellen Tab, ohne Tab-Wechsel. Erst „Route anzeigen“ führt in den Route-Tab, die Linie zeichnet sich dabei auf der Karte. Wer oben ein Ziel eingibt, landet direkt in der Route. Hütten haben ein einziges eckiges Holz-Zeichen mit Chalet (`assets/images/hut.svg`), ohne Unterteilung nach Art, Stationen werden nicht gezeichnet. Der SOS-Knopf ist ein rotes Quadrat mit weißem Rand, das sich beim Halten füllt. Orte ohne Foto bekommen ein gezeichnetes Bild, nie Buchstaben. Der Kartenfilter heißt „Karte“ (ohne eigene Spur), „Nur Route“ und „Gefahren“ (nur die eigene Spur). In der Gruppe hat jede Person „Hin“ und „Zeigen“; „Zeigen“ wirkt wie Antippen und öffnet unten die Karte mit Vibrieren. „Mein Tag“ zeigt zuerst die Daten (Höhenprofil, Farben, Abfahrten, Abzeichen), dann die Challenges, ganz unten der kräftige nachtblaue Knopf „Tag beenden“. Beim Tagesende und im Tagesfilm zieht ein Punkt die Spur hinter sich her: vor ihm ist nichts gezeichnet, ein Pistennetz im Hintergrund gibt es nicht. Der Film zeigt die Winterkarte, nachtblau abgedunkelt, oben und unten fast ganz dunkel für Titel und Zahlen. Auf der Übersicht steht die Chip-Rückgabe gleich unter den Zahlen, weiß mit orangem Rand (nicht Rot).

## Do's and Don'ts

- Do: Bewegung weich auslaufen lassen und „weniger Bewegung“ beachten.
- Do: Touch-Flächen mindestens 44 px, für Handschuhe.
- Do: „Mein Tag“ belohnt Erlebnisse: Challenges, Hüttenpass, Höhenvergleich, entdeckte Lifte.
- Don't: Tempo groß zeigen, Tempo-Abzeichen oder Tempo-Wertungen.
- Don't: dunkle Karte, durchgehend dunkle Flächen, graue Schatten, Bäume, Stationsgrafiken und teure Effekte (backdrop-filter, Mischmodi) auf der Karte.
- Don't: Monogramme, Deko-Grafiken ohne Inhalt.
