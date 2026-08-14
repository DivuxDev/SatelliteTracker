<script setup>
/**
 * SatelliteList
 * ---------------------------------------------------------------------------
 * Tabla interactiva de satelites activos. Al pulsar una fila el visor 3D vuela
 * hasta el objeto (lo dispara el watcher de `selectedId` en GlobeViewer).
 *
 * La lista esta VIRTUALIZADA: solo existen en el DOM las filas visibles mas un
 * margen. Antes se recortaba a las primeras 250 filas, y eso escondia objetos
 * tan evidentes como la ISS, que con 487 satelites cargados caia en la posicion
 * 306. Ahora el catalogo entero es navegable aunque tenga decenas de miles de
 * objetos, y el coste de render no depende de su tamano.
 *
 * Al seleccionar un satelite desde el globo, la lista se desplaza sola hasta su
 * fila: si no, seleccionar algo en 3D no daba ninguna pista de donde estaba.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Satellite } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES } from '@/services/orbitCalculationService'

const store = useSatelliteStore()

/** Alto fijo de fila, en px. La virtualizacion depende de que sea constante. */
const ROW_HEIGHT = 48
/** Filas extra renderizadas por encima y por debajo, para que el scroll no parpadee. */
const OVERSCAN = 6

const viewport = ref(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)

const total = computed(() => store.filteredSatellites.length)

const firstIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN),
)
const lastIndex = computed(() =>
  Math.min(total.value, Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN),
)

/**
 * Filas realmente renderizadas. `store.buildRow` resuelve la telemetria, que se
 * refresca a 2 Hz; con solo ~20 filas en pantalla el coste es irrelevante.
 */
const visibleRows = computed(() => {
  const source = store.filteredSatellites
  const rows = []
  for (let i = firstIndex.value; i < lastIndex.value; i += 1) {
    const sat = source[i]
    if (sat) rows.push({ index: i, ...store.buildRow(sat) })
  }
  return rows
})

function onScroll(event) {
  scrollTop.value = event.target.scrollTop
}

/** El regimen se identifica con un cuadro de color + texto en tinta neutra. */
function regimeColor(regime) {
  return ORBIT_REGIMES[regime]?.color ?? '#6b7a92'
}

/* -------------------------------------------------------------------------- */
/* Medida del viewport                                                        */
/* -------------------------------------------------------------------------- */

let resizeObserver = null

onMounted(() => {
  if (!viewport.value) return
  viewportHeight.value = viewport.value.clientHeight
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportHeight.value = entry.contentRect.height
  })
  resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

/* -------------------------------------------------------------------------- */
/* Seguimiento de la seleccion                                                */
/* -------------------------------------------------------------------------- */

/** Desplaza la lista hasta dejar la fila indicada a la vista. */
function scrollToIndex(index) {
  const element = viewport.value
  if (!element || index < 0) return
  const target = index * ROW_HEIGHT
  const bottom = target + ROW_HEIGHT
  if (target < element.scrollTop) {
    element.scrollTop = target
  } else if (bottom > element.scrollTop + element.clientHeight) {
    // Lo dejamos centrado: aparecer pegado al borde inferior se lee peor.
    element.scrollTop = target - element.clientHeight / 2 + ROW_HEIGHT
  }
}

watch(
  () => store.selectedId,
  async (id) => {
    if (!id) return
    await nextTick()
    scrollToIndex(store.filteredSatellites.findIndex((sat) => sat.id === id))
  },
)

