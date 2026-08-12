<script setup>
/**
 * SatelliteCard
 * ---------------------------------------------------------------------------
 * Ficha del satelite seleccionado: telemetria en vivo y acciones.
 * Los valores numericos se refrescan a 2 Hz (uiTick del store), suficiente para
 * lectura humana y muy por debajo del coste de refrescar a la tasa de render.
 */
import { computed } from 'vue'
import { Crosshair, Info, Telescope, X } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES, tleAgeDays } from '@/services/orbitCalculationService'
import BaseButton from '@/components/ui/BaseButton.vue'

const emit = defineEmits(['open-details', 'open-passes'])

const store = useSatelliteStore()

const satellite = computed(() => store.selectedSatellite)
const telemetry = computed(() => store.selectedTelemetry)
const regime = computed(() =>
  satellite.value ? ORBIT_REGIMES[satellite.value.regime] : null,
)

const tleAge = computed(() => {
  // eslint-disable-next-line no-unused-expressions -- refresco a 2 Hz
  store.uiTick
  return satellite.value ? tleAgeDays(satellite.value) : Number.NaN
})

/** Un TLE de mas de 14 dias produce errores de posicion de decenas de km. */
const tleWarning = computed(() => Number.isFinite(tleAge.value) && tleAge.value > 14)

const periodLabel = computed(() => {
  if (!satellite.value) return '—'
  const minutes = satellite.value.periodMinutes
  const hours = Math.floor(minutes / 60)
  const rest = minutes - hours * 60
  return hours > 0 ? `${hours} h ${rest.toFixed(0)} min` : `${minutes.toFixed(1)} min`
})

function formatCoord(value, positive, negative) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  const hemisphere = value >= 0 ? positive : negative
  return `${Math.abs(value).toFixed(3)}° ${hemisphere}`
}
</script>

