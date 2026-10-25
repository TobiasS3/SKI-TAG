// Einstellungen der App – hier wird nur umgeschaltet, nicht programmiert.

export const config = {
  // true = Daten aus data/fake/, false = echter Server (gibt's noch nicht)
  fakeData: true,
  serverUrl: 'https://api.skitag.example', // Platzhalter

  // Wetter und Lawinenbericht live aus dem Internet (auch wenn die Chips noch Fake sind)
  liveWeather: true,

  // Simulierter Chip: so viel schneller als echt läuft die Zeit (1 = Echtzeit)
  simSpeed: 8,

  // Test-Uhr (nur mit fakeData): App startet um diese Uhrzeit, z. B. '11:00'. null = echte Zeit.
  demoTime: '11:00',

  // Skigebiet
  resort: {
    name: 'KitzSki',
    center: [47.428, 12.372],
    zoom: 13,
    liftsOpen: '08:30',
    liftsClose: '16:30',
  },

  // Kartenkacheln. Später auf eigenem Server (DSGVO).
  tiles: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: 'Karte © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Stil © <a href="https://opentopomap.org">OpenTopoMap</a>',
  },

  defaultLang: 'de',
};
