/**
 * Prueba de humo de la logica pura (sin DOM):
 *  TLE sintetico -> parseo -> modelo -> propagacion -> prediccion de pasadas.
 */
import { buildDemoCatalog } from '../src/data/demoConstellation.js'
import { parseTle } from '../src/services/celestrakService.js'
import {
  buildSatellite,
  computeState,
  computeOrbitTrack,
  parseElements,
} from '../src/services/orbitCalculationService.js'
import { predictPasses } from '../src/services/passPredictorService.js'

let failures = 0
function check(name, condition, extra = '') {
  const status = condition ? 'PASS' : 'FAIL'
  if (!condition) failures += 1
  console.log(`[${status}] ${name}${extra ? ` — ${extra}` : ''}`)
}

// --- 1. Catalogo sintetico -------------------------------------------------
const now = new Date()
const catalog = buildDemoCatalog(now)
check('catalogo demo generado', catalog.length > 50, `${catalog.length} objetos`)
check('lineas TLE de 69 caracteres', catalog.every((r) => r.line1.length === 69 && r.line2.length === 69))

// --- 2. Round-trip por el parser de Celestrak ------------------------------
const text = catalog.map((r) => `${r.name}\n${r.line1}\n${r.line2}`).join('\n')
const reparsed = parseTle(text, 'demo')
check('round-trip parseTle', reparsed.length === catalog.length, `${reparsed.length} vs ${catalog.length}`)
check('nombres preservados', reparsed[0].name === catalog[0].name, `${reparsed[0].name}`)
check('ids preservados', reparsed.every((r, i) => r.id === catalog[i].id))

// --- 3. Elementos leidos por columnas --------------------------------------
const iss = catalog.find((r) => r.name.includes('ISS'))
const els = parseElements(iss.line2)
check('inclinacion ISS ~51.64', Math.abs(els.inclination - 51.64) < 0.001, String(els.inclination))
check('mean motion ISS ~15.5', Math.abs(els.meanMotion - 15.5) < 1e-6, String(els.meanMotion))
const molniya = catalog.find((r) => r.name.includes('MOLNIYA'))
check('excentricidad Molniya ~0.72', Math.abs(parseElements(molniya.line2).eccentricity - 0.72) < 1e-6)

// --- 4. Modelo y clasificacion ---------------------------------------------
const models = catalog.map(buildSatellite)
check('todos los TLE son propagables', models.every(Boolean), `${models.filter(Boolean).length}/${catalog.length}`)

const byName = (frag) => models.find((m) => m?.name.includes(frag))
check('ISS clasificada LEO', byName('ISS').regime === 'LEO', byName('ISS').regime)
check('GPS clasificado MEO', byName('GPS').regime === 'MEO', byName('GPS').regime)
check('GEOCOM clasificado GEO', byName('GEOCOM').regime === 'GEO', byName('GEOCOM').regime)
check('MOLNIYA clasificado HEO', byName('MOLNIYA').regime === 'HEO', byName('MOLNIYA').regime)

const issModel = byName('ISS')
check('periodo ISS ~92.9 min', Math.abs(issModel.periodMinutes - 92.9) < 0.5, issModel.periodMinutes.toFixed(2))
check('altitud ISS 380-460 km', issModel.perigeeKm > 380 && issModel.apogeeKm < 460,
  `${issModel.perigeeKm.toFixed(0)}–${issModel.apogeeKm.toFixed(0)} km`)

const geoModel = byName('GEOCOM')
check('altitud GEO ~35786 km', Math.abs(geoModel.perigeeKm - 35786) < 60, geoModel.perigeeKm.toFixed(0))

// --- 5. Propagacion ---------------------------------------------------------
const state = computeState(issModel.satrec, now)
check('estado ISS valido', state !== null)
check('velocidad ISS ~7.66 km/s', Math.abs(state.speedKmS - 7.66) < 0.15, state.speedKmS.toFixed(3))
check('latitud dentro de la inclinacion', Math.abs(state.latitude) <= 51.7, state.latitude.toFixed(2))
check('longitud en rango', state.longitude >= -180 && state.longitude <= 180, state.longitude.toFixed(2))

const geoState = computeState(geoModel.satrec, now)
check('GEO casi estacionario', Math.abs(geoState.speedKmS - 3.07) < 0.05, geoState.speedKmS.toFixed(3))

// La longitud de un GEO no debe moverse apreciablemente en 10 minutos.
const geoLater = computeState(geoModel.satrec, new Date(now.getTime() + 600_000))
check('deriva GEO < 0.5° en 10 min', Math.abs(geoLater.longitude - geoState.longitude) < 0.5,
  `${(geoLater.longitude - geoState.longitude).toFixed(4)}°`)

// --- 6. Traza orbital -------------------------------------------------------
const track = computeOrbitTrack(issModel.satrec, now, issModel.periodMinutes, 120)
check('traza con 120 muestras', track.length === 360, String(track.length / 3))
let minR = Infinity
let maxR = -Infinity
for (let i = 0; i < track.length / 3; i += 1) {
  const r = Math.hypot(track[i * 3], track[i * 3 + 1], track[i * 3 + 2]) / 1000
  minR = Math.min(minR, r)
  maxR = Math.max(maxR, r)
}
check('radio de la traza consistente', minR > 6700 && maxR < 6900, `${minR.toFixed(0)}–${maxR.toFixed(0)} km`)

// --- 7. Prediccion de pasadas ----------------------------------------------
const madrid = { latitude: 40.4168, longitude: -3.7038, altitudeM: 650 }
const t0 = Date.now()
const passes = predictPasses(issModel.satrec, madrid, { hours: 48, minElevation: 10, maxPasses: 8 })
const elapsed = Date.now() - t0
check('hay pasadas de la ISS sobre Madrid', passes.length > 0, `${passes.length} en 48 h`)
check('calculo bajo 3 s', elapsed < 3000, `${elapsed} ms`)

if (passes.length > 0) {
  const p = passes[0]
  check('elevacion maxima >= umbral', p.maxElevation >= 10, `${p.maxElevation.toFixed(1)}°`)
  check('duracion de pasada 60-900 s', p.durationSeconds > 60 && p.durationSeconds < 900, `${p.durationSeconds} s`)
  check('inicio antes que fin', p.startTime < p.endTime)
  check('culminacion dentro de la pasada', p.maxElevationTime >= p.startTime && p.maxElevationTime <= p.endTime)
  check('azimuts en 0-360', [p.startAzimuth, p.maxAzimuth, p.endAzimuth].every((a) => a >= 0 && a < 360))
  check('rango minimo plausible', p.minRangeKm > 400 && p.minRangeKm < 2500, `${p.minRangeKm.toFixed(0)} km`)
  console.log(
    `\n  primera pasada: ${p.startTime.toISOString()} → ${p.endTime.toISOString()}` +
      ` · max ${p.maxElevation.toFixed(0)}° · ${p.quality.label}` +
      ` · ${p.visible ? 'VISIBLE' : 'no visible a ojo'}`,
  )
}

// Un GEO sobre el ecuador nunca "sale" ni "se pone": no debe generar pasadas.
const geoPasses = predictPasses(geoModel.satrec, madrid, { hours: 24, minElevation: 10, maxPasses: 4 })
check('GEO no genera pasadas discretas', geoPasses.length === 0, `${geoPasses.length}`)

console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} COMPROBACIONES FALLIDAS`}`)
process.exit(failures === 0 ? 0 : 1)
