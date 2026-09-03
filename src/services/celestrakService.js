/**
 * celestrakService
 * ---------------------------------------------------------------------------
 * Descarga y parseo de conjuntos TLE desde Celestrak.
 *
 * Celestrak no envia cabeceras CORS permisivas de forma fiable, por lo que las
 * peticiones se hacen contra `VITE_CELESTRAK_BASE` (por defecto `/celestrak`,
 * el proxy inverso configurado en vite.config.js).
 *
 * Celestrak pide explicitamente NO descargar el mismo conjunto mas de una vez
 * cada pocas horas, asi que cacheamos en localStorage con TTL.
 */

// El encadenamiento opcional permite importar este modulo fuera de Vite
// (por ejemplo desde un script de Node), donde `import.meta.env` no existe.
const BASE = import.meta.env?.VITE_CELESTRAK_BASE || '/celestrak'
const GP_ENDPOINT = `${BASE}/NORAD/elements/gp.php`

const CACHE_PREFIX = 'sot:tle:'
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 horas
const REQUEST_TIMEOUT_MS = 25_000

/**
 * Categorias mostradas en el panel de filtros. Cada una agrupa uno o varios
 * `GROUP` de Celestrak (https://celestrak.org/NORAD/elements/).
 *
 * `heavy: true` marca conjuntos con miles de objetos: no se cargan por defecto.
 */
export const CATEGORIES = [
  {
    id: 'stations',
    label: 'Estaciones espaciales',
    short: 'STATIONS',
    color: '#f59e0b',
    groups: ['stations'],
    defaultOn: true,
  },
  {
    id: 'gnss',
    label: 'GPS / GNSS',
    short: 'GNSS',
    color: '#a855f7',
    groups: ['gnss'],
    defaultOn: true,
  },
  {
    id: 'weather',
    label: 'Meteorologicos',
    short: 'WEATHER',
    color: '#38bdf8',
    // Celestrak retiro el GROUP 'noaa': sus objetos estan en 'weather'.
    groups: ['weather', 'goes'],
    defaultOn: true,
  },
  {
    id: 'science',
    label: 'Cientificos',
    short: 'SCIENCE',
    color: '#22c55e',
    groups: ['science', 'geodetic', 'resource'],
    defaultOn: true,
  },
  {
    id: 'comms',
    label: 'Comunicaciones',
    short: 'COMMS',
    color: '#2f7fe0',
    groups: ['geo', 'intelsat', 'ses', 'iridium-NEXT', 'globalstar', 'orbcomm'],
    defaultOn: false,
  },
  {
    id: 'military',
    label: 'Militares',
    short: 'MILITARY',
    color: '#ef4444',
    groups: ['military', 'radar'],
    defaultOn: false,
  },
  {
    id: 'megaconstellations',
    label: 'Megaconstelaciones',
    short: 'MEGACONST',
    color: '#e2e8f0',
    groups: ['starlink', 'oneweb'],
    defaultOn: false,
    heavy: true,
  },
  {
    id: 'cubesats',
    label: 'CubeSats / Amateur',
    short: 'CUBESAT',
    color: '#facc15',
    groups: ['cubesat', 'amateur'],
    defaultOn: false,
    heavy: true,
  },
]

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))

/** Devuelve la categoria a la que pertenece un `GROUP` de Celestrak. */
export function categoryForGroup(group) {
  return CATEGORIES.find((c) => c.groups.includes(group)) ?? null
}

/* -------------------------------------------------------------------------- */
/* Parseo TLE                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Convierte un fichero TLE de 3 lineas (nombre + linea 1 + linea 2) en registros.
 * Ignora silenciosamente los bloques malformados en lugar de abortar el lote
 * completo: Celestrak ocasionalmente sirve entradas truncadas.
 *
 * @param {string} text  contenido crudo del fichero TLE
 * @param {string} group grupo Celestrak de origen
 * @returns {Array<{id:string,name:string,line1:string,line2:string,group:string,intlDes:string,epoch:number}>}
 */
export function parseTle(text, group = 'unknown') {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)

  const records = []
  // Recorremos buscando pares "1 ..." / "2 ..." en lugar de asumir bloques
  // rigidos de 3 lineas: asi una entrada truncada no desincroniza el resto.
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line1 = lines[i]
    const line2 = lines[i + 1]
    if (line1[0] !== '1' || line2[0] !== '2') continue
    if (line1.length < 68 || line2.length < 68) continue

    const id = line1.slice(2, 7).trim()
    if (!id) continue

    const prev = i > 0 ? lines[i - 1] : ''
    const name = prev && prev[0] !== '1' && prev[0] !== '2' ? prev.trim() : `NORAD ${id}`

    records.push({
      id,
      name,
      line1,
      line2,
      group,
      intlDes: line1.slice(9, 17).trim(),
      epoch: parseEpoch(line1),
    })
    i += 1 // saltamos la linea 2 ya consumida
  }
  return records
}

