# Changelog

## 2026-10-23 (4) – Querformat, Fehler, neues Startvideo

- **Startvideo:** Drohnenflug über Gondeln im Schnee in 4K-Qualität (Pexels), eigene Hochkant-Version fürs Handy – kein freies Kitzbühel-Video verfügbar
- **Handy quer:** Bereich links wie am Computer, Login mit Code-Karte rechts – vorher lagen Knöpfe über der Suche
- **Tag starten:** am Computer und quer als Hochformat-Karte mit Text daneben (vorher abgeschnitten)
- **Fehler behoben:** Bereich links war am Computer anfangs leer; „Kein Rückweg mehr“ erschien fälschlich mittags
- **Karte:** „Wurzhöhe · 3S“ groß an der 3S-Bergstation auf der Jochberger Seite; Resterhöhe · Pass Thurn als Einstieg

## 2026-10-23 (3) – Schneller am Handy

- **Karte:** Pisten und Lifte auf einer Canvas-Leinwand statt ~2.500 einzelner SVG-Linien
- **Kabinen:** eigene Leinwand, nur im Bild sichtbare, ~12 Bilder/s, Pause beim Ziehen/Zoomen
- **Keine Dauer-Animationen auf Linien** (Route, Gruppe, SOS) und kein Schatten-Filter auf der Spur mehr
- **Gruppe:** Liste, Radar und Rangliste werden nur gezeichnet, wenn der Tab offen ist
- **Treffpunkt:** eigene Uhrzeit eingeben, Treffpunkt direkt bei der Hütte löschen
- **Wetter:** Fehler behoben – bei „bewölkt“ flog der ganze Wetter-Kopf als Wolke durchs Bild
- **Talbahnen** (Hahnenkammbahn, Fleckalmbahn, Hornbahn, Pengelstein I, Maierlbahn, Wagstättbahn, Panoramabahn):
  großes Schild an der Talstation, schon in der Übersicht – weichen sich gegenseitig aus (unter/über/rechts/links)

## 2026-10-23 (2) – Treffpunkt, letzter Lift, Pistenstatus, Rangliste, Freunde, Tagesfilm

- **Treffpunkt:** Hütte oder Lift antippen → „Hier treffen“ mit Uhrzeit. Grüne Fahne auf der Karte,
  in der Gruppe: wer braucht wie lange, pünktlich / knapp / zu spät; Erinnerung „jetzt losfahren“
- **Letzter Lift:** rechnet den Weg zurück ins Tal (Talstation vom Morgen) – „3S Bahn schließt um 16:00,
  spätestens 15:30 los“ mit „Route starten“ (startet sofort die Navigation); Meldungen bei 30/15/5 min
- **Status-Tab:** Umschalter Lifte | Pisten. Pistenstatus: präpariert, Buckelpiste, Skiroute, eisig, gesperrt.
  Routen meiden geschlossene Lifte und gesperrte Pisten (Wind-Stopp zählt als befahrbar)
- **Rangliste der Gruppe:** Top-Speed, Tiefenmeter, Pisten-km, Abfahrten über den ganzen Tag, Gruppen-Rekorde
- **Freund dazuholen:** eigener 4-stelliger Freundes-Code, Code eines Freundes eingeben → in der Gruppe
  (Test-Codes: 4821 Max, 7305 Sophie)
- **Tagesfilm:** 9-Sekunden-Video im Hochformat aus der Tagesübersicht – Spur zeichnet sich, Zahlen zählen mit,
  Endkarte mit Logo. Speichern (MP4/WebM) oder Teilen

## 2026-10-23 – Lift-Schilder, deutlichere Spur

- **Karte:** Lifte haben ein Namensschild in der Mitte der Linie – große Bahnen ab mittlerem Zoom,
  Schlepplifte und Förderbänder ab nahem Zoom; Überdeckungen werden ausgeblendet (Lifte haben Vorrang)
- **Tagesübersicht:** deine Spur dick mit weißem/schwarzem Rand in Tempo-Farben, Liftfahrten gestrichelt,
  Pisten im Hintergrund blasser

## 2026-10-22 (7) – Startschranke, Bereich-Höhe, „Zu mir“

- **Tag starten:** neue Animation – große rote Gondel fährt am Seil ein, hält mit Nachpendeln (Stations-Gong),
  fährt beschleunigt an der Stütze vorbei weiter; Berge, Schnee, „Los geht's – dein Tag läuft“
- **Gruppe:** „Zeigen“, Punkt im Radar und „Alle zeigen“ klappen den Bereich ein – Karte wird groß
- **Bereich unten:** eingeklappt nur die Tab-Leiste; offen so hoch, dass der Tracking-Kasten ganz sichtbar ist
  und Suche + Kartenknöpfe frei bleiben. Kartenknöpfe dann als Reihe, Filter-Menü klappt nach unten auf
