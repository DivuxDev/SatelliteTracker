<script setup>
/**
 * GroundPassSimulator
 * ---------------------------------------------------------------------------
 * Calcula y visualiza las proximas pasadas del satelite seleccionado sobre una
 * ubicacion en tierra, al estilo de "See A Starlink Tonight".
 *
 * La grafica de cielo es una proyeccion polar: el centro es el cenit (90 grados
 * de elevacion) y el borde el horizonte (0 grados), con el azimut medido desde
 * el norte en sentido horario. Es la representacion estandar en observacion
 * porque se corresponde con lo que ve alguien tumbado mirando hacia arriba.
 */
import { computed, ref, watch } from 'vue'
import { Locate, MapPin, Telescope, TriangleAlert, X } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import {
  azimuthToCompass,
  formatDuration,
  predictPasses,
  sunElevationDeg,
  toGeodetic,
} from '@/services/passPredictorService'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useSatelliteStore()

const OBSERVER_STORAGE_KEY = 'sot:observer'

/* -------------------------------------------------------------------------- */
/* Ubicacion del observador                                                   */
/* -------------------------------------------------------------------------- */

function loadObserver() {
  try {
    const stored = JSON.parse(localStorage.getItem(OBSERVER_STORAGE_KEY) ?? 'null')
    if (stored && Number.isFinite(stored.latitude)) return stored
  } catch {
    /* almacenamiento no disponible */
  }
  // Por defecto, Madrid: hay que partir de algo concreto y verificable.
  return { latitude: 40.4168, longitude: -3.7038, altitudeM: 650, label: 'Madrid (por defecto)' }
}

const observer = ref(loadObserver())
const geolocationState = ref('idle') // idle | locating | denied | error
const geolocationMessage = ref('')

function persistObserver() {
  try {
    localStorage.setItem(OBSERVER_STORAGE_KEY, JSON.stringify(observer.value))
  } catch {
    /* almacenamiento no disponible */
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    geolocationState.value = 'error'
    geolocationMessage.value = 'Este navegador no expone la API de geolocalizacion.'
    return
  }
  geolocationState.value = 'locating'
  navigator.geolocation.getCurrentPosition(
    (position) => {
      observer.value = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitudeM: position.coords.altitude ?? 0,
        label: 'Ubicacion GPS',
      }
      geolocationState.value = 'idle'
      persistObserver()
      compute()
    },
    (error) => {
      geolocationState.value = error.code === error.PERMISSION_DENIED ? 'denied' : 'error'
      geolocationMessage.value =
        error.code === error.PERMISSION_DENIED
          ? 'Permiso de ubicacion denegado. Introduce las coordenadas a mano.'
          : `No se pudo obtener la ubicacion: ${error.message}`
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  )
}

/* -------------------------------------------------------------------------- */
/* Parametros y calculo                                                       */
/* -------------------------------------------------------------------------- */

const minElevation = ref(10)
const windowHours = ref(48)
const onlyVisible = ref(false)

const passes = ref([])
const selectedPassId = ref(null)
const isComputing = ref(false)
const computeError = ref(null)

const selectedPass = computed(
  () => passes.value.find((p) => p.id === selectedPassId.value) ?? passes.value[0] ?? null,
)

const sunElevation = computed(() => {
  try {
    return sunElevationDeg(toGeodetic(observer.value), new Date())
  } catch {
    return Number.NaN
  }
})

function compute() {
  const satellite = store.selectedSatellite
  if (!satellite) return

  isComputing.value = true
  computeError.value = null
  passes.value = []

  // Cedemos un frame para que la interfaz pinte el estado "calculando" antes de
  // bloquear el hilo con unos miles de propagaciones SGP4.
  requestAnimationFrame(() => {
    try {
      const result = predictPasses(satellite.satrec, observer.value, {
        start: new Date(),
        hours: Number(windowHours.value),
        minElevation: Number(minElevation.value),
        onlyVisible: onlyVisible.value,
        maxPasses: 10,
      })
      passes.value = result
      selectedPassId.value = result[0]?.id ?? null
      persistObserver()
    } catch (error) {
      computeError.value = error?.message ?? String(error)
    } finally {
      isComputing.value = false
    }
  })
}

watch(
  () => [props.open, store.selectedId],
  ([isOpen]) => {
    if (isOpen && store.selectedSatellite) compute()
  },
  { immediate: true },
)

