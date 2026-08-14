/**
 * satelliteStore
 * ---------------------------------------------------------------------------
 * Estado global de la aplicacion: catalogo, filtros, seleccion y el bucle de
 * propagacion en tiempo real.
 *
 * Decision de rendimiento importante: las posiciones NO viven en el sistema de
 * reactividad de Vue. Con miles de satelites actualizandose 20 veces por segundo,
 * hacer reactivo cada vector destruiria los FPS. En su lugar:
 *
 *   - `frame` es un `shallowRef` que apunta a TypedArrays crudos.
 *   - `frameTick` se incrementa en cada frame; lo observa solo el visor 3D.
 *   - `uiTick` se incrementa 2 veces por segundo; lo observan las listas y las
 *     fichas de telemetria, que no necesitan mas resolucion temporal.
 */

import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'

import { CATEGORIES, clearTleCache, fetchCategory } from '@/services/celestrakService'
import { ORBIT_REGIMES, buildSatellite, tleAgeDays } from '@/services/orbitCalculationService'
import { noradIdsMatchingAlias } from '@/services/satelliteProfileService'
import {
  DWELL_SECONDS,
  SUGGESTED_IDS,
  clearStats,
  loadStats,
  saveStats,
  score,
} from '@/services/trackingStatsService'
import { buildDemoCatalog } from '@/data/demoConstellation'

/** Cadencia objetivo del bucle de propagacion (ms). */
const TICK_INTERVAL_MS = 50
/** Cadencia de refresco de los valores numericos de la interfaz (ms). */
const UI_REFRESH_MS = 500

/**
 * Criterios de ordenacion de la lista lateral.
 *
 * Todos son estables a proposito: ordenar por velocidad o altitud instantanea
 * haria que las filas bailasen varias veces por segundo. Las magnitudes que se
 * usan aqui (altitud media derivada del apogeo y el perigeo) no cambian.
 */
export const SORT_MODES = [
  { id: 'relevance', label: 'Relevancia' },
  { id: 'name', label: 'Nombre' },
  { id: 'altitude', label: 'Altitud' },
  { id: 'norad', label: 'NORAD' },
]

/** Prioridad por categoria para el orden "relevancia" (menor = antes). */
const CATEGORY_PRIORITY = new Map(CATEGORIES.map((category, index) => [category.id, index]))

