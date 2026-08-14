<script setup>
/**
 * TelemetryModal
 * ---------------------------------------------------------------------------
 * Telemetria avanzada del satelite seleccionado: elementos keplerianos medios,
 * derivados orbitales, estado instantaneo y las dos lineas TLE en crudo.
 *
 * Mostrar el TLE literal es deliberado: es la unica forma de que quien use la
 * herramienta pueda verificar de donde salen los numeros y reproducirlos en
 * otro software.
 */
import { computed } from 'vue'
import { Copy, X } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { EARTH_RADIUS_KM, ORBIT_REGIMES, tleAgeDays } from '@/services/orbitCalculationService'
import { getSatelliteProfile } from '@/services/satelliteProfileService'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useSatelliteStore()
const satellite = computed(() => store.selectedSatellite)
const telemetry = computed(() => store.selectedTelemetry)
const profile = computed(() => getSatelliteProfile(satellite.value))

const epochLabel = computed(() => {
  const sat = satellite.value
  if (!sat || !Number.isFinite(sat.epoch)) return '—'
  return new Date(sat.epoch).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
})

const derived = computed(() => {
  const sat = satellite.value
  if (!sat) return []
  const age = tleAgeDays(sat)
  return [
    { label: 'Semieje mayor', value: `${sat.semiMajorAxisKm.toFixed(1)} km` },
    { label: 'Apogeo', value: `${sat.apogeeKm.toFixed(1)} km` },
    { label: 'Perigeo', value: `${sat.perigeeKm.toFixed(1)} km` },
    { label: 'Radio orbital medio', value: `${(sat.semiMajorAxisKm - EARTH_RADIUS_KM).toFixed(1)} km` },
    { label: 'Periodo', value: `${sat.periodMinutes.toFixed(2)} min` },
    { label: 'Revoluciones / dia', value: sat.elements.meanMotion.toFixed(6) },
    { label: 'Regimen', value: ORBIT_REGIMES[sat.regime].description },
    { label: 'Edad del TLE', value: Number.isFinite(age) ? `${age.toFixed(2)} dias` : '—' },
  ]
})

const elements = computed(() => {
  const sat = satellite.value
  if (!sat) return []
  return [
    { label: 'Inclinacion (i)', value: `${sat.elements.inclination.toFixed(4)}°` },
    { label: 'Asc. recta nodo (Ω)', value: `${sat.elements.raan.toFixed(4)}°` },
    { label: 'Excentricidad (e)', value: sat.elements.eccentricity.toFixed(7) },
    { label: 'Arg. perigeo (ω)', value: `${sat.elements.argPerigee.toFixed(4)}°` },
    { label: 'Anomalia media (M)', value: `${sat.elements.meanAnomaly.toFixed(4)}°` },
    { label: 'Numero de revolucion', value: String(sat.elements.revNumber ?? '—') },
  ]
})

const live = computed(() => {
  const t = telemetry.value
  if (!t) return []
  return [
    { label: 'Latitud', value: `${t.latitude.toFixed(4)}°` },
    { label: 'Longitud', value: `${t.longitude.toFixed(4)}°` },
    { label: 'Altitud', value: `${t.altitudeKm.toFixed(2)} km` },
    { label: 'Velocidad', value: `${t.speedKmS.toFixed(4)} km/s` },
    { label: 'Instante', value: `${new Date(t.time).toISOString().slice(11, 19)} UTC` },
    { label: 'Marco', value: 'TEME → ECEF (WGS84)' },
  ]
})

async function copyTle() {
  const sat = satellite.value
  if (!sat) return
  try {
    await navigator.clipboard.writeText(`${sat.name}\n${sat.line1}\n${sat.line2}`)
  } catch {
    /* el portapapeles puede estar bloqueado por permisos */
  }
}
</script>

