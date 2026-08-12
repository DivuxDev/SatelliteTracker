<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Activity, Orbit, RefreshCw, Wifi, WifiOff } from '@lucide/vue'
import { useSatelliteStore } from '@/stores/satelliteStore'

const emit = defineEmits(['open-diagnostics'])

const store = useSatelliteStore()

/* Reloj UTC en vivo: independiente del reloj de simulacion del store. */
const utcNow = ref(new Date())
let clockInterval = null
onMounted(() => {
  clockInterval = setInterval(() => {
    utcNow.value = new Date()
  }, 1000)
})
onBeforeUnmount(() => clearInterval(clockInterval))

const utcTime = computed(() =>
  utcNow.value.toISOString().slice(11, 19),
)
const utcDate = computed(() => utcNow.value.toISOString().slice(0, 10))

/* Solo se nombran los estados que piden algo de quien mira. Que todo vaya bien
 * es lo esperable y ya lo dice el verde del icono: rotularlo "LIVE" gasta sitio
 * en decir que no pasa nada. */
const syncLabel = computed(() => {
  if (store.isInitializing) return 'SINCRONIZANDO'
  if (store.isDemoMode) return 'DATOS SINTETICOS'
  if (store.loadErrors.length > 0) return 'DEGRADADO'
  return null
})

const syncColor = computed(() => {
  if (store.isDemoMode) return '#f59e0b'
  if (store.isInitializing) return '#38bdf8'
  if (store.loadErrors.length > 0) return '#ef4444'
  return '#22c55e'
})

const isSyncing = ref(false)
async function resync() {
  isSyncing.value = true
  try {
    await store.resync()
  } finally {
    isSyncing.value = false
  }
}
</script>

<template>
  <header
    class="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-grid-700 bg-space-850 px-2 sm:gap-4 sm:px-4 lg:gap-6"
  >
    <!-- Identidad: en movil solo el distintivo, el titulo ocuparia toda la barra -->
    <div class="flex shrink-0 items-center gap-2.5">
      <span
        class="flex h-8 w-8 items-center justify-center rounded-md bg-accent-600/15 text-accent-400 ring-1 ring-accent-500/30"
      >
        <Orbit :size="18" :stroke-width="1.75" />
      </span>
      <h1
        class="hidden text-[13px] font-semibold tracking-[0.14em] text-ink-100 md:block xl:hidden"
      >
        ORBIT TRACKER
      </h1>
      <h1 class="hidden text-[13px] font-semibold tracking-[0.14em] text-ink-100 xl:block">
        SATELLITE ORBIT TRACKER
      </h1>
    </div>

    <div class="min-w-0 flex-1" />

    <!-- Reloj UTC -->
    <div class="hidden items-baseline gap-2 lg:flex">
      <span class="font-mono text-sm tabular-nums text-ink-100">{{ utcTime }}</span>
      <span class="telemetry-label">UTC · {{ utcDate }}</span>
    </div>

    <!-- Estado de sincronizacion -->
    <button
      type="button"
      class="flex shrink-0 items-center gap-1.5 rounded-md border border-grid-700 bg-space-800 px-2 py-1.5 transition-colors hover:border-grid-600 sm:gap-2 sm:px-2.5"
      :title="
        store.isDemoMode
          ? 'Datos sinteticos locales. Pulsa para reintentar la conexion con Celestrak.'
          : 'Resincronizar TLE con Celestrak'
      "
      @click="resync"
    >
      <component
        :is="store.isDemoMode ? WifiOff : Wifi"
        :size="13"
        :style="{ color: syncColor }"
      />
      <span
        v-if="syncLabel"
        class="hidden text-[10px] font-semibold tracking-[0.1em] sm:inline"
        :style="{ color: syncColor }"
      >
        {{ syncLabel }}
      </span>
      <RefreshCw
        :size="11"
        class="text-ink-500"
        :class="(isSyncing || store.isInitializing) && 'animate-spin'"
      />
    </button>

    <!--
      Diagnostico: unica via de acceso al estado de las fuentes y del motor, asi
      que no se oculta en movil. El punto rojo avisa de incidencias sin obligar
      a abrirlo.
    -->
    <button
      type="button"
      class="relative shrink-0 text-ink-500 transition-colors hover:text-ink-100"
      aria-label="Diagnostico de datos"
      title="Diagnostico: fuentes de datos, motor de propagacion e incidencias"
      @click="emit('open-diagnostics')"
    >
      <Activity :size="17" :stroke-width="1.75" />
      <span
        v-if="store.loadErrors.length > 0"
        class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-alert-500 ring-2 ring-space-850"
      />
    </button>
  </header>
</template>
