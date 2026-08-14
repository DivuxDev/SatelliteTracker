/**
 * satelliteProfileService
 * ---------------------------------------------------------------------------
 * Responde a "¿que es esto y para que sirve?" para un objeto del catalogo.
 *
 * DE DONDE SALE LA INFORMACION, Y DE DONDE NO
 * Los ficheros TLE de Celestrak traen tres cosas: un nombre, dos lineas de
 * elementos orbitales y poco mas. **No traen el proposito de la mision, ni el
 * tipo de carga util, ni una descripcion.** Eso solo esta en fuentes externas
 * (SATCAT, UCS Satellite Database, Gunter's Space Page), que son descargas
 * aparte de decenas de miles de registros.
 *
 * Para no exigir esa segunda descarga se usan dos mecanismos, en este orden:
 *
 *   1. FICHA CURADA (`CURATED`): texto escrito a mano para objetos concretos,
 *      identificados por su ID NORAD, que es inmutable y no depende de como
 *      Celestrak escriba el nombre ese dia. Es informacion verificada.
 *
 *   2. CLASIFICACION POR PATRON (`MISSION_RULES`): se deduce el tipo de mision
 *      del nombre del objeto. Es una **heuristica**, igual que la que ya infiere
 *      el operador. Acierta en las familias grandes (STARLINK, NAVSTAR, COSMOS)
 *      y falla en objetos sueltos con nombres crípticos.
 *
 * Lo que no encaja en ninguno de los dos se declara "sin clasificar" en lugar de
 * asignarle un tipo plausible: un tipo inventado es peor que un hueco honesto,
 * porque el hueco se ve y la invencion no.
 */

/* -------------------------------------------------------------------------- */
/* Tipos de mision                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Los colores son los mismos que ya usa el resto de la interfaz. El texto nunca
 * lleva el color del tipo: se pone un punto de color al lado, igual que en la
 * leyenda de regimenes, para no depender del color como unico canal.
 */
export const MISSION_TYPES = {
  station: {
    id: 'station',
    label: 'Estacion espacial tripulada',
    color: '#f59e0b',
    blurb: 'Laboratorio orbital con tripulacion permanente o periodica.',
  },
  navigation: {
    id: 'navigation',
    label: 'Navegacion / GNSS',
    color: '#a855f7',
    blurb:
      'Emite senales de tiempo muy precisas. Un receptor en tierra calcula su posicion midiendo el retardo de varias de ellas a la vez.',
  },
  comms: {
    id: 'comms',
    label: 'Comunicaciones',
    color: '#3b82f6',
    blurb: 'Repite senales entre puntos de la Tierra: television, telefonia, datos o internet.',
  },
  weather: {
    id: 'weather',
    label: 'Meteorologico',
    color: '#38bdf8',
    blurb: 'Observa la atmosfera para prediccion del tiempo y vigilancia del clima.',
  },
  earth: {
    id: 'earth',
    label: 'Observacion de la Tierra',
    color: '#22c55e',
    blurb:
      'Toma imagenes o medidas de la superficie: cartografia, agricultura, incendios, hielo o vigilancia comercial.',
  },
  science: {
    id: 'science',
    label: 'Cientifico / astronomia',
    color: '#4ade80',
    blurb:
      'Instrumento de investigacion. Los telescopios espaciales miran hacia fuera, no hacia la Tierra.',
  },
  military: {
    id: 'military',
    label: 'Militar / reconocimiento',
    color: '#ef4444',
    blurb:
      'Operado por fuerzas armadas. Los detalles de la carga util casi nunca son publicos; el tipo se deduce del operador y la orbita.',
  },
  tech: {
    id: 'tech',
    label: 'Demostracion tecnologica',
    color: '#6b7a92',
    blurb: 'Prueba en vuelo de tecnologia nueva, a menudo en satelites pequenos o universitarios.',
  },
  cargo: {
    id: 'cargo',
    label: 'Carguero / nave de transporte',
    color: '#f59e0b',
    blurb: 'Vehiculo de reabastecimiento hacia una estacion espacial. Su paso por orbita es breve.',
  },
  debris: {
    id: 'debris',
    label: 'Cohete agotado o fragmento',
    color: '#4c5a72',
    blurb:
      'No es un satelite operativo: es una etapa de lanzador o un fragmento. Se sigue porque ocupa orbita y hay que evitarlo.',
  },
  unknown: {
    id: 'unknown',
    label: 'Sin clasificar',
    color: '#4c5a72',
    blurb:
      'El nombre no permite deducir el proposito, y no hay ficha propia. Los TLE no incluyen el tipo de mision.',
  },
}

