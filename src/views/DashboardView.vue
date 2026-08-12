<script setup>
/**
 * DashboardView
 * ---------------------------------------------------------------------------
 * Vista principal: visor 3D a la izquierda e inspector lateral a la derecha.
 * Aloja tambien el control del reloj de simulacion, que solo tiene sentido
 * junto a la visualizacion.
 */
import { computed } from 'vue'
import { Pause, Play, RotateCcw } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import GlobeViewer from '@/components/cesium/GlobeViewer.vue'
import SidebarPanel from '@/components/layout/SidebarPanel.vue'

const emit = defineEmits(['open-details', 'open-passes'])

const store = useSatelliteStore()

const SPEEDS = [1, 10, 60, 300]

/** Desfase del reloj simulado respecto al real, en segundos. */
const clockDrift = computed(() => {
  // eslint-disable-next-line no-unused-expressions -- refresco a 2 Hz
  store.clockTick
  return (store.currentSimulatedTime() - Date.now()) / 1000
})

const simulatedLabel = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  store.clockTick
  return new Date(store.currentSimulatedTime()).toISOString().slice(11, 19)
})
</script>

<template>
  <!--
    Apilado en movil (visor arriba, inspector debajo) y en dos columnas cuando
    hay sitio. La variante `wide` cubre tambien el movil en horizontal, donde
    sobra ancho pero falta alto.
  -->
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden wide:flex-row">
    <!-- Visor 3D -->
    <div
      class="h-[44vh] min-h-[220px] shrink-0 p-2 wide:h-auto wide:min-h-0 wide:flex-1 wide:p-3 wide:pr-0"
    >
      <div class="panel flex h-full flex-col overflow-hidden">
        <div class="panel-header gap-2">
          <h2 class="panel-title shrink-0">Global Orbit Visualization</h2>

          <!-- Reloj de simulacion -->
          <div class="flex min-w-0 items-center gap-2">
            <span class="hidden font-mono text-[11px] tabular-nums text-ink-300 sm:inline">
              {{ simulatedLabel }}
            </span>
            <span
              v-if="Math.abs(clockDrift) > 2"
              class="hidden rounded bg-warn-500/15 px-1.5 py-px font-mono text-[9px] text-warn-500 sm:inline"
              title="El reloj de simulacion se ha separado del tiempo real"
            >
              {{ clockDrift > 0 ? '+' : '' }}{{ (clockDrift / 60).toFixed(1) }} min
            </span>

            <div class="flex items-center gap-px rounded-md border border-grid-700 p-0.5">
              <button
                type="button"
                class="flex h-5 w-5 items-center justify-center rounded text-ink-500 transition-colors hover:text-ink-100"
                :aria-label="store.isPaused ? 'Reanudar' : 'Pausar'"
                @click="store.togglePause()"
              >
                <component :is="store.isPaused ? Play : Pause" :size="11" />
              </button>
              <button
                v-for="(speed, index) in SPEEDS"
                :key="speed"
                type="button"
                class="rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors"
                :class="[
                  store.timeMultiplier === speed
                    ? 'bg-accent-500/15 text-accent-400'
                    : 'text-ink-600 hover:text-ink-300',
                  // En movil solo caben los dos primeros multiplicadores, salvo
                  // que el activo sea uno de los rapidos: entonces hay que verlo.
                  index >= 2 && store.timeMultiplier !== speed ? 'hidden sm:block' : '',
                ]"
                @click="store.setTimeMultiplier(speed)"
              >
                {{ speed }}x
              </button>
              <button
                type="button"
                class="flex h-5 w-5 items-center justify-center rounded text-ink-500 transition-colors hover:text-ink-100"
                aria-label="Volver al tiempo real"
                @click="store.resetClock()"
              >
                <RotateCcw :size="11" />
              </button>
            </div>
          </div>
        </div>

        <div class="min-h-0 flex-1">
          <GlobeViewer />
        </div>
      </div>
    </div>

    <!-- Inspector lateral -->
    <SidebarPanel
      @open-details="emit('open-details')"
      @open-passes="emit('open-passes')"
    />
  </div>
</template>