/** Epoch del TLE (columnas 19-32 de la linea 1) como timestamp en ms UTC. */
function parseEpoch(line1) {
  const raw = line1.slice(18, 32).trim()
  const yy = Number.parseInt(raw.slice(0, 2), 10)
  const doy = Number.parseFloat(raw.slice(2))
  if (Number.isNaN(yy) || Number.isNaN(doy)) return Number.NaN
  const year = yy < 57 ? 2000 + yy : 1900 + yy
  const jan1 = Date.UTC(year, 0, 1)
  return jan1 + (doy - 1) * 86_400_000
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cache en dos niveles:
 *   - memoria: siempre disponible y sin limite practico de tamano. Es la que
 *     salva los conjuntos grandes (starlink ocupa ~1,7 MB de texto).
 *   - localStorage: sobrevive a recargas, pero tiene una cuota de unos 5 MB y
 *     puede fallar. Se escribe en modo "mejor esfuerzo".
 */
const memoryCache = new Map()

/**
 * @param {string} group
 * @param {boolean} allowStale  si true, ignora el TTL (se usa cuando Celestrak
 *                              responde 403 "sin cambios desde tu descarga")
 */
function readCache(group, { allowStale = false } = {}) {
  const fromMemory = memoryCache.get(group)
  if (fromMemory && (allowStale || Date.now() - fromMemory.ts <= CACHE_TTL_MS)) {
    return fromMemory
  }
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + group)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry?.text) return null
    if (!allowStale && Date.now() - entry.ts > CACHE_TTL_MS) return null
    memoryCache.set(group, entry)
    return entry
  } catch {
    return null
  }
}

function writeCache(group, text) {
  const entry = { ts: Date.now(), text }
  memoryCache.set(group, entry)
  try {
    localStorage.setItem(CACHE_PREFIX + group, JSON.stringify(entry))
  } catch {
    // Cuota superada: los conjuntos grandes no caben. No es fatal, la cache en
    // memoria sigue cubriendo la sesion actual.
  }
}

/** Borra toda la cache TLE, en memoria y en disco. */
export function clearTleCache() {
  memoryCache.clear()
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    /* almacenamiento no disponible */
  }
}

/* -------------------------------------------------------------------------- */
/* Descarga                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Cuerpo con el que Celestrak responde 403 cuando ya te descargaste el conjunto
 * y todavia no se ha regenerado ("Data is updated once every 2 hours"). No es un
 * fallo: significa que la copia que ya tenemos sigue siendo la vigente.
 */
const NOT_MODIFIED_PATTERN = /has not updated since your last successful/i

/**
 * Descarga un unico GROUP de Celestrak, con cache y degradacion elegante.
 *
 * Ante un 403 de "sin cambios" o ante un error de red, se recurre a la copia
 * cacheada aunque haya expirado el TTL: unos TLE de hace unas horas son
 * infinitamente mas utiles que ningun dato.
 *
 * @returns {Promise<{records:Array, fromCache:boolean, stale:boolean, fetchedAt:number}>}
 */
export async function fetchGroup(group, { force = false } = {}) {
  if (!force) {
    const cached = readCache(group)
    if (cached) {
      return {
        records: parseTle(cached.text, group),
        fromCache: true,
        stale: false,
        fetchedAt: cached.ts,
      }
    }
  }

  const url = `${GP_ENDPOINT}?GROUP=${encodeURIComponent(group)}&FORMAT=tle`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  /** Ultimo recurso: devolver la copia caducada si existe. */
  const fallbackToStale = (reason) => {
    const stale = readCache(group, { allowStale: true })
    if (!stale) throw new Error(reason)
    return {
      records: parseTle(stale.text, group),
      fromCache: true,
      stale: true,
      fetchedAt: stale.ts,
    }
  }

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/plain' } })
    const text = await res.text()

    if (!res.ok) {
      if (res.status === 403 && NOT_MODIFIED_PATTERN.test(text)) {
        // Celestrak confirma que nuestra copia sigue vigente.
        return fallbackToStale(
          `Celestrak indica que GROUP=${group} no ha cambiado, pero no hay copia local. ` +
            'Vuelve a intentarlo dentro de un rato.',
        )
      }
      return fallbackToStale(`Celestrak respondio ${res.status} para GROUP=${group}`)
    }

    if (/No GP data found|Invalid query/i.test(text.slice(0, 400))) {
      return fallbackToStale(`Celestrak rechazo la consulta GROUP=${group}`)
    }

    const records = parseTle(text, group)
    if (records.length === 0) return fallbackToStale(`Respuesta vacia para GROUP=${group}`)

    writeCache(group, text)
    return { records, fromCache: false, stale: false, fetchedAt: Date.now() }
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      // Fallo de red o timeout: la copia caducada sigue siendo mejor que nada.
      return fallbackToStale(
        `No se pudo contactar con Celestrak para GROUP=${group} (${error.message})`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Descarga todos los GROUPs de una categoria en paralelo y deduplica por NORAD ID.
 * Si algun grupo falla, se conservan los que si hayan respondido.
 *
 * @returns {Promise<{records:Array, errors:Array<{group:string,message:string}>}>}
 */
export async function fetchCategory(categoryId, { force = false } = {}) {
  const category = CATEGORY_BY_ID.get(categoryId)
  if (!category) throw new Error(`Categoria desconocida: ${categoryId}`)

  const settled = await Promise.allSettled(
    category.groups.map((g) => fetchGroup(g, { force })),
  )

  const byId = new Map()
  const errors = []
  let stale = false
  let fetchedAt = 0

  settled.forEach((result, index) => {
    const group = category.groups[index]
    if (result.status === 'rejected') {
      errors.push({ group, message: result.reason?.message ?? String(result.reason) })
      return
    }
    if (result.value.stale) stale = true
    fetchedAt = Math.max(fetchedAt, result.value.fetchedAt)
    for (const record of result.value.records) {
      // Un mismo satelite puede aparecer en varios grupos; nos quedamos con el
      // primero pero anotamos la categoria.
      if (!byId.has(record.id)) byId.set(record.id, { ...record, categoryId })
    }
  })

  if (byId.size === 0 && errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join(' · '))
  }

  return { records: [...byId.values()], errors, stale, fetchedAt }
}
