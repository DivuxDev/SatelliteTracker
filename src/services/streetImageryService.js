/**
 * streetImageryService
 * ---------------------------------------------------------------------------
 * Foto a pie de calle mas cercana a una ubicacion, vía la API de Mapillary
 * (gratuita, sin cuenta de facturacion — ver `.env.example`). Usada por el
 * panel "Mi horizonte a pie de calle" del simulador de pasadas.
 *
 * DOS COSAS QUE PARECIAN OBVIAS Y NO LO ERAN (verificadas en vivo contra la
 * API antes de escribir esto):
 *
 *   1. El parametro `closeto` de la API de imagenes NO funciona — se ignora
 *      en silencio. Hay que usar `bbox` (rectangulo de coordenadas); el
 *      parametro `radius` existe pero tiene un tope de 50 m, inutil aqui.
 *
 *   2. Cada imagen trae DOS rumbos de camara distintos: `compass_angle` (el
 *      magnetometro en bruto, en el momento de la captura) y
 *      `computed_compass_angle` (reconstruido por triangulacion a partir de
 *      varias imagenes cercanas — mas fiable). Pueden diferir mas de 10°
 *      entre si en la misma imagen; se prefiere siempre el segundo.
 */

const TOKEN = import.meta.env?.VITE_MAPILLARY_TOKEN
const GRAPH_URL = 'https://graph.mapillary.com/images'
const FIELDS = 'id,compass_angle,computed_compass_angle,geometry,captured_at,is_pano,thumb_1024_url'
/** Fuera de este error de rumbo, ninguna imagen "mira" razonablemente hacia el objetivo. */
const MAX_HEADING_ERROR_DEG = 40

export function hasMapillaryToken() {
  return Boolean(TOKEN)
}

function bboxAround(latitude, longitude, halfSideMeters) {
  const dLatDeg = halfSideMeters / 111_320
  const dLonDeg = dLatDeg / Math.cos((latitude * Math.PI) / 180)
  return [longitude - dLonDeg, latitude - dLatDeg, longitude + dLonDeg, latitude + dLatDeg].join(',')
}

async function queryBbox(latitude, longitude, halfSideMeters, signal) {
  const bbox = bboxAround(latitude, longitude, halfSideMeters)
  const url = `${GRAPH_URL}?access_token=${TOKEN}&fields=${FIELDS}&bbox=${bbox}&limit=100`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()

  return (json.data ?? [])
    // Una panoramica de 360° no tiene un "rumbo" util para esto: se descarta.
    .filter((img) => !img.is_pano)
    .map((img) => ({
      id: img.id,
      heading: Number.isFinite(img.computed_compass_angle) ? img.computed_compass_angle : img.compass_angle,
      longitude: img.geometry?.coordinates?.[0],
      latitude: img.geometry?.coordinates?.[1],
      capturedAt: img.captured_at,
      // URL firmada y con caducidad (parametros oh/oe): no se persiste nunca,
      // solo se usa dentro de la sesion que la pidio.
      thumbUrl: img.thumb_1024_url,
    }))
    .filter((img) => Number.isFinite(img.heading) && img.thumbUrl && Number.isFinite(img.latitude))
}

/**
 * Imagenes cercanas a una ubicacion. Un solo reintento con radio mayor si el
 * primero no encuentra nada — nunca mas de dos peticiones.
 *
 * @returns {Promise<{status:'disabled'|'ok'|'empty'|'error', images: Array}>}
 */
export async function fetchNearbyImages({ latitude, longitude }, { halfSideMeters = 250, signal } = {}) {
  if (!hasMapillaryToken()) return { status: 'disabled', images: [] }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { status: 'error', images: [] }

  try {
    let images = await queryBbox(latitude, longitude, halfSideMeters, signal)
    if (images.length === 0) {
      images = await queryBbox(latitude, longitude, 1000, signal)
    }
    return { status: images.length > 0 ? 'ok' : 'empty', images }
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return { status: 'error', images: [] }
  }
}

/* -------------------------------------------------------------------------- */
/* Seleccion de la imagen que mejor mira hacia un azimut objetivo             */
/* -------------------------------------------------------------------------- */

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6_371_000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Diferencia angular sin signo entre dos rumbos, en [0, 180]. */
export function headingDiff(a, b) {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * De entre las imagenes cercanas, la que mejor mira hacia `targetAzimuthDeg`:
 * primero por error de rumbo (si alguna cae dentro de `MAX_HEADING_ERROR_DEG`),
 * la distancia solo desempata. Si ninguna mira ni remotamente hacia ahi, se
 * devuelve igualmente la mas cercana — mejor eso que nada, pero
 * `StreetHorizonPanel.vue` debe dejar claro que no está encuadrado.
 */
export function pickImageForAzimuth(images, targetAzimuthDeg, observer) {
  if (!images || images.length === 0) return null

  const scored = images.map((image) => ({
    image,
    headingErrorDeg: headingDiff(image.heading, targetAzimuthDeg),
    distanceM: distanceMeters(observer.latitude, observer.longitude, image.latitude, image.longitude),
  }))

  const withinHeading = scored.filter((s) => s.headingErrorDeg <= MAX_HEADING_ERROR_DEG)
  const pool = withinHeading.length > 0 ? withinHeading : scored

  pool.sort((a, b) => {
    if (withinHeading.length > 0 && Math.abs(a.headingErrorDeg - b.headingErrorDeg) > 5) {
      return a.headingErrorDeg - b.headingErrorDeg
    }
    return a.distanceM - b.distanceM
  })

  return pool[0] ?? null
}
