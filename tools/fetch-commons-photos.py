"""
Sucht auf Wikimedia Commons freie Fotos von Hütten, die noch kein Foto haben.

Aufruf:   python3 tools/fetch-commons-photos.py
Ausgabe:  assets/places/commons/<name>.jpg  (freie Fotos – dürfen ins Git)
          data/skimap/media.json            (Foto + Bildnachweis je Hütte)

Ein Foto zählt nur, wenn der Hüttenname im Dateinamen vorkommt – Bilder "aus der Nähe"
zeigen meist etwas anderes (Straße, Lift, Panorama) und wären irreführend.
Lizenz und Fotograf kommen mit; die App zeigt sie am Bild.
"""
import html
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIMAP = os.path.join(ROOT, "data", "skimap", "kitzski.json")
MEDIA = os.path.join(ROOT, "data", "skimap", "media.json")
OUT_DIR = os.path.join(ROOT, "assets", "places", "commons")
UA = {"User-Agent": "SkiTag-Prototype/0.1"}

# Von Hand geprüft: Treffer zeigen etwas anderes (Fußball, Geburtshaus, Dorf …) – nicht nehmen
WRONG = {"Red Bull", "Toni Alm", "Seehof", "Berghaus Tyrol", "Kitz Ski Bar & Lounge"}

# Wörter, die in vielen Namen stecken und allein nichts aussagen
GENERIC = {"alm", "hütte", "huette", "gasthof", "gasthaus", "berggasthof", "restaurant", "bar", "cafe",
           "lounge", "bistro", "stub'n", "stube", "stuben", "the", "und", "am", "bei", "berghaus", "skihitt'n"}


def api(**params):
    params.update(format="json", action="query")
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20))
        except urllib.error.HTTPError as err:
            if err.code != 429:
                raise
            time.sleep(10 * (attempt + 1))
    raise SystemExit("Commons antwortet nicht (zu viele Anfragen)")


def slug(text):
    t = text.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40]


def key_words(name):
    words = re.findall(r"[\wäöüß']+", name.lower())
    return [w for w in words if len(w) > 3 and w not in GENERIC]


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


skimap = json.load(open(SKIMAP))
media = json.load(open(MEDIA)) if os.path.exists(MEDIA) else {}
os.makedirs(OUT_DIR, exist_ok=True)
found = 0

for hut in skimap["huts"]:
    name = hut["name"]
    if media.get(name, {}).get("photo") or name in WRONG:
        continue
    words = key_words(name)
    if not words:
        continue
    res = api(list="search", srnamespace=6, srlimit=10, srsearch=f'intitle:"{words[0]}" Kitzbühel OR Kirchberg OR Jochberg OR Tirol')
    titles = [r["title"] for r in res.get("query", {}).get("search", [])
              if r["title"].lower().endswith((".jpg", ".jpeg")) and all(w in r["title"].lower() for w in words)]
    time.sleep(1)
    if not titles:
        print(f"  –  {name}")
        continue
    info = api(prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=720, titles=titles[0])
    page = next(iter(info["query"]["pages"].values()))
    ii = page["imageinfo"][0]
    meta = ii["extmetadata"]
    file = os.path.join(OUT_DIR, slug(name) + ".jpg")
    raw = file + ".raw"
    open(raw, "wb").write(urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA)).read())
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "720", raw, "--out", file], capture_output=True)
    os.remove(raw)
    entry = media.setdefault(name, {})
    entry["photo"] = os.path.relpath(file, ROOT)
    entry["credit"] = {
        "artist": strip_tags(meta.get("Artist", {}).get("value")) or "unbekannt",
        "license": meta.get("LicenseShortName", {}).get("value", ""),
        "source": ii["descriptionurl"],
    }
    found += 1
    print(f"  ✓  {name}: {titles[0]}")
    time.sleep(1)

json.dump(media, open(MEDIA, "w"), ensure_ascii=False, indent=1)
print(f"{found} neue Fotos → {os.path.relpath(MEDIA, ROOT)}")