export const useSatelliteStore = defineStore('satellites', () => {
  /* ---------------------------------------------------------------------- */
  /* Catalogo                                                               */
  /* ---------------------------------------------------------------------- */

  /** @type {import('vue').ShallowRef<Array<object>>} */
  const satellites = shallowRef([])
  /** Mapa id NORAD -> indice dentro de `satellites`. Se reconstruye al cargar. */
  let indexById = new Map()

  const activeCategoryIds = ref(CATEGORIES.filter((c) => c.defaultOn).map((c) => c.id))
  const loadedCategoryIds = ref([])
  const loadingCategoryIds = ref([])
  /** Categorias servidas desde cache porque Celestrak no tenia datos nuevos. */
  const staleCategoryIds = ref([])
  const loadErrors = ref([])
  const isDemoMode = ref(false)
  const lastSyncAt = ref(null)
  const isInitializing = ref(true)

  /* ---------------------------------------------------------------------- */
  /* Filtros y seleccion                                                    */
  /* ---------------------------------------------------------------------- */

  const searchQuery = ref('')
  const regimeFilter = ref([])
  const countryFilter = ref([])
  const sortMode = ref('relevance')
  const selectedId = ref(null)
  const hoveredId = ref(null)
  const trackedId = ref(null)

  /* ---------------------------------------------------------------------- */
  /* Reloj de simulacion                                                    */
  /* ---------------------------------------------------------------------- */

  const timeMultiplier = ref(1)
  const isPaused = ref(false)
  /** Instante simulado actual, en ms epoch. */
  let simulatedMs = Date.now()
  let lastWallClockMs = Date.now()
  const clockTick = ref(0)

  /* ---------------------------------------------------------------------- */
  /* Estado de propagacion (no reactivo por diseno)                         */
  /* ---------------------------------------------------------------------- */

  const frame = shallowRef({ pos: null, tel: null, flags: null, time: Date.now(), count: 0 })
  const frameTick = ref(0)
  const uiTick = ref(0)
  const propagationRate = ref(0) // ticks/s efectivos, para el panel de estado

  /** @type {Worker|null} */
  let worker = null
  /** Buffers del frame anterior, listos para reciclar en el siguiente tick. */
  let recycledFrame = null
  let tickTimer = null
  let uiTimer = null
  let awaitingFrame = false
  let ticksThisSecond = 0
  let rateWindowStart = performance.now()

  /* ---------------------------------------------------------------------- */
  /* Derivados                                                              */
  /* ---------------------------------------------------------------------- */

  const totalCount = computed(() => satellites.value.length)

  /** Altitud media derivada, estable en el tiempo. La usa la ordenacion. */
  function meanAltitude(sat) {
    return (sat.apogeeKm + sat.perigeeKm) / 2
  }

  const COMPARATORS = {
    // Por defecto: primero las categorias mas interesantes (estaciones
    // espaciales antes que constelaciones enteras) y dentro de cada una, por
    // nombre. El alfabetico puro dejaba la ISS enterrada entre 487 objetos.
    relevance: (a, b) => {
      const pa = CATEGORY_PRIORITY.get(a.categoryId) ?? 99
      const pb = CATEGORY_PRIORITY.get(b.categoryId) ?? 99
      return pa !== pb ? pa - pb : a.name.localeCompare(b.name)
    },
    name: (a, b) => a.name.localeCompare(b.name),
    altitude: (a, b) => meanAltitude(a) - meanAltitude(b),
    norad: (a, b) => Number(a.id) - Number(b.id),
  }

  /**
   * Satelites que pasan los filtros activos, ya ordenados. Se recalcula solo
   * cuando cambian catalogo, filtros u orden, nunca por el avance del tiempo.
   */
  const filteredSatellites = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()
    const categories = new Set(activeCategoryIds.value)
    const regimes = regimeFilter.value
    const countries = countryFilter.value

    // Celestrak nombra los objetos como le conviene: el Hubble es "HST" y la
    // ISS es "ISS (ZARYA)". Buscar "hubble" no encontraba nada. Los alias de las
    // fichas curadas traducen el nombre por el que se busca al ID NORAD real.
    const aliasIds = query ? noradIdsMatchingAlias(query) : null

    const matches = satellites.value.filter((sat) => {
      if (categories.size > 0 && sat.categoryId && !categories.has(sat.categoryId)) return false
      if (regimes.length > 0 && !regimes.includes(sat.regime)) return false
      if (countries.length > 0 && !countries.includes(sat.country)) return false
      if (
        query &&
        !sat.name.toLowerCase().includes(query) &&
        !sat.id.includes(query) &&
        !aliasIds.has(String(sat.id))
      ) {
        return false
      }
      return true
    })

    return matches.sort(COMPARATORS[sortMode.value] ?? COMPARATORS.relevance)
  })

  /**
   * Mascara de visibilidad alineada con `satellites`, que consume el visor 3D
   * para encender/apagar puntos sin recorrer objetos.
   */
  const visibilityMask = computed(() => {
    const mask = new Uint8Array(satellites.value.length)
    const visible = filteredSatellites.value
    for (let i = 0; i < visible.length; i += 1) {
      const index = indexById.get(visible[i].id)
      if (index !== undefined) mask[index] = 1
    }
    return mask
  })

  const selectedSatellite = computed(() =>
    selectedId.value === null ? null : (satellites.value[indexById.get(selectedId.value)] ?? null),
  )

  const hoveredSatellite = computed(() =>
    hoveredId.value === null ? null : (satellites.value[indexById.get(hoveredId.value)] ?? null),
  )

  /** Lectura de telemetria de un satelite por id. Depende de `uiTick`. */
  function readTelemetry(id) {
    // eslint-disable-next-line no-unused-expressions -- fuerza la dependencia reactiva
    uiTick.value
    const index = indexById.get(id)
    const current = frame.value
    if (index === undefined || !current.tel || !current.flags?.[index]) return null

    const t = index * 4
    return {
      altitudeKm: current.tel[t],
      latitude: current.tel[t + 1],
      longitude: current.tel[t + 2],
      speedKmS: current.tel[t + 3],
      time: current.time,
    }
  }

  /**
   * Igual que `readTelemetry` pero SIN crear dependencia reactiva. Pensado para
   * llamarse desde el bucle de render de Cesium, donde queremos el dato mas
   * fresco disponible y no que Vue reaccione a nada.
   */
  function peekTelemetry(id) {
    const index = indexById.get(id)
    const current = frame.value
    if (index === undefined || !current.tel || !current.flags?.[index]) return null
    const t = index * 4
    return {
      altitudeKm: current.tel[t],
      latitude: current.tel[t + 1],
      longitude: current.tel[t + 2],
      speedKmS: current.tel[t + 3],
      time: current.time,
    }
  }

  /** Posicion ECEF en metros de un satelite. Depende de `frameTick`. */
  function readPosition(id) {
    // eslint-disable-next-line no-unused-expressions -- fuerza la dependencia reactiva
    frameTick.value
    const index = indexById.get(id)
    const current = frame.value
    if (index === undefined || !current.pos || !current.flags?.[index]) return null
    const p = index * 3
    return { x: current.pos[p], y: current.pos[p + 1], z: current.pos[p + 2] }
  }

  const selectedTelemetry = computed(() =>
    selectedId.value === null ? null : readTelemetry(selectedId.value),
  )

  /**
   * Resuelve una fila de la lista lateral. La llama `SatelliteList` solo para
   * las filas realmente visibles en pantalla (la lista esta virtualizada), asi
   * que resolver telemetria aqui cuesta lo mismo con 20 objetos que con 20.000.
   */
  function buildRow(sat) {
    const telemetry = readTelemetry(sat.id)
    return {
      id: sat.id,
      name: sat.name,
      regime: sat.regime,
      countryLabel: sat.countryLabel,
      operator: sat.operator,
      speedKmS: telemetry?.speedKmS ?? sat.nominalSpeedKmS,
      altitudeKm: telemetry?.altitudeKm ?? meanAltitude(sat),
      healthy: telemetry !== null,
    }
  }

  /** Reparto por regimen orbital del conjunto filtrado. */
  const regimeBreakdown = computed(() => {
    const counts = { LEO: 0, MEO: 0, GEO: 0, HEO: 0 }
    for (const sat of filteredSatellites.value) counts[sat.regime] += 1
    const total = filteredSatellites.value.length || 1
    return Object.entries(counts).map(([id, count]) => ({
      id,
      count,
      share: count / total,
      ...ORBIT_REGIMES[id],
    }))
  })

  /** Reparto por pais/operador inferido, ordenado de mayor a menor. */
  const countryBreakdown = computed(() => {
    const counts = new Map()
    for (const sat of filteredSatellites.value) {
      const entry = counts.get(sat.country) ?? { id: sat.country, label: sat.countryLabel, count: 0 }
      entry.count += 1
      counts.set(sat.country, entry)
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)
  })

  /** Reparto por categoria, incluyendo las no cargadas (count 0). */
  const categoryBreakdown = computed(() => {
    const counts = new Map()
    for (const sat of satellites.value) {
      counts.set(sat.categoryId, (counts.get(sat.categoryId) ?? 0) + 1)
    }
    return CATEGORIES.map((category) => ({
      ...category,
      count: counts.get(category.id) ?? 0,
      loaded: loadedCategoryIds.value.includes(category.id),
      loading: loadingCategoryIds.value.includes(category.id),
      active: activeCategoryIds.value.includes(category.id),
      stale: staleCategoryIds.value.includes(category.id),
    }))
  })

  /* ---------------------------------------------------------------------- */
  /* Estadisticas de uso local (panel "Mas seguidos")                       */
  /* ---------------------------------------------------------------------- */

  /** { id: { views, seconds, last } }. Solo actividad de este navegador. */
  const trackingStats = ref(loadStats())
  /** Instante en que se selecciono el satelite actual, para medir permanencia. */
  let selectionStartedAt = 0
  /** Si la visita actual ya se ha contabilizado como "consulta". */
  let currentViewCounted = false
  let statsDirty = false

  /**
   * Cinco satelites mas consultados, o sugerencias si aun no hay historial.
   * `basedOnUsage` distingue ambos casos para que la interfaz no presente una
   * lista editorial como si fuesen datos medidos.
   */
  const mostTracked = computed(() => {
    // eslint-disable-next-line no-unused-expressions -- refresco a 2 Hz
    uiTick.value

    const entries = Object.entries(trackingStats.value)
      .map(([id, entry]) => ({ id, ...entry, score: score(entry) }))
      .filter((entry) => entry.score > 0 && indexById.has(entry.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    if (entries.length > 0) {
      return {
        basedOnUsage: true,
        items: entries.map((entry) => ({
          ...entry,
          satellite: satellites.value[indexById.get(entry.id)],
        })),
      }
    }

    return {
      basedOnUsage: false,
      items: SUGGESTED_IDS.filter((id) => indexById.has(id))
        .slice(0, 5)
        .map((id) => ({
          id,
          views: 0,
          seconds: 0,
          score: 0,
          satellite: satellites.value[indexById.get(id)],
        })),
    }
  })

  const hasTrackingHistory = computed(() => mostTracked.value.basedOnUsage)

  /** Acumula el tiempo de observacion del satelite seleccionado. */
  function accumulateWatchTime(deltaSeconds) {
    const id = selectedId.value
    if (!id || isPaused.value) return

    const stats = trackingStats.value
    const entry = stats[id] ?? { views: 0, seconds: 0, last: 0 }
    entry.seconds += deltaSeconds
    entry.last = Date.now()

    // La consulta cuenta solo si se ha mantenido un momento: al recorrer la
    // lista con el teclado se seleccionan decenas de satelites de paso.
    if (!currentViewCounted && (Date.now() - selectionStartedAt) / 1000 >= DWELL_SECONDS) {
      entry.views += 1
      currentViewCounted = true
    }

    stats[id] = entry
    statsDirty = true
  }

  function flushStats() {
    if (!statsDirty) return
    saveStats(trackingStats.value)
    statsDirty = false
  }

  function resetTrackingStats() {
    clearStats()
    trackingStats.value = {}
    statsDirty = false
    currentViewCounted = false
  }

  /** Salud del catalogo: TLEs viejos degradan la precision de SGP4. */
  const catalogHealth = computed(() => {
    // eslint-disable-next-line no-unused-expressions
    uiTick.value
    const now = Date.now()
    let stale = 0
    let ageSum = 0
    let counted = 0
    for (const sat of satellites.value) {
      const age = tleAgeDays(sat, now)
      if (!Number.isFinite(age)) continue
      counted += 1
      ageSum += age
      if (age > 14) stale += 1
    }
    return {
      averageAgeDays: counted > 0 ? ageSum / counted : 0,
      staleCount: stale,
      staleShare: counted > 0 ? stale / counted : 0,
    }
  })

  /* ---------------------------------------------------------------------- */
  /* Carga de catalogo                                                      */
  /* ---------------------------------------------------------------------- */

  function reindex(models) {
    const map = new Map()
    for (let i = 0; i < models.length; i += 1) map.set(models[i].id, i)
    indexById = map
  }

  /** Fusiona registros TLE nuevos en el catalogo y reinicia la propagacion. */
  function mergeRecords(records) {
    const byId = new Map(satellites.value.map((sat) => [sat.id, sat]))

    for (const record of records) {
      const model = buildSatellite(record)
      if (!model) continue
      // Si ya existe, el registro mas reciente gana (epoca mas nueva).
      const existing = byId.get(model.id)
      if (existing && Number.isFinite(existing.epoch) && existing.epoch >= model.epoch) continue
      byId.set(model.id, model)
    }

    const merged = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
    reindex(merged)
    satellites.value = merged
    restartPropagation()
  }

  async function loadCategory(categoryId, { force = false } = {}) {
    if (isDemoMode.value && !force) return
    if (loadingCategoryIds.value.includes(categoryId)) return
    if (!force && loadedCategoryIds.value.includes(categoryId)) return

    loadingCategoryIds.value = [...loadingCategoryIds.value, categoryId]
    try {
      const { records, errors, stale } = await fetchCategory(categoryId, { force })
      mergeRecords(records)
      if (!loadedCategoryIds.value.includes(categoryId)) {
        loadedCategoryIds.value = [...loadedCategoryIds.value, categoryId]
      }
      // "stale" = Celestrak confirmo que no hay datos nuevos y hemos servido la
      // copia local. Es un estado normal, no un error.
      staleCategoryIds.value = stale
        ? [...new Set([...staleCategoryIds.value, categoryId])]
        : staleCategoryIds.value.filter((id) => id !== categoryId)
      lastSyncAt.value = Date.now()
      if (errors.length > 0) {
        loadErrors.value = [
          ...loadErrors.value,
          ...errors.map((e) => ({ categoryId, message: `${e.group}: ${e.message}` })),
        ]
      }
    } catch (error) {
      loadErrors.value = [
        ...loadErrors.value,
        { categoryId, message: error?.message ?? String(error) },
      ]
      throw error
    } finally {
      loadingCategoryIds.value = loadingCategoryIds.value.filter((id) => id !== categoryId)
    }
  }

  /** Activa el catalogo sintetico local (sin red). */
  function enableDemoMode() {
    isDemoMode.value = true
    const records = buildDemoCatalog(new Date())
    const models = records.map(buildSatellite).filter(Boolean)
    reindex(models)
    satellites.value = models
    loadedCategoryIds.value = [...new Set(records.map((r) => r.categoryId))]
    activeCategoryIds.value = loadedCategoryIds.value.slice()
    lastSyncAt.value = Date.now()
    restartPropagation()
  }

  /** Carga inicial: intenta Celestrak y cae a modo demo si no hay nada. */
  async function initialize() {
    isInitializing.value = true
    startClock()

    const targets = activeCategoryIds.value.slice()
    const results = await Promise.allSettled(targets.map((id) => loadCategory(id)))
    const anySucceeded = results.some((r) => r.status === 'fulfilled')

    if (!anySucceeded || satellites.value.length === 0) {
      enableDemoMode()
    }

    isInitializing.value = false
  }

  /**
   * Fuerza una resincronizacion de todas las categorias cargadas.
   *
   * No se borra la cache a proposito: Celestrak responde 403 cuando el conjunto
   * no ha cambiado desde la ultima descarga, y en ese caso la copia cacheada es
   * justamente el dato vigente. Borrarla nos dejaria sin nada.
   */
  async function resync() {
    if (isDemoMode.value) {
      // Reintentamos la conexion real; si vuelve a fallar, seguimos en demo.
      isDemoMode.value = false
      loadErrors.value = []
      const results = await Promise.allSettled(
        activeCategoryIds.value.map((id) => loadCategory(id, { force: true })),
      )
      if (!results.some((r) => r.status === 'fulfilled') || satellites.value.length === 0) {
        enableDemoMode()
      }
      return
    }
    loadErrors.value = []
    const targets = loadedCategoryIds.value.slice()
    await Promise.allSettled(targets.map((id) => loadCategory(id, { force: true })))
  }

  /* ---------------------------------------------------------------------- */
  /* Filtros                                                                */
  /* ---------------------------------------------------------------------- */

  async function toggleCategory(categoryId) {
    const isActive = activeCategoryIds.value.includes(categoryId)
    activeCategoryIds.value = isActive
      ? activeCategoryIds.value.filter((id) => id !== categoryId)
      : [...activeCategoryIds.value, categoryId]

    if (!isActive && !isDemoMode.value && !loadedCategoryIds.value.includes(categoryId)) {
      try {
        await loadCategory(categoryId)
      } catch {
        // El error ya queda registrado en loadErrors y se muestra en la UI.
      }
    }
  }

  function toggleRegime(regime) {
    regimeFilter.value = regimeFilter.value.includes(regime)
      ? regimeFilter.value.filter((r) => r !== regime)
      : [...regimeFilter.value, regime]
  }

  function toggleCountry(country) {
    countryFilter.value = countryFilter.value.includes(country)
      ? countryFilter.value.filter((c) => c !== country)
      : [...countryFilter.value, country]
  }

  function resetFilters() {
    searchQuery.value = ''
    regimeFilter.value = []
    countryFilter.value = []
    sortMode.value = 'relevance'
    activeCategoryIds.value = CATEGORIES.filter((c) => c.defaultOn).map((c) => c.id)
  }

  const hasActiveFilters = computed(
    () =>
      searchQuery.value.trim() !== '' ||
      regimeFilter.value.length > 0 ||
      countryFilter.value.length > 0,
  )

  /* ---------------------------------------------------------------------- */
  /* Seleccion                                                              */
  /* ---------------------------------------------------------------------- */

  function select(id) {
    if (id !== selectedId.value) {
      selectionStartedAt = Date.now()
      currentViewCounted = false
    }
    selectedId.value = id
  }

  function clearSelection() {
    selectedId.value = null
    trackedId.value = null
  }

  function setHovered(id) {
    hoveredId.value = id
  }

  function toggleTracking(id = selectedId.value) {
    trackedId.value = trackedId.value === id ? null : id
  }

  function getById(id) {
    const index = indexById.get(id)
    return index === undefined ? null : satellites.value[index]
  }

  function getByIndex(index) {
    return satellites.value[index] ?? null
  }

  /** Indice O(1) dentro de `satellites`, o -1. Lo usan las capas de Cesium. */
  function indexOf(id) {
    return indexById.get(id) ?? -1
  }

  /* ---------------------------------------------------------------------- */
  /* Reloj y bucle de propagacion                                           */
  /* ---------------------------------------------------------------------- */

  function currentSimulatedTime() {
    return simulatedMs
  }

  function advanceClock() {
    const now = Date.now()
    const elapsed = now - lastWallClockMs
    lastWallClockMs = now
    if (!isPaused.value) simulatedMs += elapsed * timeMultiplier.value
  }

  function resetClock() {
    simulatedMs = Date.now()
    lastWallClockMs = Date.now()
    timeMultiplier.value = 1
    isPaused.value = false
    clockTick.value += 1
  }

  function setTimeMultiplier(value) {
    advanceClock()
    timeMultiplier.value = value
    clockTick.value += 1
  }

  function togglePause() {
    advanceClock()
    isPaused.value = !isPaused.value
    clockTick.value += 1
  }

  function ensureWorker() {
    if (worker) return worker
    worker = new Worker(new URL('../workers/propagator.worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = handleWorkerMessage
    worker.onerror = (event) => {
      loadErrors.value = [
        ...loadErrors.value,
        { categoryId: null, message: `Worker de propagacion: ${event.message}` },
      ]
    }
    return worker
  }

  function handleWorkerMessage(event) {
    const data = event.data
    if (data.type === 'ready') {
      awaitingFrame = false
      requestTick()
      return
    }
    if (data.type !== 'state') return

    const previous = frame.value
    frame.value = {
      pos: data.pos,
      tel: data.tel,
      flags: data.flags,
      time: data.time,
      count: data.count,
    }
    // El frame anterior ya no se lee: sus buffers vuelven al worker.
    recycledFrame = previous.pos ? previous : null

    frameTick.value += 1
    awaitingFrame = false

    ticksThisSecond += 1
    const elapsed = performance.now() - rateWindowStart
    if (elapsed >= 1000) {
      propagationRate.value = Math.round((ticksThisSecond * 1000) / elapsed)
      ticksThisSecond = 0
      rateWindowStart = performance.now()
    }

    tickTimer = setTimeout(requestTick, TICK_INTERVAL_MS)
  }

  function requestTick() {
    if (!worker || awaitingFrame || satellites.value.length === 0) return
    advanceClock()
    awaitingFrame = true

    const recycled = recycledFrame
    recycledFrame = null

    const message = { type: 'tick', time: simulatedMs }
    const transfers = []
    if (recycled) {
      message.pos = recycled.pos
      message.tel = recycled.tel
      message.flags = recycled.flags
      transfers.push(recycled.pos.buffer, recycled.tel.buffer, recycled.flags.buffer)
    }

    worker.postMessage(message, transfers)
  }

  /** Reinicia el worker con el catalogo actual. */
  function restartPropagation() {
    if (tickTimer) clearTimeout(tickTimer)
    tickTimer = null
    recycledFrame = null
    awaitingFrame = true
    frame.value = { pos: null, tel: null, flags: null, time: simulatedMs, count: 0 }

    const instance = ensureWorker()
    instance.postMessage({
      type: 'init',
      records: satellites.value.map((sat) => ({
        id: sat.id,
        line1: sat.line1,
        line2: sat.line2,
      })),
    })
  }

  function startClock() {
    lastWallClockMs = Date.now()
    if (!uiTimer) {
      let ticksSinceFlush = 0
      uiTimer = setInterval(() => {
        uiTick.value += 1
        clockTick.value += 1
        accumulateWatchTime(UI_REFRESH_MS / 1000)
        // Escribir en localStorage dos veces por segundo seria absurdo: se
        // vuelca cada ~15 s y al cerrar la aplicacion.
        ticksSinceFlush += 1
        if (ticksSinceFlush >= 30) {
          flushStats()
          ticksSinceFlush = 0
        }
      }, UI_REFRESH_MS)
    }
  }

  /** Vacia la cache TLE local. Solo para diagnostico desde la vista Network. */
  function purgeCache() {
    clearTleCache()
    staleCategoryIds.value = []
  }

  function dispose() {
    flushStats()
    if (tickTimer) clearTimeout(tickTimer)
    if (uiTimer) clearInterval(uiTimer)
    tickTimer = null
    uiTimer = null
    worker?.terminate()
    worker = null
  }

  return {
    // catalogo
    satellites,
    totalCount,
    activeCategoryIds,
    loadedCategoryIds,
    loadingCategoryIds,
    staleCategoryIds,
    loadErrors,
    isDemoMode,
    isInitializing,
    lastSyncAt,
    // filtros
    searchQuery,
    regimeFilter,
    countryFilter,
    sortMode,
    hasActiveFilters,
    filteredSatellites,
    visibilityMask,
    buildRow,
    // seleccion
    selectedId,
    hoveredId,
    trackedId,
    selectedSatellite,
    hoveredSatellite,
    selectedTelemetry,
    // uso local
    trackingStats,
    mostTracked,
    hasTrackingHistory,
    resetTrackingStats,
    // analitica
    regimeBreakdown,
    countryBreakdown,
    categoryBreakdown,
    catalogHealth,
    // reloj / propagacion
    frame,
    frameTick,
    uiTick,
    clockTick,
    timeMultiplier,
    isPaused,
    propagationRate,
    // acciones
    initialize,
    resync,
    purgeCache,
    loadCategory,
    enableDemoMode,
    toggleCategory,
    toggleRegime,
    toggleCountry,
    resetFilters,
    select,
    clearSelection,
    setHovered,
    toggleTracking,
    getById,
    getByIndex,
    indexOf,
    readTelemetry,
    peekTelemetry,
    readPosition,
    currentSimulatedTime,
    setTimeMultiplier,
    togglePause,
    resetClock,
    dispose,
  }
})
