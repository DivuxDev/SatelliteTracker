/**
 * demoConstellation
 * ---------------------------------------------------------------------------
 * Constelacion de respaldo para cuando Celestrak no esta accesible (sin red,
 * proxy no configurado, rate limit...).
 *
 * IMPORTANTE: estos TLE son SINTETICOS. Se generan a partir de conjuntos de
 * elementos keplerianos representativos de cada regimen orbital, con epoca
 * "ahora", y se serializan al formato TLE estandar para que SGP4 los propague
 * igual que a los reales. NO son efemerides de satelites reales y no deben
 * usarse para apuntar antenas ni planificar observaciones.
 *
 * La aplicacion marca este modo con `synthetic: true` y muestra un aviso.
 */

/* -------------------------------------------------------------------------- */
/* Serializacion TLE                                                          */
/* -------------------------------------------------------------------------- */

/** Suma de digitos modulo 10; los signos '-' cuentan como 1. */
function checksum(line) {
  let sum = 0
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c >= '0' && c <= '9') sum += c.charCodeAt(0) - 48
    else if (c === '-') sum += 1
  }
  return sum % 10
}

/** Codifica un numero en la notacion exponencial implicita del TLE: ' 12345-4'. */
function encodeExponential(value) {
  if (!value) return ' 00000+0'
  const sign = value < 0 ? '-' : ' '
  const abs = Math.abs(value)
  let exponent = Math.ceil(Math.log10(abs))
  let mantissa = Math.round((abs / 10 ** exponent) * 1e5)
  if (mantissa >= 1e5) {
    mantissa = Math.round(mantissa / 10)
    exponent += 1
  }
  const expSign = exponent < 0 ? '-' : '+'
  return `${sign}${String(mantissa).padStart(5, '0')}${expSign}${Math.abs(exponent)}`
}

/** Epoca TLE (YYDDD.DDDDDDDD) a partir de un Date. */
function encodeEpoch(date) {
  const year = date.getUTCFullYear()
  const startOfYear = Date.UTC(year, 0, 1)
  const dayOfYear = (date.getTime() - startOfYear) / 86_400_000 + 1
  const yy = String(year % 100).padStart(2, '0')
  const [intPart, fracPart] = dayOfYear.toFixed(8).split('.')
  return `${yy}${intPart.padStart(3, '0')}.${fracPart}`
}

/**
 * Construye un par de lineas TLE valido (incluidos los checksums) a partir de
 * elementos keplerianos medios.
 */
export function buildTleLines({
  satnum,
  intlDes,
  epoch,
  inclination,
  raan,
  eccentricity,
  argPerigee,
  meanAnomaly,
  meanMotion,
  bstar = 0,
  revNumber = 1,
  elementSetNumber = 999,
}) {
  const num = String(satnum).padStart(5, '0')

  const line1Body =
    `1 ${num}U ${intlDes.padEnd(8, ' ')} ${encodeEpoch(epoch)} ` +
    ` .00000000  00000-0 ${encodeExponential(bstar)} 0 ` +
    `${String(elementSetNumber).padStart(4, ' ')}`

  const eccDigits = String(Math.round(eccentricity * 1e7)).padStart(7, '0')

  const line2Body =
    `2 ${num} ${inclination.toFixed(4).padStart(8, ' ')} ` +
    `${raan.toFixed(4).padStart(8, ' ')} ${eccDigits} ` +
    `${argPerigee.toFixed(4).padStart(8, ' ')} ` +
    `${meanAnomaly.toFixed(4).padStart(8, ' ')} ` +
    `${meanMotion.toFixed(8).padStart(11, ' ')}` +
    `${String(revNumber).padStart(5, ' ')}`

  return [line1Body + checksum(line1Body), line2Body + checksum(line2Body)]
}

/* -------------------------------------------------------------------------- */
/* Definicion de la constelacion de demostracion                              */
/* -------------------------------------------------------------------------- */

/**
 * Cada plantilla describe un plano orbital que se replica `count` veces
 * repartiendo RAAN y anomalia media para obtener una distribucion realista.
 */
