/**
 * skyEventsService
 * ---------------------------------------------------------------------------
 * Eventos astronomicos interesantes de ver desde una ubicacion en tierra:
 * lluvias de meteoros (dato fijo, ver `meteorShowers.js`) y candidatos a
 * reentrada de satelites (derivado en vivo del catalogo TLE que ya tenemos
 * cargado — no es una fuente de datos nueva, es una relectura de una que ya
 * existe).
 *
 * SIN COMETAS: los cometas brillantes son eventos irregulares (se descubren
 * sin patron fijo) y no hay una API gratuita fiable para su posicion y
 * brillo actual. Anadirlos exigiria una lista curada a mano que alguien
 * tendria que mantener al dia; queda fuera de esta primera version.
 */
import { gstime } from 'satellite.js'
import { sunElevationDeg } from './passPredictorService'
import { METEOR_SHOWERS } from '@/data/meteorShowers'

const MS_PER_DAY = 86_400_000
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/* -------------------------------------------------------------------------- */
/* Proyeccion AR/Dec -> Azimut/Elevacion                                      */
/* -------------------------------------------------------------------------- */

/**
 * Posicion aparente de un punto fijo del cielo (AR/Dec, en grados) para un
 * observador y un instante dados. A diferencia de `passPredictorService.js`
 * (que calcula angulos de vision hacia un satelite a distancia finita), un
 * radiante de meteoros esta, a efectos practicos, en el infinito: es la
 * transformacion ecuatorial -> horizontal clasica, no la funcion de rango
 * finito que ya usa el resto de la app.
 *
 * Formula estandar (Duffett-Smith, "Practical Astronomy with your
 * Calculator"): tiempo sidereo local -> angulo horario -> altura -> azimut,
 * con el ajuste de cuadrante por el signo de sin(H). Azimut medido desde el
 * norte en sentido horario, igual que en el resto de la app.
 *
 * @param {number} raDeg
 * @param {number} decDeg
 * @param {{latitude:number, longitude:number}} observerGd radianes (mismo formato que `toGeodetic`)
 * @param {Date} date
 */
export function radiantAltAz(raDeg, decDeg, observerGd, date) {
  const gmstRad = gstime(date)
  const lstRad = gmstRad + observerGd.longitude
  const raRad = raDeg * DEG_TO_RAD
  const decRad = decDeg * DEG_TO_RAD
  const latRad = observerGd.latitude

  let hourAngleRad = lstRad - raRad
  // Normalizado a [-PI, PI] para que sin/cos no acumulen error con angulos grandes.
  hourAngleRad = Math.atan2(Math.sin(hourAngleRad), Math.cos(hourAngleRad))

  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(hourAngleRad)
  const altitudeRad = Math.asin(Math.min(1, Math.max(-1, sinAlt)))

  const cosAz =
    (Math.sin(decRad) - Math.sin(altitudeRad) * Math.sin(latRad)) /
    (Math.cos(altitudeRad) * Math.cos(latRad))
  let azimuthRad = Math.acos(Math.min(1, Math.max(-1, cosAz)))
  if (Math.sin(hourAngleRad) > 0) azimuthRad = 2 * Math.PI - azimuthRad

  return {
    altitudeDeg: altitudeRad * RAD_TO_DEG,
    azimuthDeg: azimuthRad * RAD_TO_DEG,
  }
}

/* -------------------------------------------------------------------------- */
/* Lluvias de meteoros                                                        */
/* -------------------------------------------------------------------------- */

/** Dia del ano (1-366) de un mes/dia, sobre un ano de referencia bisiesto
 *  para que funcione tambien con el 29 de febrero si algun dia hiciera falta. */
function dayOfYear(month, day) {
  const start = Date.UTC(2000, 0, 1)
  const target = Date.UTC(2000, month - 1, day)
  return Math.round((target - start) / MS_PER_DAY) + 1
}

/** ¿Cae `date` dentro del rango activo de la lluvia? Tiene en cuenta que el
 *  rango puede cruzar el fin de ano (p.ej. Cuadrantidas: 28 dic - 12 ene). */
function isShowerActive(shower, date) {
  const doy = dayOfYear(date.getUTCMonth() + 1, date.getUTCDate())
  const from = dayOfYear(shower.active.from.month, shower.active.from.day)
  const to = dayOfYear(shower.active.to.month, shower.active.to.day)
  if (from <= to) return doy >= from && doy <= to
  return doy >= from || doy <= to
}

/** Proximo pico de la lluvia a partir de `from`: este ano si aun no ha
 *  pasado, si no el que viene. */
function nextPeakDate(shower, from) {
  const year = from.getUTCFullYear()
  const thisYear = new Date(Date.UTC(year, shower.peak.month - 1, shower.peak.day, 12))
  if (thisYear >= from) return thisYear
  return new Date(Date.UTC(year + 1, shower.peak.month - 1, shower.peak.day, 12))
}

