"""
Baut aus OpenStreetMap-Daten die Skigebietskarte für die App.

Eingabe:  tools/kitzski-osm.json   (Overpass-Export: Pisten, Lifte, Hütten)
Ausgabe:  data/skimap/kitzski.json (Pisten, Lifte, Hütten + Netz für die Routenplanung)

Behalten werden nur die KitzSki-Teilgebiete (Hahnenkamm bis Resterhöhe, Horn, Gaisberg,
Bichlalm, Kirchberg, Reith) – dazu jeder Lift mit offiziellem KitzSki-Code (A1 … H12),
auch kleine Übungslifte, die allein stehen. Jeder Punkt bekommt seine Höhe (Open-Meteo, zwischengespeichert in
tools/elevation-cache.json).

Aufruf:   python3 tools/build-skimap.py

Pisten und Lifte werden zu einem Netz aus Knoten (Kreuzungen, Stationen) und
Kanten (Pistenstücke, Liftfahrten, kurze Fußwege) verbunden. Damit kann die App
Routen berechnen: "Von hier zur Sonnalm, ohne schwarze Pisten".

Daten © OpenStreetMap-Mitwirkende, ODbL.
"""
import json
import math
import os
import re
import collections
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "kitzski-osm.json")
OUT = os.path.join(ROOT, "data", "skimap", "kitzski.json")

LIFT_TYPES = {
    "cable_car": "Seilbahn", "gondola": "Gondel", "chair_lift": "Sessellift",
    "mixed_lift": "Kombibahn", "t-bar": "Schlepplift", "j-bar": "Schlepplift",
    "platter": "Tellerlift", "rope_tow": "Seillift", "magic_carpet": "Förderband",
}
DIFFICULTY = {"novice": "easy", "easy": "easy", "intermediate": "intermediate",
              "advanced": "advanced", "expert": "expert", "freeride": "freeride"}

# Pisten ohne Nummer in OSM, die auf dem offiziellen KitzSki-Plan eine haben: (Name, Schwierigkeit) → Nummer
REF_FIX = {("Gaisberg", "intermediate"): "41", ("Gaisberg", "advanced"): "42"}

LIFT_LINK_M = 120     # Liftstation ↔ Piste: so weit darf man gehen/rutschen
PISTE_LINK_M = 45     # loses Pistenende ↔ andere Piste
HUT_NEAR_M = 250      # Hütte zählt als "am Berg", wenn so nah an Piste/Lift
# Verbindungsbahnen, mit denen man in beide Richtungen fährt (sonst nur bergauf).
# Ihre Stationen sind groß – Ein-/Ausstieg aus etwas weiterem Umkreis.
BOTH_WAYS = {"3S Bahn"}
BOTH_WAYS_LINK_M = 200


