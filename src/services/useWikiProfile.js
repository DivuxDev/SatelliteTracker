/**
 * useWikiProfile
 * ---------------------------------------------------------------------------
 * Dispara `wikiLookupService.lookupByNorad` solo cuando hace falta: el modal
 * de telemetria esta abierto Y el satelite seleccionado es elegible (ver
 * `isWikiEligible`). Nunca se llama desde la ficha siempre visible
 * (SatelliteCard): eso dispararia una peticion de red por cada satelite que
 * el usuario mirase de pasada, no solo los que abre a proposito.
 */
import { ref, watch } from 'vue'
import { isWikiEligible, lookupByNorad } from './wikiLookupService'

/**
 * @param {import('vue').Ref<object|null>} satelliteRef
 * @param {import('vue').Ref<object|null>} profileRef
 * @param {import('vue').Ref<boolean>} openRef
 * @param {import('vue').Ref<boolean>} isDemoModeRef
 */
export function useWikiProfile(satelliteRef, profileRef, openRef, isDemoModeRef) {
  /** @type {import('vue').Ref<'idle'|'loading'|'ok'|'none'|'error'>} */
  const state = ref('idle')
  const entry = ref(null)

  watch(
    [() => satelliteRef.value?.id, openRef],
    async ([id, isOpen]) => {
      if (!isOpen || !id) {
        state.value = 'idle'
        entry.value = null
        return
      }

      if (!isWikiEligible(satelliteRef.value, profileRef.value, { isDemoMode: isDemoModeRef.value })) {
        state.value = 'idle'
        entry.value = null
        return
      }

      state.value = 'loading'
      entry.value = null
      const result = await lookupByNorad(id)

      // El satelite pudo cambiar (o el modal cerrarse) mientras la peticion
      // estaba en vuelo: no pisar el estado de una seleccion mas reciente.
      if (satelliteRef.value?.id !== id || !openRef.value) return
      state.value = result.status
      entry.value = result.status === 'ok' ? result : null
    },
    { immediate: true },
  )

  return { state, entry }
}