/* -------------------------------------------------------------------------- */
/* Clasificacion por patron de nombre                                         */
/* -------------------------------------------------------------------------- */

/**
 * El orden importa: gana la primera que casa. Los patrones de basura orbital van
 * primero porque un "SL-16 R/B" tambien contiene texto que casaria con otras
 * reglas.
 */
const MISSION_RULES = [
  { re: /(R\/B|ROCKET BODY|DEB\b|DEBRIS|COOLANT|SHROUD|PLATFORM)/i, type: 'debris' },

  { re: /^(ISS|ZARYA|CSS|TIANHE|WENTIAN|MENGTIAN|MIR)\b/i, type: 'station' },
  { re: /^(PROGRESS|CYGNUS|DRAGON|CREW DRAGON|SOYUZ|SHENZHOU|TIANZHOU|HTV|ATV)/i, type: 'cargo' },

  {
    re: /^(NAVSTAR|GPS|GLONASS|GALILEO|BEIDOU|IRNSS|NAVIC|QZS|MICHIBIKI|NVS-)/i,
    type: 'navigation',
  },

  {
    re: /^(NOAA|GOES|METOP|MSG|MTG|METEOR|FENGYUN|HIMAWARI|DMSP|SUOMI|JPSS|GOSAT|ELEKTRO)/i,
    type: 'weather',
  },

  {
    re: /^(LANDSAT|SENTINEL|TERRA|AQUA|AURA|ICESAT|SWOT|CRYOSAT|SMAP|SWARM|AEOLUS|BIOMASS|PROBA|SKYSAT|WORLDVIEW|GEOEYE|PLANET|FLOCK|DOVE|ICEYE|BLACKSKY|CAPELLA|RADARSAT|CARTOSAT|RESOURCESAT|RISAT|KOMPSAT|ARIRANG|GAOFEN|YAOGAN|HAIYANG|ALOS|ASNARO|PAZ|INGENIO|SEOSAT|DEIMOS|SAOCOM|AMAZONIA|CBERS|OCEANSAT|TIANHUI)/i,
    type: 'earth',
  },

  {
    re: /^(HST|HUBBLE|CHANDRA|XMM|FERMI|SWIFT|NUSTAR|IXPE|TESS|KEPLER|SPITZER|GAIA|INTEGRAL|ASTROSAT|SOLAR|SOHO|IRIS|HINODE|CLUSTER|THEMIS|MMS|VAN ALLEN|GRACE|SCISAT|GEODETIC|LAGEOS|STARLETTE|AJISAI|ETALON|SHIJIAN)/i,
    type: 'science',
  },

  {
    re: /^(USA|NROL|MILSTAR|WGS|AEHF|SBIRS|GSSAP|OFEQ|TECSAR|EROS|COSMOS|KOSMOS|EKS|LUCH|IGS)\b/i,
    type: 'military',
  },

  {
    re: /^(STARLINK|ONEWEB|IRIDIUM|GLOBALSTAR|ORBCOMM|INTELSAT|GALAXY|SES|ASTRA|O3B|INMARSAT|EUTELSAT|HOTBIRD|AMOS|ANIK|NIMIQ|TELESAT|CHINASAT|ZHONGXING|GSAT|INSAT|KOREASAT|HISPASAT|AMAZONAS|SPAINSAT|XTAR|THURAYA|YAHSAT|NILESAT|ARABSAT|TURKSAT|MEASAT|THAICOM|APSTAR|ASIASAT|QIANFAN|GUOWANG|GONETS|MOLNIYA|TDRS|SYRACUSE|SICRAL|SKYNET)/i,
    type: 'comms',
  },

  { re: /(CUBESAT|-?\dU\b|TECHNO|DEMO|PATHFINDER|TESTBED|ANSER|PLATERO|MINISAT)/i, type: 'tech' },
]