def dist(a, b):
    """Abstand zweier Punkte [lat, lng] in Metern (Haversine)."""
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def line_len(coords):
    return sum(dist(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def rnd(c):
    return [round(c[0], 5), round(c[1], 5)]


data = json.load(open(SRC))["elements"]
pos = {}        # OSM-Knoten-ID → [lat, lng]
pistes, lifts, huts = [], [], []

for e in data:
    t = e.get("tags", {})
    if e["type"] == "way" and "geometry" in e:
        for nid, g in zip(e["nodes"], e["geometry"]):
            pos[nid] = [g["lat"], g["lon"]]
    if "piste:type" in t:
        if t.get("area") == "yes" or e["nodes"][0] == e["nodes"][-1]:
            continue  # Pistenflächen, keine Linien
        pistes.append({
            "osm": e["id"], "nodes": e["nodes"],
            "name": t.get("piste:name") or t.get("name"),
            # Manche Pisten haben mehrere Nummern („16a;28a“) – die erste reicht fürs Schild
            "ref": (t.get("piste:ref") or t.get("ref") or "").split(";")[0].strip() or None,
            "diff": DIFFICULTY.get(t.get("piste:difficulty"), "intermediate"),
        })
        p = pistes[-1]
        p["ref"] = p["ref"] or REF_FIX.get((p["name"], p["diff"]))
    elif "aerialway" in t and t["aerialway"] in LIFT_TYPES:
        lifts.append({
            "osm": e["id"], "nodes": e["nodes"], "name": t.get("name"),
            "code": t.get("ref"),  # offizieller KitzSki-Code, z. B. „A1“ (Hahnenkammbahn)
            "type": t["aerialway"],
            "website": t.get("website"),
            "capacity": t.get("aerialway:capacity"),
            "occupancy": t.get("aerialway:occupancy"),
        })
    elif t.get("name") and (t.get("amenity") in ("restaurant", "cafe", "bar")
                            or t.get("tourism") == "alpine_hut"):
        if "lat" in e:
            p = [e["lat"], e["lon"]]
        elif "center" in e:
            p = [e["center"]["lat"], e["center"]["lon"]]
        elif "bounds" in e:
            b = e["bounds"]
            p = [(b["minlat"] + b["maxlat"]) / 2, (b["minlon"] + b["maxlon"]) / 2]
        else:
            continue
        huts.append({"name": t["name"], "pos": p,
                     "website": t.get("website") or t.get("contact:website"),
                     "phone": t.get("phone") or t.get("contact:phone"),
                     "hours": t.get("opening_hours"),
                     "kind": "hut" if t.get("tourism") == "alpine_hut" else t.get("amenity"),
                     "osm": f'{e["type"]}/{e["id"]}'})

# --- Kreuzungen finden: Knoten, die in mehreren Wegen vorkommen -------------
use = collections.Counter()
for w in pistes + lifts:
    for n in set(w["nodes"]):
        use[n] += 1

edges = []      # {a, b, kind, ref(index), coords, len}


def add_piste_edges(i, p):
    """Piste an Kreuzungen in Stücke schneiden (Richtung = bergab, wie in OSM)."""
    nodes = p["nodes"]
    start = 0
    for k in range(1, len(nodes)):
        if k == len(nodes) - 1 or use[nodes[k]] > 1:
            seg = nodes[start:k + 1]
            coords = [pos[n] for n in seg]
            edges.append({"a": seg[0], "b": seg[-1], "kind": "piste", "ref": i,
                          "coords": coords, "len": line_len(coords)})
            start = k


for i, p in enumerate(pistes):
    add_piste_edges(i, p)

# Richtung der Lifte prüfen: oben beginnen Pisten, unten enden sie.
piste_starts = [pos[p["nodes"][0]] for p in pistes]
piste_ends = [pos[p["nodes"][-1]] for p in pistes]


def score(c):
    starts = sum(1 for s in piste_starts if dist(c, s) < 150)
    ends = sum(1 for e in piste_ends if dist(c, e) < 150)
    return starts - ends


for l in lifts:
    if score(pos[l["nodes"][0]]) > score(pos[l["nodes"][-1]]):
        l["nodes"] = l["nodes"][::-1]   # falsch herum eingezeichnet

for i, l in enumerate(lifts):
    coords = [pos[n] for n in l["nodes"]]
    # In OSM zeigen Lifte von der Tal- zur Bergstation.
    edges.append({"a": l["nodes"][0], "b": l["nodes"][-1], "kind": "lift", "ref": i,
                  "coords": [coords[0], coords[-1]] if len(coords) > 2 else coords,
                  "len": line_len(coords)})
    if l["name"] in BOTH_WAYS:
        edges.append({"a": l["nodes"][-1], "b": l["nodes"][0], "kind": "lift", "ref": i,
                      "coords": [coords[-1], coords[0]], "len": line_len(coords)})
    l["coords"] = coords

# --- Lose Enden verbinden ----------------------------------------------------
piste_nodes = {}
for i, p in enumerate(pistes):
    for n in p["nodes"]:
        piste_nodes.setdefault(n, set()).add(i)

# Raster für schnelle Nachbarsuche (~100 m Zellen)
grid = collections.defaultdict(list)
cell = lambda c: (int(c[0] * 1000), int(c[1] * 700))
for n in piste_nodes:
    grid[cell(pos[n])].append(n)


def near_nodes(c, radius, exclude_piste=None):
    """Nächster Pistenknoten je Piste im Umkreis."""
    cx, cy = cell(c)
    best = {}
    for dx in (-2, -1, 0, 1, 2):
        for dy in (-2, -1, 0, 1, 2):
            for n in grid.get((cx + dx, cy + dy), ()):
                d = dist(c, pos[n])
                if d > radius:
                    continue
                for pi in piste_nodes[n]:
                    if pi == exclude_piste:
                        continue
                    if pi not in best or d < best[pi][1]:
                        best[pi] = (n, d)
    return best.values()


def walk(a, b, d):
    edges.append({"a": a, "b": b, "kind": "walk", "ref": None,
                  "coords": [pos[a], pos[b]], "len": d})


def entries(l):
    """Stationen, an denen man einsteigt (Talstation; bei BOTH_WAYS beide)."""
    return [l["nodes"][0], l["nodes"][-1]] if l["name"] in BOTH_WAYS else [l["nodes"][0]]


def exits(l):
    return [l["nodes"][-1], l["nodes"][0]] if l["name"] in BOTH_WAYS else [l["nodes"][-1]]


def link_m(*ls):
    return BOTH_WAYS_LINK_M if any(l["name"] in BOTH_WAYS for l in ls) else LIFT_LINK_M


for l in lifts:
    for st in entries(l):
        for n, d in near_nodes(pos[st], link_m(l)):
            walk(n, st, d)          # von der Piste zum Lift
    for st in exits(l):
        for n, d in near_nodes(pos[st], link_m(l)):
            walk(st, n, d)          # vom Lift auf die Piste
# Mehrere Lifte an einer Station: Umsteigen
for i, l in enumerate(lifts):
    for j, m in enumerate(lifts):
        if i == j:
            continue
        for a in exits(l):
            for b in entries(m):
                d = dist(pos[a], pos[b])
                if d < link_m(l, m):
                    walk(a, b, d)

for i, p in enumerate(pistes):
    first, last = p["nodes"][0], p["nodes"][-1]
    if use[last] == 1:
        for n, d in near_nodes(pos[last], PISTE_LINK_M, exclude_piste=i):
            walk(last, n, d)
    if use[first] == 1:
        for n, d in near_nodes(pos[first], PISTE_LINK_M, exclude_piste=i):
            walk(n, first, d)

# --- Teilnetze: nur die von KitzSki behalten ---------------------------------
# Im Kartenausschnitt liegen auch Nachbargebiete (Wildkogel, Smaragdbahn …).
# Ein Teilnetz gehört zu KitzSki, wenn eine dieser Bahnen darin fährt.
AREAS = {
    "Hahnenkamm · Pengelstein · Resterhöhe": {"Hahnenkammbahn", "Fleckalmbahn", "3S Bahn", "Pengelstein I",
                                              "Wagstättbahn", "Panoramabahn Kitzbüheler Alpen I", "Resterhöhe", "Zweitausender"},
    "Kitzbüheler Horn": {"Hornbahn I", "Hornbahn II", "Horngipfelbahn"},
    "Gaisberg": {"Gaisberg"},
    "Bichlalm": {"Bichlalmlift"},
    "Kirchberg": {"Schatzerlift"},
    "Reith": {"Übungslift Reith", "Sun Cord Reith"},
}
# Offizielle KitzSki-Liftcodes (A1 … H12). Teilnetze mit so einem Lift gehören dazu, auch ohne Pisten.
KITZ_CODE = re.compile(r"^[A-H]\d{1,2}$")
NEAR_AREA_M = 2500  # einzelner Lift so nah an einem Teilgebiet → gehört dorthin (z. B. G2 Pass Thurn)

adj = collections.defaultdict(set)
for e in edges:
    adj[e["a"]].add(e["b"])
    adj[e["b"]].add(e["a"])
seen, comps = set(), []
for n in adj:
    if n in seen:
        continue
    comp, stack = set(), [n]
    while stack:
        x = stack.pop()
        if x in comp:
            continue
        comp.add(x)
        stack.extend(adj[x] - comp)
    seen |= comp
    comps.append(comp)

area_of = {}  # Knoten → Name des Teilgebiets
for comp in comps:
    names = {lifts[e["ref"]]["name"] for e in edges if e["kind"] == "lift" and e["a"] in comp}
    for area, seeds in AREAS.items():
        if names & seeds:
            for n in comp:
                area_of[n] = area
            break

# Übrige Teilnetze mit KitzSki-Lift (z. B. ein Schlepplift allein an der Talstation):
# zum nächsten Teilgebiet in der Nähe
assigned = list(area_of)
for comp in comps:
    if next(iter(comp)) in area_of:
        continue
    codes = {lifts[e["ref"]]["code"] for e in edges if e["kind"] == "lift" and e["a"] in comp}
    if not any(c and KITZ_CODE.match(c) for c in codes):
        continue
    probe = pos[next(iter(comp))]
    near = min(assigned, key=lambda n: dist(probe, pos[n]))
    if dist(probe, pos[near]) < NEAR_AREA_M:
        for n in comp:
            area_of[n] = area_of[near]
    else:
        print(f"  Achtung: Lift(e) {sorted(c for c in codes if c)} ohne Teilgebiet")
edges = [e for e in edges if e["a"] in area_of]

# Kern je Teilgebiet: Knoten, von denen man überall hin und wieder zurück kommt.
fwd, back = collections.defaultdict(set), collections.defaultdict(set)
for e in edges:
    fwd[e["a"]].add(e["b"])
    back[e["b"]].add(e["a"])


def reach(s, g):
    seen, stack = {s}, [s]
    while stack:
        for y in g[stack.pop()] - seen:
            seen.add(y)
            stack.append(y)
    return seen


core = set()
for area in AREAS:
    members = [n for n, a in area_of.items() if a == area]
    best = set()
    for n in members:
        if n not in best:
            c = reach(n, fwd) & reach(n, back)
            if len(c) > len(best):
                best = c
    core |= best

# --- Höhen (Open-Meteo, Copernicus DEM 90 m) – mit Zwischenspeicher ------------
CACHE = os.path.join(ROOT, "tools", "elevation-cache.json")
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def key(c):
    return f"{c[0]:.5f},{c[1]:.5f}"


def elevations(points):
    todo = [p for p in points if key(p) not in cache]
    for i in range(0, len(todo), 100):
        chunk = todo[i:i + 100]
        url = "https://api.open-meteo.com/v1/elevation?" + urllib.parse.urlencode({
            "latitude": ",".join(f"{p[0]:.5f}" for p in chunk),
            "longitude": ",".join(f"{p[1]:.5f}" for p in chunk),
        })
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "SkiTag-dev/0.1"})
                data = json.load(urllib.request.urlopen(req, timeout=30))
                break
            except Exception:
                time.sleep(3 * (attempt + 1))
        else:
            raise SystemExit("Höhen konnten nicht geladen werden")
        for p, h in zip(chunk, data["elevation"]):
            cache[key(p)] = round(h)
        time.sleep(0.4)
    json.dump(cache, open(CACHE, "w"))
    return [cache[key(p)] for p in points]


