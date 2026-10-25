// Karte erstellen (Leaflet + OpenStreetMap-Kacheln).

import { config } from '../config.js';
import { load, save } from '../core/storage.js';

export const MAP_STYLES = ['winter', 'terrain'];

export function createMap(el) {
  const map = L.map(el, {
    zoomControl: false,
    minZoom: 11,
    maxZoom: config.tiles.maxZoom,
    zoomSnap: 0.25,
    wheelPxPerZoomLevel: 90,
  }).setView(config.resort.center, config.resort.zoom);

  L.tileLayer(config.tiles.url, {
    maxZoom: config.tiles.maxZoom,
    attribution: config.tiles.attribution,
    className: 'map-tiles',
  }).addTo(map);

  // Zoomstufe als Klasse – damit blendet CSS Details erst beim Reinzoomen ein
  const setZoomClass = () => {
    const z = Math.floor(map.getZoom());
    el.dataset.zoom = z;
    el.classList.toggle('z-mid', map.getZoom() >= 13.5);
    el.classList.toggle('z-near', z >= 14);
    el.classList.toggle('z-close', z >= 15);
  };
  map.on('zoomend', setZoomClass);
  setZoomClass();

  setMapStyle(el, load('mapStyle', 'winter'));
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

/**
 * Kartenstil umschalten. Die Kacheln bleiben dieselben, CSS färbt sie um:
 *  winter  = eisblaues Gelände, Pisten leuchten
 *  terrain = normale Topo-Karte mit Wald und Wiesen
 */
export function setMapStyle(el, style) {
  if (!MAP_STYLES.includes(style)) style = 'winter';
  MAP_STYLES.forEach((s) => el.classList.toggle(`style-${s}`, s === style));
  save('mapStyle', style);
  return style;
}
