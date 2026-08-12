/**
 * trackingStatsService
 * ---------------------------------------------------------------------------
 * Estadisticas de uso para el panel "Mas seguidos".
 *
 * ACLARACION IMPORTANTE SOBRE LO QUE MIDE ESTO
 * --------------------------------------------
 * Flightradar24 y similares calculan sus "vuelos mas seguidos" agregando en su
 * servidor la actividad de todos sus usuarios. Esta aplicacion no tiene backend
 * ni usuarios ademas de quien la abre, asi que NO puede medir popularidad
 * global. Inventar esas cifras seria presentar datos falsos como reales.
 *
 * Lo que si es medible y cierto es la actividad LOCAL: que satelites consulta
 * esta persona y cuanto tiempo los deja seleccionados. Eso es lo que se registra
 * aqui, se guarda solo en este navegador y se etiqueta como tal en la interfaz.
 */

const STORAGE_KEY = 'sot:tracking-stats'
/** Segundos que hay que mantener un satelite seleccionado para contar la visita. */
export const DWELL_SECONDS = 1.5
/** Peso de una visita frente a un segundo de observacion, al ordenar. */
const VIEW_WEIGHT = 20

/**
 * Objetos con los que se rellena el panel mientras no hay historial propio.
 * Se muestran etiquetados como "sugeridos", nunca como si fuesen datos de uso.
 * Solo aparecen los que esten realmente en el catalogo cargado.
 */
export const SUGGESTED_IDS = [
  '25544', // ISS (ZARYA)
  '48274', // CSS (TIANHE)
  '20580', // HST — Hubble
  '27424', // AQUA
  '25994', // TERRA
  '39084', // LANDSAT 8
  '43013', // NOAA 20
  '40697', // SENTINEL-2A
]

/** @returns {Record<string, {views:number, seconds:number, last:number}>} */
export function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    /* almacenamiento no disponible: las estadisticas duran lo que la sesion */
  }
}

export function clearStats() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Puntuacion de un satelite. Una consulta larga pesa mas que muchas fugaces,
 * pero abrir un satelite repetidamente tambien cuenta.
 */
export function score(entry) {
  return (entry?.views ?? 0) * VIEW_WEIGHT + (entry?.seconds ?? 0)
}

/** Formatea segundos como "3 min 20 s" o "45 s". */
export function formatWatchTime(seconds) {
  const total = Math.round(seconds)
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} min ${String(total % 60).padStart(2, '0')} s`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}
