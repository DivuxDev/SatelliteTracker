/**
 * orbitCalculationService
 * ---------------------------------------------------------------------------
 * Envoltorio sobre satellite.js (SGP4/SDP4) con las derivaciones que necesita
 * la interfaz: regimen orbital, periodo, apogeo/perigeo, estado instantaneo y
 * traza de orbita completa.
 *
 * Convenios de unidades:
 *   - satellite.js trabaja en km y km/s, en el marco TEME (cuasi-inercial).
 *   - CesiumJS espera metros en ECEF (fixed frame) para posiciones sobre el
 *     globo, o TEME + modelMatrix para dibujar la orbita como anillo inercial.
 */

import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  eciToGeodetic,
  degreesLat,
  degreesLong,
} from 'satellite.js'

export const EARTH_RADIUS_KM = 6378.137
export const MU_EARTH = 398_600.4418 // km^3/s^2

/**
 * Paleta categorica por regimen orbital.
 *
 * Dos pasos del MISMO tono para dos superficies distintas:
 *   - `color`     va sobre los paneles (#161c28). Validado con el verificador de
 *                 paleta: banda de luminosidad OKLCH, suelo de croma, separacion
 *                 CVD (peor par adyacente ΔE 9,6 deutan) y contraste >= 3:1.
 *   - `markColor` va sobre el negro del espacio en la escena WebGL, donde los
 *                 puntos se leen como fuentes de luz y necesitan mas brillo.
 *
 * El tono no cambia entre ambos, asi que la identidad de la serie se mantiene.
 * El texto nunca usa estos colores: lleva tokens de tinta y un punto de color al
 * lado, para que la identidad no dependa solo del color.
 */
export const ORBIT_REGIMES = {
  LEO: {
    id: 'LEO',
    label: 'LEO',
    color: '#16a34a',
    markColor: '#22c55e',
    description: 'Orbita baja (< 2.000 km)',
  },
  MEO: {
    id: 'MEO',
    label: 'MEO',
    color: '#9333ea',
    markColor: '#a855f7',
    description: 'Orbita media (2.000-35.000 km)',
  },
  GEO: {
    id: 'GEO',
    label: 'GEO',
    color: '#0d8fd0',
    markColor: '#38bdf8',
    description: 'Geoestacionaria (~35.786 km)',
  },
  HEO: {
    id: 'HEO',
    label: 'HEO',
    color: '#c2760a',
    markColor: '#f59e0b',
    description: 'Muy eliptica / alta excentricidad',
  },
}

/** Orden fijo de las series. Nunca se cicla ni se reordena por magnitud. */
export const REGIME_ORDER = ['LEO', 'MEO', 'GEO', 'HEO']

/* -------------------------------------------------------------------------- */
/* Lectura directa de elementos del TLE                                       */
/* -------------------------------------------------------------------------- */

/**
 * Extrae los elementos keplerianos medios de la linea 2 del TLE.
 * Los leemos del texto (y no del satrec) porque el satrec almacena la version
 * "un-kozai" del movimiento medio, que no es el valor publicado.
 */
export function parseElements(line2) {
  return {
    inclination: Number.parseFloat(line2.slice(8, 16)),
    raan: Number.parseFloat(line2.slice(17, 25)),
    eccentricity: Number.parseFloat(`0.${line2.slice(26, 33).trim()}`),
    argPerigee: Number.parseFloat(line2.slice(34, 42)),
    meanAnomaly: Number.parseFloat(line2.slice(43, 51)),
    meanMotion: Number.parseFloat(line2.slice(52, 63)), // revoluciones / dia
    revNumber: Number.parseInt(line2.slice(63, 68).trim(), 10),
  }
}

/**
 * Clasifica el regimen orbital a partir del apogeo, perigeo, inclinacion y periodo.
 * La excentricidad manda: una Molniya con apogeo MEO sigue siendo HEO.
 */
