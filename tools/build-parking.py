"""
Parkplätze an den Talstationen für die App.

Eingabe:  tools/kitzski-parking-osm.json  (Overpass-Export, alle amenity=parking rund um KitzSki)
          data/skimap/kitzski.json        (für die Talstationen)
Ausgabe:  data/skimap/parking.json

Neu holen (wenn sich in OSM was ändert):
  curl -A "SkiTag-Dev/0.1" https://overpass-api.de/api/interpreter \
    --data-urlencode 'data=[out:json][timeout:60];nwr["amenity"="parking"](47.27,12.29,47.49,12.48);out geom tags;' \
    -o tools/kitzski-parking-osm.json

Behalten wird nur, was ein Skigast wirklich anfährt: öffentliche Parkplätze nah an einer
Talstation (höchstens 500 m), groß genug (ab ~1200 m² oder mit P-Nummer/Kapazität), je Talstation die größten.

Aufruf:   python3 tools/build-parking.py
Daten © OpenStreetMap-Mitwirkende, ODbL.
"""
import json
import math
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "kitzski-parking-osm.json")
MAP = os.path.join(ROOT, "data", "skimap", "kitzski.json")
OUT = os.path.join(ROOT, "data", "skimap", "parking.json")

NEAR_M = 500        # so weit darf der Parkplatz von der Talstation weg sein
MIN_AREA = 1200     # m² – kleinere Flächen sind Anrainer- oder Kurzparkplätze
PER_STATION = 3     # höchstens so viele je Talstation
VALLEY_ELE = 1000   # Talstation liegt tiefer als das
# Einstiege von der Straße, die höher liegen als VALLEY_ELE
EXTRA_STATIONS = {"Resterhöhe", "Panoramabahn Kitzbüheler Alpen I"}
# Ort je Talstation (für den Filter in der App)
TOWNS = [("Kitzbühel", [47.4467, 12.3919]), ("Kirchberg", [47.4433, 12.3167]), ("Reith", [47.4180, 12.3500]),
         ("Jochberg", [47.3772, 12.4203]), ("Pass Thurn", [47.3115, 12.4120])]
# OSM-Namen, die im Schild seltsam aussehen
NAME_FIX = {"Panoramabahn Kitzbüheler Alpen": "", "Parken Pengelstein I Ausweichparkplatz": "Ausweichparkplatz Pengelstein"}
TOWN_FIX = {"Pengelstein I": "Kirchberg"}  # Talstation Klausen gehört zu Kirchberg


def dist(a, b):
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def area(ring):
    """Fläche eines Umrisses [[lat, lng] …] in m² (flach gerechnet, reicht hier)."""
    if len(ring) < 3:
        return 0
    lat0 = math.radians(ring[0][0])
    pts = [(p[1] * 111320 * math.cos(lat0), p[0] * 110540) for p in ring]
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2


def shape(el):
    """Mittelpunkt + Umriss eines OSM-Elements"""
    if el["type"] == "node":
        return [el["lat"], el["lon"]], []
    if el["type"] == "way":
        ring = [[g["lat"], g["lon"]] for g in el.get("geometry", [])]
    else:  # Relation: äußere Ringe zusammen
        ring = [[g["lat"], g["lon"]] for m in el.get("members", []) if m.get("role") == "outer" for g in m.get("geometry", [])]
    if not ring:
        return None, []
    return [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)], ring


def main():
    skimap = json.load(open(MAP))
    core = set(skimap["core"])
    stations = {}
    for e in skimap["edges"]:
        if e["kind"] != "lift" or e["a"] not in core:
            continue
        lift = skimap["lifts"][e["ref"]]
        if lift["type"] in ("magic_carpet", "rope_tow", "platter") or lift["name"].startswith("Übungslift"):
            continue
        if skimap["ele"][e["a"]] < VALLEY_ELE or lift["name"] in EXTRA_STATIONS:
            stations.setdefault(lift["name"], {"lift": lift["name"], "code": lift.get("code"), "node": e["a"], "pos": skimap["nodes"][e["a"]]})

    found = {}
    for el in json.load(open(SRC))["elements"]:
        t = el.get("tags", {})
        if t.get("access") in ("private", "no", "permit", "delivery") or t.get("parking") == "street_side":
            continue
        pos, ring = shape(el)
        if not pos:
            continue
        a = area(ring)
        # „Nur für Kunden“ an einer Talstation heißt meist: für Liftgäste (P1 Hahnenkammbahn, Wagstätt P1)
        if t.get("access") == "customers" and a < 2000 and not re.search(r"P\s?\d|bahn|lift", t.get("name", ""), re.I):
            continue
        cap = int(re.match(r"\d*", t.get("capacity", "")).group() or 0)
        name = t.get("name") or ""
        if a < MIN_AREA and cap < 40 and not re.match(r"P\s?\d", name) and t.get("parking") not in ("underground", "multi-storey"):
            continue
        st = min(stations.values(), key=lambda s: dist(pos, s["pos"]))
        d = dist(pos, st["pos"])
        if d > NEAR_M:
            continue
        found.setdefault(st["lift"], []).append({
            "name": name, "pos": [round(pos[0], 5), round(pos[1], 5)],
            "kind": t.get("parking") or "surface",
            "fee": {"yes": True, "no": False}.get(t.get("fee")),
            "capacity": cap or None, "area": round(a), "walk": round(d),
            "station": st["lift"], "code": st["code"], "node": st["node"],
            "town": TOWN_FIX.get(st["lift"]) or min(TOWNS, key=lambda tw: dist(st["pos"], tw[1]))[0],
            "osm": f'{el["type"]}/{el["id"]}',
        })

    out = []
    for lift, lots in found.items():
        # Größte zuerst; Tiefgaragen/Parkhäuser zählen, als wären sie groß
        lots.sort(key=lambda p: -(p["area"] if p["kind"] == "surface" else max(p["area"], 5000)))
        short = re.sub(r" Kitzbüheler Alpen I*$| I+$", "", lift)
        for p in lots[:PER_STATION]:
            p["name"] = NAME_FIX.get(p["name"], p["name"])
            if p["name"] == "P4" and lift == "Hausleiten":
                p["name"] = "P4 Parkplatz Hausleiten"
            if not p["name"]:
                kind = {"underground": "Tiefgarage", "multi-storey": "Parkhaus"}.get(p["kind"], "Parkplatz")
                p["name"] = f"{kind} {short}"
            same = [q for q in out if q["name"].rstrip(" 0123456789") == p["name"]]
            if same:
                p["name"] = f'{p["name"]} {len(same) + 1}'
            out.append(p)
    out.sort(key=lambda p: (p["town"], p["station"], p["walk"]))
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} Parkplätze → {os.path.relpath(OUT, ROOT)}")
    for p in out:
        print(f'  {p["town"]:11} {p["station"]:32} {p["name"]:38} {p["walk"]:4} m  {p["area"]:6} m²  fee={p["fee"]} {p["kind"]}')


if __name__ == "__main__":
    main()
