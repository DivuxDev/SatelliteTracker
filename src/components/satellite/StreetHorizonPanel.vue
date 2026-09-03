<script setup>
/**
 * StreetHorizonPanel
 * ---------------------------------------------------------------------------
 * "Mi horizonte a pie de calle": la foto a nivel de calle mas cercana al
 * observador, con un indicador de hacia donde mirar para ver al satelite en
 * un instante concreto de la pasada seleccionada.
 *
 * LIMITE HONESTO, A PROPOSITO: una foto de calle tiene un campo de vision
 * horizontal de ~75° y esta encuadrada hacia el horizonte, no hacia el
 * cenit. Un satelite que culmina a 70° de elevacion no cabe en NINGUNA foto
 * de calle. En vez de fingir que la marca de posicion es exacta, el panel lo
 * dice explicitamente cuando el satelite queda fuera de encuadre (por
 * elevacion o por rumbo) — es la misma honestidad sobre la procedencia y los
 * limites del dato que ya practica el resto de la app.
 */
import { computed, ref, watch } from 'vue'
import { Camera, Compass, TriangleAlert } from '@lucide/vue'
import { fetchNearbyImages, hasMapillaryToken, headingDiff, pickImageForAzimuth } from '@/services/streetImageryService'
import { azimuthToCompass } from '@/services/passPredictorService'

const props = defineProps({
  observer: { type: Object, required: true },
  pass: { type: Object, default: null },
})

/** Asume un campo de vision horizontal tipico de camara de calle. No es un
 *  dato de la imagen (Mapillary no lo expone): es una aproximacion para
 *  decidir si el objetivo cae dentro del encuadre o no. */
const ASSUMED_HORIZONTAL_FOV_DEG = 75
/** Por encima de esta elevacion, ninguna foto a pie de calle encuadra el objetivo. */
const MAX_FRAMEABLE_ELEVATION_DEG = 35

const MOMENTS = [
  { id: 'rise', label: 'Aparece' },
  { id: 'peak', label: 'Culmina' },
  { id: 'set', label: 'Desaparece' },
]
const moment = ref('peak')

const momentData = computed(() => {
  const pass = props.pass
  if (!pass) return null
  if (moment.value === 'rise') {
    return { azimuthDeg: pass.startAzimuth, elevationDeg: pass.track?.[0]?.elevation ?? 0, time: pass.startTime }
  }
  if (moment.value === 'set') {
    return {
      azimuthDeg: pass.endAzimuth,
      elevationDeg: pass.track?.at(-1)?.elevation ?? 0,
      time: pass.endTime,
    }
  }
  return { azimuthDeg: pass.maxAzimuth, elevationDeg: pass.maxElevation, time: pass.maxElevationTime }
})

/* -------------------------------------------------------------------------- */
/* Carga de imagenes: una vez por ubicacion/pasada, no por cada cambio de instante */
/* -------------------------------------------------------------------------- */

const fetchState = ref(hasMapillaryToken() ? 'idle' : 'disabled')
const images = ref([])
const imageFailed = ref(false)
let requestToken = 0

async function loadImages() {
  if (!hasMapillaryToken()) {
    fetchState.value = 'disabled'
    return
  }
  const lat = Number(props.observer?.latitude)
  const lon = Number(props.observer?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    fetchState.value = 'error'
    return
  }

  const thisRequest = ++requestToken
  fetchState.value = 'loading'
  imageFailed.value = false
  const result = await fetchNearbyImages({ latitude: lat, longitude: lon }).catch(() => ({
    status: 'error',
    images: [],
  }))
  if (thisRequest !== requestToken) return // una ubicacion mas reciente ya esta en vuelo

  images.value = result.images
  fetchState.value = result.status
}

watch(
  () => [props.observer?.latitude, props.observer?.longitude, props.pass?.id],
  () => loadImages(),
  { immediate: true },
)

/* -------------------------------------------------------------------------- */
/* Imagen elegida + si el objetivo cae dentro de su encuadre                  */
/* -------------------------------------------------------------------------- */

const picked = computed(() => {
  if (!momentData.value || images.value.length === 0) return null
  return pickImageForAzimuth(images.value, momentData.value.azimuthDeg, {
    latitude: Number(props.observer.latitude),
    longitude: Number(props.observer.longitude),
  })
})

/** Diferencia con signo: positivo = el objetivo cae a la derecha de hacia donde mira la foto. */
function signedHeadingDiff(target, heading) {
  let diff = (target - heading) % 360
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return diff
}

const frame = computed(() => {
  if (!picked.value || !momentData.value) return null
  const diff = signedHeadingDiff(momentData.value.azimuthDeg, picked.value.image.heading)
  const halfFov = ASSUMED_HORIZONTAL_FOV_DEG / 2
  const tooHigh = momentData.value.elevationDeg > MAX_FRAMEABLE_ELEVATION_DEG
  const inHorizontalFrame = Math.abs(diff) <= halfFov
  return {
    inFrame: inHorizontalFrame && !tooHigh,
    tooHigh,
    outOfFrameSide: diff > 0 ? 'derecha' : 'izquierda',
    // Posicion horizontal de la marca dentro de la foto, -1 (borde izq) a 1 (borde der).
    markerRatio: Math.max(-1, Math.min(1, diff / halfFov)),
  }
})
</script>