export function classifyRegime({ apogeeKm, perigeeKm, eccentricity, inclination, periodMinutes }) {
  if (eccentricity > 0.25) return ORBIT_REGIMES.HEO
  const isGeosynchronous = Math.abs(periodMinutes - 1436) < 40
  if (isGeosynchronous && inclination < 15) return ORBIT_REGIMES.GEO
  if (apogeeKm < 2000) return ORBIT_REGIMES.LEO
  if (perigeeKm < 35_000) return ORBIT_REGIMES.MEO
  return ORBIT_REGIMES.GEO
}

/* -------------------------------------------------------------------------- */
/* Inferencia de operador / pais                                              */
/* -------------------------------------------------------------------------- */

/**
 * Celestrak no incluye el pais en los ficheros TLE, solo en el SATCAT. Para no
 * exigir una segunda descarga de 30k registros inferimos operador y pais a
 * partir del nombre del objeto, que sigue convenios muy estables.
 *
 * ATENCION: es una heuristica. Los objetos que no encajan quedan como
 * "Desconocido" en lugar de asignarse a un pais al azar.
 */
const OPERATOR_RULES = [
  { re: /^STARLINK/i, operator: 'SpaceX', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^ONEWEB/i, operator: 'Eutelsat OneWeb', country: 'GB', countryLabel: 'Reino Unido' },
  { re: /^IRIDIUM/i, operator: 'Iridium', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^GLOBALSTAR/i, operator: 'Globalstar', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^ORBCOMM/i, operator: 'ORBCOMM', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(NAVSTAR|GPS)/i, operator: 'US Space Force', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(NOAA|GOES|DMSP|SUOMI|JPSS)/i, operator: 'NOAA', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(LANDSAT|AQUA|TERRA|AURA|ICESAT|SWOT|TESS|FERMI|SWIFT|NUSTAR|IXPE)/i, operator: 'NASA', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(USA|NROL|MILSTAR|WGS|AEHF|SBIRS|GSSAP)/i, operator: 'US DoD', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(INTELSAT|GALAXY)/i, operator: 'Intelsat', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(SES|ASTRA|O3B)/i, operator: 'SES', country: 'LU', countryLabel: 'Luxemburgo' },
  { re: /^INMARSAT/i, operator: 'Inmarsat / Viasat', country: 'GB', countryLabel: 'Reino Unido' },
  { re: /^(EUTELSAT|HOTBIRD)/i, operator: 'Eutelsat', country: 'FR', countryLabel: 'Francia' },
  { re: /^NVS-/i, operator: 'Roscosmos (GLONASS-K2)', country: 'RU', countryLabel: 'Rusia' },
  { re: /^(COSMOS|KOSMOS|GLONASS|MOLNIYA|METEOR|RESURS|GONETS|LUCH|EKS)/i, operator: 'Roscosmos / VKS', country: 'RU', countryLabel: 'Rusia' },
  { re: /^(BEIDOU|YAOGAN|GAOFEN|SHIJIAN|TIANHUI|FENGYUN|CHINASAT|ZHONGXING|HAIYANG|YUNHAI|QIANFAN|GUOWANG)/i, operator: 'CNSA / CASC', country: 'CN', countryLabel: 'China' },
  { re: /^(GALILEO|SENTINEL|SWARM|CRYOSAT|AEOLUS|BIOMASS|PROBA|METOP|MSG|MTG)/i, operator: 'ESA / EUMETSAT', country: 'EU', countryLabel: 'Union Europea' },
  { re: /^(PAZ|SPAINSAT|HISPASAT|XTAR|INGENIO|SEOSAT|AMAZONAS|MINISAT|DEIMOS|ANSER|PLATERO)/i, operator: 'Espana (Hisdesat / INTA / Hispasat)', country: 'ES', countryLabel: 'Espana' },
  { re: /^(ISS|ZARYA|PROGRESS|SOYUZ|CYGNUS|CREW DRAGON|DRAGON)/i, operator: 'Cooperacion internacional', country: 'INT', countryLabel: 'Internacional' },
  { re: /^(CSS|TIANHE|WENTIAN|MENGTIAN|SHENZHOU|TIANZHOU)/i, operator: 'CMSA', country: 'CN', countryLabel: 'China' },
  { re: /^(HIMAWARI|IGS|QZS|MICHIBIKI|ALOS|GOSAT|ASNARO)/i, operator: 'JAXA / Japon', country: 'JP', countryLabel: 'Japon' },
  { re: /^(CARTOSAT|RESOURCESAT|RISAT|IRNSS|NAVIC|GSAT|OCEANSAT|INSAT|ASTROSAT)/i, operator: 'ISRO', country: 'IN', countryLabel: 'India' },
  { re: /^(KOMPSAT|ARIRANG|CAS500|KOREASAT)/i, operator: 'KARI', country: 'KR', countryLabel: 'Corea del Sur' },
  { re: /^(AMOS|OFEQ|EROS|TECSAR)/i, operator: 'Israel', country: 'IL', countryLabel: 'Israel' },
  { re: /^(SAOCOM|ARSAT|NUSAT|AMAZONIA|CBERS|SCD)/i, operator: 'CONAE / INPE', country: 'AR', countryLabel: 'Latinoamerica' },
  { re: /^(SKYSAT|WORLDVIEW|GEOEYE|PLANET|FLOCK|DOVE|ICEYE|BLACKSKY|CAPELLA)/i, operator: 'Operador comercial EO', country: 'US', countryLabel: 'EE.UU.' },
  { re: /^(TELESAT|ANIK|NIMIQ|RADARSAT|SCISAT)/i, operator: 'Telesat / CSA', country: 'CA', countryLabel: 'Canada' },
  { re: /^(TDRS|TDRSS)/i, operator: 'NASA', country: 'US', countryLabel: 'EE.UU.' },
]

