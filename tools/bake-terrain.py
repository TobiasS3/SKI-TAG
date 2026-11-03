#!/usr/bin/env python3
"""Malt die Winterkarte einmal vor: assets/terrain/{z}/{x}/{y}.webp

Das Handy rechnet so nichts selbst, und zur Laufzeit geht keine Anfrage an fremde Server.
Gelände: AWS Terrain Tiles. Wald, Wasser, Straßen, Häuser, Gipfel: OpenStreetMap (Overpass).

    pip install numpy pillow
    python3 tools/bake-terrain.py
"""
import io
import json
import math
import os
import pathlib
import subprocess
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(os.environ.get('TERRAIN_OUT', ROOT / 'assets' / 'terrain'))
CACHE = pathlib.Path('/tmp/skitag-terrarium')
OSM_FILE = CACHE / 'osm.json'
ZOOMS = [11, 12, 13, 14, 15]
SIZE = 256
PAD = 0.03  # Grad Rand ums Skigebiet

STOPS = np.array([0.0, 0.3, 0.5, 0.62, 0.72, 1.0])
COLORS = np.array([[92, 124, 198], [146, 174, 230], [208, 223, 248], [244, 248, 254], [255, 255, 255], [255, 255, 255]], float)
LIGHT = np.array([-0.52, -0.52, 0.68])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
FOREST = np.array([58, 98, 104], float)
ROCK = np.array([122, 138, 170], float)
WATER = np.array([96, 170, 226], float)


def box():
    data = json.loads((ROOT / 'data/skimap/kitzski.json').read_text())
    lats = [n[0] for n in data['nodes']]
    lngs = [n[1] for n in data['nodes']]
    return min(lats) - PAD, max(lats) + PAD, min(lngs) - PAD, max(lngs) + PAD


def wx(lng, n):
    return (np.asarray(lng) + 180) / 360 * n


def wy(lat, n):
    r = np.radians(np.asarray(lat))
    return (1 - np.arcsinh(np.tan(r)) / np.pi) / 2 * n


def fetch_osm(b):
    if OSM_FILE.exists():
        return
    bbox = f'{b[0]},{b[2]},{b[1]},{b[3]}'
    query = f"""[out:json][timeout:170];
(
  way["landuse"="forest"]({bbox}); relation["landuse"="forest"]({bbox});
  way["natural"="wood"]({bbox}); relation["natural"="wood"]({bbox});
  way["natural"="water"]({bbox}); relation["natural"="water"]({bbox});
  way["waterway"~"^(river|stream)$"]({bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"]({bbox});
  way["building"]({bbox});
  node["natural"="peak"]["name"]({bbox});
);
out geom;"""
    # curl statt urllib: die Python-Version am Mac scheitert sonst am TLS der Overpass-Server
    for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']:
        done = subprocess.run(['curl', '-sS', '--fail', '--max-time', '190', '-A', 'SkiTag-bake/1.0', '--data-urlencode', f'data@-', '-o', str(OSM_FILE), url], input=query.encode())
        if done.returncode == 0 and OSM_FILE.stat().st_size > 1000:
            return
        print('Overpass', url, done.returncode)
        OSM_FILE.unlink(missing_ok=True)
    raise SystemExit('Keine OSM-Daten bekommen')


def stitch(parts):
    """Teilstücke eines Rings aneinanderhängen"""
    rings = []
    parts = [list(p) for p in parts if p]
    while parts:
        ring = parts.pop()
        grown = True
        while grown and ring[0] != ring[-1]:
            grown = False
            for i, p in enumerate(parts):
                if p[0] == ring[-1]:
                    ring += p[1:]
                elif p[-1] == ring[-1]:
                    ring += p[-2::-1]
                elif p[-1] == ring[0]:
                    ring = p[:-1] + ring
                elif p[0] == ring[0]:
                    ring = p[:0:-1] + ring
                else:
                    continue
                parts.pop(i)
                grown = True
                break
        rings.append(ring)
    return rings