- **„Zu mir“:** dein Punkt landet genau in der Mitte des sichtbaren Kartenteils (nicht mehr unter dem Bereich)
- **Login:** Skifahrer fährt etwas langsamer

## 2026-10-22 (6) – Tagesende, Vollbild, Bereich ziehen

- **Tag beenden:** Animation (deine Strecke zeichnet sich in Tempo-Farben, Kilometer und Tiefenmeter zählen hoch),
  danach eigene Vollbild-Übersicht: Karte mit deiner Spur und den Pisten, alle Zahlen, Abfahrten, Abzeichen,
  GPX/JSON herunterladen, Teilen. Ab dann zeigt die App nur noch diese Übersicht (auch nach Neuladen)
- **Mein Tag im Vollbild:** Knopf „Vollbild“ während der Aufzeichnung, SOS bleibt sichtbar
- **Bereich unten:** ziehen am Griff, an der Tab-Leiste oder im Inhalt; zwei Stufen (klein / gut die Hälfte),
  SOS- und Kartenknöpfe gleiten beim Ziehen mit
- **Route-Tab:** „Zurück“ oben statt „Route löschen“ unten
- **Test-Modus:** Test-Uhr `demoTime` in `js/config.js` (App startet z. B. um 11:00, nur mit Fake-Daten) –
  so lässt sich auch abends mit offenen Liften testen. Menü und Tagesübersicht: „Test: Tag zurücksetzen“

## 2026-10-22 (5) – Navigation einklappen, Radar neu, Animationen

- **Navigation am Handy:** Knopf „Karte“ klappt die Navigation ein – Route bleibt auf der Karte,
  Tabs, Liftstatus und Suche sind wieder da. Oben ein Streifen „8 min · Seidlalm · Zurück“
- **Radar (Gruppe):** hell statt dunkel, ohne drehenden Strahl, Ringe mit Entfernung (500 m / 2 km / 8 km),
  Himmelsrichtungen, Name + Entfernung an jedem Punkt, Wurzel-Maßstab (nahe Leute kleben nicht in der Mitte)
- **Login:** Skifahrer carvt mit Spur quer durchs Bild, bevor die Schwarz-Blende kommt
- **Tag starten:** kurze Szene – Gondel fährt einmal übers Bild, „Los geht's – dein Tag läuft“ (antippen = überspringen)
- **Wetter:** Schneefall, Regen, Gewitter-Blitze, Nebel und ziehende Wolken im Kopf – je nach aktuellem Wetter;
  Abstand zwischen „Die nächsten Tage“ und den Kästen darunter repariert
- **Karte:** viel größerer Rand zum Herumschauen, weiter rauszoomen möglich

## 2026-10-22 (4) – Liftstatus, Kartenfilter, Video, 3S-Route

- **3S-Bahn:** Routen über die 3S gehen jetzt – sie fährt in beide Richtungen, Stationen sind ans Netz
  angebunden. Damit ist die ganze Resterhöhe-Seite (Zweitausender, Bärenbadkogel, Panoramabahn …) erreichbar
- **Kartenfilter** (Knopf rechts): Alles · Nur Route (andere Pisten/Lifte blass) · Gefahren (nur eigene Spur).
  Im Route-Tab zusätzlich der Schalter „Nur Route zeigen“
- **Route starten:** links bleibt eine Vorschau mit Restzeit, Fortschritt und Schritten (aktueller markiert)
- **Kopfleiste:** groß „Noch offen 1:15 h“ bis Liftschluss, neuer Knopf mit Liftstatus (52/55 offen),
  Lawinenstufe sitzt jetzt im Wetter-Knopf
- **Lifte-Tab (neu):** alle Lifte nach Gebiet, Öffnungszeiten, Status (offen / Wind-Stopp / zu / schließt bald),
  Filter Alle/Offen/Zu – vorerst Beispieldaten in `data/fake/lift-status.json`
- **Hütten:** großes Titelbild mit Name, große Knöpfe Anrufen/Webseite; ohne Foto eine gezeichnete Bergszene.
  6 neue freie Fotos von Wikimedia Commons (`tools/fetch-commons-photos.py`)
- **Karte:** Gipfel-Schilder mit Höhe, leicht eisblauer Winter-Stil, überlappende Namen werden ausgeblendet,
  Begrenzung aufs Skigebiet ohne Springen (nie weiter rauszoomen als der Rahmen)
- **Wetter:** heller Himmel je nach Wetter statt schwarzer Karte, Temperaturbalken in Blau/Türkis
- **SOS-Knopf:** klares rotes Quadrat ohne Glow, füllt sich beim Halten von unten
- **Startseite:** Video einer fahrenden Gondel statt Fotos