const UNKNOWN_OPERATOR = {
  operator: 'Desconocido',
  country: 'XX',
  countryLabel: 'Sin clasificar',
}

export function inferOperator(name) {
  for (const rule of OPERATOR_RULES) {
    if (rule.re.test(name)) {
      return { operator: rule.operator, country: rule.country, countryLabel: rule.countryLabel }
    }
  }
  return UNKNOWN_OPERATOR
}

/* -------------------------------------------------------------------------- */
/* Construccion del modelo de satelite                                        */
/* -------------------------------------------------------------------------- */

/**
 * Convierte un registro TLE crudo en el modelo que usa la aplicacion.
 * Devuelve `null` si el TLE no es propagable (satellite.js lanza en ese caso).
 *
 * @param {{id:string,name:string,line1:string,line2:string,group:string,categoryId?:string,intlDes?:string,epoch?:number}} tle
 */
export function buildSatellite(tle) {
  let satrec
  try {
    satrec = twoline2satrec(tle.line1, tle.line2)
  } catch {
    return null
  }
  if (!satrec || satrec.error) return null

  const elements = parseElements(tle.line2)
  if (!Number.isFinite(elements.meanMotion) || elements.meanMotion <= 0) return null

  const periodMinutes = 1440 / elements.meanMotion
  const periodSeconds = periodMinutes * 60
  const semiMajorAxisKm = Math.cbrt((MU_EARTH * periodSeconds ** 2) / (4 * Math.PI ** 2))
  const apogeeKm = semiMajorAxisKm * (1 + elements.eccentricity) - EARTH_RADIUS_KM
  const perigeeKm = semiMajorAxisKm * (1 - elements.eccentricity) - EARTH_RADIUS_KM

  const regime = classifyRegime({
    apogeeKm,
    perigeeKm,
    eccentricity: elements.eccentricity,
    inclination: elements.inclination,
    periodMinutes,
  })

  const { operator, country, countryLabel } = inferOperator(tle.name)

  return {
    id: tle.id,
    name: tle.name,
    line1: tle.line1,
    line2: tle.line2,
    intlDes: tle.intlDes ?? '',
    group: tle.group,
    categoryId: tle.categoryId ?? null,
    epoch: tle.epoch ?? Number.NaN,
    satrec,
    elements,
    periodMinutes,
    semiMajorAxisKm,
    apogeeKm,
    perigeeKm,
    regime: regime.id,
    regimeColor: regime.color,
    regimeMarkColor: regime.markColor,
    operator,
    country,
    countryLabel,
    // Velocidad orbital media (vis-viva a radio medio), sirve como valor de
    // arranque antes de la primera propagacion.
    nominalSpeedKmS: Math.sqrt(MU_EARTH / semiMajorAxisKm),
  }
}