class Layer:
    def __init__(self):
        self.items = []

    def add(self, geo, meta=None):
        self.items.append((np.array(geo, float), meta))

    def freeze(self):
        self.box = np.array([[i[0][:, 0].min(), i[0][:, 0].max(), i[0][:, 1].min(), i[0][:, 1].max()] for i in self.items]) if self.items else np.zeros((0, 4))

    def near(self, s, n, w, e):
        b = self.box
        hit = (b[:, 1] >= s) & (b[:, 0] <= n) & (b[:, 3] >= w) & (b[:, 2] <= e)
        return [self.items[i] for i in np.nonzero(hit)[0]]


OSM = None


def osm():
    global OSM
    if OSM is not None:
        return OSM
    raw = json.loads(OSM_FILE.read_text())
    forest, holes, water, rivers, roads, houses = Layer(), Layer(), Layer(), Layer(), Layer(), Layer()
    peaks = []
    pts = lambda g: [(p['lat'], p['lon']) for p in g]
    for el in raw['elements']:
        tags = el.get('tags', {})
        if el['type'] == 'node':
            ele = tags.get('ele', '')
            peaks.append((el['lat'], el['lon'], tags['name'], ele.split('.')[0] if ele[:1].isdigit() else ''))
            continue
        is_forest = tags.get('landuse') == 'forest' or tags.get('natural') == 'wood'
        is_water = tags.get('natural') == 'water'
        if el['type'] == 'relation':
            outer = stitch([pts(m['geometry']) for m in el.get('members', []) if m.get('role') != 'inner' and m.get('geometry')])
            inner = stitch([pts(m['geometry']) for m in el.get('members', []) if m.get('role') == 'inner' and m.get('geometry')])
            for r in outer:
                if len(r) > 2:
                    (forest if is_forest else water).add(r)
            if is_forest:
                for r in inner:
                    if len(r) > 2:
                        holes.add(r)
            continue
        g = el.get('geometry')
        if not g or len(g) < 2:
            continue
        if is_forest:
            forest.add(pts(g))
        elif is_water:
            water.add(pts(g))
        elif 'waterway' in tags:
            rivers.add(pts(g), tags['waterway'])
        elif 'highway' in tags:
            roads.add(pts(g), tags['highway'])
        elif 'building' in tags:
            houses.add(pts(g))
    for layer in (forest, holes, water, rivers, roads, houses):
        layer.freeze()
    OSM = dict(forest=forest, holes=holes, water=water, rivers=rivers, roads=roads, houses=houses, peaks=peaks)
    return OSM


def heights(z, x, y):
    path = CACHE / f'{z}-{x}-{y}.png'
    if not path.exists():
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=30) as res:
                    path.write_bytes(res.read())
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt)
    px = np.asarray(Image.open(io.BytesIO(path.read_bytes())).convert('RGB'), float)
    return px[..., 0] * 256 + px[..., 1] + px[..., 2] / 256 - 32768


ROAD_MIN = {'motorway': 11, 'trunk': 11, 'primary': 11, 'secondary': 12, 'tertiary': 13, 'unclassified': 14, 'residential': 14}
ROAD_W = {'motorway': 1.6, 'trunk': 1.5, 'primary': 1.3, 'secondary': 1.1, 'tertiary': .9, 'unclassified': .7, 'residential': .6}


