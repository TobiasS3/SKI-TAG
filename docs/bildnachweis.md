# Bildnachweis

## Freie Fotos (Wikimedia Commons) – im Repo

Diese Fotos dürfen mit Namensnennung verwendet werden. Die App zeigt den Nachweis direkt am Bild.

| Datei | Motiv | Foto | Lizenz | Quelle |
|---|---|---|---|---|
| `assets/images/hero/kitzbuehel-hahnenkamm-winter.jpg` | Kitzbühel mit Hahnenkamm und Streif | Heribert Pohl | CC BY-SA 2.0 | [Commons](https://commons.wikimedia.org/wiki/File:Kitzb%C3%BChl,_Tirol,_im_Hintergrund_der_Hahnenkamm_(Streif)_(11540575696).jpg) |
| `assets/images/hero/hahnenkammbahn-gondel.jpg` | Gondel der Hahnenkammbahn | Kim Skipper Eriksen (Beschnitt: Christoph Waghubinger) | CC BY 2.0 | [Commons](https://commons.wikimedia.org/wiki/File:Hahnenkammbahn_-_Gondel_Ernst_Hinterseer.jpg) |
| `assets/images/hero/streif-zielhang.jpg` | Zielhang Streif, Hahnenkammrennen 2011 | Michael Fleischhacker | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Hahnekammrennen2011.jpg) |
| `assets/places/commons/hahnenkammbahn.jpg` | Hahnenkammbahn | Kim Skipper Eriksen | CC BY 2.0 | [Commons](https://commons.wikimedia.org/wiki/File:Hahnenkammbahn_(19247946548).jpg) |
| `assets/places/commons/3s-bahn.jpg` | 3S-Bahn | Aisano | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Kitzb%C3%BChel,_Dreiseilbahn,_2.jpeg) |
| `assets/places/commons/kitzbueheler-horn.jpg` | Kitzbüheler Horn | Andrzej Otrębski | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Kitzbuheler_Horn_1.jpg) |
| `assets/places/commons/pengelstein.jpg` | Pengelstein | Kuhni74 | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Pengelstein-Ost-von-Jochberg.jpg) |
| `assets/places/commons/hahnenkamm-bergstation.jpg` | Bergstation Hahnenkammbahn | Ironbernietyrol | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Bergstation_Hahnenkammbahn.jpg) |
| `assets/places/commons/streif.jpg` | Streif | Michael Fleischhacker | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Hahnekammrennen2011.jpg) |
| `assets/places/commons/seidlalm.jpg` | Seidlalm | Clemens Stockner | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Seidlalm_01.jpg) |
| `assets/places/commons/hornkoepflhuette.jpg` | Hornköpflhütte (Sommer) | Mateus2019 | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:AUT_%E2%80%94_Tirol_%E2%80%94_KB_%E2%80%94_Kitzb%C3%BChel_%E2%80%94_Ried_am_Horn_8_(Hornk%C3%B6pflh%C3%BCtte_%C2%B7_Au%C3%9Fenansicht)_2024-08-31_Mattes.jpg) |
| `assets/places/commons/oberlandhuette.jpg` | Oberlandhütte (Sommer) | Mateus2019 | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:AUT_%E2%80%94_Tirol_%E2%80%94_Bezirk_Kitzb%C3%BChel_%E2%80%94_Gemeinde_Kirchberg_in_Tirol_%E2%80%94_Aschau_%E2%80%94_Falkensteinweg_35_(Oberlandh%C3%BCtte)_2023-09-30_Mattes.jpg) |
| `assets/places/commons/ehrenbachhoehe.jpg` | Ehrenbachhöhe | Daniel Pirch | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Ehrenbachh%C3%B6he_-_panoramio.jpg) |
| `assets/places/commons/pengelstein.jpg` | Pengelstein (Berg, für die gleichnamige Hütte) | Kuhni74 | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Pengelstein-Ost-von-Jochberg-unten.jpg) |
| `assets/places/commons/restaurant-panoramabahn.jpg` | Panoramabahn Kitzbüheler Alpen (für das Restaurant dort) | Wald1siedel | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:Panoramabahn_Kitzb%C3%BCheler_Alpen.JPG) |

Neue Hütten-Fotos sucht `python3 tools/fetch-commons-photos.py` – nur Treffer mit dem Hüttennamen im Dateinamen.
Danach von Hand prüfen: Falsche Treffer kommen in `WRONG` im Skript (z. B. „Red Bull“ = Fußballfoto).
Hütten ohne Foto zeigen eine gezeichnete Bergszene. Echte Fotos aller Hütten → über KitzSki als Partner.

## Video – im Repo

| Datei | Motiv | Quelle | Lizenz |
|---|---|---|---|
| `assets/video/skitag-intro.mp4` (+ Poster) | Gondelbahn im Schnee, Drohnenflug. **Nicht KitzSki.** 14,5 s, Full HD, Farben leicht verstärkt, ohne Ton | [Pexels, Video 30115054](https://www.pexels.com/video/30115054/) | Pexels-Lizenz (freie Nutzung, auch kommerziell, Namensnennung freiwillig) |
| `assets/video/skitag-intro-hoch.mp4` (+ Poster) | Gleiches Video, Hochformat-Ausschnitt für Handys (Sek. 7,5–13,5, Ausschnitt folgt der Gondel), 1080×1920 | wie oben | wie oben |

Auf Wikimedia Commons gibt es kein freies Gondel-Video aus Kitzbühel (Stand Oktober 2026), die KitzSki-Videos
gehören KitzSki. Mit deren Erlaubnis (z. B. als Partner) einfach die Dateien ersetzen und `VIDEO` in
`views/login/login-view.js` anpassen.

