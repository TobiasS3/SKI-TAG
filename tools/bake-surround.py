#!/usr/bin/env python3
"""Malt das Umland außerhalb der Winterkarte: echtes Gelände, aber weich und blass.

Wer rauszoomt (z. B. Richtung St. Johann), sieht statt weißem Rand ruhige, unscharfe Berge
in denselben Farben wie die Karte – ohne Wald, Straßen und Namen, es ist nur Stimmung.
Gelände: AWS Terrain Tiles (wie tools/bake-terrain.py), einmal vorgemalt, das Handy rechnet nichts.

    python3 tools/bake-surround.py
Ausgabe: assets/terrain/surround.webp + assets/terrain/surround.json (Ecken für Leaflet)
"""
import io
import json
import math
import pathlib
import time
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
TERRAIN = ROOT / 'assets' / 'terrain'
CACHE = pathlib.Path('/tmp/skitag-terrarium')
Z = 10
SIZE = 256
GROW = 1.2  # so viel Umland je Seite (× Größe der Winterkarte)
BG = np.array([238, 243, 251], float)  # Hintergrund der Karte (guest.css .style-painted.map)
# gleiche Farben und Licht wie die Winterkarte
STOPS = np.array([0.0, 0.3, 0.5, 0.62, 0.72, 1.0])
COLORS = np.array([[92, 124, 198], [146, 174, 230], [208, 223, 248], [244, 248, 254], [255, 255, 255], [255, 255, 255]], float)
LIGHT = np.array([-0.52, -0.52, 0.68])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def tile_of(lat, lng):
    n = 2 ** Z
    x = (lng + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def lat_of(y):
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** Z))))


def heights(x, y):
    path = CACHE / f'{Z}-{x}-{y}.png'
    if not path.exists():
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
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


CACHE.mkdir(exist_ok=True)
(south, west), (north, east) = json.loads((TERRAIN / 'bounds.json').read_text())
h, w = north - south, east - west
x0, y0 = tile_of(north + h * GROW, west - w * GROW)
x1, y1 = tile_of(south - h * GROW, east + w * GROW)
tx = range(int(x0), int(x1) + 1)
ty = range(int(y0), int(y1) + 1)

grid = np.vstack([np.hstack([heights(x, y) for x in tx]) for y in ty])
lat = math.radians((north + south) / 2)
mpp = 156543.03 * math.cos(lat) / 2 ** Z
dy, dx = np.gradient(grid, mpp)
nx, ny = -dx * 2.8, -dy * 2.8
lit = np.clip((nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / np.sqrt(nx * nx + ny * ny + 1), 0, 1)
rgb = np.stack([np.interp(lit, STOPS, COLORS[:, k]) for k in range(3)], -1)

# Weich zeichnen: Berge erkennbar, aber unscharf
img = Image.fromarray(np.uint8(rgb)).filter(ImageFilter.GaussianBlur(1.6))
b = np.asarray(img, float)

# Blass: am Kartenrand weicher Übergang, nach außen fast nur Hintergrund
H, W = b.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
kx0, ky0 = tile_of(north, west)
kx1, ky1 = tile_of(south, east)
cx0, cx1 = (kx0 - tx[0]) * SIZE, (kx1 - tx[0]) * SIZE
cy0, cy1 = (ky0 - ty[0]) * SIZE, (ky1 - ty[0]) * SIZE
fx = np.maximum(0, np.maximum(cx0 - xx, xx - cx1)) / ((cx1 - cx0) * GROW)
fy = np.maximum(0, np.maximum(cy0 - yy, yy - cy1)) / ((cy1 - cy0) * GROW)
d = np.clip(np.hypot(fx, fy), 0, 1)
wash = 0.1 + 0.82 * d ** 0.6        # am Rand fast wie die Karte, nach außen immer blasser
out = b * (1 - wash[..., None]) + BG * wash[..., None]
Image.fromarray(np.uint8(out)).save(TERRAIN / 'surround.webp', quality=70, method=6)

bounds = [[round(lat_of(ty[-1] + 1), 5), round(tx[0] / 2 ** Z * 360 - 180, 5)],
          [round(lat_of(ty[0]), 5), round((tx[-1] + 1) / 2 ** Z * 360 - 180, 5)]]
(TERRAIN / 'surround.json').write_text(json.dumps(bounds))
print('surround.webp', W, 'x', H, (TERRAIN / 'surround.webp').stat().st_size // 1024, 'KB', bounds)