def bake(job):
    z, x, y = job
    path = OUT / str(z) / str(x) / f'{y}.webp'
    if path.exists():
        return
    data = osm()
    grid = np.zeros((SIZE + 2, SIZE + 2))
    c = heights(z, x, y)
    grid[1:-1, 1:-1] = c
    grid[1:-1, 0] = heights(z, x - 1, y)[:, -1]
    grid[1:-1, -1] = heights(z, x + 1, y)[:, 0]
    grid[0, 1:-1] = heights(z, x, y - 1)[-1, :]
    grid[-1, 1:-1] = heights(z, x, y + 1)[0, :]
    grid[0, 0], grid[0, -1], grid[-1, 0], grid[-1, -1] = c[0, 0], c[0, -1], c[-1, 0], c[-1, -1]

    lat = math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / 2 ** z)))
    mpp = 156543.03 * math.cos(lat) / 2 ** z
    ex = {11: 2.6, 12: 2.2, 13: 1.9, 14: 1.7}.get(z, 1.6)
    dx = (grid[1:-1, 2:] - grid[1:-1, :-2]) / (2 * mpp)
    dy = (grid[2:, 1:-1] - grid[:-2, 1:-1]) / (2 * mpp)
    nx, ny = -dx * ex, -dy * ex
    lit = np.clip((nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / np.sqrt(nx * nx + ny * ny + 1), 0, 1)
    rgb = np.stack([np.interp(lit, STOPS, COLORS[:, k]) for k in range(3)], -1)
    steep = np.hypot(dx, dy)
    rock = steep > 0.85
    rgb[rock] += (ROCK - rgb[rock]) * np.minimum(0.5, (steep[rock] - 0.85) * 0.8)[..., None]
    rgb = np.asarray(Image.fromarray(np.uint8(rgb)).resize((512, 512), Image.BICUBIC), float)
    shade = np.asarray(Image.fromarray(np.uint8(lit * 255)).resize((512, 512), Image.BICUBIC), float)[..., None] / 255

    # Grenzen der Kachel in Grad, mit Rand für Beschriftung
    n = 2 ** z

    def to_lat(v):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * v / n))))
    m = 0.15
    north, south = to_lat(y - m), to_lat(y + 1 + m)
    west, east = (x - m) / n * 360 - 180, (x + 1 + m) / n * 360 - 180
    S = 2  # doppelt zeichnen, dann verkleinern: glatte Kanten

    def xy(a):
        return list(zip((wx(a[:, 1], n) - x) * 512 * S, (wy(a[:, 0], n) - y) * 512 * S))

    def mask_of(layer, cut=None):
        img = Image.new('L', (512 * S, 512 * S), 0)
        d = ImageDraw.Draw(img)
        for a, _ in layer.near(south, north, west, east):
            d.polygon(xy(a), fill=255)
        if cut:
            for a, _ in cut.near(south, north, west, east):
                d.polygon(xy(a), fill=0)
        return np.asarray(img.resize((512, 512), Image.LANCZOS), float)[..., None] / 255

    # Wald: dunkles Tannengrün, das den Schatten mitnimmt, leicht gesprenkelt
    forest = mask_of(data['forest'], data['holes'])
    rng = np.random.default_rng(z * 1000003 + x * 1009 + y)
    speck = np.asarray(Image.fromarray(np.uint8(rng.random((512, 512)) * 255)).filter(ImageFilter.GaussianBlur(0.8)), float)[..., None] / 255
    soft_forest = np.asarray(Image.fromarray(np.uint8(forest[..., 0] * 255)).filter(ImageFilter.GaussianBlur({11: .8, 12: 1, 13: 1.5, 14: 2.5}.get(z, 4))), float)[..., None] / 255
    tone = FOREST * (0.72 + shade * 0.55) * (0.92 + speck * 0.16)
    amount = {11: 0.5, 12: 0.5, 13: 0.46, 14: 0.34}.get(z, 0.26)
    rgb = rgb + (tone - rgb) * soft_forest * amount

    rgb = rgb + (WATER - rgb) * mask_of(data['water'])

    # Höhenlinien
    if z >= 12:
        fine = Image.fromarray(grid.astype('float32'), 'F').resize((516, 516), Image.BICUBIC)
        h = np.asarray(fine)[2:-2, 2:-2]
        step = {12: 200, 13: 100}.get(z, 50)
        band = np.floor(h / step)
        edge = (band != np.roll(band, 1, 0)) | (band != np.roll(band, 1, 1))
        edge[0, :] = edge[:, 0] = False
        bold = np.floor(h / (step * 5))
        major = edge & ((bold != np.roll(bold, 1, 0)) | (bold != np.roll(bold, 1, 1)))
        soft = Image.fromarray(np.uint8(edge) * 150 + np.uint8(major) * 105).filter(ImageFilter.GaussianBlur(0.6))
        line = np.asarray(soft, float)[..., None] / 255
        rgb = rgb + (np.array([58, 84, 148.]) - rgb) * line * 0.38

    img = Image.fromarray(np.uint8(np.clip(rgb, 0, 255))).convert('RGBA')

    # Einzelne Tannen, fest im Bild: kostet das Handy nichts
    if z >= 13:
        trees = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        td = ImageDraw.Draw(trees)
        gap, size = {13: (9, 3.2), 14: (13, 5.5)}.get(z, (20, 8.5))
        for gy in range(0, 512, gap):
            for gx in range(0, 512, gap):
                jx, jy, sz = rng.random(3)
                px, py = gx + (jx - .5) * gap, gy + (jy - .5) * gap
                if forest[int(np.clip(py, 0, 511)), int(np.clip(px, 0, 511)), 0] < .5:
                    continue
                r = size * (.75 + sz * .5)
                td.polygon([(px, py - r * 1.5), (px + r * .68, py + r * .55), (px - r * .68, py + r * .55)], fill=(38, 84, 78, 215))
                td.polygon([(px, py - r * 1.5), (px - r * .68, py + r * .55), (px - r * .1, py + r * .55)], fill=(70, 122, 110, 215))
        img = Image.alpha_composite(img, trees)

    # Linien und Häuser
    over = Image.new('RGBA', (512 * S, 512 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    scale = {11: .9, 12: 1.2, 13: 1.8, 14: 2.8}.get(z, 4.2) * S
    for a, kind in data['rivers'].near(south, north, west, east):
        if kind == 'river' or z >= 13:
            d.line(xy(a), fill=(96, 170, 226, 255), width=max(1, round(scale * (1.1 if kind == 'river' else .5))), joint='curve')
    near_roads = [(a, k) for a, k in data['roads'].near(south, north, west, east) if z >= ROAD_MIN[k]]
    for a, k in near_roads:
        d.line(xy(a), fill=(120, 130, 155, 255), width=max(1, round(scale * ROAD_W[k] + 2 * S * 0.6)), joint='curve')
    for a, k in near_roads:
        color = (255, 226, 170, 255) if k in ('motorway', 'trunk', 'primary') else (255, 255, 255, 255)
        d.line(xy(a), fill=color, width=max(1, round(scale * ROAD_W[k])), joint='curve')
    if z >= 14:
        for a, _ in data['houses'].near(south, north, west, east):
            d.polygon(xy(a), fill=(86, 92, 112, 255))
    img = Image.alpha_composite(img, over.resize((512, 512), Image.LANCZOS))

    # Keine Gipfelnamen im Bild: Namen zeigt die App selbst, wo sie gebraucht werden

    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert('RGB').save(path, 'WEBP', quality=76, method=4)


def main():
    CACHE.mkdir(exist_ok=True)
    b = box()
    fetch_osm(b)
    jobs = []
    for z in ZOOMS:
        n = 2 ** z
        x0, x1 = int(wx(b[2], n)), int(wx(b[3], n))
        y0, y1 = int(wy(b[1], n)), int(wy(b[0], n))
        jobs += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    print(len(jobs), 'Kacheln, Gebiet', [round(v, 4) for v in b])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'bounds.json').write_text(json.dumps([[b[0], b[2]], [b[1], b[3]]]))
    with ProcessPoolExecutor(8) as pool:
        list(pool.map(bake, jobs, chunksize=8))


if __name__ == '__main__':
    main()