# --- Ausgabe kompakt: Knoten durchnummerieren ---------------------------------
node_ids = sorted({e["a"] for e in edges} | {e["b"] for e in edges})
index = {n: i for i, n in enumerate(node_ids)}
used_p = sorted({e["ref"] for e in edges if e["kind"] == "piste"})
used_l = sorted({e["ref"] for e in edges if e["kind"] == "lift"})
p_new = {old: i for i, old in enumerate(used_p)}
l_new = {old: i for i, old in enumerate(used_l)}
area_names = list(AREAS)

node_ele = elevations([rnd(pos[n]) for n in node_ids])

out_edges = []
for e in edges:
    ref = p_new.get(e["ref"]) if e["kind"] == "piste" else l_new.get(e["ref"]) if e["kind"] == "lift" else None
    out_edges.append({"a": index[e["a"]], "b": index[e["b"]], "kind": e["kind"],
                      "ref": ref, "len": round(e["len"]),
                      "coords": [rnd(c) for c in e["coords"]]})

all_coords = [pos[n] for n in node_ids]
on_mountain = []
for h in huts:
    d = min(dist(h["pos"], c) for c in all_coords)
    if d < HUT_NEAR_M:
        h["pos"] = rnd(h["pos"])
        near = min(core, key=lambda n: dist(h["pos"], pos[n]))
        h["node"] = index[near]
        h["area"] = area_names.index(area_of[near])
        on_mountain.append(h)
