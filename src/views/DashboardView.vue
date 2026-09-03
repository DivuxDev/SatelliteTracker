<script setup>
/**
 * DashboardView
 * ---------------------------------------------------------------------------
 * Vista principal. El globo es siempre el lienzo completo de la ventana; todo
 * lo demas —controles del visor, inspector— flota encima en posicion
 * absoluta, siguiendo la direccion «HUD translucido». Movil (`stacked`) y
 * escritorio (`wide`) comparten esta arquitectura y solo difieren en las
 * coordenadas y el tamano de cada chapa, tal como describe el handoff de
 * diseno para las pantallas 1 y 2.
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
    En ambos layouts el globo ocupa todo el area disponible y el resto flota
    encima. La variante `wide` cubre tambien el movil en horizontal, donde
    sobra ancho pero falta alto.
  -->
  <div class="relative min-h-0 flex-1 overflow-hidden">
    <!-- Visor 3D: a sangre siempre, sin panel ni cabecera propia. -->
    <div class="absolute inset-0">
      <GlobeViewer />
    </div>

    <!--
      Controles del visor — chapa flotante con el reloj de simulacion, pausa y
      multiplicadores. En movil va compacta bajo la barra superior
      (top:64,left:10); en escritorio es la chapa "VISOR ORBITAL" completa en
      top:72,left:20.
    -->
    <div
      class="absolute left-[10px] top-16 z-10 flex items-center gap-2 hud-chip px-2.5 py-1.5 wide:left-5 wide:top-[72px] wide:gap-3 wide:px-3.5 wide:py-[9px]"
    >
      <span class="hidden text-t1 font-semibold tracking-[0.12em] uppercase text-hud-ink-accent wide:inline">
        Visor orbital
      </span>
      <span class="font-mono text-t2 font-semibold tabular-nums text-hud-ink-100 wide:text-t3">
        {{ simulatedLabel }}
      </span>
      <span
        v-if="Math.abs(clockDrift) > 2"
        class="hidden rounded bg-warn-500/15 px-1.5 py-px font-mono text-t1 text-warn-500 wide:inline"
        title="El reloj de simulacion se ha separado del tiempo real"
      >
        {{ clockDrift > 0 ? '+' : '' }}{{ (clockDrift / 60).toFixed(1) }} min
      </span>

      <div class="hidden h-4 w-px bg-accent-300/16 wide:block" />

      <button
        type="button"
        class="flex h-5 w-5 items-center justify-center rounded-full text-hud-ink-500 transition-colors hover:text-hud-ink-100 wide:h-6 wide:w-6"
        :aria-label="store.isPaused ? 'Reanudar' : 'Pausar'"
        @click="store.togglePause()"
      >
        <component :is="store.isPaused ? Play : Pause" :size="11" class="wide:hidden" />
        <component :is="store.isPaused ? Play : Pause" :size="12" class="hidden wide:block" />
      </button>

      <div class="flex items-center gap-0.5">
        <button
          v-for="(speed, index) in SPEEDS"
          :key="speed"
          type="button"
          class="rounded-full px-1.5 py-0.5 font-mono text-t1 tabular-nums transition-colors wide:px-2 wide:py-1"
          :class="[
            store.timeMultiplier === speed
              ? 'bg-accent-400 text-[#05080e] shadow-[0_0_14px_rgba(95,168,240,.5)]'
              : 'text-hud-ink-500 hover:text-hud-ink-300',
            // En movil solo caben los dos primeros multiplicadores, salvo que
            // el activo sea uno de los rapidos: entonces hay que verlo.
            index >= 2 && store.timeMultiplier !== speed ? 'hidden wide:block' : '',
          ]"
          @click="store.setTimeMultiplier(speed)"
        >
          {{ speed }}×
        </button>
      </div>

      <!-- Volver a tiempo real: icono en movil (ahorra sitio), texto en escritorio. -->
      <button
        type="button"
        class="flex h-5 w-5 items-center justify-center rounded-full text-hud-ink-500 transition-colors hover:text-hud-ink-100 wide:hidden"
        aria-label="Volver al tiempo real"
        title="Volver al tiempo real"
        @click="store.resetClock()"
      >
        <RotateCcw :size="11" />
      </button>
      <button
        type="button"
        class="hidden text-t1 font-semibold tracking-[0.06em] uppercase text-accent-400 transition-colors hover:text-accent-300 wide:inline"
        title="Volver al tiempo real"
        @click="store.resetClock()"
      >
        Tiempo real
      </button>
    </div>

    <!-- Inspector -->
    <SidebarPanel
      @open-details="emit('open-details')"
      @open-passes="emit('open-passes')"
    />
  </div>
</template>
