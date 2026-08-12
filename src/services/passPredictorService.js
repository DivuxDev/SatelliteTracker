/**
 * passPredictorService
 * ---------------------------------------------------------------------------
 * Prediccion de pasadas visibles sobre un observador en tierra, al estilo de
 * "See A Starlink Tonight".
 *
 * Una pasada se considera VISIBLE a simple vista cuando se cumplen a la vez:
 *   1. El satelite esta por encima del horizonte del observador (elevacion > min).
 *   2. El satelite esta iluminado por el Sol (no dentro de la sombra terrestre).
 *   3. El observador esta a oscuras (Sol por debajo de -6 grados, crepusculo civil).
 *
 * Si solo se cumple (1) la pasada existe pero no se ve: la marcamos como
 * "solo radio" en lugar de descartarla, porque sigue siendo util para antenas.
 */

import {
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  degreesToRadians,
  radiansToDegrees,
  jday,
  sunPos,
  shadowFraction,
} from 'satellite.js'

const AU_TO_KM = 149_597_870.7
const MS_PER_MINUTE = 60_000

/** Umbral de oscuridad del observador (crepusculo civil). */
const OBSERVER_DARK_SUN_ELEVATION_DEG = -6
/** Por encima de este valor consideramos que el satelite entra en sombra. */
const ECLIPSE_SHADOW_THRESHOLD = 0.75

/**
 * Normaliza la ubicacion del observador al formato de satellite.js (radianes + km).
 * @param {{latitude:number, longitude:number, altitudeM?:number}} observer
 */
export function toGeodetic(observer) {
  return {
    latitude: degreesToRadians(observer.latitude),
    longitude: degreesToRadians(observer.longitude),
    height: (observer.altitudeM ?? 0) / 1000,
  }
}

/** Elevacion del Sol sobre el horizonte del observador, en grados. */
export function sunElevationDeg(observerGd, date) {
  const { rsun } = sunPos(jday(date))
  const sunEciKm = { x: rsun.x * AU_TO_KM, y: rsun.y * AU_TO_KM, z: rsun.z * AU_TO_KM }
  const sunEcf = eciToEcf(sunEciKm, gstime(date))
  return radiansToDegrees(ecfToLookAngles(observerGd, sunEcf).elevation)
}

/**
 * Muestra instantanea del satelite vista desde el observador.
 * @returns {null|{azimuth:number, elevation:number, rangeKm:number, sunlit:boolean, time:Date}}
 */
function sample(satrec, observerGd, date) {
  let pv
  try {
    pv = propagate(satrec, date)
  } catch {
    return null
  }
  if (!pv?.position) return null

  const gmst = gstime(date)
  const ecf = eciToEcf(pv.position, gmst)
  const look = ecfToLookAngles(observerGd, ecf)
  if (!Number.isFinite(look.elevation)) return null

  const { rsun } = sunPos(jday(date))
  const shadow = shadowFraction(rsun, pv.position)

  return {
    time: date,
    azimuth: (radiansToDegrees(look.azimuth) + 360) % 360,
    elevation: radiansToDegrees(look.elevation),
    rangeKm: look.rangeSat,
    sunlit: shadow < ECLIPSE_SHADOW_THRESHOLD,
  }
}

/** Busca por biseccion el instante exacto del cruce de `minElevation`. */
function refineCrossing(satrec, observerGd, tBeforeMs, tAfterMs, minElevation, iterations = 14) {
  let lo = tBeforeMs
  let hi = tAfterMs
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2
    const s = sample(satrec, observerGd, new Date(mid))
    if (!s) break
    if (s.elevation < minElevation) lo = mid
    else hi = mid
  }
  return new Date((lo + hi) / 2)
}

/**
 * Predice las proximas pasadas de un satelite sobre un observador.
 *
 * @param {object}   satrec              satrec de satellite.js
 * @param {object}   observer            {latitude, longitude, altitudeM}
 * @param {object}   [options]
 * @param {Date}     [options.start]     instante inicial (por defecto, ahora)
 * @param {number}   [options.hours]     ventana de busqueda en horas
 * @param {number}   [options.minElevation] elevacion minima en grados
 * @param {number}   [options.maxPasses] numero maximo de pasadas a devolver
 * @param {number}   [options.stepSeconds] paso de la busqueda gruesa
 * @param {boolean}  [options.onlyVisible] descartar las pasadas no visibles a simple vista
 * @returns {Array<Pass>}
 */