<template>
  <section class="rounded-md border border-accent-300/16 bg-[rgba(5,10,20,.45)] p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-t1 font-semibold uppercase tracking-[0.08em] text-hud-ink-accent">
        <Camera :size="13" />
        Mi horizonte a pie de calle
      </span>
      <div v-if="pass" class="flex items-center gap-0.5 rounded-full border border-accent-300/22 p-0.5">
        <button
          v-for="m in MOMENTS"
          :key="m.id"
          type="button"
          class="rounded-full px-2 py-1 text-t1 font-medium transition-colors"
          :class="moment === m.id ? 'bg-accent-500/20 text-accent-400' : 'text-hud-ink-500 hover:text-hud-ink-300'"
          @click="moment = m.id"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <!-- Sin satelite/pasada seleccionada -->
    <p v-if="!pass" class="py-4 text-center text-t2 text-hud-ink-600">
      Selecciona una pasada para ver hacia donde mirar.
    </p>

    <!-- Sin token configurado -->
    <div v-else-if="fetchState === 'disabled'" class="flex gap-2 py-3 text-t2 text-hud-ink-500">
      <TriangleAlert :size="14" class="mt-0.5 shrink-0 text-warn-500" />
      <p>
        Este panel necesita un token gratuito de Mapillary
        (<code class="text-hud-ink-300">VITE_MAPILLARY_TOKEN</code>). Sin el, el resto de la app
        funciona igual. Instrucciones en <code class="text-hud-ink-300">.env.example</code>.
      </p>
    </div>

    <!-- Coordenadas invalidas -->
    <p v-else-if="fetchState === 'error' && images.length === 0 && !picked" class="py-3 text-t2 text-warn-500">
      No se pudo consultar la imagen mas cercana: revisa las coordenadas del observador o tu conexion.
    </p>

    <!-- Cargando -->
    <div v-else-if="fetchState === 'loading'" class="flex items-center justify-center gap-2 py-8">
      <span class="h-4 w-4 animate-spin rounded-full border-2 border-accent-500/30 border-t-accent-500" />
      <span class="text-t2 text-hud-ink-500">Buscando la foto mas cercana…</span>
    </div>

    <!-- Sin cobertura -->
    <p v-else-if="fetchState === 'empty'" class="py-3 text-t2 text-hud-ink-500">
      Mapillary no tiene fotos a pie de calle cerca de esta ubicacion. La cobertura depende de si
      alguien ha pasado por ahi con la app o una camara compatible.
    </p>

    <!-- Resultado -->
    <div v-else-if="picked">
      <div class="relative overflow-hidden rounded-md border border-accent-300/16">
        <img
          v-if="!imageFailed"
          :src="picked.image.thumbUrl"
          alt="Foto a pie de calle mas cercana al observador"
          class="block h-auto w-full"
          @error="imageFailed = true"
        />
        <div v-else class="flex h-40 items-center justify-center bg-space-900 text-t2 text-hud-ink-600">
          La imagen ya no esta disponible (los enlaces de Mapillary caducan).
        </div>

        <!-- Marca de direccion: solo si el objetivo cae dentro del encuadre asumido -->
        <div
          v-if="frame?.inFrame"
          class="pointer-events-none absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          :style="{ left: `${50 + frame.markerRatio * 45}%` }"
        >
          <span class="h-3 w-3 rounded-full border-2 border-accent-400 bg-accent-400/30 shadow-[0_0_10px_rgba(95,168,240,.7)]" />
        </div>
      </div>

      <!-- Explicacion del encuadre: nunca se finge precision que la foto no tiene -->
      <p v-if="frame?.inFrame" class="mt-2 flex items-center gap-1.5 text-t2 text-signal-500">
        <Compass :size="13" />
        El satelite deberia verse cerca del punto marcado, hacia el
        {{ azimuthToCompass(momentData.azimuthDeg) }} ({{ momentData.azimuthDeg.toFixed(0) }}°) a
        {{ momentData.elevationDeg.toFixed(0) }}° de altura.
      </p>
      <p v-else-if="frame?.tooHigh" class="mt-2 flex items-center gap-1.5 text-t2 text-warn-500">
        <TriangleAlert :size="13" />
        Elevacion {{ momentData.elevationDeg.toFixed(0) }}° — muy por encima de lo que encuadra una
        foto a pie de calle. Mira casi vertical, hacia el
        {{ azimuthToCompass(momentData.azimuthDeg) }}.
      </p>
      <p v-else class="mt-2 flex items-center gap-1.5 text-t2 text-warn-500">
        <TriangleAlert :size="13" />
        Esta foto mira hacia el {{ azimuthToCompass(picked.image.heading) }}; el satelite sale por
        tu {{ frame?.outOfFrameSide }}, fuera de este encuadre (hacia el
        {{ azimuthToCompass(momentData.azimuthDeg) }}).
      </p>
      <p class="mt-1 text-t1 text-hud-ink-600">
        Foto mas cercana disponible en Mapillary, no en tiempo real
        ({{ headingDiff(picked.image.heading, momentData.azimuthDeg).toFixed(0) }}° de diferencia de
        rumbo, {{ picked.distanceM.toFixed(0) }} m del observador).
      </p>
    </div>
  </section>
</template>