/**
 * Deduce el tipo de mision del nombre.
 * @returns {{type: object, inferred: boolean}} `inferred` distingue lo deducido
 *   por patron de lo que viene de una ficha verificada.
 */
export function classifyMission(name) {
  const clean = (name ?? '').trim()
  for (const rule of MISSION_RULES) {
    if (rule.re.test(clean)) return { type: MISSION_TYPES[rule.type], inferred: true }
  }
  return { type: MISSION_TYPES.unknown, inferred: true }
}

/* -------------------------------------------------------------------------- */
/* Fichas curadas                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Indexadas por ID NORAD, que no cambia nunca. Indexar por nombre seria fragil:
 * Celestrak escribe el Hubble como "HST", la ISS como "ISS (ZARYA)" y esos
 * rotulos han cambiado con los anos.
 *
 * `alias` alimenta el buscador: son los nombres por los que la gente busca de
 * verdad, no como esten escritos en el TLE.
 */
export const CURATED = {
  25544: {
    type: 'station',
    alias: ['ISS', 'Estacion Espacial Internacional', 'International Space Station'],
    summary:
      'La Estacion Espacial Internacional: el mayor objeto construido por el ser humano en orbita, habitado de forma continua desde noviembre de 2000.',
    facts: [
      'Unos 109 m de envergadura y en torno a 420 t.',
      'Da una vuelta a la Tierra cada 90 minutos: 16 amaneceres al dia.',
      'Es el objeto artificial mas brillante del cielo nocturno; se ve a simple vista sin instrumentos.',
    ],
  },
  20580: {
    type: 'science',
    alias: ['Hubble', 'HST', 'Telescopio Espacial Hubble'],
    summary:
      'El telescopio espacial Hubble. Observa en visible, ultravioleta e infrarrojo cercano desde 1990, por encima de la atmosfera que emborrona las imagenes desde tierra.',
    facts: [
      'Espejo primario de 2,4 m.',
      'Fue reparado y mejorado en cinco misiones tripuladas del transbordador.',
      'Su orbita baja decae poco a poco; sin reimpulso acabara reentrando.',
    ],
  },
  48274: {
    type: 'station',
    alias: ['Tiangong', 'CSS', 'Estacion espacial china'],
    summary:
      'Modulo Tianhe, nucleo de la estacion espacial china Tiangong, habitada de forma permanente desde 2021.',
    facts: ['Tercera estacion habitada de forma continua de la historia, tras Mir y la ISS.'],
  },
  25994: {
    type: 'earth',
    alias: ['Terra', 'EOS AM-1'],
    summary:
      'Terra, buque insignia del programa de observacion terrestre de la NASA. Lleva el instrumento MODIS, que fotografia toda la superficie del planeta cada uno o dos dias.',
    facts: ['En orbita heliosincrona: cruza el ecuador siempre a la misma hora solar local.'],
  },
  27424: {
    type: 'earth',
    alias: ['Aqua'],
    summary:
      'Aqua, gemelo de Terra centrado en el ciclo del agua: vapor, nubes, precipitacion, hielo y humedad del suelo.',
    facts: [],
  },
  43013: {
    type: 'weather',
    alias: ['NOAA-20', 'JPSS-1'],
    summary:
      'NOAA-20, satelite meteorologico polar. Alimenta los modelos de prediccion numerica con sondeos de temperatura y humedad de toda la columna atmosferica.',
    facts: [],
  },
  36411: {
    type: 'weather',
    alias: ['GOES-15'],
    summary:
      'Serie GOES: meteorologia desde orbita geoestacionaria. Al girar a la vez que la Tierra vigila siempre el mismo hemisferio, que es lo que permite ver moverse un huracan en bucle.',
    facts: [],
  },
}

