/**
 * Clave de inyeccion compartida por los componentes de Cesium.
 *
 * `GlobeViewer` es el unico que crea el `Viewer`; el resto de componentes
 * (`SatelliteEntity`, `OrbitPolyline`) lo reciben por `inject` y se limitan a
 * anadir y limpiar sus propias primitivas. Asi cada capa gestiona su ciclo de
 * vida sin que el visor tenga que conocerlas.
 */
import { inject } from 'vue'

export const CESIUM_VIEWER_KEY = Symbol('cesium-viewer')

/** @returns {import('vue').ShallowRef<import('cesium').Viewer|null>} */
export function useCesiumViewer() {
  const viewer = inject(CESIUM_VIEWER_KEY, null)
  if (!viewer) {
    throw new Error('useCesiumViewer() requiere un <GlobeViewer> ancestro')
  }
  return viewer
}
