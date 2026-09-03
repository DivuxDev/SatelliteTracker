<script setup>
/**
 * SatelliteEntity
 * ---------------------------------------------------------------------------
 * Capa de puntos del catalogo. Es un componente sin salida en el DOM: su unica
 * responsabilidad es mantener sincronizada una `PointPrimitiveCollection` de
 * Cesium con el estado del store.
 *
 * Por que primitivas y no entidades: una `Entity` por satelite implica un
 * `Property` que Cesium evalua en cada frame, con un coste de decenas de
 * microsegundos cada una. Con miles de objetos eso es inviable. Una
 * `PointPrimitiveCollection` los agrupa en un unico draw call y solo hay que
 * reescribir el buffer de posiciones.
 */
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  BlendOption,
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  NearFarScalar,
  PointPrimitiveCollection,
  VerticalOrigin,
} from 'cesium'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { ORBIT_REGIMES } from '@/services/orbitCalculationService'
import { useCesiumViewer } from './useCesiumViewer'

/** Por encima de este numero de satelites visibles dejamos de rotular. */
const LABEL_THRESHOLD = 70

/**
 * En un lienzo de movil los mismos puntos tapan buena parte del globo, asi que
 * se dibujan algo mas pequenos. Se resuelve al construir la coleccion: un
 * cambio de tamano de ventana no justifica reconstruir miles de primitivas.
 */
const isCompactViewport = window.matchMedia('(max-width: 1023px)').matches
const BASE_POINT_SIZE = isCompactViewport ? 4 : 5.5
const GEO_POINT_SIZE = isCompactViewport ? 4.5 : 6

const store = useSatelliteStore()
const viewer = useCesiumViewer()

const points = shallowRef(null)
const labels = shallowRef(null)

/** Indice en `store.satellites` -> PointPrimitive, para acceso O(1) por frame. */
let primitives = []
/** id NORAD -> Label actualmente instanciada. */
const labelPrimitives = new Map()
/** Conjunto de ids rotulados, para no recrear las etiquetas cada frame. */
let labelledIds = new Set()
/** Estado original de los puntos resaltados, para poder restaurarlo. */
let previouslyHighlighted = []

const scratchPosition = new Cartesian3()

/**
 * Los puntos van sobre el negro del espacio, no sobre un panel: usan el paso
 * `markColor` (mas brillante) de la misma familia de tonos que la paleta de la
 * interfaz, para que la identidad de cada regimen no cambie entre medios.
 */
const REGIME_COLORS = Object.fromEntries(
  Object.entries(ORBIT_REGIMES).map(([id, regime]) => [
    id,
    Color.fromCssColorString(regime.markColor),
  ]),
)
const SELECTED_COLOR = Color.fromCssColorString('#ffffff')
// Acento reconciliado con el logo (ver README de diseno, seccion «Marca»):
// el azul generico #3b82f6/#93c5fd desaparece del proyecto.
const HOVERED_COLOR = Color.fromCssColorString('#7fb5f2')
const LABEL_COLOR = Color.fromCssColorString('#cbd5e1')
const LABEL_COLOR_SELECTED = Color.fromCssColorString('#ffffff')
const OUTLINE_HIGHLIGHT = Color.fromCssColorString('#7fb5f2').withAlpha(0.85)

