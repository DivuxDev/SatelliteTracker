<script setup>
/**
 * GlobeViewer
 * ---------------------------------------------------------------------------
 * Visor 3D. Crea el `Viewer` de Cesium, lo estiliza para el tema oscuro y lo
 * expone por `provide` a las capas hijas (`SatelliteEntity`, `OrbitPolyline`).
 *
 * Tambien concentra todo lo que depende de la camara y del raton:
 * seleccion por clic, tooltip de hover, controles de zoom y modo seguimiento.
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import {
  Cartesian3,
  Ellipsoid,
  HeadingPitchRange,
  Ion,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  Viewer,
} from 'cesium'
import {
  Globe as GlobeIcon,
  Layers,
  Maximize2,
  Minus,
  Orbit as OrbitIcon,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Target,
  TriangleAlert,
  Waypoints,
  WifiOff,
} from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES, REGIME_ORDER } from '@/services/orbitCalculationService'
import {
  DEFAULT_THEME_ID,
  GLOBE_THEMES,
  applyGlobeTheme,
  loadThemeId,
  saveThemeId,
  themeForcesLighting,
} from '@/services/globeThemeService'
import { CESIUM_VIEWER_KEY } from './useCesiumViewer'
import SatelliteEntity from './SatelliteEntity.vue'
import OrbitPolyline from './OrbitPolyline.vue'

const store = useSatelliteStore()

/** Leyenda del visor: va sobre panel, asi que usa el paso validado para paneles. */
const REGIME_LEGEND = REGIME_ORDER.map((id) => ORBIT_REGIMES[id])

/**
 * Altura de la camara en la vista inicial.
 *
 * En escritorio se busca encuadrar la Tierra sin dejar fuera el anillo
 * geoestacionario (35.786 km de altitud). En movil el lienzo es mucho mas
 * pequeno y a esa distancia la Tierra queda diminuta, asi que nos acercamos: el
 * usuario siempre puede alejarse con el control de zoom.
 */
function cameraHomeHeight() {
  return window.innerWidth < 1024 ? 19_000_000 : 30_000_000
}

const container = ref(null)
const viewer = shallowRef(null)
provide(CESIUM_VIEWER_KEY, viewer)

const initError = ref(null)
const is2D = ref(false)
const showOrbit = ref(true)
const showGroundTrack = ref(false)
const showFootprint = ref(true)
const lightingEnabled = ref(false)
/**
 * Campo de estrellas de fondo (skyBox de Cesium). Desactivado por defecto: sin
 * el, el espacio queda como un plano negro limpio y los satelites (que tambien
 * son puntos brillantes) dejan de competir con el ruido del fondo.
 */
const showStars = ref(false)
/** Solo aplica por debajo de sm: en escritorio el panel de capas siempre esta abierto. */
const layersOpen = ref(false)

/* Temas del globo */
const themeId = ref(loadThemeId())
const themePickerOpen = ref(false)
const applyingTheme = ref(false)
const themeError = ref(null)
const activeTheme = computed(
  () => GLOBE_THEMES.find((t) => t.id === themeId.value) ?? GLOBE_THEMES[0],
)

/** Estado del tooltip de hover, en coordenadas de pantalla. */
const tooltip = ref({ visible: false, x: 0, y: 0, id: null })

let eventHandler = null
let removeTrackingListener = null
let lastPickAt = 0

const tooltipSatellite = computed(() =>
  tooltip.value.id ? store.getById(tooltip.value.id) : null,
)
const tooltipTelemetry = computed(() =>
  tooltip.value.id ? store.readTelemetry(tooltip.value.id) : null,
)

/* -------------------------------------------------------------------------- */
/* Creacion del visor                                                         */
/* -------------------------------------------------------------------------- */

