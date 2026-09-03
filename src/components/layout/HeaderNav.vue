<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Activity, CircleQuestionMark, RefreshCw, Wifi, WifiOff } from '@lucide/vue'
import { useSatelliteStore } from '@/stores/satelliteStore'

const emit = defineEmits(['open-diagnostics', 'open-help'])

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
    class="absolute inset-x-0 top-0 z-30 flex h-14 shrink-0 items-center gap-2 hud-topbar px-3 sm:gap-4 sm:px-4 lg:gap-6 wide:px-5"
  >
    <!-- Identidad: en movil solo el distintivo, el titulo ocuparia toda la barra -->
    <div class="flex shrink-0 items-center gap-2.5">
      <!--
        El mismo SVG que el favicon, servido desde public/: un solo fichero como
        origen de la marca, en la pestana y en la barra. Trae su propio fondo
        redondeado, asi que no lleva la caja con anillo de acento que llevaba el
        icono generico anterior. En el HUD lleva ademas un anillo tenue para
        separarse del globo que se ve tras la barra.
      -->
      <img
        src="/favicon-32.svg"
        alt="Satellite Orbit Tracker"
        width="32"
        height="32"
        class="h-8 w-8 shrink-0 wide:h-7 wide:w-7 wide:rounded-lg wide:shadow-[0_0_0_1px_rgba(127,181,242,.35)]"
      />
      <h1
        class="hidden text-[13px] font-semibold tracking-[0.14em] text-ink-100 md:block xl:hidden wide:!hidden"
      >
        ORBIT TRACKER
      </h1>
      <h1 class="hidden text-[13px] font-semibold tracking-[0.14em] text-ink-100 xl:block wide:!hidden">
        SATELLITE ORBIT TRACKER
      </h1>
      <!-- Version HUD del titulo: unica, siempre visible en escritorio -->
      <h1 class="hidden text-t1 font-semibold text-hud-ink-accent hud-title wide:block">
        SATELLITE ORBIT TRACKER
      </h1>
    </div>

    <div class="min-w-0 flex-1" />

    <!--
      Reloj UTC. En movil, solo la hora (t3): no cabe la fecha junto al resto
      de la barra. En escritorio se despliega en dos lineas con la fecha.
    -->
    <div class="flex items-baseline gap-2 wide:flex-col wide:items-end wide:gap-0">
      <span class="font-mono text-t3 font-semibold tabular-nums text-hud-ink-100 wide:text-t4">{{ utcTime }}</span>
      <span class="telemetry-label hidden text-hud-ink-500 wide:block">UTC · {{ utcDate }}</span>
    </div>

    <!-- Estado de sincronizacion -->
    <button
      type="button"
      class="flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[rgba(127,181,242,.28)] bg-[rgba(10,18,32,.55)] px-2.5 transition-colors hover:border-accent-300/50 sm:gap-2 sm:px-3"
      :title="
        store.isDemoMode
          ? 'Datos sinteticos locales. Pulsa para reintentar la conexion con Celestrak.'
          : 'Resincronizar TLE con Celestrak'
      "
      @click="resync"
    >
      <span
        v-if="!store.isDemoMode"
        class="status-dot inline-block"
        :style="{ backgroundColor: syncColor, color: syncColor }"
      />
      <component
        v-else
        :is="WifiOff"
        :size="13"
        :style="{ color: syncColor }"
      />
      <span
        v-if="syncLabel"
        class="hidden text-t1 font-semibold tracking-[0.1em] sm:inline"
        :style="{ color: syncColor }"
      >
        {{ syncLabel }}
      </span>
      <span v-else class="hidden text-t1 font-semibold tracking-[0.1em] wide:inline" :style="{ color: syncColor }">
        ENLACE
      </span>
      <RefreshCw
        :size="11"
        class="text-hud-ink-500"
        :class="(isSyncing || store.isInitializing) && 'animate-spin'"
      />
    </button>

    <!-- Manual: explica la app a quien la abre por primera vez. -->
    <button
      type="button"
      class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[rgba(127,181,242,.28)] bg-[rgba(10,18,32,.55)] text-hud-ink-300 transition-colors hover:text-accent-400"
      aria-label="Manual de uso"
      title="Manual de uso"
      @click="emit('open-help')"
    >
      <CircleQuestionMark :size="17" :stroke-width="1.75" />
    </button>

    <!--
      Diagnostico: unica via de acceso al estado de las fuentes y del motor, asi
      que no se oculta en movil. El punto rojo avisa de incidencias sin obligar
      a abrirlo.
    -->
    <button
      type="button"
      class="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[rgba(127,181,242,.28)] bg-[rgba(10,18,32,.55)] text-hud-ink-300 transition-colors hover:text-accent-400"
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