/* -------------------------------------------------------------------------- */
/* Grafica de cielo                                                           */
/* -------------------------------------------------------------------------- */

const SKY_SIZE = 220
const SKY_CENTER = SKY_SIZE / 2
const SKY_RADIUS = SKY_SIZE / 2 - 18

/** Proyeccion polar azimut/elevacion -> coordenadas SVG. */
function project(azimuth, elevation) {
  const r = ((90 - Math.max(0, elevation)) / 90) * SKY_RADIUS
  const rad = (azimuth * Math.PI) / 180
  return { x: SKY_CENTER + r * Math.sin(rad), y: SKY_CENTER - r * Math.cos(rad) }
}

const skyPath = computed(() => {
  const pass = selectedPass.value
  if (!pass) return ''
  return pass.track
    .map((point, index) => {
      const { x, y } = project(point.azimuth, point.elevation)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

/** Segmentos iluminados por el Sol: son los tramos realmente visibles a ojo. */
const sunlitSegments = computed(() => {
  const pass = selectedPass.value
  if (!pass) return []
  const segments = []
  let current = null
  for (const point of pass.track) {
    if (point.sunlit) {
      const { x, y } = project(point.azimuth, point.elevation)
      current = current ?? []
      current.push(`${current.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    } else if (current) {
      if (current.length > 1) segments.push(current.join(' '))
      current = null
    }
  }
  if (current && current.length > 1) segments.push(current.join(' '))
  return segments
})

const passStartPoint = computed(() => {
  const pass = selectedPass.value
  return pass ? project(pass.track[0].azimuth, pass.track[0].elevation) : null
})
const passEndPoint = computed(() => {
  const pass = selectedPass.value
  return pass ? project(pass.track.at(-1).azimuth, pass.track.at(-1).elevation) : null
})
const passPeakPoint = computed(() => {
  const pass = selectedPass.value
  return pass ? project(pass.maxAzimuth, pass.maxElevation) : null
})

/* -------------------------------------------------------------------------- */
/* Formateo                                                                   */
/* -------------------------------------------------------------------------- */

const timeFormat = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const dayFormat = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

function formatTime(date) {
  return timeFormat.format(date)
}
function formatDay(date) {
  return dayFormat.format(date)
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-space-950/80 p-2 backdrop-blur-sm sm:p-4"
    @click.self="emit('close')"
  >
    <div class="panel flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden sm:max-h-[88vh]">
      <div class="panel-header">
        <div class="flex items-center gap-2">
          <Telescope :size="15" class="text-accent-400" />
          <h2 class="panel-title">Ground Pass Simulator</h2>
          <span v-if="store.selectedSatellite" class="text-xs text-ink-300">
            · {{ store.selectedSatellite.name }}
          </span>
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

      <div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[300px_1fr]">
        <!-- Panel de parametros -->
        <div class="space-y-3 border-b border-grid-800 p-3 sm:p-4 lg:border-b-0 lg:border-r">
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="telemetry-label">Ubicacion del observador</span>
              <button
                type="button"
                class="flex items-center gap-1 text-[10px] text-accent-400 hover:underline"
                :disabled="geolocationState === 'locating'"
                @click="useCurrentLocation"
              >
                <Locate :size="11" />
                {{ geolocationState === 'locating' ? 'Localizando…' : 'Usar mi GPS' }}
              </button>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <BaseInput
                v-model="observer.latitude"
                type="number"
                label="Latitud"
                suffix="°N"
                step="0.0001"
                mono
              />
              <BaseInput
                v-model="observer.longitude"
                type="number"
                label="Longitud"
                suffix="°E"
                step="0.0001"
                mono
              />
            </div>
            <div class="mt-2">
              <BaseInput
                v-model="observer.altitudeM"
                type="number"
                label="Altitud sobre el nivel del mar"
                suffix="m"
                step="1"
                mono
              />
            </div>

            <p
              v-if="geolocationMessage && geolocationState !== 'idle'"
              class="mt-2 flex gap-1.5 text-[10px] leading-relaxed text-warn-500"
            >
              <TriangleAlert :size="12" class="mt-px shrink-0" />
              {{ geolocationMessage }}
            </p>

            <p class="mt-2 flex items-center gap-1.5 text-[10px] text-ink-600">
              <MapPin :size="11" />
              Sol a {{ Number.isFinite(sunElevation) ? sunElevation.toFixed(1) : '—' }}° ·
              {{ sunElevation < -6 ? 'cielo oscuro' : 'demasiada luz' }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2 border-t border-grid-800 pt-3">
            <BaseInput
              v-model="minElevation"
              type="number"
              label="Elevacion minima"
              suffix="°"
              min="0"
              max="80"
              step="5"
              mono
            />
            <BaseInput
              v-model="windowHours"
              type="number"
              label="Ventana"
              suffix="h"
              min="1"
              max="168"
              step="12"
              mono
            />
          </div>

          <label class="flex cursor-pointer items-center gap-2 text-[11px] text-ink-300">
            <input
              v-model="onlyVisible"
              type="checkbox"
              class="h-3.5 w-3.5 accent-[#3b82f6]"
            />
            Solo pasadas visibles a simple vista
          </label>

          <BaseButton variant="primary" block :loading="isComputing" @click="compute">
            Calcular pasadas
          </BaseButton>

          <p class="text-[10px] leading-relaxed text-ink-600">
            Una pasada se marca como visible cuando el satelite esta iluminado por el Sol y el
            observador ya esta a oscuras (Sol por debajo de -6°). El resto siguen listadas: son
            utiles para seguimiento por radio aunque no se vean.
          </p>
        </div>

        <!-- Resultados -->
        <div class="min-h-0 p-4">
          <div v-if="!store.selectedSatellite" class="py-10 text-center text-xs text-ink-500">
            Selecciona antes un satelite.
          </div>

          <div v-else-if="isComputing" class="flex flex-col items-center gap-3 py-14">
            <span
              class="h-6 w-6 animate-spin rounded-full border-2 border-accent-500/30 border-t-accent-500"
            />
            <p class="text-xs text-ink-500">Propagando {{ windowHours }} h de orbita…</p>
          </div>

          <div v-else-if="computeError" class="py-10 text-center">
            <p class="text-xs text-alert-500">{{ computeError }}</p>
          </div>

          <div v-else-if="passes.length === 0" class="py-10 text-center">
            <p class="text-xs text-ink-500">
              Ninguna pasada por encima de {{ minElevation }}° en las proximas
              {{ windowHours }} horas.
            </p>
            <p class="mt-1.5 text-[11px] text-ink-600">
              Prueba a bajar la elevacion minima o a ampliar la ventana. Los satelites de orbita
              alta pueden no pasar nunca sobre esta latitud.
            </p>
          </div>

          <div v-else class="grid gap-4 md:grid-cols-[240px_1fr]">
            <!-- Grafica de cielo -->
            <div>
              <svg
                :viewBox="`0 0 ${SKY_SIZE} ${SKY_SIZE}`"
                class="mx-auto w-full max-w-[240px] md:mx-0"
              >
                <!-- Circulos de elevacion -->
                <circle
                  v-for="elevation in [0, 30, 60]"
                  :key="elevation"
                  :cx="SKY_CENTER"
                  :cy="SKY_CENTER"
                  :r="((90 - elevation) / 90) * SKY_RADIUS"
                  fill="none"
                  stroke="#263043"
                  :stroke-dasharray="elevation === 0 ? '' : '2 3'"
                />
                <!-- Ejes cardinales -->
                <line
                  :x1="SKY_CENTER"
                  :y1="SKY_CENTER - SKY_RADIUS"
                  :x2="SKY_CENTER"
                  :y2="SKY_CENTER + SKY_RADIUS"
                  stroke="#263043"
                />
                <line
                  :x1="SKY_CENTER - SKY_RADIUS"
                  :y1="SKY_CENTER"
                  :x2="SKY_CENTER + SKY_RADIUS"
                  :y2="SKY_CENTER"
                  stroke="#263043"
                />
                <!-- Brujula -->
                <text
                  v-for="point in [
                    { label: 'N', x: SKY_CENTER, y: SKY_CENTER - SKY_RADIUS - 6 },
                    { label: 'E', x: SKY_CENTER + SKY_RADIUS + 9, y: SKY_CENTER + 4 },
                    { label: 'S', x: SKY_CENTER, y: SKY_CENTER + SKY_RADIUS + 13 },
                    { label: 'O', x: SKY_CENTER - SKY_RADIUS - 9, y: SKY_CENTER + 4 },
                  ]"
                  :key="point.label"
                  :x="point.x"
                  :y="point.y"
                  text-anchor="middle"
                  fill="#6b7a92"
                  font-size="10"
                  font-family="JetBrains Mono, monospace"
                >
                  {{ point.label }}
                </text>

                <!-- Trayectoria completa (tenue) y tramos iluminados (brillantes) -->
                <path :d="skyPath" fill="none" stroke="#33405a" stroke-width="1.5" />
                <path
                  v-for="(segment, index) in sunlitSegments"
                  :key="index"
                  :d="segment"
                  fill="none"
                  stroke="#3b82f6"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />

                <!-- Marcadores -->
                <circle
                  v-if="passStartPoint"
                  :cx="passStartPoint.x"
                  :cy="passStartPoint.y"
                  r="3"
                  fill="#22c55e"
                />
                <circle
                  v-if="passEndPoint"
                  :cx="passEndPoint.x"
                  :cy="passEndPoint.y"
                  r="3"
                  fill="#ef4444"
                />
                <circle
                  v-if="passPeakPoint"
                  :cx="passPeakPoint.x"
                  :cy="passPeakPoint.y"
                  r="4"
                  fill="none"
                  stroke="#ffffff"
                  stroke-width="1.5"
                />
              </svg>

              <div v-if="selectedPass" class="mt-2 space-y-1 text-[10px]">
                <p class="flex justify-between text-ink-500">
                  <span>Aparece</span>
                  <span class="font-mono text-signal-500">
                    {{ azimuthToCompass(selectedPass.startAzimuth) }}
                    ({{ selectedPass.startAzimuth.toFixed(0) }}°)
                  </span>
                </p>
                <p class="flex justify-between text-ink-500">
                  <span>Culmina</span>
                  <span class="font-mono text-ink-100">
                    {{ selectedPass.maxElevation.toFixed(0) }}° hacia
                    {{ azimuthToCompass(selectedPass.maxAzimuth) }}
                  </span>
                </p>
                <p class="flex justify-between text-ink-500">
                  <span>Desaparece</span>
                  <span class="font-mono text-alert-500">
                    {{ azimuthToCompass(selectedPass.endAzimuth) }}
                    ({{ selectedPass.endAzimuth.toFixed(0) }}°)
                  </span>
                </p>
              </div>
            </div>

            <!-- Lista de pasadas -->
            <div class="min-w-0">
              <div class="mb-2 flex items-baseline justify-between">
                <span class="telemetry-label">Proximas pasadas</span>
                <span class="font-mono text-[10px] text-ink-600">{{ passes.length }}</span>
              </div>

              <ul class="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                <li v-for="pass in passes" :key="pass.id">
                  <button
                    type="button"
                    class="w-full rounded-md border px-2.5 py-2 text-left transition-colors"
                    :class="
                      selectedPass?.id === pass.id
                        ? 'border-accent-500/60 bg-accent-500/10'
                        : 'border-grid-800 hover:border-grid-600 hover:bg-space-750'
                    "
                    @click="selectedPassId = pass.id"
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="font-mono text-xs text-ink-100">
                        {{ formatTime(pass.startTime) }}
                      </span>
                      <span class="text-[10px] capitalize text-ink-600">
                        {{ formatDay(pass.startTime) }}
                      </span>
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span class="font-mono text-[10px] text-ink-300">
                        max {{ pass.maxElevation.toFixed(0) }}°
                      </span>
                      <span class="font-mono text-[10px] text-ink-500">
                        {{ formatDuration(pass.durationSeconds) }}
                      </span>
                      <span class="font-mono text-[10px] text-ink-500">
                        {{ pass.minRangeKm.toFixed(0) }} km
                      </span>
                      <span
                        class="rounded px-1 py-px text-[9px] font-semibold"
                        :style="{
                          color: pass.quality.color,
                          backgroundColor: `${pass.quality.color}18`,
                        }"
                      >
                        {{ pass.quality.label }}
                      </span>
                      <span
                        v-if="pass.visible"
                        class="rounded bg-signal-500/15 px-1 py-px text-[9px] font-semibold text-signal-500"
                      >
                        VISIBLE
                      </span>
                      <span v-else class="text-[9px] text-ink-600">
                        {{ pass.observerDark ? 'en sombra' : 'de dia' }}
                      </span>
                    </div>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