async function initViewer() {
  // El token de Ion es opcional. Si existe, los temas pueden usar la imagineria
  // mundial de alta resolucion; si no, todo funciona con los recursos que
  // CesiumJS ya trae empaquetados.
  const token = import.meta.env?.VITE_CESIUM_ION_TOKEN
  if (token) Ion.defaultAccessToken = token

  const instance = new Viewer(container.value, {
    // La capa base la pone applyGlobeTheme justo despues de crear el visor.
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
    contextOptions: { webgl: { alpha: false, powerPreference: 'high-performance' } },
  })

  const scene = instance.scene

  // --- Ajustes independientes del tema -------------------------------------
  scene.skyAtmosphere.hueShift = 0.02
  scene.sun.show = false
  // El skyBox es el campo de estrellas; la atmosfera del limbo es otra cosa y
  // se mantiene siempre.
  scene.skyBox.show = showStars.value
  scene.moon.show = false
  scene.fog.enabled = false
  scene.highDynamicRange = false
  scene.postProcessStages.fxaa.enabled = true

  // --- Camara --------------------------------------------------------------
  scene.screenSpaceCameraController.minimumZoomDistance = 500_000
  scene.screenSpaceCameraController.maximumZoomDistance = 1.2e8
  scene.screenSpaceCameraController.enableCollisionDetection = false

  instance.camera.setView({
    destination: Cartesian3.fromDegrees(-45, 12, cameraHomeHeight()),
  })

  viewer.value = instance
  await selectTheme(themeId.value, { persist: false })
  attachInteraction(instance)
  attachTracking(instance)
}

/* -------------------------------------------------------------------------- */
/* Temas del globo                                                            */
/* -------------------------------------------------------------------------- */

/* Los dos paneles flotantes son excluyentes: juntos taparian medio visor. */
function toggleThemePicker() {
  themePickerOpen.value = !themePickerOpen.value
  layersOpen.value = false
}

function toggleLayersPanel() {
  layersOpen.value = !layersOpen.value
  themePickerOpen.value = false
}

async function selectTheme(id, { persist = true } = {}) {
  const instance = viewer.value
  if (!instance) return

  themeError.value = null
  applyingTheme.value = true
  const result = await applyGlobeTheme(instance, id)
  applyingTheme.value = false

  if (!result.ok) {
    themeError.value = result.message
    // Si el tema pedido falla, no dejamos el globo sin capa: volvemos al que
    // siempre funciona porque va empaquetado con la aplicacion.
    if (id !== DEFAULT_THEME_ID) {
      themeId.value = DEFAULT_THEME_ID
      await applyGlobeTheme(instance, DEFAULT_THEME_ID)
    }
    return
  }

  themeId.value = id
  if (persist) saveThemeId(id)
  // Los temas con terminador mandan sobre el conmutador manual de iluminacion.
  lightingEnabled.value = themeForcesLighting(id)
}

/* -------------------------------------------------------------------------- */
/* Interaccion: hover y seleccion                                             */
/* -------------------------------------------------------------------------- */

function attachInteraction(instance) {
  eventHandler = new ScreenSpaceEventHandler(instance.scene.canvas)

  eventHandler.setInputAction((movement) => {
    // El picking implica una lectura de la GPU: lo limitamos a ~16 Hz para no
    // penalizar los FPS cuando el raton se mueve rapido.
    const now = performance.now()
    if (now - lastPickAt < 60) return
    lastPickAt = now

    const picked = instance.scene.pick(movement.endPosition)
    const id = typeof picked?.id === 'string' ? picked.id : null

    store.setHovered(id)
    tooltip.value = id
      ? { visible: true, x: movement.endPosition.x, y: movement.endPosition.y, id }
      : { visible: false, x: 0, y: 0, id: null }
    instance.scene.canvas.style.cursor = id ? 'pointer' : 'grab'
  }, ScreenSpaceEventType.MOUSE_MOVE)

  eventHandler.setInputAction((click) => {
    const picked = instance.scene.pick(click.position)
    // El vuelo de camara lo dispara el watcher de `selectedId`, asi que la
    // seleccion desde el globo y desde la lista lateral se comportan igual.
    if (typeof picked?.id === 'string') store.select(picked.id)
  }, ScreenSpaceEventType.LEFT_CLICK)
}