/** Edad del TLE en dias. Por encima de ~14 dias la precision se degrada mucho. */
export function tleAgeDays(satellite, now = Date.now()) {
  if (!Number.isFinite(satellite.epoch)) return Number.NaN
  return (now - satellite.epoch) / 86_400_000
}

/* -------------------------------------------------------------------------- */
/* Estado instantaneo                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Propaga un satelite a una fecha concreta.
 * @returns {null|{positionEcfKm:{x,y,z}, positionEciKm:{x,y,z}, latitude:number,
 *                 longitude:number, altitudeKm:number, speedKmS:number, gmst:number}}
 */
export function computeState(satrec, date) {
  let pv
  try {
    pv = propagate(satrec, date)
  } catch {
    return null
  }
  if (!pv?.position || !pv?.velocity) return null

  const { position, velocity } = pv
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    return null
  }

  const gmst = gstime(date)
  const ecf = eciToEcf(position, gmst)
  const geodetic = eciToGeodetic(position, gmst)

  return {
    positionEciKm: position,
    positionEcfKm: ecf,
    latitude: degreesLat(geodetic.latitude),
    longitude: degreesLong(geodetic.longitude),
    altitudeKm: geodetic.height,
    speedKmS: Math.hypot(velocity.x, velocity.y, velocity.z),
    gmst,
  }
}

/**
 * Traza de una orbita completa en el marco TEME (cuasi-inercial), en metros.
 *
 * Se devuelve en TEME —y no en ECEF— a proposito: dibujada asi la orbita es un
 * anillo estable, y basta con rotar la polilinea con la matriz TEME->fixed en
 * cada frame para mantenerla anclada a la Tierra que gira. Si se generara en
 * ECEF, la traza saldria como una espiral deformada.
 *
 * @param {object} satrec
 * @param {Date} date       instante central de la traza
 * @param {number} periodMinutes
 * @param {number} samples  numero de puntos (>= 32)
 * @returns {Float64Array}  [x0,y0,z0, x1,y1,z1, ...] en metros
 */
export function computeOrbitTrack(satrec, date, periodMinutes, samples = 240) {
  const count = Math.max(32, samples)
  const out = new Float64Array(count * 3)
  const stepMs = (periodMinutes * 60_000) / (count - 1)
  const startMs = date.getTime() - (periodMinutes * 60_000) / 2

  let written = 0
  for (let i = 0; i < count; i += 1) {
    const t = new Date(startMs + i * stepMs)
    let pv
    try {
      pv = propagate(satrec, t)
    } catch {
      continue
    }
    if (!pv?.position) continue
    const { x, y, z } = pv.position
    if (!Number.isFinite(x)) continue
    out[written * 3] = x * 1000
    out[written * 3 + 1] = y * 1000
    out[written * 3 + 2] = z * 1000
    written += 1
  }

  return written === count ? out : out.subarray(0, written * 3)
}

/**
 * Traza sobre el terreno (ground track) en coordenadas geodesicas.
 * @returns {Array<{lat:number, lon:number, altKm:number}>}
 */
export function computeGroundTrack(satrec, date, periodMinutes, samples = 180) {
  const points = []
  const stepMs = (periodMinutes * 60_000) / (samples - 1)
  const startMs = date.getTime()

  for (let i = 0; i < samples; i += 1) {
    const t = new Date(startMs + i * stepMs)
    const state = computeState(satrec, t)
    if (!state) continue
    points.push({ lat: state.latitude, lon: state.longitude, altKm: state.altitudeKm })
  }
  return points
}
