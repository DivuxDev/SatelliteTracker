<script setup>
/**
 * CosmicEventsModal
 * ---------------------------------------------------------------------------
 * Eventos interesantes de ver desde tierra: proximas lluvias de meteoros
 * (dato astronomico fijo) y satelites candidatos a reentrada (derivado en
 * vivo del catalogo TLE ya cargado). Sin cometas por ahora: son eventos
 * irregulares sin fuente gratuita fiable — ver la cabecera de
 * `skyEventsService.js`.
 */
import { computed } from 'vue'
import { Locate, MoonStar, Rocket, Satellite, TriangleAlert } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import {
  geolocationMessage,
  geolocationState,
  observer,
  observerGeodetic,
  requestGeolocation,
} from '@/services/observerLocationService'
import { reentryCandidates, showerVisibility, upcomingMeteorShowers } from '@/services/skyEventsService'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useSatelliteStore()

const showers = computed(() => {
  const gd = observerGeodetic.value
  return upcomingMeteorShowers(new Date(), { withinDays: 120 }).map((shower) => ({
    ...shower,
    visibility: gd ? showerVisibility(shower, gd) : null,
  }))
})

const reentries = computed(() => reentryCandidates(store.satellites, { limit: 12 }))

/** Categorias con potenciales candidatos a reentrada que no estan cargadas
 *  por defecto (comunicaciones, militares, megaconstelaciones, cubesats) —
 *  si la lista sale corta lo mas probable es que sea por esto, no porque no
 *  haya nada cayendo. */
const unloadedHeavyCategories = computed(() =>
  store.categoryBreakdown.filter((c) => c.heavy && !c.loaded),
)

const VERDICT_LABEL = {
  good: 'Buena visibilidad: radiante alto en noche cerrada',
  low: 'Radiante bajo sobre el horizonte',
  'below-horizon': 'Radiante bajo el horizonte esta noche',
  daylight: 'Sin noche astronomica en las proximas 24h desde esta latitud',
}
const VERDICT_COLOR = {
  good: '#22c55e',
  low: '#f59e0b',
  'below-horizon': '#6f8199',
  daylight: '#6f8199',
}

const dayFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' })
function formatPeak(date) {
  return dayFormat.format(date)
}
function formatDaysToPeak(days) {
  if (days < 1) return 'hoy'
  if (days < 2) return 'manana'
  return `en ${Math.round(days)} dias`
}

function selectReentryCandidate(id) {
  store.select(id)
  emit('close')
}
</script>

