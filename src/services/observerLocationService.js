/**
 * observerLocationService
 * ---------------------------------------------------------------------------
 * Ubicacion del observador en tierra: GPS o manual, persistida en
 * localStorage. Vivia como estado privado dentro de GroundPassSimulator.vue;
 * se extrae aqui porque el modal de eventos cosmicos y el panel de street
 * view (calculo de visibilidad de lluvias de meteoros, foto mas cercana)
 * necesitan la MISMA ubicacion, no una copia cada uno.
 *
 * `ref` a nivel de modulo en lugar de un store de Pinia: no es catalogo de
 * datos ni estado de sesion de la app, es una preferencia local del
 * navegador. La reactividad de Vue funciona igual fuera de un componente,
 * asi que un `ref`+`watch` de modulo basta para compartirlo entre quien lo
 * importe sin el peso de un store dedicado.
 */
import { computed, ref, watch } from 'vue'
import { toGeodetic } from './passPredictorService'

const STORAGE_KEY = 'sot:observer'

function readStorage() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (stored && Number.isFinite(stored.latitude) && Number.isFinite(stored.longitude)) {
      return stored
    }
  } catch {
    /* almacenamiento no disponible o corrupto */
  }
  // Por defecto, Madrid: hay que partir de algo concreto y verificable.
  return { latitude: 40.4168, longitude: -3.7038, altitudeM: 650, label: 'Madrid (por defecto)' }
}

/** Ubicacion del observador. Los campos numericos pueden ser '' de forma
 *  transitoria mientras se edita un BaseInput vacio: usar `isObserverValid`
 *  / `observerGeodetic` antes de propagar, nunca los campos crudos. */
export const observer = ref(readStorage())

export const geolocationState = ref('idle') // idle | locating | denied | error
export const geolocationMessage = ref('')

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(observer.value))
  } catch {
    /* almacenamiento no disponible */
  }
}

// Persistencia automatica: antes solo se guardaba al pulsar "Calcular
// pasadas" o tras el GPS, asi que editar las coordenadas a mano y cerrar el
// modal sin recalcular perdia el cambio. `deep` porque `observer` es un
// objeto plano editado campo a campo desde los BaseInput.
watch(observer, persist, { deep: true })

/** ¿Tiene la ubicacion coordenadas numericas validas ahora mismo? */
export function isObserverValid(value = observer.value) {
  return (
    Number.isFinite(Number(value?.latitude)) &&
    Number.isFinite(Number(value?.longitude)) &&
    Math.abs(Number(value.latitude)) <= 90 &&
    Math.abs(Number(value.longitude)) <= 180
  )
}

/** Geodetico en radianes/km para satellite.js, o null si aun no es valido
 *  (p.ej. mientras el usuario borra un campo numerico para reescribirlo). */
export const observerGeodetic = computed(() => {
  if (!isObserverValid()) return null
  return toGeodetic({
    latitude: Number(observer.value.latitude),
    longitude: Number(observer.value.longitude),
    altitudeM: Number(observer.value.altitudeM) || 0,
  })
})

/**
 * Pide la ubicacion GPS del navegador y actualiza `observer` si tiene exito.
 * @returns {Promise<void>}
 */
export function requestGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      geolocationState.value = 'error'
      geolocationMessage.value = 'Este navegador no expone la API de geolocalizacion.'
      resolve()
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
        resolve()
      },
      (error) => {
        geolocationState.value = error.code === error.PERMISSION_DENIED ? 'denied' : 'error'
        geolocationMessage.value =
          error.code === error.PERMISSION_DENIED
            ? 'Permiso de ubicacion denegado. Introduce las coordenadas a mano.'
            : `No se pudo obtener la ubicacion: ${error.message}`
        resolve()
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  })
}
