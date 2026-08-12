/**
 * propagator.worker
 * ---------------------------------------------------------------------------
 * Propaga TODO el catalogo cargado fuera del hilo principal.
 *
 * Propagar unos pocos miles de satelites con SGP4 cuesta varios milisegundos por
 * tick; hacerlo en el hilo de render tumbaria los FPS de CesiumJS. Aqui se
 * calcula en un worker y se devuelven TypedArrays *transferidos* (coste cero de
 * copia). El hilo principal reenvia los mismos buffers en el siguiente tick para
 * reciclarlos y no generar basura cada frame.
 *
 * Protocolo:
 *   main -> worker  { type: 'init', records: [{id, line1, line2}] }
 *   worker -> main  { type: 'ready', count, failed }
 *   main -> worker  { type: 'tick', time, pos?, tel?, flags? }   (buffers reciclados)
 *   worker -> main  { type: 'state', time, count, pos, tel, flags }
 *
 * Layout de los buffers (n = numero de satelites):
 *   pos   Float32Array(n * 3)  posicion ECEF en metros  [x, y, z]
 *   tel   Float32Array(n * 4)  [altitudKm, latitudDeg, longitudDeg, velocidadKmS]
 *   flags Uint8Array(n)        1 = propagacion valida, 0 = descartar
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

/** @type {Array<object|null>} */
let satrecs = []
let count = 0

function handleInit(records) {
  satrecs = new Array(records.length)
  let failed = 0

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]
    try {
      const satrec = twoline2satrec(record.line1, record.line2)
      if (!satrec || satrec.error) {
        satrecs[i] = null
        failed += 1
      } else {
        satrecs[i] = satrec
      }
    } catch {
      satrecs[i] = null
      failed += 1
    }
  }

  count = records.length
  self.postMessage({ type: 'ready', count, failed })
}

function handleTick({ time, pos, tel, flags }) {
  const n = count
  // Reutilizamos los buffers devueltos por el hilo principal si tienen el
  // tamano correcto; si el catalogo ha cambiado, reservamos nuevos.
  // Los buffers llegan transferidos, asi que se pueden usar tal cual (sin copiar).
  const positions = pos?.length === n * 3 ? pos : new Float32Array(n * 3)
  const telemetry = tel?.length === n * 4 ? tel : new Float32Array(n * 4)
  const validity = flags?.length === n ? flags : new Uint8Array(n)

  const date = new Date(time)
  const gmst = gstime(date)

  for (let i = 0; i < n; i += 1) {
    const satrec = satrecs[i]
    if (!satrec) {
      validity[i] = 0
      continue
    }

    let pv
    try {
      pv = propagate(satrec, date)
    } catch {
      validity[i] = 0
      continue
    }

    if (!pv?.position || !pv?.velocity || !Number.isFinite(pv.position.x)) {
      validity[i] = 0
      continue
    }

    const ecf = eciToEcf(pv.position, gmst)
    const geodetic = eciToGeodetic(pv.position, gmst)

    // Un satelite reentrado propaga a altitudes negativas: lo ocultamos.
    if (!Number.isFinite(geodetic.height) || geodetic.height < -50) {
      validity[i] = 0
      continue
    }

    const p = i * 3
    positions[p] = ecf.x * 1000
    positions[p + 1] = ecf.y * 1000
    positions[p + 2] = ecf.z * 1000

    const t = i * 4
    telemetry[t] = geodetic.height
    telemetry[t + 1] = degreesLat(geodetic.latitude)
    telemetry[t + 2] = degreesLong(geodetic.longitude)
    telemetry[t + 3] = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z)

    validity[i] = 1
  }

  self.postMessage(
    { type: 'state', time, count: n, pos: positions, tel: telemetry, flags: validity },
    [positions.buffer, telemetry.buffer, validity.buffer],
  )
}

self.onmessage = (event) => {
  const message = event.data
  switch (message?.type) {
    case 'init':
      handleInit(message.records ?? [])
      break
    case 'tick':
      handleTick(message)
      break
    default:
      break
  }
}