<template>
  <BaseModal :open="open" title="Eventos cosmicos" :icon="MoonStar" max-width="max-w-3xl" @close="$emit('close')">
    <div class="space-y-5 p-4">
      <!-- Ubicacion del observador: comparte estado con el simulador de pasadas -->
      <div class="rounded-md border border-accent-300/16 bg-[rgba(5,10,20,.45)] p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span class="telemetry-label">Ubicacion del observador</span>
          <button
            type="button"
            class="flex items-center gap-1 text-t1 text-accent-400 hover:underline"
            :disabled="geolocationState === 'locating'"
            @click="requestGeolocation"
          >
            <Locate :size="11" />
            {{ geolocationState === 'locating' ? 'Localizando…' : 'Usar mi GPS' }}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <BaseInput v-model="observer.latitude" type="number" label="Latitud" suffix="°N" step="0.0001" mono />
          <BaseInput v-model="observer.longitude" type="number" label="Longitud" suffix="°E" step="0.0001" mono />
          <BaseInput
            v-model="observer.altitudeM"
            type="number"
            label="Altitud"
            suffix="m"
            step="1"
            mono
            class="col-span-2 sm:col-span-1"
          />
        </div>
        <p v-if="!observerGeodetic" class="mt-2 text-t1 text-warn-500">
          Coordenadas incompletas: no se puede calcular la visibilidad de las lluvias.
        </p>
        <p
          v-else-if="geolocationMessage && geolocationState !== 'idle'"
          class="mt-2 text-t1 text-warn-500"
        >
          {{ geolocationMessage }}
        </p>
      </div>

      <!-- Lluvias de meteoros -->
      <section>
        <h3 class="mb-2 flex items-center gap-2 border-b border-accent-300/16 pb-1.5 text-t1 font-semibold uppercase tracking-[0.09em] text-hud-ink-accent">
          <MoonStar :size="14" />
          Proximas lluvias de meteoros
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="shower in showers"
            :key="shower.id"
            class="rounded-md border border-accent-300/16 px-3 py-2"
            :class="shower.isActiveNow ? 'bg-[rgba(47,127,224,.08)]' : ''"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span class="flex items-baseline gap-2">
                <span class="text-t3 font-semibold text-hud-ink-100">{{ shower.name }}</span>
                <span
                  v-if="shower.isActiveNow"
                  class="rounded-full border border-signal-500/50 px-1.5 py-px text-t1 font-semibold text-signal-500"
                >
                  activa
                </span>
              </span>
              <span class="font-mono text-t2 tabular-nums text-hud-ink-300">
                pico {{ formatPeak(shower.peakDate) }} · {{ formatDaysToPeak(shower.daysToPeak) }}
              </span>
            </div>
            <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-t1 text-hud-ink-500">
              <span>ZHR ~{{ shower.zhr }}/h</span>
              <span>{{ shower.speedKmS }} km/s</span>
              <span class="truncate">{{ shower.parentBody }}</span>
            </p>
            <p
              v-if="shower.visibility"
              class="mt-1.5 flex items-center gap-1.5 text-t2"
              :style="{ color: VERDICT_COLOR[shower.visibility.verdict] }"
            >
              <span class="status-dot" :style="{ backgroundColor: 'currentColor', color: 'currentColor' }" />
              {{ VERDICT_LABEL[shower.visibility.verdict] }}
              <span v-if="shower.visibility.bestAltitudeDeg !== null" class="font-mono tabular-nums">
                ({{ shower.visibility.bestAltitudeDeg.toFixed(0) }}° de altura)
              </span>
            </p>
          </li>
        </ul>
      </section>

      <!-- Candidatos a reentrada -->
      <section>
        <h3 class="mb-2 flex items-center gap-2 border-b border-accent-300/16 pb-1.5 text-t1 font-semibold uppercase tracking-[0.09em] text-hud-ink-accent">
          <Rocket :size="14" />
          Satelites candidatos a reentrada
        </h3>
        <p class="mb-2 flex gap-1.5 text-t1 leading-relaxed text-hud-ink-600">
          <TriangleAlert :size="12" class="mt-px shrink-0" />
          Estimacion aproximada: un unico TLE no permite predecir con precision ni la fecha ni el
          lugar de reentrada. El perigeo y el arrastre atmosferico (B*) solo indican que orbita
          esta decayendo.
        </p>

        <div v-if="reentries.length === 0" class="rounded-md border border-accent-300/16 px-3 py-4 text-center">
          <p class="text-t2 text-hud-ink-500">
            Ningun objeto del catalogo cargado tiene el perigeo lo bastante bajo ahora mismo.
          </p>
          <p v-if="unloadedHeavyCategories.length > 0" class="mt-1 text-t1 text-hud-ink-600">
            Hay categorias sin cargar que podrian tener candidatos:
            {{ unloadedHeavyCategories.map((c) => c.label).join(', ') }}. Actívalas desde Filtros.
          </p>
        </div>

        <ul v-else class="space-y-1">
          <li v-for="sat in reentries" :key="sat.id">
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-accent-300/28 hover:bg-[rgba(47,127,224,.08)]"
              @click="selectReentryCandidate(sat.id)"
            >
              <Satellite :size="13" class="shrink-0 text-hud-ink-600" />
              <span class="min-w-0 flex-1 truncate text-t2 font-medium text-hud-ink-100">{{ sat.name }}</span>
              <span class="shrink-0 font-mono text-t1 tabular-nums text-hud-ink-500">
                {{ sat.perigeeKm.toFixed(0) }} km
              </span>
              <span
                class="shrink-0 rounded-full border px-1.5 py-px text-t1 font-semibold"
                :style="{ color: sat.band.color, borderColor: `${sat.band.color}80` }"
              >
                {{ sat.band.label }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </BaseModal>
</template>
