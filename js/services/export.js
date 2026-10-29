// Tag als Datei aufs Gerät bringen (iPhone, Android, PC).

/** iPhone/iPad? (iPad meldet sich als Mac mit Touch) */
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Fertige Datei aufs Gerät bringen.
 * iPhone: Teilen-Menü (dort „Video sichern“ → landet in Fotos). Android & PC: normaler Download.
 * Muss direkt aus einem Tipp heraus aufgerufen werden (sonst blockt Safari das Teilen-Menü).
 * Ergebnis: 'saved' | 'shared' | 'cancelled'
 */
export async function saveFile(file, { preferShare = isIOS() } = {}) {
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'saved';
}

/** Text als Datei herunterladen (z. B. CSV-Protokoll für Bergbahn und Skischule). */
export function download(filename, text, type) {
  saveFile(new File([text], filename, { type }), { preferShare: false });
}