/* -------------------------------------------------------------------------- */
/* Camara: vuelo y modo seguimiento                                           */
/* -------------------------------------------------------------------------- */

const scratchTransform = new Matrix4()
const scratchOffset = new Cartesian3()

function attachTracking(instance) {
  removeTrackingListener = instance.scene.preRender.addEventListener(() => {
    const id = store.trackedId
    if (!id) return
    const telemetry = store.peekTelemetry(id)
    if (!telemetry) return

    const position = Cartesian3.fromDegrees(
      telemetry.longitude,
      telemetry.latitude,
      telemetry.altitudeKm * 1000,
    )
    // lookAt fija la camara a un marco local que sigue al objetivo. Hay que
    // restaurar la transformada al salir del modo seguimiento.
    Transforms.eastNorthUpToFixedFrame(position, Ellipsoid.WGS84, scratchTransform)
    instance.camera.lookAtTransform(
      scratchTransform,
      new HeadingPitchRange(0, CesiumMath.toRadians(-28), trackingRange(telemetry.altitudeKm)),
    )
  })
}

/**
 * Distancia de camara en modo seguimiento: pegada al objeto, porque lo que
 * interesa ahi es verlo moverse sobre el terreno.
 */
function trackingRange(altitudeKm) {
  return Math.max(2.2e6, altitudeKm * 1000 * 1.4)
}

/**
 * Distancia de camara al volar hacia un satelite recien seleccionado. Es mucho
 * mayor que la de seguimiento: la primera vez que se mira un objeto se quiere
 * situarlo respecto a la Tierra y a su orbita, no verle los remaches.
 */
function overviewRange(altitudeKm) {
  return Math.min(9e7, Math.max(6.5e6, altitudeKm * 1000 * 1.15))
}

watch(
  () => store.trackedId,
  (id) => {
    if (!id && viewer.value) viewer.value.camera.lookAtTransform(Matrix4.IDENTITY)
  },
)

/** Vuela hasta un satelite dejandolo centrado con la Tierra de fondo. */
function flyToSatellite(id) {
  const instance = viewer.value
  if (!instance) return
  const telemetry = store.peekTelemetry(id)
  if (!telemetry) return
  if (store.trackedId) return // en modo seguimiento la camara ya esta fijada

  const position = Cartesian3.fromDegrees(
    telemetry.longitude,
    telemetry.latitude,
    telemetry.altitudeKm * 1000,
  )
  // Nos alejamos radialmente desde el satelite para no quedar dentro de el.
  const normalized = Cartesian3.normalize(position, scratchOffset)
  const distance = Cartesian3.magnitude(position) + overviewRange(telemetry.altitudeKm)

  instance.camera.flyTo({
    destination: Cartesian3.multiplyByScalar(normalized, distance, new Cartesian3()),
    duration: 1.1,
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
  })
}

/* La seleccion desde la lista lateral tambien debe mover la camara. */
watch(
  () => store.selectedId,
  (id) => {
    if (id) flyToSatellite(id)
  },
)

/* -------------------------------------------------------------------------- */
/* Controles                                                                  */
/* -------------------------------------------------------------------------- */

function zoom(factor) {
  const instance = viewer.value
  if (!instance) return
  const height = instance.camera.positionCartographic.height
  const amount = height * factor
  if (factor > 0) instance.camera.zoomOut(amount)
  else instance.camera.zoomIn(-amount)
}

function resetView() {
  const instance = viewer.value
  if (!instance) return
  store.trackedId = null
  instance.camera.lookAtTransform(Matrix4.IDENTITY)
  instance.camera.flyTo({
    destination: Cartesian3.fromDegrees(-45, 12, cameraHomeHeight()),
    duration: 1.2,
  })
}

function toggleSceneMode() {
  const instance = viewer.value
  if (!instance) return
  is2D.value = !is2D.value
  if (is2D.value) instance.scene.morphTo2D(1.2)
  else instance.scene.morphTo3D(1.2)
}

