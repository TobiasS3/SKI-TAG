# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA aus reinem HTML, CSS und JavaScript. Später per Capacitor als iOS-App (danach Android) verpackt, mit demselben Web-Code und eigenem Design statt nativem iOS-Look.

## Users

Gäste, die im Skigebiet einen Ski-Tag-Chip mieten. Der wichtigste Nutzer der Gast-Ansicht sind **Familien und Gruppen**: Sie wollen wissen, wo das Kind oder die Gruppe gerade ist, und wieder zusammenfinden. Eigenes Tracking, Abzeichen und das Tagesvideo sind Extras.

Weitere Nutzer mit eigenen Ansichten: Bergbahn-Mitarbeiter und Skischulen.

## Product Purpose

Notruf und Ortung übers Skigebiet per Miet-Chip mit SOS-Knopf, keine cm-genaue Suche. Der Chip allein reicht, die App ist für Gäste optional und nur ein Werkzeug fürs Mieten. Erfolg heißt: Im Ernstfall kommt schnell Hilfe, und niemand verliert seine Gruppe aus den Augen.

## Operating Context

- Vor allem am Handy, draußen am Berg: Sonne, Kälte, Handschuhe, kurze Blicke. Das Handy hat Vorrang, Desktop muss sauber funktionieren.
- Zugang per Vorname und Code vom Mietbeleg. Der Code bestimmt die Ansicht, der Zugang läuft am Tagesende aus.
- Der Tag lässt sich als MP4-Video herunterladen und teilen.

## Capabilities and Constraints

- Gast-Ansicht: Karte, eigenes Tracking, Wetter, Strecken und Pisten, Liftstatus, Freunde und Gruppe, Reichweiten-Alarm, SOS.
- Keine Frameworks, kein CMS. Karten mit Leaflet und OpenStreetMap, 2D, nur Winter-Stil.
- DSGVO: keine externen Fonts, keine Google-Dienste.
- Aktuell Fake-Daten, bis die Chip-Technik steht. Kartendaten: KitzSki.
- Keine Pisten-Statistik für die Bergbahn.

## Brand Commitments

- Name: Ski Tag. Gäste und Mitarbeiter werden mit „Sie“ angesprochen.
- Rot ist dem Notruf vorbehalten.
- Pistenfarben wie auf den Schildern in Österreich.

## Evidence on Hand

Echte Kartendaten in `data/skimap/kitzski.json`, Live-Wetter und Lawinenbericht, sobald Online-Dienste erreichbar sind. Noch keine echten Chip-Daten, Kundenstimmen oder Partner-Belege: nichts davon erfinden.

## Product Principles

1. **Sicherheit vor Spaß.** SOS und Gruppe sind jederzeit erreichbar. Spielerisches darf sie nie verdrängen.
2. **Keine Fehlalarme.** SOS ist sauber abgesichert. Geht jemand verloren, gibt es zuerst nur ein Vibrationssignal an die eigene Gruppe, keinen sofortigen Notruf.
3. **Erlebnisse statt Tempo.** Abzeichen belohnen Erlebnisse (erste Abfahrt, schwarze Piste, Streif), nie Geschwindigkeit.
4. **Ein kurzer Blick reicht.** Das Wichtigste ist am Berg ohne Lesen und Suchen erfassbar.
5. **Ein Werkzeug für einen Tag.** Kein Konto, kein Einrichten; der Tag endet mit einem Video.

## Accessibility & Inclusion

Große Touch-Flächen für Handschuhe und starker Kontrast bei Sonnenlicht sind Pflicht.
