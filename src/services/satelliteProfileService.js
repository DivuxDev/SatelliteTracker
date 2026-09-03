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
 *
 * Ademas de esos dos hay un tercer mecanismo, mas alla de este fichero: para
 * lo que no esta curado y no es una constelacion en serie (ver
 * `FAMILY_RULES`), `wikiLookupService.js` intenta una consulta en vivo a
 * Wikidata/Wikipedia por ID NORAD exacto. Se activa solo desde el modal de
 * telemetria (nunca aqui, esta funcion sigue siendo sincrona) y nunca
 * sustituye al tipo de mision deducido, solo aporta una descripcion mas.
 */
import { CURATED } from '@/data/curatedSatellites'

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
/* Familias de constelacion                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Para constelaciones en serie (miles de unidades identicas e
 * intercambiables) una ficha por satelite no tiene sentido, y buscarla en
 * Wikipedia no vale mas que esto: nunca hay pagina propia para "STARLINK-30234",
 * pero la EXPLICACION de la familia entera es la misma para todas sus
 * unidades y es mas util que cualquier otra cosa que se pudiera mostrar.
 *
 * Solo se consulta cuando no hay ficha curada (ver `getSatelliteProfile`).
 * El orden importa igual que en `MISSION_RULES`: gana la primera que casa.
 */
const FAMILY_RULES = [
  {
    re: /^STARLINK/i,
    family: {
      id: 'starlink',
      label: 'Constelacion Starlink',
      summary:
        'Una de las mas de 7.000 unidades de Starlink, la red de internet de banda ancha de SpaceX. Los satelites de esta familia son de serie e intercambiables: no existe una ficha individual para cada uno.',
    },
  },
  {
    re: /^ONEWEB/i,
    family: {
      id: 'oneweb',
      label: 'Constelacion OneWeb',
      summary:
        'Uno de los mas de 600 satelites de OneWeb, una red de internet de banda ancha en orbita baja competidora de Starlink.',
    },
  },
  {
    re: /^(QIANFAN|GUOWANG)/i,
    family: {
      id: 'china-megaconstellation',
      label: 'Megaconstelacion china',
      summary:
        'Satelite de una de las megaconstelaciones chinas de internet en despliegue (Qianfan/G60 o Guowang), pensadas como respuesta a Starlink. Miles de unidades planificadas, de serie.',
    },
  },
  {
    re: /^IRIDIUM/i,
    family: {
      id: 'iridium',
      label: 'Constelacion Iridium NEXT',
      summary:
        'Uno de los 66 satelites operativos (mas repuestos en orbita) de Iridium NEXT, que da cobertura de telefonia y datos por satelite en cualquier punto del planeta, polos incluidos.',
    },
  },
  {
    re: /^GLOBALSTAR/i,
    family: {
      id: 'globalstar',
      label: 'Constelacion Globalstar',
      summary: 'Uno de los satelites de Globalstar, red de telefonia y mensajeria por satelite en orbita baja.',
    },
  },
  {
    re: /^ORBCOMM/i,
    family: {
      id: 'orbcomm',
      label: 'Constelacion Orbcomm',
      summary:
        'Uno de los satelites de Orbcomm, especializada en mensajeria de maquina a maquina: seguimiento de flotas, contenedores y sensores remotos.',
    },
  },
  {
    re: /^(FLOCK|DOVE)/i,
    family: {
      id: 'planet-flock',
      label: 'Enjambre Planet Flock/Dove',
      summary:
        'Uno de los cientos de cubesats "Dove" de Planet Labs, organizados en enjambres ("Flock"). Fotografian la superficie terrestre completa a diario en baja resolucion.',
    },
  },
  {
    re: /^LEMUR/i,
    family: {
      id: 'spire-lemur',
      label: 'Constelacion Spire Lemur',
      summary:
        'Uno de los cubesats Lemur de Spire Global: recogen datos meteorologicos, de trafico maritimo (AIS) y aereo (ADS-B) mediante radio-ocultacion y receptores embarcados.',
    },
  },
]

/**
 * Copy generico para constelaciones en serie, o `null` si el nombre no
 * pertenece a ninguna familia conocida.
 */
export function classifyFamily(name) {
  const clean = (name ?? '').trim()
  for (const rule of FAMILY_RULES) {
    if (rule.re.test(clean)) return rule.family
  }
  return null
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
  // Una constelacion en serie nunca tiene ficha propia (son miles de unidades
  // identicas), asi que solo se busca cuando no hay curada.
  const family = curated ? null : classifyFamily(satellite.name)

  return {
    type,
    // Solo lo curado esta verificado; lo demas es deduccion del nombre y la
    // interfaz debe poder decirlo.
    verified: Boolean(curated),
    summary: curated?.summary ?? null,
    facts: curated?.facts ?? [],
    /** Explicacion generica del tipo, util cuando no hay ficha propia. */
    blurb: type.blurb,
    /** Copy de familia (p.ej. "Constelacion Starlink"), o null si no aplica. */
    family,
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
