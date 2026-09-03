/**
 * meteorShowers
 * ---------------------------------------------------------------------------
 * Las lluvias de meteoros anuales mayores. A diferencia de los satelites o
 * los cometas, esto es un dato astronomico ESTABLE: la Tierra cruza estas
 * corrientes de escombros cometarios en las mismas fechas cada ano, asi que
 * no hace falta ninguna fuente en vivo — es una tabla fija, igual de fiable
 * un ano que el siguiente.
 *
 * Coordenadas del radiante (ascension recta / declinacion) redondeadas al
 * grado: son suficientes para decidir si el radiante esta por encima del
 * horizonte esa noche, que es la unica pregunta que responde este panel. No
 * son coordenadas de precision astrometrica ni varian noche a noche dentro
 * de la ventana activa (en la practica el radiante deriva unos pocos grados
 * a lo largo de las semanas de actividad; para esta app, con el valor del
 * pico basta).
 *
 * `active.from` / `active.to` puede cruzar el fin de ano (p.ej. las
 * Cuadrantidas: 28 dic - 12 ene) — `skyEventsService.js` lo tiene en cuenta.
 */
export const METEOR_SHOWERS = [
  {
    id: 'quadrantids',
    name: 'Cuadrantidas',
    parentBody: 'Asteroide 2003 EH1',
    radiant: { raDeg: 230, decDeg: 49 },
    peak: { month: 1, day: 3 },
    active: { from: { month: 12, day: 28 }, to: { month: 1, day: 12 } },
    zhr: 120,
    speedKmS: 41,
  },
  {
    id: 'lyrids',
    name: 'Liridas',
    parentBody: 'Cometa C/1861 G1 (Thatcher)',
    radiant: { raDeg: 271, decDeg: 34 },
    peak: { month: 4, day: 22 },
    active: { from: { month: 4, day: 16 }, to: { month: 4, day: 25 } },
    zhr: 18,
    speedKmS: 49,
  },
  {
    id: 'eta-aquariids',
    name: 'Eta Acuaridas',
    parentBody: 'Cometa 1P/Halley',
    radiant: { raDeg: 338, decDeg: -1 },
    peak: { month: 5, day: 6 },
    active: { from: { month: 4, day: 19 }, to: { month: 5, day: 28 } },
    zhr: 50,
    speedKmS: 66,
  },
  {
    id: 'alpha-capricornids',
    name: 'Alfa Capricornidas',
    parentBody: 'Cometa 169P/NEAT',
    radiant: { raDeg: 307, decDeg: -10 },
    peak: { month: 7, day: 30 },
    active: { from: { month: 7, day: 3 }, to: { month: 8, day: 15 } },
    zhr: 5,
    speedKmS: 23,
  },
  {
    id: 'delta-aquariids-south',
    name: 'Delta Acuaridas del Sur',
    parentBody: 'Cometa 96P/Machholz (probable)',
    radiant: { raDeg: 339, decDeg: -16 },
    peak: { month: 7, day: 30 },
    active: { from: { month: 7, day: 12 }, to: { month: 8, day: 23 } },
    zhr: 25,
    speedKmS: 41,
  },
  {
    id: 'perseids',
    name: 'Perseidas',
    parentBody: 'Cometa 109P/Swift-Tuttle',
    radiant: { raDeg: 46, decDeg: 58 },
    peak: { month: 8, day: 12 },
    active: { from: { month: 7, day: 17 }, to: { month: 8, day: 24 } },
    zhr: 100,
    speedKmS: 59,
  },
  {
    id: 'draconids',
    name: 'Draconidas',
    parentBody: 'Cometa 21P/Giacobini-Zinner',
    radiant: { raDeg: 262, decDeg: 54 },
    peak: { month: 10, day: 8 },
    active: { from: { month: 10, day: 6 }, to: { month: 10, day: 10 } },
    zhr: 10,
    speedKmS: 21,
  },
  {
    id: 'orionids',
    name: 'Oriondas',
    parentBody: 'Cometa 1P/Halley',
    radiant: { raDeg: 95, decDeg: 16 },
    peak: { month: 10, day: 21 },
    active: { from: { month: 10, day: 2 }, to: { month: 11, day: 7 } },
    zhr: 20,
    speedKmS: 66,
  },
  {
    id: 'southern-taurids',
    name: 'Tauridas del Sur',
    parentBody: 'Cometa 2P/Encke',
    radiant: { raDeg: 52, decDeg: 13 },
    peak: { month: 11, day: 5 },
    active: { from: { month: 9, day: 10 }, to: { month: 11, day: 20 } },
    zhr: 5,
    speedKmS: 27,
  },
  {
    id: 'northern-taurids',
    name: 'Tauridas del Norte',
    parentBody: 'Asteroide 2004 TG10 (complejo Encke)',
    radiant: { raDeg: 58, decDeg: 22 },
    peak: { month: 11, day: 12 },
    active: { from: { month: 10, day: 20 }, to: { month: 12, day: 10 } },
    zhr: 5,
    speedKmS: 29,
  },
  {
    id: 'leonids',
    name: 'Leonidas',
    parentBody: 'Cometa 55P/Tempel-Tuttle',
    radiant: { raDeg: 152, decDeg: 22 },
    peak: { month: 11, day: 17 },
    active: { from: { month: 11, day: 6 }, to: { month: 11, day: 30 } },
    zhr: 15,
    speedKmS: 71,
  },
  {
    id: 'geminids',
    name: 'Geminidas',
    parentBody: 'Asteroide 3200 Faeton',
    radiant: { raDeg: 112, decDeg: 33 },
    peak: { month: 12, day: 13 },
    active: { from: { month: 12, day: 4 }, to: { month: 12, day: 17 } },
    zhr: 140,
    speedKmS: 35,
  },
  {
    id: 'ursids',
    name: 'Ursidas',
    parentBody: 'Cometa 8P/Tuttle',
    radiant: { raDeg: 217, decDeg: 75 },
    peak: { month: 12, day: 22 },
    active: { from: { month: 12, day: 17 }, to: { month: 12, day: 26 } },
    zhr: 10,
    speedKmS: 33,
  },
]