const TEMPLATES = [
  {
    prefix: 'DEMO ISS',
    categoryId: 'stations',
    group: 'stations',
    count: 1,
    inclination: 51.64,
    meanMotion: 15.5,
    eccentricity: 0.0006,
    bstar: 2.4e-4,
  },
  {
    prefix: 'DEMO CSS',
    categoryId: 'stations',
    group: 'stations',
    count: 1,
    inclination: 41.47,
    meanMotion: 15.62,
    eccentricity: 0.0005,
    bstar: 1.9e-4,
    raanOffset: 120,
  },
  {
    prefix: 'DEMO GPS',
    categoryId: 'gnss',
    group: 'gnss',
    count: 12,
    planes: 6,
    inclination: 55.0,
    meanMotion: 2.0056,
    eccentricity: 0.008,
  },
  {
    prefix: 'DEMO GLONASS',
    categoryId: 'gnss',
    group: 'gnss',
    count: 6,
    planes: 3,
    inclination: 64.8,
    meanMotion: 2.1314,
    eccentricity: 0.002,
    raanOffset: 45,
  },
  {
    prefix: 'DEMO GALILEO',
    categoryId: 'gnss',
    group: 'gnss',
    count: 6,
    planes: 3,
    inclination: 56.0,
    meanMotion: 1.7047,
    eccentricity: 0.0003,
    raanOffset: 90,
  },
  {
    prefix: 'DEMO GEOCOM',
    categoryId: 'comms',
    group: 'geo',
    count: 8,
    planes: 8,
    inclination: 0.06,
    meanMotion: 1.0027,
    eccentricity: 0.0002,
  },
  {
    prefix: 'DEMO POLARSAT',
    categoryId: 'weather',
    group: 'weather',
    count: 8,
    planes: 8,
    inclination: 98.2,
    meanMotion: 14.62,
    eccentricity: 0.0012,
    bstar: 1.1e-4,
  },
  {
    prefix: 'DEMO SCISAT',
    categoryId: 'science',
    group: 'science',
    count: 6,
    planes: 6,
    inclination: 28.5,
    meanMotion: 15.1,
    eccentricity: 0.0009,
    bstar: 8e-5,
  },
  {
    prefix: 'DEMO MOLNIYA',
    categoryId: 'comms',
    group: 'geo',
    count: 3,
    planes: 3,
    inclination: 63.4,
    meanMotion: 2.0064,
    eccentricity: 0.72,
    argPerigee: 270,
  },
  {
    prefix: 'DEMO SHELL',
    categoryId: 'megaconstellations',
    group: 'starlink',
    count: 24,
    planes: 6,
    inclination: 53.0,
    meanMotion: 15.06,
    eccentricity: 0.0002,
    bstar: 3.2e-4,
  },
]

/**
 * Genera el catalogo de demostracion con epoca en `now`.
 * @returns {Array<{id,name,line1,line2,group,categoryId,intlDes,epoch,synthetic}>}
 */
export function buildDemoCatalog(now = new Date()) {
  const records = []
  let satnum = 90001

  for (const template of TEMPLATES) {
    const planes = template.planes ?? 1
    const perPlane = Math.max(1, Math.round(template.count / planes))

    for (let plane = 0; plane < planes; plane += 1) {
      for (let slot = 0; slot < perPlane; slot += 1) {
        if (records.length >= 200) break

        const raan = ((template.raanOffset ?? 0) + (360 / planes) * plane) % 360
        // Desfase de fase entre planos para evitar que todos los satelites
        // crucen el ecuador a la vez.
        const meanAnomaly =
          ((360 / perPlane) * slot + (360 / (planes * perPlane)) * plane) % 360

        const index = records.length + 1
        const [line1, line2] = buildTleLines({
          satnum,
          intlDes: `26${String(index).padStart(3, '0')}A`,
          epoch: now,
          inclination: template.inclination,
          raan,
          eccentricity: template.eccentricity,
          argPerigee: template.argPerigee ?? 0,
          meanAnomaly,
          meanMotion: template.meanMotion,
          bstar: template.bstar ?? 0,
          revNumber: 1,
        })

        const suffix = template.count > 1 ? `-${String(slot + 1 + plane * perPlane).padStart(2, '0')}` : ''

        records.push({
          id: String(satnum),
          name: `${template.prefix}${suffix}`,
          line1,
          line2,
          group: template.group,
          categoryId: template.categoryId,
          intlDes: `26${String(index).padStart(3, '0')}A`,
          epoch: now.getTime(),
          synthetic: true,
        })

        satnum += 1
      }
    }
  }

  return records
}