/**
 * Lluvias cuyo proximo pico cae dentro de `withinDays`, ordenadas por
 * cercania. Con el listado fijo de 13 lluvias mayores, una ventana de 120
 * dias siempre devuelve varias — nunca una lista vacia salvo que se reduzca
 * mucho la ventana.
 */
export function upcomingMeteorShowers(date = new Date(), { withinDays = 120 } = {}) {
  return METEOR_SHOWERS.map((shower) => {
    const peakDate = nextPeakDate(shower, date)
    return {
      ...shower,
      peakDate,
      daysToPeak: (peakDate.getTime() - date.getTime()) / MS_PER_DAY,
      isActiveNow: isShowerActive(shower, date),
    }
  })
    .filter((shower) => shower.daysToPeak <= withinDays)
    .sort((a, b) => a.daysToPeak - b.daysToPeak)
}

/**
 * ¿Se puede ver esta lluvia esta noche desde `observerGd`? Muestrea las 24 h
 * siguientes a `date` cada 20 min y se queda con el mejor instante DE NOCHE
 * CERRADA (Sol por debajo de -12°, crepusculo astronomico — con meteoros
 * hace falta mas oscuridad que con un satelite iluminado). Un solo instante
 * suelto no vale: si se evalua a las 4 de la tarde el radiante puede estar
 * alto pero en pleno dia, y el panel se veria roto sin explicacion.
 */
export function showerVisibility(shower, observerGd, date = new Date()) {
  const stepMs = 20 * 60 * 1000
  const startMs = date.getTime()
  const endMs = startMs + MS_PER_DAY

  let best = null
  for (let t = startMs; t <= endMs; t += stepMs) {
    const instant = new Date(t)
    let sunElevation
    try {
      sunElevation = sunElevationDeg(observerGd, instant)
    } catch {
      continue
    }
    if (!Number.isFinite(sunElevation) || sunElevation >= -12) continue

    const { altitudeDeg, azimuthDeg } = radiantAltAz(
      shower.radiant.raDeg,
      shower.radiant.decDeg,
      observerGd,
      instant,
    )
    if (!best || altitudeDeg > best.altitudeDeg) {
      best = { altitudeDeg, azimuthDeg, time: instant }
    }
  }

  if (!best) {
    // No hubo ni un instante de noche cerrada en las proximas 24h: latitudes
    // altas en verano, tipicamente.
    return { verdict: 'daylight', bestAltitudeDeg: null, bestAzimuthDeg: null, bestTime: null }
  }

  const verdict = best.altitudeDeg >= 30 ? 'good' : best.altitudeDeg >= 0 ? 'low' : 'below-horizon'
  return {
    verdict,
    bestAltitudeDeg: best.altitudeDeg,
    bestAzimuthDeg: best.azimuthDeg,
    bestTime: best.time,
  }
}

/* -------------------------------------------------------------------------- */
/* Candidatos a reentrada                                                     */
/* -------------------------------------------------------------------------- */

function reentryBand(perigeeKm) {
  if (perigeeKm < 200) return { id: 'imminent', label: 'Inminente', color: '#ef4444' }
  if (perigeeKm < 300) return { id: 'decaying', label: 'Decayendo', color: '#f59e0b' }
  return { id: 'low-orbit', label: 'Orbita muy baja', color: '#38bdf8' }
}

/**
 * Candidatos a reentrada: satelites con perigeo muy bajo del catalogo YA
 * CARGADO — pura derivacion, sin fuente de datos nueva. Ordenados por
 * perigeo y, a igualdad, por el termino de arrastre B* del propio TLE (mas
 * B* = frena mas rapido con el rozamiento atmosferico): un objeto a 380 km
 * con B* alto decae antes que uno a 400 km con B* bajo, y el perigeo solo no
 * distingue eso.
 *
 * DELIBERADAMENTE SIN FECHA. Un unico TLE no permite predecir cuando ni
 * donde va a reentrar un objeto — eso exige modelos de arrastre atmosferico
 * que esta app no tiene. Decir "banda" en vez de un numero inventado es la
 * misma honestidad sobre la procedencia de los datos que ya practica el
 * resto de la interfaz.
 *
 * @param {Array} satellites  `store.satellites`
 */
export function reentryCandidates(satellites, { maxPerigeeKm = 400, limit = 12 } = {}) {
  return satellites
    .filter((sat) => Number.isFinite(sat.perigeeKm) && sat.perigeeKm < maxPerigeeKm)
    .map((sat) => ({
      id: sat.id,
      name: sat.name,
      regime: sat.regime,
      perigeeKm: sat.perigeeKm,
      apogeeKm: sat.apogeeKm,
      bstar: Number.isFinite(sat.satrec?.bstar) ? sat.satrec.bstar : null,
      band: reentryBand(sat.perigeeKm),
    }))
    .sort((a, b) => {
      if (Math.abs(a.perigeeKm - b.perigeeKm) > 5) return a.perigeeKm - b.perigeeKm
      return (b.bstar ?? 0) - (a.bstar ?? 0)
    })
    .slice(0, limit)
}
