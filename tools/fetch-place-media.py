"""
Holt für Hütten und Bahnen ein Vorschaubild und ein Logo von deren eigener Webseite
(og:image bzw. Favicon/Apple-Touch-Icon) und speichert sie lokal.

Aufruf:   python3 tools/fetch-place-media.py
Ausgabe:  assets/places/web/…        (Bilder – NICHT im Git, siehe .gitignore)
          data/skimap/media.json      (welche Datei zu welcher Hütte gehört)

ACHTUNG: Die Bilder gehören den Hütten/Bahnen. Nur für den Prototyp lokal verwenden.
Vor einer Veröffentlichung Erlaubnis einholen (z. B. über KitzSki als Partner).
Die Fotos von Wikimedia Commons (assets/places/commons/) sind frei, mit Namensnennung.
"""
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIMAP = os.path.join(ROOT, "data", "skimap", "kitzski.json")
OUT_DIR = os.path.join(ROOT, "assets", "places", "web")
MEDIA = os.path.join(ROOT, "data", "skimap", "media.json")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) SkiTag-Prototype/0.1"}

os.makedirs(OUT_DIR, exist_ok=True)


def slug(text):
    t = text.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40]


def fetch(url, limit=4_000_000):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=12) as r:
        return r.read(limit), r.geturl(), r.headers.get("Content-Type", "")


def find_meta(html, base):
    """og:image und das größte Icon aus dem HTML suchen."""
    photo = None
    m = re.search(r'<meta[^>]+(?:property|name)=["\']og:image(?::url)?["\'][^>]+content=["\']([^"\']+)', html, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image', html, re.I)
    if m:
        photo = urllib.parse.urljoin(base, m.group(1).strip())
    icons = []
    for tag in re.findall(r"<link[^>]+>", html, re.I):
        rel = re.search(r'rel=["\']([^"\']+)', tag, re.I)
        href = re.search(r'href=["\']([^"\']+)', tag, re.I)
        if not rel or not href or "icon" not in rel.group(1).lower():
            continue
        size = re.search(r'sizes=["\'](\d+)', tag)
        score = int(size.group(1)) if size else (180 if "apple" in rel.group(1).lower() else 32)
        if href.group(1).lower().endswith(".svg"):
            score = 150
        icons.append((score, urllib.parse.urljoin(base, href.group(1).strip())))
    icons.sort(reverse=True)
    logo = icons[0][1] if icons else urllib.parse.urljoin(base, "/favicon.ico")
    return photo, logo


def save_image(url, name, max_w):
    """Bild laden und mit sips (macOS) verkleinern → JPG/PNG."""
    data, _, ctype = fetch(url)
    if len(data) < 300:
        return None
    ext = ".svg" if "svg" in ctype or url.lower().endswith(".svg") else ".png" if "png" in ctype or "icon" in ctype else ".jpg"
    raw = os.path.join(OUT_DIR, name + "-raw" + ext)
    open(raw, "wb").write(data)
    if ext == ".svg":
        final = os.path.join(OUT_DIR, name + ".svg")
        os.replace(raw, final)
        return os.path.relpath(final, ROOT)
    final = os.path.join(OUT_DIR, name + (".jpg" if max_w > 200 else ".png"))
    fmt = "jpeg" if final.endswith(".jpg") else "png"
    res = subprocess.run(["sips", "-s", "format", fmt, "-Z", str(max_w), raw, "--out", final],
                         capture_output=True)
    os.remove(raw)
    return os.path.relpath(final, ROOT) if res.returncode == 0 and os.path.exists(final) else None


def handle(place):
    name, website = place
    result = {"website": website}
    try:
        html, final_url, _ = fetch(website, 800_000)
        html = html.decode("utf-8", "ignore")
        photo, logo = find_meta(html, final_url)
        if photo:
            try:
                result["photo"] = save_image(photo, slug(name), 720)
            except Exception:
                pass
        if logo:
            try:
                result["logo"] = save_image(logo, slug(name) + "-logo", 128)
            except Exception:
                pass
    except Exception as err:
        result["error"] = str(err)[:80]
    return name, result


skimap = json.load(open(SKIMAP))
places = {}
for hut in skimap["huts"]:
    if hut.get("website"):
        url = hut["website"] if hut["website"].startswith("http") else "https://" + hut["website"]
        places[hut["name"]] = url
for lift in skimap["lifts"]:
    if lift.get("website"):
        places.setdefault(lift["name"], lift["website"])

with ThreadPoolExecutor(8) as pool:
    results = dict(pool.map(handle, places.items()))

media = json.load(open(MEDIA)) if os.path.exists(MEDIA) else {}
for name, res in results.items():
    entry = media.setdefault(name, {})
    entry.update({k: v for k, v in res.items() if v})
json.dump(media, open(MEDIA, "w"), ensure_ascii=False, indent=1)

ok_photo = sum(1 for r in results.values() if r.get("photo"))
ok_logo = sum(1 for r in results.values() if r.get("logo"))
print(f"{len(results)} Webseiten: {ok_photo} Fotos, {ok_logo} Logos → {os.path.relpath(MEDIA, ROOT)}")
