// Rechnen mit Koordinaten. Punkte sind immer [lat, lng].

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** Abstand in Metern (Haversine-Formel). */
export function distance(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Länge einer Linie in Metern. */
export function lineLength(coords) {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += distance(coords[i - 1], coords[i]);
  return sum;
}

/** Punkt, der `meters` weit entlang der Linie liegt. */
export function pointAlong(coords, meters) {
  let left = meters;
  for (let i = 1; i < coords.length; i++) {
    const seg = distance(coords[i - 1], coords[i]);
    if (left <= seg) {
      const f = seg === 0 ? 0 : left / seg;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
      ];
    }
    left -= seg;
  }
  return coords[coords.length - 1];
}

/** Index des nächsten Punkts aus einer Liste. */
export function nearestIndex(point, points) {
  let best = -1;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = distance(point, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Richtung von a nach b in Grad (0 = Norden, 90 = Osten). */
export function bearing(a, b) {
  const lat1 = rad(a[0]);
  const lat2 = rad(b[0]);
  const dLng = rad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Grad → Himmelsrichtung als Kürzel: 0 → "N", 225 → "SW" */
export function compass(deg, lang = 'de') {
  const de = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (lang === 'de' ? de : en)[Math.round(deg / 45) % 8];
}
