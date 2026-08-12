<script setup>
/**
 * App
 * ---------------------------------------------------------------------------
 * Composicion de la aplicacion: cabecera, dashboard y modales.
 *
 * La app es de una sola pantalla. El visor 3D nunca se desmonta —destruir y
 * recrear el `Viewer` de Cesium costaria cientos de milisegundos y perderia el
 * estado de camara—, asi que todo lo accesorio (telemetria, pasadas,
 * diagnostico) se consulta en modales superpuestos.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import HeaderNav from '@/components/layout/HeaderNav.vue'
import DashboardView from '@/views/DashboardView.vue'
import TelemetryModal from '@/components/satellite/TelemetryModal.vue'
import GroundPassSimulator from '@/components/satellite/GroundPassSimulator.vue'
import DiagnosticsModal from '@/components/layout/DiagnosticsModal.vue'

const store = useSatelliteStore()

const detailsOpen = ref(false)
const passesOpen = ref(false)
const diagnosticsOpen = ref(false)

/* Escape cierra de dentro hacia fuera; sin nada abierto, deselecciona. */
function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (passesOpen.value) passesOpen.value = false
  else if (detailsOpen.value) detailsOpen.value = false
  else if (diagnosticsOpen.value) diagnosticsOpen.value = false
  else store.clearSelection()
}

onMounted(() => {
  store.initialize()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  store.dispose()
})
</script>

<template>
  <div class="flex h-full flex-col bg-space-950">
    <HeaderNav @open-diagnostics="diagnosticsOpen = true" />

    <main class="relative flex min-h-0 flex-1 flex-col">
      <DashboardView @open-details="detailsOpen = true" @open-passes="passesOpen = true" />
    </main>

    <TelemetryModal :open="detailsOpen" @close="detailsOpen = false" />
    <GroundPassSimulator :open="passesOpen" @close="passesOpen = false" />
    <DiagnosticsModal :open="diagnosticsOpen" @close="diagnosticsOpen = false" />
  </div>
</template>
