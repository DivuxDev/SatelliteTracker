<script setup>
/**
 * MostTrackedPanel
 * ---------------------------------------------------------------------------
 * Los cinco satelites mas consultados, al estilo del panel "Most Tracked" de
 * Flightradar24.
 *
 * DIFERENCIA IMPORTANTE CON FLIGHTRADAR24: alli el ranking sale de agregar en
 * servidor la actividad de todos los usuarios. Aqui no hay backend ni mas
 * usuarios que quien abre la aplicacion, asi que lo que se mide es la actividad
 * LOCAL de este navegador. La cabecera lo dice explicitamente para que nadie
 * interprete la lista como una medida de popularidad global.
 *
 * Mientras no hay historial propio se muestran objetos sugeridos, etiquetados
 * como tales y nunca con cifras de uso inventadas.
 */
import { computed, ref } from 'vue'
import { ChevronDown, Eye, Trash2, TrendingUp } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES } from '@/services/orbitCalculationService'
import { formatWatchTime } from '@/services/trackingStatsService'

const store = useSatelliteStore()

// Plegado por defecto cuando el layout esta apilado: en movil el espacio
// vertical es el recurso escaso y la lista principal debe mandar.
const collapsed = ref(window.matchMedia('(max-width: 1023px)').matches)

const data = computed(() => store.mostTracked)

function regimeColor(regime) {
  return ORBIT_REGIMES[regime]?.color ?? '#6b7a92'
}
</script>

<template>
  <section v-if="data.items.length > 0" class="panel shrink-0 wide:hud-panel">
    <div class="panel-header wide:border-b-[rgba(127,181,242,.16)] wide:px-3.5 wide:py-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <TrendingUp :size="13" class="shrink-0 text-accent-400" />
        <span class="min-w-0">
          <span class="panel-title block">Mas seguidos</span>
          <span class="mt-0.5 block text-[10px] leading-tight text-ink-600 wide:text-t1 wide:text-hud-ink-500">
            {{
              data.basedOnUsage
                ? 'Segun tu actividad en este navegador'
                : 'Sugerencias: aun no hay historial propio'
            }}
          </span>
        </span>
        <ChevronDown
          :size="14"
          class="ml-auto shrink-0 text-ink-600 transition-transform"
          :class="!collapsed && 'rotate-180'"
        />
      </button>

      <button
        v-if="data.basedOnUsage && !collapsed"
        type="button"
        class="shrink-0 text-ink-600 transition-colors hover:text-alert-500"
        title="Borrar el historial de consultas de este navegador"
        aria-label="Borrar historial"
        @click="store.resetTrackingStats()"
      >
        <Trash2 :size="12" />
      </button>
    </div>

    <!-- Filas de una sola linea: este panel convive con la lista principal y la
         ficha de detalle, asi que no puede comerse el alto de la barra lateral. -->
    <ol v-if="!collapsed" class="p-1 wide:p-1.5">
      <li v-for="(item, index) in data.items" :key="item.id">
        <button
          type="button"
          class="flex h-7 w-full items-center gap-2 rounded px-2 text-left transition-colors wide:h-8 wide:rounded-md wide:px-2.5"
          :class="store.selectedId === item.id ? 'bg-accent-500/10 wide:bg-[rgba(47,127,224,.16)]' : 'hover:bg-space-750 wide:hover:bg-[rgba(47,127,224,.08)]'"
          :title="`${item.satellite.name} · NORAD ${item.id} · ${item.satellite.countryLabel}`"
          @click="store.select(item.id)"
          @mouseenter="store.setHovered(item.id)"
          @mouseleave="store.setHovered(null)"
        >
          <span
            class="w-3 shrink-0 text-center font-mono text-[11px] wide:text-t1"
            :class="index === 0 ? 'text-accent-400' : 'text-ink-600 wide:text-hud-ink-600'"
          >
            {{ index + 1 }}
          </span>

          <span
            class="h-2 w-2 shrink-0 rounded-sm wide:h-1.5 wide:w-1.5 wide:rounded-full"
            :style="{
              backgroundColor: regimeColor(item.satellite.regime),
              boxShadow: `0 0 8px ${regimeColor(item.satellite.regime)}`,
            }"
            :title="item.satellite.regime"
          />

          <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink-100">
            {{ item.satellite.name }}
          </span>

          <span
            v-if="data.basedOnUsage"
            class="flex shrink-0 items-center gap-1 font-mono text-[10px] text-ink-500"
            :title="`${item.views} consultas · ${formatWatchTime(item.seconds)} en pantalla`"
          >
            <Eye :size="10" class="text-ink-600" />
            {{ item.views }}
            <span class="text-ink-600">· {{ formatWatchTime(item.seconds) }}</span>
          </span>
          <span v-else class="shrink-0 font-mono text-[10px] text-ink-600">
            {{ item.id }}
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>