<template>
  <div
    v-if="open && satellite"
    class="fixed inset-0 z-50 flex items-center justify-center bg-space-950/80 p-2 backdrop-blur-sm sm:p-4"
    @click.self="emit('close')"
  >
    <div class="panel flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden sm:max-h-[88vh]">
      <div class="panel-header">
        <div class="min-w-0">
          <h2 class="panel-title">Telemetria avanzada</h2>
          <p class="mt-0.5 truncate text-sm font-semibold text-ink-100">{{ satellite.name }}</p>
        </div>
        <button
          type="button"
          class="text-ink-600 transition-colors hover:text-ink-100"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          <X :size="15" />
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <!--
          Que es este objeto. Va lo primero a proposito: antes de los numeros,
          la pregunta que casi todo el mundo trae es "¿y esto que es?".
        -->
        <section v-if="profile" class="rounded-md border border-grid-700 bg-space-850 p-3">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              class="status-dot shrink-0"
              :style="{ backgroundColor: profile.type.color, color: profile.type.color }"
            />
            <span class="text-[13px] font-semibold text-ink-100">{{ profile.type.label }}</span>
            <!--
              Distinguir lo verificado de lo deducido no es un adorno: el tipo
              sale del nombre del objeto mediante patrones, y eso falla.
            -->
            <span
              v-if="!profile.verified"
              class="rounded bg-space-750 px-1.5 py-px text-[10px] text-ink-500"
              title="Deducido del nombre del objeto mediante patrones. Los TLE no incluyen el tipo de mision."
            >
              deducido
            </span>
            <span
              v-else
              class="rounded bg-signal-500/15 px-1.5 py-px text-[10px] text-signal-500"
              title="Ficha escrita a mano y verificada para este objeto"
            >
              ficha propia
            </span>
          </div>

          <p v-if="profile.summary" class="mt-2 text-[12px] leading-relaxed text-ink-300">
            {{ profile.summary }}
          </p>
          <p v-else class="mt-2 text-[12px] leading-relaxed text-ink-300">
            {{ profile.blurb }}
          </p>

          <ul v-if="profile.facts.length > 0" class="mt-2 space-y-0.5">
            <li
              v-for="fact in profile.facts"
              :key="fact"
              class="flex gap-1.5 text-[11px] leading-relaxed text-ink-500"
            >
              <span class="text-accent-400">·</span>
              {{ fact }}
            </li>
          </ul>

          <!-- Lo que dice la orbita. Esto no es heuristica: sale de los numeros. -->
          <div v-if="profile.notes.length > 0" class="mt-3 border-t border-grid-800 pt-2">
            <p class="telemetry-label mb-1">Lo que dice su orbita</p>
            <ul class="space-y-1">
              <li
                v-for="note in profile.notes"
                :key="note"
                class="text-[11px] leading-relaxed text-ink-500"
              >
                {{ note }}
              </li>
            </ul>
          </div>
        </section>

        <!-- Identificacion -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p class="telemetry-label">NORAD ID</p>
            <p class="telemetry-value">{{ satellite.id }}</p>
          </div>
          <div>
            <p class="telemetry-label">Desig. internacional</p>
            <p class="telemetry-value">{{ satellite.intlDes || '—' }}</p>
          </div>
          <div>
            <p class="telemetry-label">Operador</p>
            <p class="truncate text-[13px] text-ink-100" :title="satellite.operator">
              {{ satellite.operator }}
            </p>
          </div>
          <div>
            <p class="telemetry-label">Pais / agencia</p>
            <p class="text-[13px] text-ink-100">{{ satellite.countryLabel }}</p>
          </div>
        </div>

        <!-- Estado en vivo -->
        <section>
          <h3 class="panel-title mb-2">Estado instantaneo</h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div v-for="item in live" :key="item.label" class="border-l border-grid-700 pl-2.5">
              <dt class="telemetry-label">{{ item.label }}</dt>
              <dd class="telemetry-value">{{ item.value }}</dd>
            </div>
          </dl>
          <p v-if="live.length === 0" class="text-xs text-ink-500">
            Sin solucion de propagacion valida para este objeto.
          </p>
        </section>

        <!-- Elementos keplerianos -->
        <section>
          <h3 class="panel-title mb-2">Elementos keplerianos medios</h3>
          <p class="mb-2 text-[11px] text-ink-600">Epoca del conjunto: {{ epochLabel }}</p>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div v-for="item in elements" :key="item.label" class="border-l border-grid-700 pl-2.5">
              <dt class="telemetry-label">{{ item.label }}</dt>
              <dd class="telemetry-value">{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <!-- Derivados -->
        <section>
          <h3 class="panel-title mb-2">Geometria orbital derivada</h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div v-for="item in derived" :key="item.label" class="border-l border-grid-700 pl-2.5">
              <dt class="telemetry-label">{{ item.label }}</dt>
              <dd class="text-[13px] text-ink-100">{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <!-- TLE en crudo -->
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="panel-title">Two-Line Element set</h3>
            <button
              type="button"
              class="flex items-center gap-1 text-[10px] text-accent-400 hover:underline"
              @click="copyTle"
            >
              <Copy :size="11" />
              Copiar
            </button>
          </div>
          <pre
            class="overflow-x-auto rounded-md border border-grid-700 bg-space-950 p-3 font-mono text-[11px] leading-relaxed text-ink-300"
          >{{ satellite.name }}
{{ satellite.line1 }}
{{ satellite.line2 }}</pre>
          <p class="mt-2 text-[10px] leading-relaxed text-ink-600">
            Fuente: {{ store.isDemoMode ? 'catalogo sintetico local (modo demo)' : `Celestrak · GROUP=${satellite.group}` }}.
            La propagacion usa SGP4/SDP4 sobre satellite.js; los TLE solo son validos en un entorno
            de pocos dias alrededor de su epoca.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