function sameSet(a, b) {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

/* -------------------------------------------------------------------------- */
/* Construccion de la coleccion                                               */
/* -------------------------------------------------------------------------- */

function ensureCollections() {
  if (points.value || !viewer.value) return
  const scene = viewer.value.scene
  points.value = scene.primitives.add(
    new PointPrimitiveCollection({ blendOption: BlendOption.OPAQUE_AND_TRANSLUCENT }),
  )
  labels.value = scene.primitives.add(new LabelCollection({ scene }))
}

function rebuild(satellites) {
  ensureCollections()
  const collection = points.value
  if (!collection) return

  collection.removeAll()
  labels.value?.removeAll()
  labelPrimitives.clear()
  labelledIds = new Set()
  previouslyHighlighted = []
  primitives = new Array(satellites.length)

  for (let i = 0; i < satellites.length; i += 1) {
    const sat = satellites[i]
    primitives[i] = collection.add({
      id: sat.id,
      position: Cartesian3.ZERO,
      color: REGIME_COLORS[sat.regime] ?? REGIME_COLORS.LEO,
      pixelSize: sat.regime === 'GEO' ? GEO_POINT_SIZE : BASE_POINT_SIZE,
      // Un contorno translucido del color del punto simula un halo suave sin
      // pagar el coste de un billboard con textura por satelite.
      outlineColor: (REGIME_COLORS[sat.regime] ?? REGIME_COLORS.LEO).withAlpha(0.25),
      outlineWidth: 2,
      // Los objetos lejanos se encogen en lugar de saturar la pantalla.
      scaleByDistance: new NearFarScalar(1.5e6, 1.6, 6.0e7, 0.6),
      translucencyByDistance: new NearFarScalar(1.5e6, 1.0, 1.2e8, 0.35),
      show: false,
    })
  }

  applyPositions()
  applyHighlight()
}

/* -------------------------------------------------------------------------- */
/* Actualizaciones por frame                                                  */
/* -------------------------------------------------------------------------- */

function applyPositions() {
  const collection = points.value
  const current = store.frame
  if (!collection || !current.pos || primitives.length === 0) return
  if (current.count !== primitives.length) return // catalogo cambiado; esperamos al rebuild

  const { pos, flags } = current
  const mask = store.visibilityMask

  for (let i = 0; i < primitives.length; i += 1) {
    const primitive = primitives[i]
    if (!primitive) continue

    if (mask[i] !== 1 || flags[i] !== 1) {
      if (primitive.show) primitive.show = false
      continue
    }

    const p = i * 3
    scratchPosition.x = pos[p]
    scratchPosition.y = pos[p + 1]
    scratchPosition.z = pos[p + 2]
    // El setter clona internamente, asi que reutilizar el scratch es seguro.
    primitive.position = scratchPosition
    if (!primitive.show) primitive.show = true
  }

  syncLabels()
}

/** Solo rotulamos cuando la escena no esta saturada de objetos. */
function syncLabels() {
  const labelCollection = labels.value
  const current = store.frame
  if (!labelCollection || !current.pos) return

  const visible = store.filteredSatellites
  const wanted = new Set()
  if (visible.length <= LABEL_THRESHOLD) for (const sat of visible) wanted.add(sat.id)
  if (store.selectedId) wanted.add(store.selectedId)
  if (store.hoveredId) wanted.add(store.hoveredId)

  if (!sameSet(wanted, labelledIds)) {
    labelCollection.removeAll()
    labelPrimitives.clear()
    for (const id of wanted) {
      const sat = store.getById(id)
      if (!sat) continue
      labelPrimitives.set(
        id,
        labelCollection.add({
          text: sat.name,
          font: '500 11px "JetBrains Mono", monospace',
          fillColor: LABEL_COLOR,
          outlineColor: Color.fromCssColorString('#05070b'),
          outlineWidth: 2.5,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(9, 0),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 1.4e8),
          position: Cartesian3.ZERO,
        }),
      )
    }
    labelledIds = wanted
  }

  for (const [id, label] of labelPrimitives) {
    const index = store.indexOf(id)
    if (index < 0 || current.flags[index] !== 1) {
      label.show = false
      continue
    }
    const p = index * 3
    scratchPosition.x = current.pos[p]
    scratchPosition.y = current.pos[p + 1]
    scratchPosition.z = current.pos[p + 2]
    label.position = scratchPosition
    label.show = true
    label.fillColor = id === store.selectedId ? LABEL_COLOR_SELECTED : LABEL_COLOR
  }
}

/** Resalta seleccion y hover restaurando siempre el estado anterior. */
function applyHighlight() {
  for (const entry of previouslyHighlighted) {
    entry.primitive.color = entry.color
    entry.primitive.pixelSize = entry.pixelSize
    entry.primitive.outlineWidth = entry.outlineWidth
    entry.primitive.outlineColor = entry.outlineColor
  }
  previouslyHighlighted = []

  const highlight = (id, color, size) => {
    if (!id) return
    const primitive = primitives[store.indexOf(id)]
    if (!primitive) return
    previouslyHighlighted.push({
      primitive,
      color: primitive.color,
      pixelSize: primitive.pixelSize,
      outlineWidth: primitive.outlineWidth,
      outlineColor: primitive.outlineColor,
    })
    primitive.color = color
    primitive.pixelSize = size
    primitive.outlineWidth = 2
    primitive.outlineColor = OUTLINE_HIGHLIGHT
  }

  highlight(store.hoveredId, HOVERED_COLOR, 8)
  highlight(store.selectedId, SELECTED_COLOR, 11)
}

/* -------------------------------------------------------------------------- */
/* Enlaces reactivos                                                          */
/* -------------------------------------------------------------------------- */

watch(() => store.satellites, rebuild, { immediate: true })

watch(() => store.frameTick, applyPositions)

watch(() => store.visibilityMask, applyPositions)

watch([() => store.selectedId, () => store.hoveredId], () => {
  applyHighlight()
  syncLabels()
})

onBeforeUnmount(() => {
  const scene = viewer.value?.scene
  if (scene && !scene.isDestroyed()) {
    if (points.value) scene.primitives.remove(points.value)
    if (labels.value) scene.primitives.remove(labels.value)
  }
  points.value = null
  labels.value = null
  primitives = []
  labelPrimitives.clear()
})
</script>

<template>
  <!-- Sin salida en el DOM: este componente solo gestiona primitivas de Cesium. -->
</template>
