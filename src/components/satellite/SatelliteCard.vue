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
import { getSatelliteProfile } from '@/services/satelliteProfileService'
import BaseButton from '@/components/ui/BaseButton.vue'
import MissionEmblem from './MissionEmblem.vue'

const emit = defineEmits(['open-details', 'open-passes'])

const store = useSatelliteStore()

const satellite = computed(() => store.selectedSatellite)
const telemetry = computed(() => store.selectedTelemetry)
const regime = computed(() =>
  satellite.value ? ORBIT_REGIMES[satellite.value.regime] : null,
)
// No lee `uiTick`: el tipo de mision no cambia con la telemetria en vivo, asi
// que no hace falta recalcularlo al refresco de 2 Hz de la ficha.
const profile = computed(() => (satellite.value ? getSatelliteProfile(satellite.value) : null))

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
    class="panel hud-panel-featured max-h-[60%] shrink-0 overflow-y-auto stacked:fixed stacked:inset-x-0 stacked:bottom-0 stacked:z-30 stacked:h-[417px] stacked:max-h-[417px] stacked:rounded-b-none stacked:rounded-t-[18px] stacked:border-x-0 stacked:border-b-0 stacked:bg-[rgba(7,14,26,.86)] stacked:backdrop-blur-[16px]"
  >
    <!-- Asa de arrastre: puramente visual, la ficha se cierra con la X. -->
    <div class="hidden justify-center pb-1 pt-2 stacked:flex">
      <span class="h-1 w-9 rounded-full bg-accent-300/30" />
    </div>

    <div class="panel-header border-b-[rgba(127,181,242,.16)] stacked:border-b-0 stacked:pt-1 wide:px-3.5 wide:py-3">
      <h2 class="panel-title">Detalle del satelite</h2>
      <button
        type="button"
        class="text-ink-600 transition-colors hover:text-ink-100"
        aria-label="Cerrar ficha"
        @click="store.clearSelection()"
      >
        <X :size="14" />
      </button>
    </div>

    <div class="p-3 wide:p-3.5">
      <div class="flex gap-3">
        <!-- Distintivo: forma segun el tipo de mision, color segun el regimen orbital -->
        <MissionEmblem :type-id="profile?.type?.id ?? 'unknown'" :color="regime?.color ?? '#7fb5f2'" :size="50" />

        <!-- Identidad y telemetria principal -->
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <h3 class="truncate text-t4 font-semibold text-hud-ink-100">{{ satellite.name }}</h3>
            <span
              class="shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-t1"
              :style="{
                color: regime?.color,
                borderColor: `${regime?.color}55`,
                backgroundColor: `${regime?.color}14`,
              }"
            >
              {{ satellite.regime }}
            </span>
          </div>

          <p class="mt-0.5 truncate font-mono text-t1 text-hud-ink-500">
            NORAD {{ satellite.id }}<span v-if="satellite.intlDes"> · {{ satellite.intlDes }}</span>
          </p>
        </div>
      </div>

      <!--
        Rejilla de telemetria: 3x2 en escritorio (los 6 valores), 2x2 en movil
        —altitud, inclinacion, periodo y velocidad—, con valores a t4. Se
        oculta latitud/longitud en vez de duplicar el marcado: al desaparecer
        del flujo, la rejilla de 2 columnas los recoloca sola en 2x2.
      -->
      <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-accent-300/16 pt-2.5 wide:grid-cols-3 wide:pt-3">
        <div>
          <dt class="telemetry-label">Altitud</dt>
          <dd class="telemetry-value stacked:text-t4">
            {{ telemetry ? `${telemetry.altitudeKm.toFixed(0)} km` : '—' }}
          </dd>
        </div>
        <div>
          <dt class="telemetry-label">Inclinacion</dt>
          <dd class="telemetry-value stacked:text-t4">{{ satellite.elements.inclination.toFixed(2) }}°</dd>
        </div>
        <div class="stacked:hidden">
          <dt class="telemetry-label">Latitud</dt>
          <dd class="telemetry-value">
            {{ formatCoord(telemetry?.latitude, 'N', 'S') }}
          </dd>
        </div>
        <div class="stacked:hidden">
          <dt class="telemetry-label">Longitud</dt>
          <dd class="telemetry-value">
            {{ formatCoord(telemetry?.longitude, 'E', 'O') }}
          </dd>
        </div>
        <div>
          <dt class="telemetry-label">Periodo</dt>
          <dd class="telemetry-value stacked:text-t4">{{ periodLabel }}</dd>
        </div>
        <div>
          <dt class="telemetry-label">Velocidad</dt>
          <dd class="telemetry-value stacked:text-t4">
            {{ telemetry ? `${telemetry.speedKmS.toFixed(2)} km/s` : '—' }}
          </dd>
        </div>
      </dl>

      <p class="mt-2 truncate text-t2 text-hud-ink-300" :title="satellite.operator">
        {{ satellite.operator }}
      </p>

      <p
        v-if="tleWarning"
        class="mt-2.5 rounded border border-warn-500/30 bg-warn-500/10 px-2 py-1.5 text-t2 leading-relaxed text-warn-500"
      >
        TLE de hace {{ tleAge.toFixed(1) }} dias. La precision de SGP4 se degrada notablemente
        pasadas dos semanas: resincroniza antes de usar estos datos para apuntar.
      </p>

      <!-- Acciones: objetivo tactil minimo de 44px en movil. -->
      <div class="mt-3 grid grid-cols-3 gap-1.5">
        <BaseButton
          :variant="store.trackedId === satellite.id ? 'primary' : 'secondary'"
          size="sm"
          block
          class="rounded-full text-t2 stacked:h-11 wide:h-9"
          :title="
            store.trackedId === satellite.id
              ? 'Liberar la camara'
              : 'Fijar la camara sobre el satelite'
          "
          @click="store.toggleTracking(satellite.id)"
        >
          <Crosshair :size="12" />
          Seguir
        </BaseButton>
        <BaseButton variant="secondary" size="sm" block class="rounded-full border-accent-300/32 text-t2 stacked:h-11 wide:h-9" @click="emit('open-details')">
          <Info :size="12" />
          Detalles
        </BaseButton>
        <BaseButton variant="secondary" size="sm" block class="rounded-full border-accent-300/32 text-t2 stacked:h-11 wide:h-9" @click="emit('open-passes')">
          <Telescope :size="12" />
          Pasadas
        </BaseButton>
      </div>
    </div>
  </section>

  <!-- Estado vacio: solo con el layout en dos columnas. Apilado ocuparia una
       hoja permanente sin contenido, robandole sitio a la lista. -->
  <section v-else class="panel hud-panel-featured hidden shrink-0 p-5 text-center wide:block">
    <p class="text-t2 text-hud-ink-300">Selecciona un satelite</p>
    <p class="mt-1 text-t1 leading-relaxed text-hud-ink-600">
      Pulsa un punto del globo o una fila de la lista para ver su telemetria en vivo, su orbita y
      las proximas pasadas sobre tu posicion.
    </p>
  </section>
</template>