## 2026-10-22 (3) – Navigation, echtes Wetter, neues Design

- **Design neu:** Grau/Weiß/Schwarz mit mehrlagigen Schatten, Akzente Orange (Route), Blau (du), Rot (SOS)
- **Startseite:** echte Fotos von KitzSki (Commons) mit langsamer Kamerafahrt statt gezeichneter Szene;
  Login-Effekt: Felder werden grün → Karte fliegt weg → Foto zoomt in den Berg → schwarzer Kreis
- **Chip verbinden:** schwarzer Bildschirm mit Statuszeilen (Signal, Position, Akku, Gruppe, SOS), Karte öffnet sich kreisförmig
- **Route starten:** Navigation mit nächstem Schritt, Entfernung, Restzeit, Ankunft, grauer gefahrener Teil,
  automatische Neuberechnung beim Abkommen, „Angekommen“
- **Karte:** ganzes KitzSki (Hahnenkamm–Resterhöhe, Horn, Gaisberg, Bichlalm), nur im Gebiet verschiebbar;
  Hütten erst beim Reinzoomen; großer eigener Punkt mit Richtungspfeil
- **Hütten & Bahnen:** Foto, Logo (oder Monogramm), Öffnungszeiten, Höhe, Webseite/Anrufen
- **Tracking:** Höhe, Tiefenmeter, Höhenprofil, Pisten-km nach Farbe, Liste der Abfahrten, Abzeichen
- **Wetter live** (Open-Meteo) für 5 Höhen, 4-Tage-Vorschau; **Lawinenbericht live** (Tirol) – ohne gültigen Bericht ehrlich „kein aktueller Bericht“
- **SOS** im neuen Schwarz/Rot-Look

## 2026-10-22 (2) – Notruf, Gruppe, neues Design

- **SOS-Notruf** in der Gäste-Ansicht, gegen Fehlalarme dreifach gesichert:
  3 Sekunden halten → 5 Sekunden Countdown mit „Abbrechen“ → senden.
  Danach: Helfer (nächster Mitarbeiter), Ankunftszeit, Helfer fährt auf der Karte zu dir,
  Koordinaten, Direktwahl Bergrettung 140 / 112, „Mir geht's gut“ mit Bestätigung.
  Bleibt nach Neuladen aktiv. Fake-Mitarbeiter in `data/fake/staff.json`.
- **Gruppe neu:** Radar (wer ist wo, Richtung + Entfernung), pro Person Tätigkeit
  („Hahnenkammbahn hoch“), Entfernung, Tempo, Chip-Akku, letzter Kontakt,
  Knöpfe Zeigen / Hinfahren / Vibrieren, ganze Gruppe rufen, Abstandswarnung fürs Kind.
  Auf der Karte: Namensschild, Spur, Lift-Symbol, Linie zur ausgewählten Person.
- **Design:** dunkle „Instrumente“ (Tacho, Radar, Notruf) im hellen Design,
  Kartenstil „Winter“ (eisblau) oder „Gelände“, Lifte als Seil mit Bergstation-Namen,
  eigener Punkt mit Blickrichtung und Funk-Ring bei jedem Signal.
- **Startseite:** neue Szene – Gittermasten, Gondeln am Bügel, Tannen mit Schnee,
  präparierte Piste, Skifahrer in Endlosschleife, dessen Chip zur Antenne der Bergstation funkt.
- **„Chip wird verbunden“** nach dem Login.

## 2026-10-22 – Startseite, Login, Gäste-Ansicht

- Startseite mit fahrender Gondel, Code-Eingabe im Skipass-Stil, Deutsch/Englisch
- Login per Code → Ansicht je nach Rolle, Zugang läuft um Mitternacht ab
- Gäste-Ansicht:
  - Karte mit echten KitzSki-Pisten (Farben + Nummernschilder), Liften mit fahrenden Kabinen, Hütten
  - Suche nach Hütten, Liften, Pisten (auch Pistennummer)
  - Routenplanung: schnellste / schwarze meiden / schwarze bevorzugen / nur blaue, mit Dauer, Strecke, Anzahl Pisten und Lifte
  - „Mein Tag“: Tracking mit Tacho, Pisten-km, Abfahrten, Liftfahrten, Top-Speed; Spur in Tempo-Farben; Download als GPX/JSON, Teilen
  - Wetter nach Höhe, Stundenwerte, Schnee, Lawinengefahr
  - Gruppe/Familie auf der Karte, Vibrationssignal (kein Notruf)
- Bergbahn- und Skischul-Ansicht: Platzhalter
