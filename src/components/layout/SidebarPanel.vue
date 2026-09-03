<script setup>
/**
 * SidebarPanel
 * ---------------------------------------------------------------------------
 * Inspector lateral: buscador, filtros, lista de satelites activos y ficha del
 * seleccionado. Es el punto de entrada a las acciones de detalle y pasadas,
 * que se propagan hacia arriba para que App.vue controle los modales.
 */
import { computed, ref } from 'vue'
import { ListFilter, MoonStar, Search, TriangleAlert, X } from '@lucide/vue'

import { SORT_MODES, useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES } from '@/services/orbitCalculationService'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import SatelliteList from '@/components/satellite/SatelliteList.vue'
import SatelliteCard from '@/components/satellite/SatelliteCard.vue'
import MostTrackedPanel from '@/components/satellite/MostTrackedPanel.vue'

const emit = defineEmits(['open-details', 'open-passes', 'open-cosmic-events'])

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
    Flota siempre sobre el globo, en posicion absoluta, en ambos layouts —solo
    cambian las coordenadas—. En movil ocupa el ancho completo con 10px de
    margen, arrancando en top:372 (justo donde termina el tercio superior que
    ocupa el globo) hasta bottom:12. En escritorio es la columna de 352px de
    ancho en right:20, arrancando bajo la barra superior (top:72).
  -->
  <aside
    class="absolute inset-x-[10px] top-[372px] bottom-3 z-10 flex min-h-0 flex-col gap-2 overflow-hidden wide:inset-x-auto wide:right-5 wide:top-[72px] wide:bottom-4 wide:w-[352px] wide:gap-3"
  >
    <!--
      "Mas seguidos" desaparece en movil. Ahi el alto es el recurso escaso: con
      el visor ocupando 44vh a la lista le quedaban cinco filas, y este panel
      —que en movil ya arrancaba plegado— se llevaba una de ellas solo con su
      cabecera.
    -->
    <MostTrackedPanel class="stacked:hidden" />
    <!--
      Panel principal: buscador + lista.
      `overflow-hidden` es necesario: cuando la barra lateral es baja (movil en
      horizontal) este panel se comprime, y sin recorte su contenido se salia y
      se pintaba por encima de la ficha del satelite.
    -->
    <div class="panel hud-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="panel-header border-b-[rgba(127,181,242,.16)] wide:px-3.5 wide:py-3">
        <div class="min-w-0">
          <h2 class="panel-title">Seguimiento en vivo</h2>
          <!--
            En movil solo el recuento: la procedencia de los datos ya la dice el
            indicador de la cabecera, y aqui partia el rotulo en dos lineas.
          -->
          <p class="mt-0.5 truncate text-t1 text-hud-ink-500">
            {{ store.filteredSatellites.length.toLocaleString('es-ES') }} de
            {{ store.totalCount.toLocaleString('es-ES') }} objetos<span class="stacked:hidden">
              · {{ store.isDemoMode ? 'datos sinteticos' : 'TLE Celestrak' }}</span
            >
          </p>
        </div>
        <!-- Recuento compacto: solo escritorio, a la derecha de la cabecera -->
        <span class="hidden shrink-0 font-mono text-t1 tabular-nums text-hud-ink-500 wide:inline">
          {{ store.filteredSatellites.length.toLocaleString('es-ES') }}/{{
            store.totalCount.toLocaleString('es-ES')
          }}
        </span>
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
      <div class="flex items-center gap-2 px-3 py-3 wide:px-3.5">
        <BaseInput
          v-model="store.searchQuery"
          placeholder="Buscar por nombre o NORAD ID"
        >
          <template #icon><Search :size="13" /></template>
        </BaseInput>
        <button
          type="button"
          class="relative flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border transition-colors wide:h-[34px] wide:w-auto wide:px-3"
          :class="
            showFilters || activeFilterCount > 0
              ? 'border-accent-500/60 bg-accent-500/10 text-accent-400'
              : 'border-accent-300/22 bg-[rgba(5,10,20,.5)] text-hud-ink-500 hover:text-hud-ink-300'
          "
          aria-label="Filtros"
          @click="showFilters = !showFilters"
        >
          <ListFilter :size="14" />
          <span class="hidden text-t1 font-semibold tracking-[0.08em] uppercase wide:inline">
            Filtros
          </span>
          <span
            v-if="activeFilterCount > 0"
            class="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent-400 px-1 text-[9px] font-bold text-[#05080e] wide:static wide:ml-0.5 wide:h-4 wide:min-w-4 wide:px-1.5 wide:text-[10px]"
          >
            {{ activeFilterCount }}
          </span>
        </button>
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent-300/22 bg-[rgba(5,10,20,.5)] text-hud-ink-500 transition-colors hover:text-hud-ink-300 wide:h-[34px] wide:w-[34px]"
          aria-label="Eventos cosmicos"
          title="Eventos cosmicos: lluvias de meteoros y satelites en reentrada"
          @click="emit('open-cosmic-events')"
        >
          <MoonStar :size="14" />
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

        <!--
          El orden vive con los filtros, no sobre la lista. Son la misma
          pregunta —"como quiero ver el catalogo"— y sobre la lista ocupaba una
          fila permanente que en movil valia dos satelites visibles.
        -->
        <div>
          <span class="telemetry-label mb-1.5 block">Orden</span>
          <div class="flex items-center gap-0.5">
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

      <!-- Lista: sin cabecera propia. El titulo del panel ya dice que es y
           cuantos objetos hay, y el orden se ajusta desde los filtros. -->
      <div class="flex min-h-0 flex-1 flex-col border-t border-accent-300/10">
        <SatelliteList />
      </div>
    </div>

    <!-- Ficha de detalle -->
    <SatelliteCard @open-details="emit('open-details')" @open-passes="emit('open-passes')" />
  </aside>
</template>