hut_ele = elevations([h["pos"] for h in on_mountain])
for h, ele in zip(on_mountain, hut_ele):
    h["ele"] = ele

result = {
    "meta": {"name": "KitzSki", "source": "© OpenStreetMap-Mitwirkende (ODbL), Höhen: Copernicus DEM via Open-Meteo"},
    "areas": area_names,
    "nodes": [rnd(pos[n]) for n in node_ids],
    "ele": node_ele,
    "nodeArea": [area_names.index(area_of[n]) for n in node_ids],
    "core": sorted(index[n] for n in core),
    "pistes": [{"name": pistes[i]["name"], "ref": pistes[i]["ref"], "diff": pistes[i]["diff"]} for i in used_p],
    "lifts": [{"name": lifts[i]["name"] or LIFT_TYPES[lifts[i]["type"]], "code": lifts[i]["code"], "type": lifts[i]["type"],
               "typeName": LIFT_TYPES[lifts[i]["type"]],
               "website": lifts[i]["website"],
               "capacity": lifts[i]["capacity"],
               "occupancy": lifts[i]["occupancy"],
               "coords": [rnd(c) for c in lifts[i]["coords"]]} for i in used_l],
    "huts": sorted(on_mountain, key=lambda h: h["name"]),
    "edges": out_edges,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

for i, area in enumerate(area_names):
    n = sum(1 for a in result["nodeArea"] if a == i)
    print(f"  {area}: {n} Knoten")
print(f"Netz: {len(node_ids)} Knoten, {len(out_edges)} Kanten, Kern {len(core)}")
print(f"Pisten: {len(used_p)}, Lifte: {len(used_l)}, Hütten: {len(on_mountain)}")
print(f"Höhen: {min(node_ele)}–{max(node_ele)} m")
print(f"Datei: {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB)")
