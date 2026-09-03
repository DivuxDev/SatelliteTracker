<script setup>
/**
 * OrbitPolyline
 * ---------------------------------------------------------------------------
 * Dibuja, para el satelite seleccionado:
 *   1. La orbita completa como anillo brillante.
 *   2. La traza sobre el terreno (ground track) de la siguiente revolucion.
 *   3. La huella de cobertura instantanea sobre la superficie.
 *
 * Detalle importante: el anillo orbital se calcula en el marco TEME
 * (cuasi-inercial) y se ancla a la Tierra rotando la coleccion completa con la
 * matriz TEME -> pseudo-fixed en cada frame. Si se generase directamente en
 * ECEF, la orbita saldria dibujada como una espiral deformada, porque la Tierra
 * gira por debajo mientras se recorre el periodo.
 */
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  CallbackProperty,
  Cartesian3,
  Color,
  JulianDate,
  Material,
  Matrix3,
  Matrix4,
  PolylineCollection,
  Transforms,
} from 'cesium'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { computeOrbitTrack, EARTH_RADIUS_KM } from '@/services/orbitCalculationService'
import { useCesiumViewer } from './useCesiumViewer'

const props = defineProps({
  showOrbit: { type: Boolean, default: true },
  showFootprint: { type: Boolean, default: true },
})

const store = useSatelliteStore()
const viewer = useCesiumViewer()

/** Anillo orbital, en marco TEME (rotado por modelMatrix). */
const orbitLines = shallowRef(null)
/** Huella de cobertura (una sola entidad). */
const footprintEntity = shallowRef(null)

let removePreUpdate = null
let trackRefreshTimer = null

const scratchMatrix3 = new Matrix3()
const scratchMatrix4 = new Matrix4()
const scratchPosition = new Cartesian3()

/*
 * Acento reconciliado con la rampa del logo (ver README de diseno, seccion
 * «Marca»): el azul generico #3b82f6 desaparece del proyecto. El anillo usa
 * el paso mas claro (accent-300) y la huella el par accent-400/accent-500,
 * igual que en las superficies CSS.
 */
const ORBIT_RING_COLOR = Color.fromCssColorString('#7fb5f2')
const FOOTPRINT_FILL_COLOR = Color.fromCssColorString('#2f7fe0')
const FOOTPRINT_OUTLINE_COLOR = Color.fromCssColorString('#5fa8f0')

/* -------------------------------------------------------------------------- */
/* Ciclo de vida de las primitivas                                            */
/* -------------------------------------------------------------------------- */

function ensurePrimitives() {
  const instance = viewer.value
  if (!instance || orbitLines.value) return

  orbitLines.value = instance.scene.primitives.add(new PolylineCollection())

  // La orbita vive en TEME: rotamos toda la coleccion en cada frame.
  removePreUpdate = instance.scene.preUpdate.addEventListener(() => {
    const collection = orbitLines.value
    if (!collection || collection.length === 0) return
    const julian = JulianDate.fromDate(new Date(store.currentSimulatedTime()))
    const rotation = Transforms.computeTemeToPseudoFixedMatrix(julian, scratchMatrix3)
    if (!rotation) return
    collection.modelMatrix = Matrix4.fromRotationTranslation(
      rotation,
      Cartesian3.ZERO,
      scratchMatrix4,
    )
  })
}

/* -------------------------------------------------------------------------- */
/* Anillo orbital                                                             */
/* -------------------------------------------------------------------------- */

function drawOrbit() {
  ensurePrimitives()
  const collection = orbitLines.value
  if (!collection) return

  collection.removeAll()
  const sat = store.selectedSatellite
  if (!sat || !props.showOrbit) return

  const track = computeOrbitTrack(
    sat.satrec,
    new Date(store.currentSimulatedTime()),
    sat.periodMinutes,
    // Las orbitas altas son casi circulares y necesitan menos muestras.
    sat.regime === 'LEO' ? 260 : 180,
  )
  if (track.length < 9) return

  const positions = new Array(track.length / 3)
  for (let i = 0; i < positions.length; i += 1) {
    positions[i] = new Cartesian3(track[i * 3], track[i * 3 + 1], track[i * 3 + 2])
  }

  collection.add({
    positions,
    loop: true,
    width: 2,
    material: Material.fromType('PolylineGlow', {
      color: ORBIT_RING_COLOR.withAlpha(0.85),
      glowPower: 0.2,
      taperPower: 1,
    }),
  })
}

/* -------------------------------------------------------------------------- */
/* Huella de cobertura                                                        */
/* -------------------------------------------------------------------------- */

/** Radio en superficie del cono de visibilidad (elevacion 0) para altitud h. */
function footprintRadiusMeters(altitudeKm) {
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(altitudeKm, 1))
  return EARTH_RADIUS_KM * Math.acos(Math.min(1, ratio)) * 1000
}

function ensureFootprint() {
  const instance = viewer.value
  if (!instance || footprintEntity.value) return

  footprintEntity.value = instance.entities.add({
    position: new CallbackProperty(() => {
      const id = store.selectedId
      if (!id) return undefined
      // peekTelemetry: dato fresco de cada frame y sin dependencia reactiva.
      const telemetry = store.peekTelemetry(id)
      if (!telemetry) return undefined
      return Cartesian3.fromDegrees(
        telemetry.longitude,
        telemetry.latitude,
        0,
        undefined,
        scratchPosition,
      )
    }, false),
    ellipse: {
      semiMajorAxis: new CallbackProperty(() => currentFootprintRadius(), false),
      semiMinorAxis: new CallbackProperty(() => currentFootprintRadius(), false),
      material: FOOTPRINT_FILL_COLOR.withAlpha(0.1),
      outline: true,
      outlineColor: FOOTPRINT_OUTLINE_COLOR.withAlpha(0.6),
      outlineWidth: 1,
      height: 0,
    },
    show: false,
  })
}

function currentFootprintRadius() {
  const id = store.selectedId
  if (!id) return 1
  const telemetry = store.peekTelemetry(id)
  return footprintRadiusMeters(telemetry?.altitudeKm ?? store.getById(id)?.perigeeKm ?? 500)
}

function syncFootprintVisibility() {
  ensureFootprint()
  if (!footprintEntity.value) return
  footprintEntity.value.show = Boolean(props.showFootprint && store.selectedSatellite)
}

/* -------------------------------------------------------------------------- */
/* Enlaces reactivos                                                          */
/* -------------------------------------------------------------------------- */

function redrawAll() {
  drawOrbit()
  syncFootprintVisibility()
}

watch(
  [
    () => store.selectedId,
    () => props.showOrbit,
    () => props.showFootprint,
    () => store.timeMultiplier,
  ],
  redrawAll,
  { immediate: true },
)

// La orbita precesa lentamente: refrescamos la traza cada pocos segundos para
// que no se desacople del satelite, sobre todo con el reloj acelerado.
trackRefreshTimer = setInterval(() => {
  if (store.selectedId && !store.isPaused) {
    drawOrbit()
  }
}, 10_000)

onBeforeUnmount(() => {
  clearInterval(trackRefreshTimer)
  removePreUpdate?.()
  const instance = viewer.value
  if (instance && !instance.isDestroyed()) {
    if (orbitLines.value) instance.scene.primitives.remove(orbitLines.value)
    if (footprintEntity.value) instance.entities.remove(footprintEntity.value)
  }
  orbitLines.value = null
  footprintEntity.value = null
})
</script>

<template>
  <!-- Sin salida en el DOM: este componente solo gestiona primitivas de Cesium. -->
</template>
