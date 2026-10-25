// Tag als Datei speichern und teilen.

/** GPX = Standardformat für Strecken (Strava, Komoot, Google Earth … können es öffnen). */
export function toGPX(day, name) {
  const pts = day.points
    .map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${new Date(p.time).toISOString()}</time></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Ski Tag" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${new Date(day.startedAt).toISOString()}</time></metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Datei herunterladen lassen. */
export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Teilen über das Handy-Menü (WhatsApp, Mail …). Klappt das nicht,
 * wird der Text kopiert. Ergebnis: 'shared' | 'copied' | 'cancelled'
 */
export async function share({ title, text, filename, content, type }) {
  const file = filename ? new File([content], filename, { type }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title, text, files: [file] });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
  } catch (err) {
    if (err.name === 'AbortError') return 'cancelled';
  }
  await navigator.clipboard?.writeText(text);
  return 'copied';
}