function toggleLighting() {
  lightingEnabled.value = !lightingEnabled.value
  if (viewer.value) viewer.value.scene.globe.enableLighting = lightingEnabled.value
}

function toggleStars() {
  showStars.value = !showStars.value
  if (viewer.value) viewer.value.scene.skyBox.show = showStars.value
}

async function toggleFullscreen() {
  const element = container.value?.parentElement
  if (!element) return
  if (document.fullscreenElement) await document.exitFullscreen()
  else await element.requestFullscreen()
}

/* -------------------------------------------------------------------------- */
/* Ciclo de vida                                                              */
/* -------------------------------------------------------------------------- */

onMounted(async () => {
  try {
    await initViewer()
  } catch (error) {
    initError.value = error?.message ?? String(error)
  }
})

onBeforeUnmount(() => {
  removeTrackingListener?.()
  eventHandler?.destroy()
  eventHandler = null
  const instance = viewer.value
  viewer.value = null
  if (instance && !instance.isDestroyed()) instance.destroy()
})

const CONTROLS = computed(() => [
  { id: 'zoom-in', icon: Plus, label: 'Acercar', action: () => zoom(-0.35) },
  { id: 'zoom-out', icon: Minus, label: 'Alejar', action: () => zoom(0.5) },
  { id: 'reset', icon: RotateCcw, label: 'Restablecer vista', action: resetView },
  {
    id: 'mode',
    icon: GlobeIcon,
    label: is2D.value ? 'Cambiar a 3D' : 'Cambiar a 2D',
    action: toggleSceneMode,
    active: is2D.value,
    text: is2D.value ? '2D' : '3D',
  },
  // Agrupado con el resto de controles de vista: suelto en la esquina inferior
  // derecha chocaba con el panel de capas en visores bajos.
  { id: 'fullscreen', icon: Maximize2, label: 'Pantalla completa', action: toggleFullscreen },
])

