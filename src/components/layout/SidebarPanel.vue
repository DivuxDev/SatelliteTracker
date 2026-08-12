<script setup>
/**
 * SidebarPanel
 * ---------------------------------------------------------------------------
 * Inspector lateral: buscador, filtros, lista de satelites activos y ficha del
 * seleccionado. Es el punto de entrada a las acciones de detalle y pasadas,
 * que se propagan hacia arriba para que App.vue controle los modales.
 */
import { computed, ref } from 'vue'
import { EllipsisVertical, ListFilter, Search, TriangleAlert, X } from '@lucide/vue'

import { SORT_MODES, useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES } from '@/services/orbitCalculationService'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import SatelliteList from '@/components/satellite/SatelliteList.vue'
import SatelliteCard from '@/components/satellite/SatelliteCard.vue'
import MostTrackedPanel from '@/components/satellite/MostTrackedPanel.vue'

const emit = defineEmits(['open-details', 'open-passes'])

const store = useSatelliteStore()
const showFilters = ref(false)

const regimeOptions = computed(() =>
  store.regimeBreakdown.map((entry) => ({
    value: entry.id,
    label: `${entry.label} — ${ORBIT_REGIMES[entry.id].description}`,
    count: entry.count,
    color: entry.color,
  })),
)

const countryOptions = computed(() =>
  store.countryBreakdown.map((entry) => ({
    value: entry.id,
    label: entry.label,
    count: entry.count,
  })),
)

const activeFilterCount = computed(
  () => store.regimeFilter.length + store.countryFilter.length,
)
</script>

<template>
  <!--
    En movil el inspector ocupa todo el ancho por debajo del visor; a partir de
    lg vuelve a ser la columna lateral de ancho fijo.
  -->
  <!--
    Ancho con `clamp` en una sola declaracion en lugar de encadenar `wide:` y
    `xl:`: al ser `wide` una variante propia, su orden en la cascada frente a los
    breakpoints de serie no esta garantizado y `xl:` acababa perdiendo.
    El resultado: 300 px como minimo, 360 como maximo, y escalado en medio.
  -->
  <aside
    class="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-2 wide:w-[clamp(300px,24vw,360px)] wide:flex-none wide:shrink-0 wide:gap-3 wide:p-3"
  >
    <MostTrackedPanel />
    <!--
      Panel principal: buscador + lista.
      `overflow-hidden` es necesario: cuando la barra lateral es baja (movil en
      horizontal) este panel se comprime, y sin recorte su contenido se salia y
      se pintaba por encima de la ficha del satelite.
    -->
    <div class="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Live Sat Tracking</h2>
          <p class="mt-0.5 text-[10px] text-ink-600">
            {{ store.filteredSatellites.length.toLocaleString('es-ES') }} de
            {{ store.totalCount.toLocaleString('es-ES') }} objetos ·
            {{ store.isDemoMode ? 'datos sinteticos' : 'TLE Celestrak' }}
          </p>
        </div>
        <button
          type="button"
          class="text-ink-600 transition-colors hover:text-ink-100"
          aria-label="Opciones del panel"
        >
          <EllipsisVertical :size="15" />
        </button>
      </div>

      <!-- Aviso de modo demo -->
      <div
        v-if="store.isDemoMode"
        class="mx-3 mt-3 flex gap-2 rounded-md border border-warn-500/30 bg-warn-500/10 px-2.5 py-2"
      >
        <TriangleAlert :size="13" class="mt-px shrink-0 text-warn-500" />
        <p class="text-[10px] leading-relaxed text-warn-500">
          <strong class="font-semibold">Modo demo.</strong> No se pudo contactar con Celestrak, asi
          que se muestra una constelacion sintetica generada localmente. No son efemerides reales.
        </p>
      </div>

      <!-- Buscador -->
      <div class="flex items-center gap-2 px-3 py-3">
        <BaseInput
          v-model="store.searchQuery"
          placeholder="Buscar por nombre o NORAD ID"
        >
          <template #icon><Search :size="13" /></template>
        </BaseInput>
        <button
          type="button"
          class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors"
          :class="
            showFilters || activeFilterCount > 0
              ? 'border-accent-500/60 bg-accent-500/10 text-accent-400'
              : 'border-grid-700 bg-space-850 text-ink-500 hover:text-ink-300'
          "
          aria-label="Filtros"
          @click="showFilters = !showFilters"
        >
          <ListFilter :size="14" />
          <span
            v-if="activeFilterCount > 0"
            class="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-semibold text-white"
          >
            {{ activeFilterCount }}
          </span>
        </button>
      </div>

      <!-- Filtros -->
      <div v-if="showFilters" class="space-y-3 border-t border-grid-800 px-3 py-3">
        <div>
          <span class="telemetry-label mb-1.5 block">Categoria</span>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="category in store.categoryBreakdown"
              :key="category.id"
              type="button"
              class="flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] transition-colors"
              :class="
                category.active
                  ? 'border-transparent text-ink-100'
                  : 'border-grid-700 text-ink-500 hover:text-ink-300'
              "
              :style="
                category.active
                  ? { backgroundColor: `${category.color}22`, borderColor: `${category.color}66` }
                  : {}
              "
              :title="
                category.heavy && !category.loaded
                  ? `${category.label} — conjunto grande, la descarga puede tardar`
                  : category.label
              "
              @click="store.toggleCategory(category.id)"
            >
              <span
                v-if="category.loading"
                class="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent"
              />
              <span
                v-else
                class="status-dot"
                :style="{ backgroundColor: category.color, color: category.color }"
              />
              {{ category.short }}
              <span v-if="category.count > 0" class="font-mono text-ink-600">
                {{ category.count }}
              </span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-2">
          <BaseSelect
            v-model="store.regimeFilter"
            :options="regimeOptions"
            label="Regimen orbital"
            placeholder="Todos los regimenes"
          />
          <BaseSelect
            v-model="store.countryFilter"
            :options="countryOptions"
            label="Pais / operador (inferido del nombre)"
            placeholder="Todos los operadores"
          />
        </div>

        <button
          v-if="store.hasActiveFilters"
          type="button"
          class="flex items-center gap-1 text-[10px] text-ink-500 transition-colors hover:text-ink-100"
          @click="store.resetFilters()"
        >
          <X :size="11" />
          Limpiar todos los filtros
        </button>
      </div>

      <!-- Lista -->
      <div class="flex min-h-0 flex-1 flex-col border-t border-grid-800">
        <div class="px-3 pb-2 pt-2.5">
          <h3 class="panel-title">Active Satellites</h3>
          <!-- El orden va en su propia fila: en un panel de 300 px no cabe
               junto al titulo sin partir las etiquetas. -->
          <div class="mt-1.5 flex items-center gap-0.5">
            <button
              v-for="mode in SORT_MODES"
              :key="mode.id"
              type="button"
              class="flex-1 rounded px-1 py-1 text-[10px] transition-colors"
              :class="
                store.sortMode === mode.id
                  ? 'bg-accent-500/15 text-accent-400'
                  : 'text-ink-600 hover:bg-space-750 hover:text-ink-300'
              "
              :title="`Ordenar por ${mode.label.toLowerCase()}`"
              @click="store.sortMode = mode.id"
            >
              {{ mode.label }}
            </button>
          </div>
        </div>
        <SatelliteList />
      </div>
    </div>

    <!-- Ficha de detalle -->
    <SatelliteCard @open-details="emit('open-details')" @open-passes="emit('open-passes')" />
  </aside>
</template>