// Al cambiar los filtros el contenido se reordena: volvemos arriba para no
// quedarnos mirando un hueco vacio a mitad del scroll.
watch(
  () => [store.searchQuery, store.sortMode, store.activeCategoryIds, store.regimeFilter, store.countryFilter],
  () => {
    if (viewport.value) viewport.value.scrollTop = 0
    scrollTop.value = 0
  },
  { deep: true },
)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!--
      Cabecera de columnas. En pantallas estrechas se sacrifica "Estado": el
      nombre es lo unico que permite identificar un satelite, y con cuatro
      columnas quedaba reducido a 84 px.
    -->
    <div
      class="grid shrink-0 grid-cols-[1fr_46px_58px] items-center gap-2 border-b border-grid-800 px-3 pb-2 pt-1 sm:grid-cols-[1fr_50px_46px_58px]"
    >
      <span class="telemetry-label">Nombre</span>
      <span class="telemetry-label hidden sm:block">Estado</span>
      <span class="telemetry-label">Orbita</span>
      <span class="telemetry-label text-right">Velocidad</span>
    </div>

    <!-- Ventana virtualizada -->
    <div ref="viewport" class="min-h-0 flex-1 overflow-y-auto" @scroll.passive="onScroll">
      <!-- Espaciador con el alto total real, para que la barra de scroll sea fiel -->
      <div class="relative w-full" :style="{ height: `${total * ROW_HEIGHT}px` }">
        <button
          v-for="row in visibleRows"
          :key="row.id"
          type="button"
          class="group absolute inset-x-0 grid grid-cols-[1fr_46px_58px] items-center gap-2 border-b border-grid-800/60 px-3 text-left transition-colors sm:grid-cols-[1fr_50px_46px_58px]"
          :class="store.selectedId === row.id ? 'bg-accent-500/10' : 'hover:bg-space-750'"
          :style="{ height: `${ROW_HEIGHT}px`, transform: `translateY(${row.index * ROW_HEIGHT}px)` }"
          @click="store.select(row.id)"
          @mouseenter="store.setHovered(row.id)"
          @mouseleave="store.setHovered(null)"
        >
          <!-- Marcador de seleccion -->
          <span
            v-if="store.selectedId === row.id"
            class="absolute inset-y-0 left-0 w-0.5 bg-accent-500"
          />

          <span class="min-w-0">
            <span class="block truncate text-xs font-medium text-ink-100">{{ row.name }}</span>
            <span class="block truncate font-mono text-[10px] text-ink-600">
              {{ row.id }} · {{ row.countryLabel }}
            </span>
          </span>

          <span class="hidden items-center gap-1.5 sm:flex">
            <span
              class="status-dot"
              :style="{
                backgroundColor: row.healthy ? '#22c55e' : '#6b7a92',
                color: row.healthy ? '#22c55e' : '#6b7a92',
              }"
            />
            <span class="text-[10px]" :class="row.healthy ? 'text-signal-500' : 'text-ink-600'">
              {{ row.healthy ? 'Active' : 'Stale' }}
            </span>
          </span>

          <span class="flex items-center gap-1.5">
            <span
              class="h-2 w-2 shrink-0 rounded-sm"
              :style="{ backgroundColor: regimeColor(row.regime) }"
            />
            <span class="font-mono text-[11px] text-ink-300">{{ row.regime }}</span>
          </span>

          <span class="flex items-center justify-end gap-1.5">
            <span class="font-mono text-[11px] tabular-nums text-ink-300">
              {{ row.speedKmS.toFixed(1) }}
            </span>
            <!-- Icono decorativo: en movil compite por ancho con el nombre. -->
            <Satellite
              :size="12"
              class="hidden shrink-0 text-ink-600 transition-colors group-hover:text-accent-400 sm:block"
            />
          </span>
        </button>
      </div>

      <!-- Vacio -->
      <div
        v-if="total === 0"
        class="flex flex-col items-center gap-2 px-4 py-10 text-center"
      >
        <Satellite :size="20" class="text-ink-600" />
        <p class="text-xs text-ink-500">Ningun satelite coincide con los filtros</p>
        <button
          v-if="store.hasActiveFilters"
          type="button"
          class="text-[11px] text-accent-400 underline-offset-2 hover:underline"
          @click="store.resetFilters()"
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  </div>
</template>
