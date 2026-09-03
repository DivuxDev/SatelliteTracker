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
import { Copy, ExternalLink, X } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { EARTH_RADIUS_KM, ORBIT_REGIMES, tleAgeDays } from '@/services/orbitCalculationService'
import { getSatelliteProfile } from '@/services/satelliteProfileService'
import { useWikiProfile } from '@/services/useWikiProfile'
import MissionEmblem from './MissionEmblem.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useSatelliteStore()
const satellite = computed(() => store.selectedSatellite)
const telemetry = computed(() => store.selectedTelemetry)
const profile = computed(() => getSatelliteProfile(satellite.value))
const regime = computed(() => (satellite.value ? ORBIT_REGIMES[satellite.value.regime] : null))

/**
 * Tercer nivel de procedencia: solo se dispara mientras este modal esta
 * abierto y el satelite es elegible (ver `isWikiEligible`). `openRef` es el
 * propio prop `open` — cuando se cierra el modal, el watcher interno deja de
 * disparar peticiones nuevas.
 */
const openRef = computed(() => props.open)
const isDemoModeRef = computed(() => store.isDemoMode)
const { state: wikiState, entry: wikiEntry } = useWikiProfile(satellite, profile, openRef, isDemoModeRef)

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
    <div class="panel hud-modal flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden sm:max-h-[88vh]">
      <div class="panel-header border-b-[rgba(127,181,242,.16)] px-4 py-3.5">
        <div class="flex min-w-0 items-center gap-3">
          <MissionEmblem :type-id="profile?.type?.id ?? 'unknown'" :color="regime?.color ?? '#7fb5f2'" :size="36" />
          <div class="min-w-0">
            <h2 class="panel-title text-hud-ink-accent hud-title">Telemetria avanzada</h2>
            <p class="mt-0.5 truncate text-t4 font-semibold text-hud-ink-100">{{ satellite.name }}</p>
          </div>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-300/28 bg-[rgba(10,18,32,.55)] text-hud-ink-300 transition-colors hover:text-accent-400"
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
        <section
          v-if="profile"
          class="rounded-md border p-3"
          :class="
            profile.verified
              ? 'border-[rgba(34,197,94,.35)] bg-[rgba(34,197,94,.06)]'
              : wikiState === 'ok'
                ? 'border-accent-300/35'
                : 'border-dashed border-accent-300/28'
          "
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              class="status-dot shrink-0"
              :style="{
                backgroundColor: profile.verified ? '#22c55e' : wikiState === 'ok' ? '#7fb5f2' : '#63799a',
                color: profile.verified ? '#22c55e' : wikiState === 'ok' ? '#7fb5f2' : '#63799a',
                boxShadow: profile.verified ? '0 0 8px #22c55e' : 'none',
              }"
            />
            <!--
              Distinguir la procedencia no es un adorno: el TIPO de mision
              (esta etiqueta) sale siempre del nombre por patrones, nunca de
              Wikipedia — un extracto de Wikipedia describe el objeto, no
              valida su clasificacion. Por eso el nombre del tipo se queda en
              cursiva/discontinuo incluso cuando hay descripcion externa.
            -->
            <span
              class="text-t3 font-semibold text-hud-ink-100"
              :class="!profile.verified && 'italic text-hud-ink-300'"
            >
              {{ profile.type.label }}
            </span>
            <span
              v-if="profile.verified"
              class="rounded-full border border-[rgba(34,197,94,.5)] px-1.5 py-px text-t1 font-semibold text-signal-500"
              title="Ficha escrita a mano y verificada para este objeto"
            >
              FICHA PROPIA
            </span>
            <span
              v-else-if="wikiState === 'ok'"
              class="rounded-full border border-accent-300/45 px-1.5 py-px text-t1 font-semibold text-accent-400"
              :title="`Descripcion obtenida de Wikipedia en ${wikiEntry.lang === 'es' ? 'espanol' : 'ingles'} por ID NORAD exacto`"
            >
              WIKIPEDIA · {{ wikiEntry.lang.toUpperCase() }}
            </span>
            <span
              v-else-if="wikiState === 'loading'"
              class="rounded-full border border-accent-300/28 px-1.5 py-px text-t1 text-hud-ink-500"
            >
              buscando en Wikipedia…
            </span>
            <span
              v-else
              class="rounded-full border border-accent-300/28 px-1.5 py-px text-t1 text-hud-ink-500"
              title="Deducido del nombre del objeto mediante patrones. Los TLE no incluyen el tipo de mision."
            >
              deducido
            </span>
          </div>

          <!--
            Cuerpo: prioridad ficha curada > extracto de Wikipedia > copy de
            familia de constelacion > explicacion generica del tipo. Nunca se
            deja un hueco vacio mientras se busca: se ve el texto generico
            hasta que (si acaso) lo sustituye algo mejor.
          -->
          <p v-if="profile.summary" class="mt-2 text-t3 leading-relaxed text-hud-ink-300">
            {{ profile.summary }}
          </p>
          <template v-else-if="wikiState === 'ok' && wikiEntry">
            <p class="mt-2 text-t3 leading-relaxed text-hud-ink-300">{{ wikiEntry.extract }}</p>
            <p class="mt-2 flex flex-wrap items-center gap-1.5 text-t1 text-hud-ink-600">
              Extracto de Wikipedia en {{ wikiEntry.lang === 'es' ? 'español' : 'inglés' }} · CC BY-SA 4.0
              <a
                :href="wikiEntry.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-accent-400 hover:underline"
              >
                Ver en Wikipedia
                <ExternalLink :size="10" />
              </a>
            </p>
          </template>
          <p v-else class="mt-2 text-t3 leading-relaxed text-hud-ink-300">
            {{ profile.family?.summary ?? profile.blurb }}
          </p>

          <ul v-if="profile.facts.length > 0" class="mt-2 space-y-0.5">
            <li
              v-for="fact in profile.facts"
              :key="fact"
              class="flex gap-1.5 text-t2 leading-relaxed text-hud-ink-300"
            >
              <span class="text-accent-400">·</span>
              {{ fact }}
            </li>
          </ul>

          <!-- Lo que dice la orbita. Esto no es heuristica: sale de los numeros. -->
          <div v-if="profile.notes.length > 0" class="mt-3 border-t border-accent-300/16 pt-2">
            <p class="telemetry-label mb-1 text-hud-ink-accent">Lo que dice su orbita</p>
            <ul class="space-y-1">
              <li
                v-for="note in profile.notes"
                :key="note"
                class="text-t2 leading-relaxed text-hud-ink-300"
              >
                {{ note }}
              </li>
            </ul>
          </div>
        </section>

        <!-- Identificacion: 4 columnas, celdas en tono de campo HUD -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-md border border-accent-300/16 bg-[rgba(5,10,20,.45)] px-2.5 py-2">
            <p class="telemetry-label">NORAD ID</p>
            <p class="telemetry-value">{{ satellite.id }}</p>
          </div>
          <div class="rounded-md border border-accent-300/16 bg-[rgba(5,10,20,.45)] px-2.5 py-2">
            <p class="telemetry-label">Desig. internacional</p>
            <p class="telemetry-value">{{ satellite.intlDes || '—' }}</p>
          </div>
          <div class="rounded-md border border-accent-300/16 bg-[rgba(5,10,20,.45)] px-2.5 py-2">
            <p class="telemetry-label">Operador</p>
            <p class="truncate text-t2 text-hud-ink-100" :title="satellite.operator">
              {{ satellite.operator }}
            </p>
          </div>
          <div class="rounded-md border border-accent-300/16 bg-[rgba(5,10,20,.45)] px-2.5 py-2">
            <p class="telemetry-label">Pais / agencia</p>
            <p class="text-t2 text-hud-ink-100">{{ satellite.countryLabel }}</p>
          </div>
        </div>

        <!-- Estado en vivo -->
        <section>
          <h3 class="panel-title mb-2 border-b border-accent-300/16 pb-1.5 text-hud-ink-accent">
            Estado instantaneo
          </h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div v-for="item in live" :key="item.label" class="border-l border-accent-300/16 pl-2.5">
              <dt class="telemetry-label text-hud-ink-500">{{ item.label }}</dt>
              <dd class="telemetry-value text-t3 text-hud-ink-100">{{ item.value }}</dd>
            </div>
          </dl>
          <p v-if="live.length === 0" class="text-xs text-ink-500">
            Sin solucion de propagacion valida para este objeto.
          </p>
        </section>

        <!-- Elementos keplerianos -->
        <section>
          <h3 class="panel-title mb-2 border-b border-accent-300/16 pb-1.5 text-hud-ink-accent">
            Elementos keplerianos medios
          </h3>
          <p class="mb-2 text-t1 text-hud-ink-600">Epoca del conjunto: {{ epochLabel }}</p>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div v-for="item in elements" :key="item.label" class="border-l border-accent-300/16 pl-2.5">
              <dt class="telemetry-label text-hud-ink-500">{{ item.label }}</dt>
              <dd class="telemetry-value text-t3 text-hud-ink-100">{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <!-- Derivados -->
        <section>
          <h3 class="panel-title mb-2 border-b border-accent-300/16 pb-1.5 text-hud-ink-accent">
            Geometria orbital derivada
          </h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div v-for="item in derived" :key="item.label" class="border-l border-accent-300/16 pl-2.5">
              <dt class="telemetry-label text-hud-ink-500">{{ item.label }}</dt>
              <dd class="text-t3 text-hud-ink-100">{{ item.value }}</dd>
            </div>
          </dl>
        </section>

        <!-- TLE en crudo -->
        <section>
          <div class="mb-2 flex items-center justify-between border-b border-accent-300/16 pb-1.5">
            <h3 class="panel-title text-hud-ink-accent">Two-Line Element set</h3>
            <button
              type="button"
              class="flex items-center gap-1 text-t1 text-accent-400 hover:underline"
              @click="copyTle"
            >
              <Copy :size="11" />
              Copiar
            </button>
          </div>
          <!-- Epoca y edad, en la cabecera del bloque: es lo primero que hace
               falta para juzgar si el TLE sigue siendo fiable. -->
          <p class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-t1 text-hud-ink-500">
            <span>Epoca {{ epochLabel }}</span>
            <span v-if="derived.find((d) => d.label === 'Edad del TLE')">
              · {{ derived.find((d) => d.label === 'Edad del TLE').value }}
            </span>
          </p>
          <pre
            class="overflow-x-auto rounded-md border border-accent-300/16 bg-[rgba(3,7,14,.7)] p-3 font-mono text-t2 text-hud-ink-300"
            style="line-height: 1.7"
          >{{ satellite.name }}
{{ satellite.line1 }}
{{ satellite.line2 }}</pre>
          <p class="mt-2 text-t1 leading-relaxed text-hud-ink-600">
            Fuente: {{ store.isDemoMode ? 'catalogo sintetico local (modo demo)' : `Celestrak · GROUP=${satellite.group}` }}.
            La propagacion usa SGP4/SDP4 sobre satellite.js; los TLE solo son validos en un entorno
            de pocos dias alrededor de su epoca.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