<template>
  <!--
    Cuando el layout esta apilado, la ficha es una hoja inferior superpuesta:
    encajarla en el flujo dejaria la lista reducida a dos o tres filas. En dos
    columnas vuelve a ser un panel normal al pie de la barra lateral.
  -->
  <section
    v-if="satellite"
    class="panel max-h-[60%] shrink-0 overflow-y-auto stacked:fixed stacked:inset-x-0 stacked:bottom-0 stacked:z-30 stacked:max-h-[72vh] stacked:rounded-b-none stacked:border-x-0 stacked:border-b-0 stacked:shadow-2xl stacked:shadow-black/70"
  >
    <div class="panel-header stacked:sticky stacked:top-0 stacked:z-10 stacked:bg-space-800">
      <h2 class="panel-title">Satellite Details</h2>
      <button
        type="button"
        class="text-ink-600 transition-colors hover:text-ink-100"
        aria-label="Cerrar ficha"
        @click="store.clearSelection()"
      >
        <X :size="14" />
      </button>
    </div>

    <div class="p-3">
      <div class="flex gap-3">
        <!-- Distintivo orbital: esquema del regimen, no una foto generica -->
        <div
          class="relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-md border border-grid-700 bg-space-850 overflow-hidden"
        >
          <svg viewBox="0 0 74 74" class="absolute inset-0 h-full w-full">
            <defs>
              <radialGradient :id="`earth-${satellite.id}`" cx="38%" cy="34%" r="70%">
                <stop offset="0%" stop-color="#243348" />
                <stop offset="100%" stop-color="#0d131d" />
              </radialGradient>
            </defs>
            <circle cx="37" cy="37" r="17" :fill="`url(#earth-${satellite.id})`" />
            <circle cx="37" cy="37" r="17" fill="none" stroke="#38bdf8" stroke-opacity="0.25" />
            <ellipse
              cx="37"
              cy="37"
              :rx="satellite.regime === 'GEO' ? 30 : satellite.regime === 'MEO' ? 26 : 22"
              :ry="satellite.regime === 'HEO' ? 12 : 8"
              fill="none"
              :stroke="regime?.color ?? '#3b82f6'"
              stroke-width="1.1"
              :transform="`rotate(${-satellite.elements.inclination * 0.55} 37 37)`"
              opacity="0.9"
            />
            <circle
              :cx="37 + (satellite.regime === 'GEO' ? 30 : satellite.regime === 'MEO' ? 26 : 22) * 0.72"
              :cy="37 - 6"
              r="2.4"
              :fill="regime?.color ?? '#3b82f6'"
            />
          </svg>
        </div>

        <!-- Identidad y telemetria principal -->
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <h3 class="truncate text-sm font-semibold text-ink-100">{{ satellite.name }}</h3>
            <span
              class="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]"
              :style="{
                color: regime?.color,
                borderColor: `${regime?.color}55`,
                backgroundColor: `${regime?.color}14`,
              }"
            >
              {{ satellite.regime }}
            </span>
          </div>

          <p class="mt-0.5 truncate font-mono text-[10px] text-ink-600">
            NORAD {{ satellite.id }}<span v-if="satellite.intlDes"> · {{ satellite.intlDes }}</span>
          </p>

          <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <div>
              <dt class="telemetry-label">Alt</dt>
              <dd class="telemetry-value">
                {{ telemetry ? `${telemetry.altitudeKm.toFixed(0)} km` : '—' }}
              </dd>
            </div>
            <div>
              <dt class="telemetry-label">Incl</dt>
              <dd class="telemetry-value">{{ satellite.elements.inclination.toFixed(2) }}°</dd>
            </div>
            <div>
              <dt class="telemetry-label">Lat</dt>
              <dd class="telemetry-value">
                {{ formatCoord(telemetry?.latitude, 'N', 'S') }}
              </dd>
            </div>
            <div>
              <dt class="telemetry-label">Long</dt>
              <dd class="telemetry-value">
                {{ formatCoord(telemetry?.longitude, 'E', 'O') }}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Segunda fila de telemetria -->
      <dl class="mt-3 grid grid-cols-3 gap-2 border-t border-grid-800 pt-2.5">
        <div>
          <dt class="telemetry-label">Periodo</dt>
          <dd class="telemetry-value">{{ periodLabel }}</dd>
        </div>
        <div>
          <dt class="telemetry-label">Velocidad</dt>
          <dd class="telemetry-value">
            {{ telemetry ? `${telemetry.speedKmS.toFixed(2)} km/s` : '—' }}
          </dd>
        </div>
        <div>
          <dt class="telemetry-label">Operador</dt>
          <dd class="truncate text-[11px] text-ink-300" :title="satellite.operator">
            {{ satellite.operator }}
          </dd>
        </div>
      </dl>

      <p
        v-if="tleWarning"
        class="mt-2.5 rounded border border-warn-500/30 bg-warn-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-warn-500"
      >
        TLE de hace {{ tleAge.toFixed(1) }} dias. La precision de SGP4 se degrada notablemente
        pasadas dos semanas: resincroniza antes de usar estos datos para apuntar.
      </p>

      <!-- Acciones -->
      <div class="mt-3 grid grid-cols-3 gap-1.5">
        <BaseButton
          :variant="store.trackedId === satellite.id ? 'primary' : 'secondary'"
          size="sm"
          block
          :title="
            store.trackedId === satellite.id
              ? 'Liberar la camara'
              : 'Fijar la camara sobre el satelite'
          "
          @click="store.toggleTracking(satellite.id)"
        >
          <Crosshair :size="12" />
          Track
        </BaseButton>
        <BaseButton variant="secondary" size="sm" block @click="emit('open-details')">
          <Info :size="12" />
          Details
        </BaseButton>
        <BaseButton variant="secondary" size="sm" block @click="emit('open-passes')">
          <Telescope :size="12" />
          Pasadas
        </BaseButton>
      </div>
    </div>
  </section>

  <!-- Estado vacio: solo con el layout en dos columnas. Apilado ocuparia una
       hoja permanente sin contenido, robandole sitio a la lista. -->
  <section v-else class="panel hidden shrink-0 p-5 text-center wide:block">
    <p class="text-xs text-ink-500">Selecciona un satelite</p>
    <p class="mt-1 text-[11px] leading-relaxed text-ink-600">
      Pulsa un punto del globo o una fila de la lista para ver su telemetria en vivo, su orbita y
      las proximas pasadas sobre tu posicion.
    </p>
  </section>
</template>
