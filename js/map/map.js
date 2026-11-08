// Karte erstellen (Leaflet + OpenStreetMap-Kacheln).

import { config } from '../config.js';

/** painted: gemalte Berge über der Topo-Karte (Gast-Ansicht) */
export function createMap(el, { painted = false } = {}) {
  const map = L.map(el, {
    zoomControl: false,
    minZoom: 11,
    maxZoom: config.tiles.maxZoom,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 90,
  }).setView(config.resort.center, config.resort.zoom);

  if (painted) {
    // Umland außerhalb der Winterkarte: echte Berge, weich und blass (tools/bake-surround.py) –
    // beim Rauszoomen kein weißer Rand. Liegt unter den Kacheln.
    map.createPane('surround').style.zIndex = 150;
    fetch('assets/terrain/surround.json').then((r) => r.json()).then((b) => {
      L.imageOverlay('assets/terrain/surround.webp', b, { pane: 'surround', interactive: false, className: 'terrain-surround' }).addTo(map);
    }).catch(() => {});
    // Vorgemalte Winterkarte (tools/bake-terrain.py): liegt bei uns, das Handy rechnet nichts
    L.tileLayer('assets/terrain/{z}/{x}/{y}.webp', {
      minNativeZoom: 11,
      maxNativeZoom: 15,
      bounds: [[47.25093, 12.27017], [47.50728, 12.49549]],
      className: 'terrain-tiles',
      attribution: 'Karte © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Gelände: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a>',
    }).addTo(map);
    el.classList.add('style-painted');
    map.setMaxZoom(16); // näher wird die vorgemalte Karte unscharf
  } else {
    L.tileLayer(config.tiles.url, {
      maxZoom: config.tiles.maxZoom,
      attribution: config.tiles.attribution,
      className: 'map-tiles',
    }).addTo(map);
  }

  // Zoomstufe als Klasse – damit blendet CSS Details erst beim Reinzoomen ein
  const setZoomClass = () => {
    const z = Math.floor(map.getZoom());
    el.dataset.zoom = z;
    el.classList.toggle('z-mid', map.getZoom() >= 13.5);
    el.classList.toggle('z-near', z >= 14);
    el.classList.toggle('z-close', z >= 15);
    el.classList.toggle('z-names', map.getZoom() >= 14.4); // ab hier stehen die Liftnamen da
  };
  map.on('zoomend', setZoomClass);

  // Beim Zoomen zieht Leaflet das alte Bild nur größer/kleiner – Pisten und Lifte würden kurz dick und
  // unscharf. Darum blenden sie während des Zoomens kurz aus (kostet das Handy nichts).
  // Sicher wieder einblenden: auch bei „moveend“ und spätestens nach 1,5 s (unterbrochene Flüge).
  let zoomTimer = 0;
  let safety = 0;
  map.on('zoomstart', () => {
    clearTimeout(zoomTimer);
    clearTimeout(safety);
    el.classList.add('is-zooming');
    safety = setTimeout(() => el.classList.remove('is-zooming'), 1500);
  });
  map.on('zoomend moveend', () => {
    clearTimeout(zoomTimer);
    clearTimeout(safety);
    zoomTimer = setTimeout(() => el.classList.remove('is-zooming'), 40);
  });
  setZoomClass();

  // Nur ein Kartenstil: Winter (eisblaues Gelände, Pisten leuchten)
  el.classList.add('style-winter');
  return map;
}

/**
 * Karte aufs Skigebiet begrenzen: man kann im Gebiet plus großzügigem Rand herumschieben
 * und nur so weit rauszoomen, wie dieser Rahmen reicht.
 * Rückgabe: { all, main } – alle Teilgebiete bzw. nur das große (Hahnenkamm–Resterhöhe)
 */
export function limitToArea(map, skimap) {
  const all = L.latLngBounds(skimap.nodes);
  const main = L.latLngBounds(skimap.nodes.filter((_, i) => skimap.nodeArea[i] === 0));
  // Großzügiger Rand zum Herumschauen (Kitzbühel, Jochberg, Pass Thurn …),
  // unten etwas mehr, weil dort am Handy der Bereich mit den Tabs liegt
  const h = all.getNorth() - all.getSouth();
  const w = all.getEast() - all.getWest();
  const limit = L.latLngBounds(
    [all.getSouth() - h * 0.9, all.getWest() - w * 0.8],
    [all.getNorth() + h * 0.6, all.getEast() + w * 0.8],
  );
  map.setMaxBounds(limit);
  map.options.maxBoundsViscosity = 0.8; // am Rand leicht nachgeben statt hart stoppen

  // Nie weiter rauszoomen, als der Rahmen reicht – sonst springt die Karte hin und her
  const fitMinZoom = () => {
    const z = map.getBoundsZoom(limit, true);
    map.setMinZoom(Math.max(10, Math.ceil(z * 4) / 4));
  };
  fitMinZoom();
  map.on('resize', fitMinZoom);
  return { all, main };
}