export function predictPasses(satrec, observer, options = {}) {
  const {
    start = new Date(),
    hours = 48,
    minElevation = 10,
    maxPasses = 8,
    stepSeconds = 30,
    onlyVisible = false,
  } = options

  const observerGd = toGeodetic(observer)
  const endMs = start.getTime() + hours * 3600_000
  const stepMs = stepSeconds * 1000

  const passes = []
  let previous = sample(satrec, observerGd, start)
  /** Instantes que acotan el ascenso: uno por debajo del umbral y otro por encima. */
  let riseBracket = null

  for (let tMs = start.getTime() + stepMs; tMs <= endMs; tMs += stepMs) {
    const current = sample(satrec, observerGd, new Date(tMs))
    if (!current) {
      previous = current
      continue
    }

    const wasUp = previous ? previous.elevation >= minElevation : false
    const isUp = current.elevation >= minElevation

    if (!wasUp && isUp) {
      riseBracket = { belowMs: tMs - stepMs, aboveMs: tMs }
    } else if (wasUp && !isUp && riseBracket) {
      const pass = buildPass(satrec, observerGd, minElevation, {
        ...riseBracket,
        setAboveMs: tMs - stepMs,
        setBelowMs: tMs,
      })
      riseBracket = null
      if (pass && (!onlyVisible || pass.visible)) {
        passes.push(pass)
        if (passes.length >= maxPasses) break
      }
    }

    previous = current
  }

  return passes
}

/**
 * Construye el detalle completo de una pasada a partir de los brackets de
 * cruce del umbral de elevacion hallados en la busqueda gruesa.
 */
function buildPass(satrec, observerGd, minElevation, brackets) {
  const { belowMs, aboveMs, setAboveMs, setBelowMs } = brackets
  const startTime = refineCrossing(satrec, observerGd, belowMs, aboveMs, minElevation)
  const endTime = refineCrossing(satrec, observerGd, setBelowMs, setAboveMs, minElevation)

  const startMs = startTime.getTime()
  const endMs = endTime.getTime()
  const durationS = (endMs - startMs) / 1000
  if (!Number.isFinite(durationS) || durationS <= 0) return null

  // Muestreo denso de la pasada para la grafica de cielo (max ~120 puntos).
  const sampleCount = Math.min(120, Math.max(12, Math.round(durationS / 5)))
  const track = []
  let peak = null
  let sunlitCount = 0

  for (let i = 0; i < sampleCount; i += 1) {
    const t = new Date(startMs + ((endMs - startMs) * i) / (sampleCount - 1))
    const s = sample(satrec, observerGd, t)
    if (!s) continue
    track.push(s)
    if (!peak || s.elevation > peak.elevation) peak = s
    if (s.sunlit) sunlitCount += 1
  }

  if (!peak || track.length < 3) return null

  const observerDarkAtPeak = sunElevationDeg(observerGd, peak.time) < OBSERVER_DARK_SUN_ELEVATION_DEG
  const visible = peak.sunlit && observerDarkAtPeak

  return {
    id: `${startMs}`,
    startTime,
    endTime,
    durationSeconds: Math.round(durationS),
    maxElevation: peak.elevation,
    maxElevationTime: peak.time,
    startAzimuth: track[0].azimuth,
    maxAzimuth: peak.azimuth,
    endAzimuth: track[track.length - 1].azimuth,
    minRangeKm: peak.rangeKm,
    visible,
    observerDark: observerDarkAtPeak,
    sunlitFraction: sunlitCount / track.length,
    quality: qualityFor(peak.elevation),
    track,
  }
}

function qualityFor(maxElevation) {
  if (maxElevation >= 60) return { id: 'excellent', label: 'Excelente', color: '#22c55e' }
  if (maxElevation >= 35) return { id: 'good', label: 'Buena', color: '#38bdf8' }
  if (maxElevation >= 20) return { id: 'fair', label: 'Aceptable', color: '#f59e0b' }
  return { id: 'low', label: 'Rasante', color: '#6b7a92' }
}

/** Nombre del punto cardinal para un azimut en grados. */
export function azimuthToCompass(azimuth) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
  return points[Math.round(((azimuth % 360) + 360) % 360 / 22.5) % 16]
}

/** Formatea una duracion en segundos como "4 min 12 s". */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m} min ${s.toString().padStart(2, '0')} s` : `${s} s`
}

/** Minutos hasta un instante futuro (negativo si ya paso). */
export function minutesUntil(date, from = new Date()) {
  return (date.getTime() - from.getTime()) / MS_PER_MINUTE
}