/* Indice inverso de alias, en minusculas, para el buscador. */
const ALIAS_INDEX = new Map()
for (const [norad, entry] of Object.entries(CURATED)) {
  for (const alias of entry.alias ?? []) {
    ALIAS_INDEX.set(alias.toLowerCase(), norad)
  }
}

/**
 * IDs NORAD cuyos alias casan con la consulta. Permite que buscar "Hubble"
 * encuentre el objeto que Celestrak llama "HST".
 * @returns {Set<string>}
 */
export function noradIdsMatchingAlias(query) {
  const q = (query ?? '').trim().toLowerCase()
  const hits = new Set()
  if (q.length < 2) return hits
  for (const [alias, norad] of ALIAS_INDEX) {
    if (alias.includes(q)) hits.add(norad)
  }
  return hits
}

/* -------------------------------------------------------------------------- */
/* Perfil completo                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Perfil de un objeto: que es, de que tipo y con que grado de certeza.
 *
 * @param {{id:string,name:string,regime:string,periodMinutes:number,perigeeKm:number,apogeeKm:number}} satellite
 */
export function getSatelliteProfile(satellite) {
  if (!satellite) return null

  const curated = CURATED[String(satellite.id)] ?? null
  const classified = classifyMission(satellite.name)
  const type = curated?.type ? MISSION_TYPES[curated.type] : classified.type

  return {
    type,
    // Solo lo curado esta verificado; lo demas es deduccion del nombre y la
    // interfaz debe poder decirlo.
    verified: Boolean(curated),
    summary: curated?.summary ?? null,
    facts: curated?.facts ?? [],
    /** Explicacion generica del tipo, util cuando no hay ficha propia. */
    blurb: type.blurb,
    notes: buildNotes(satellite, type),
  }
}

/**
 * Observaciones derivadas de la propia orbita. A diferencia del tipo de mision,
 * esto NO es heuristica: sale de los numeros del TLE y siempre es cierto.
 */
function buildNotes(satellite, type) {
  const notes = []
  const inclination = satellite.elements?.inclination ?? Number.NaN
  const period = satellite.periodMinutes ?? Number.NaN

  if (Number.isFinite(inclination)) {
    if (inclination > 95 && inclination < 105) {
      notes.push(
        'Orbita casi polar y retrograda: es el rasgo de una orbita heliosincrona, que sobrevuela cada punto siempre a la misma hora solar. Tipico de observacion terrestre y meteorologia.',
      )
    } else if (inclination < 1) {
      notes.push(
        'Inclinacion practicamente nula: se mantiene sobre el ecuador. Combinado con un periodo de 24 h, es una orbita geoestacionaria.',
      )
    } else if (inclination > 60 && inclination < 70) {
      notes.push(
        'Inclinacion alta: cubre latitudes que una orbita ecuatorial nunca alcanza, incluidas las regiones polares.',
      )
    }
  }

  if (Number.isFinite(period)) {
    if (period > 1400 && period < 1480) {
      notes.push('Periodo de un dia sideral: se mantiene fijo sobre el mismo punto de la Tierra.')
    } else if (period < 100) {
      notes.push(
        `Da una vuelta completa cada ${period.toFixed(0)} minutos: unas ${Math.round(1440 / period)} vueltas al dia.`,
      )
    }
  }

  const drop = (satellite.apogeeKm ?? 0) - (satellite.perigeeKm ?? 0)
  if (drop > 5000) {
    notes.push(
      `Orbita muy excentrica: pasa de ${satellite.perigeeKm.toFixed(0)} km en el perigeo a ${satellite.apogeeKm.toFixed(0)} km en el apogeo. Se mueve muy rapido abajo y muy despacio arriba.`,
    )
  }

  if (type.id === 'debris') {
    notes.push(
      'No responde a mando: su orbita solo cambia por rozamiento atmosferico y por la forma de la Tierra.',
    )
  }

  return notes
}