const LAYER_TOGGLES = computed(() => [
  { id: 'orbit', icon: OrbitIcon, label: 'Anillo orbital', model: showOrbit },
  { id: 'ground', icon: Waypoints, label: 'Traza terrestre', model: showGroundTrack },
  { id: 'footprint', icon: Target, label: 'Huella de cobertura', model: showFootprint },
  { id: 'lighting', icon: Sun, label: 'Iluminacion solar', model: lightingEnabled, action: toggleLighting },
  { id: 'stars', icon: Sparkles, label: 'Estrellas de fondo', model: showStars, action: toggleStars },
])
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-[#05070b]">
    <div ref="container" class="absolute inset-0" />

    <!-- Capas 3D: se montan cuando el viewer existe -->
    <template v-if="viewer">
      <SatelliteEntity />
      <OrbitPolyline
        :show-orbit="showOrbit"
        :show-ground-track="showGroundTrack"
        :show-footprint="showFootprint"
      />
    </template>

    <!-- Controles de camara (arriba izquierda). Objetivos tactiles de 36 px en movil. -->
    <div class="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
      <button
        v-for="control in CONTROLS"
        :key="control.id"
        type="button"
        class="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md border border-grid-700 bg-space-800/90 text-ink-300 backdrop-blur transition-colors hover:border-accent-500/60 hover:text-accent-400 sm:h-8 sm:w-8"
        :class="control.active && 'border-accent-500/60 text-accent-400'"
        :title="control.label"
        :aria-label="control.label"
        @click="control.action"
      >
        <span v-if="control.text" class="text-[10px] font-semibold">{{ control.text }}</span>
        <component :is="control.icon" v-else :size="14" />
      </button>
    </div>

    <!--
      Capas visibles (arriba derecha). En movil el panel abierto taparia medio
      globo, asi que se pliega tras un boton y solo se despliega al tocarlo.
    -->
    <div class="absolute right-3 top-3 flex flex-col items-end gap-1">
      <div class="flex items-center gap-1">
        <!-- Selector de tema del globo -->
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md border border-grid-700 bg-space-800/90 text-ink-300 backdrop-blur transition-colors hover:text-accent-400 sm:h-8 sm:w-8"
          :class="themePickerOpen && 'border-accent-500/60 text-accent-400'"
          :aria-expanded="themePickerOpen"
          :title="`Tema del globo: ${activeTheme.label}`"
          aria-label="Tema del globo"
          @click="toggleThemePicker"
        >
          <Palette :size="15" />
        </button>

        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-md border border-grid-700 bg-space-800/90 text-ink-300 backdrop-blur transition-colors sm:hidden"
          :class="layersOpen && 'border-accent-500/60 text-accent-400'"
          :aria-expanded="layersOpen"
          aria-label="Capas del visor"
          @click="toggleLayersPanel"
        >
          <Layers :size="15" />
        </button>
      </div>

      <!-- Lista de temas -->
      <div
        v-if="themePickerOpen"
        class="max-h-[calc(100%-3rem)] w-60 overflow-y-auto rounded-md border border-grid-700 bg-space-800/95 p-1 backdrop-blur"
      >
        <p class="px-1.5 pb-1 pt-0.5 text-[9px] font-semibold tracking-[0.12em] text-ink-600">
          TEMA DEL GLOBO
        </p>
        <button
          v-for="theme in GLOBE_THEMES"
          :key="theme.id"
          type="button"
          class="w-full rounded px-1.5 py-1.5 text-left transition-colors"
          :class="
            themeId === theme.id
              ? 'bg-accent-500/10 text-accent-400'
              : 'text-ink-300 hover:bg-space-750'
          "
          :disabled="applyingTheme"
          @click="selectTheme(theme.id)"
        >
          <span class="flex items-center gap-1.5 text-[11px] font-medium">
            {{ theme.label }}
            <WifiOff
              v-if="!theme.offline"
              :size="10"
              class="text-warn-500"
              title="Necesita conexion a internet"
            />
          </span>
          <span class="mt-0.5 block text-[10px] leading-tight text-ink-600">
            {{ theme.description }}
          </span>
        </button>
        <p class="px-1.5 pb-0.5 pt-1.5 text-[9px] leading-relaxed text-ink-600">
          Los temas con
          <WifiOff :size="9" class="inline text-warn-500" />
          descargan teselas de terceros y requieren conexion.
        </p>
      </div>

      <!-- max-h evita que el panel desborde el visor cuando este es bajo
           (movil en horizontal), donde chocaba con los controles inferiores.
           Con el selector de temas abierto se oculta: apilados taparian el
           globo entero. -->
      <div
        class="max-h-[calc(100%-1rem)] flex-col gap-1 overflow-y-auto rounded-md border border-grid-700 bg-space-800/90 p-1 backdrop-blur"
        :class="themePickerOpen ? 'hidden' : layersOpen ? 'flex' : 'hidden sm:flex'"
      >
        <span
          class="hidden px-1.5 pt-0.5 text-[9px] font-semibold tracking-[0.12em] text-ink-600 sm:block"
        >
          CAPAS
        </span>
        <button
          v-for="toggle in LAYER_TOGGLES"
          :key="toggle.id"
          type="button"
          class="flex items-center gap-2 rounded px-1.5 py-1.5 text-[11px] transition-colors sm:py-1"
          :class="
            toggle.model.value
              ? 'bg-accent-500/10 text-accent-400'
              : 'text-ink-500 hover:text-ink-300'
          "
          :title="toggle.label"
          @click="toggle.action ? toggle.action() : (toggle.model.value = !toggle.model.value)"
        >
          <component :is="toggle.icon" :size="12" />
          <span class="pr-1">{{ toggle.label }}</span>
        </button>
      </div>
    </div>

    <!--
      Leyenda de regimenes + estado del motor.
      Va centrada abajo a proposito: la esquina inferior izquierda la ocupan los
      creditos de CesiumJS, que por licencia deben permanecer visibles.
    -->
    <div
      class="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-md border border-grid-700 bg-space-800/85 px-3 py-1.5 backdrop-blur sm:bottom-4 sm:gap-4"
    >
      <span
        v-for="regime in REGIME_LEGEND"
        :key="regime.id"
        class="flex items-center gap-1.5 text-[10px] text-ink-300"
        :title="regime.description"
      >
        <span class="status-dot" :style="{ backgroundColor: regime.color, color: regime.color }" />
        {{ regime.id }}
      </span>

      <span class="hidden h-3 w-px bg-grid-700 sm:block" />

      <!-- Los indicadores del motor son secundarios: en movil se ceden en favor
           de la leyenda, que es lo que hace falta para leer el globo. -->
      <span class="hidden items-center gap-1.5 text-[10px] sm:flex">
        <span class="telemetry-label">SGP4</span>
        <span class="font-mono tabular-nums text-signal-400">{{ store.propagationRate }} Hz</span>
      </span>
      <span class="hidden items-center gap-1.5 text-[10px] sm:flex">
        <span class="telemetry-label">OBJ</span>
        <span class="font-mono tabular-nums text-ink-300">
          {{ store.filteredSatellites.length.toLocaleString('es-ES') }}
        </span>
      </span>
    </div>

    <!-- Tooltip de hover. Oculto en movil: sin raton no hay hover, y al tocar
         un punto la ficha del satelite ya muestra estos datos y mas. -->
    <div
      v-if="tooltip.visible && tooltipSatellite"
      class="pointer-events-none absolute z-10 hidden -translate-y-1/2 translate-x-4 rounded-md border border-grid-600 bg-space-850/95 px-2.5 py-1.5 shadow-xl shadow-black/60 backdrop-blur sm:block"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      <p class="text-[11px] font-semibold text-ink-100">{{ tooltipSatellite.name }}</p>
      <p class="font-mono text-[10px] text-ink-500">
        NORAD {{ tooltipSatellite.id }} · {{ tooltipSatellite.regime }}
      </p>
      <p v-if="tooltipTelemetry" class="font-mono text-[10px] text-accent-400">
        {{ tooltipTelemetry.altitudeKm.toFixed(0) }} km ·
        {{ tooltipTelemetry.speedKmS.toFixed(2) }} km/s
      </p>
    </div>

    <!-- Aviso cuando un tema no se puede cargar -->
    <div
      v-if="themeError"
      class="absolute left-1/2 top-3 flex max-w-sm -translate-x-1/2 items-start gap-2 rounded-md border border-warn-500/40 bg-space-850/95 px-3 py-2 backdrop-blur"
    >
      <TriangleAlert :size="13" class="mt-px shrink-0 text-warn-500" />
      <p class="text-[11px] leading-relaxed text-ink-300">{{ themeError }}</p>
      <button
        type="button"
        class="shrink-0 text-ink-600 hover:text-ink-100"
        aria-label="Descartar aviso"
        @click="themeError = null"
      >
        ×
      </button>
    </div>

    <!-- Estados de carga y error -->
    <div
      v-if="store.isInitializing"
      class="pointer-events-none absolute inset-0 flex items-center justify-center bg-space-950/60 backdrop-blur-[2px]"
    >
      <div class="flex flex-col items-center gap-3">
        <span
          class="h-7 w-7 animate-spin rounded-full border-2 border-accent-500/30 border-t-accent-500"
        />
        <p class="text-xs tracking-[0.14em] text-ink-300">DESCARGANDO CATALOGO TLE</p>
      </div>
    </div>

    <div
      v-if="initError"
      class="absolute inset-0 flex items-center justify-center bg-space-950/90 p-8"
    >
      <div class="panel max-w-md p-5">
        <p class="mb-2 text-sm font-semibold text-alert-500">No se pudo inicializar el visor 3D</p>
        <p class="text-xs leading-relaxed text-ink-300">{{ initError }}</p>
        <p class="mt-3 text-[11px] text-ink-500">
          Comprueba que el navegador soporta WebGL 2 y que la aceleracion por hardware esta activa.
        </p>
      </div>
    </div>

  </div>
</template>
