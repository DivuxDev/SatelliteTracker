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
import HelpModal from '@/components/layout/HelpModal.vue'
import CosmicEventsModal from '@/components/sky/CosmicEventsModal.vue'

const store = useSatelliteStore()

/**
 * Pila de modales abiertos, por nombre. Con 3 modales un if/else de booleans
 * bastaba; con 5+ (Manual, y los que vengan despues) deja de escalar, asi
 * que el estado es una lista y Escape siempre cierra el ultimo abierto.
 * `openModal` mueve el nombre al final si ya estaba, para que reabrir algo
 * que ya estaba abierto lo deje como "mas reciente" sin duplicarlo.
 */
const modalStack = ref([])

function openModal(name) {
  modalStack.value = [...modalStack.value.filter((m) => m !== name), name]
}
function closeModal(name) {
  modalStack.value = modalStack.value.filter((m) => m !== name)
}
function isModalOpen(name) {
  return modalStack.value.includes(name)
}

/* Escape cierra de dentro hacia fuera; sin nada abierto, deselecciona. */
function onKeydown(event) {
  if (event.key !== 'Escape') return
  if (modalStack.value.length > 0) {
    closeModal(modalStack.value[modalStack.value.length - 1])
  } else {
    store.clearSelection()
  }
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
  <div class="relative flex h-full flex-col bg-space-950">
    <HeaderNav
      @open-diagnostics="openModal('diagnostics')"
      @open-help="openModal('help')"
    />

    <main class="relative flex min-h-0 flex-1 flex-col">
      <DashboardView
        @open-details="openModal('details')"
        @open-passes="openModal('passes')"
        @open-cosmic-events="openModal('cosmic-events')"
      />
    </main>

    <TelemetryModal :open="isModalOpen('details')" @close="closeModal('details')" />
    <GroundPassSimulator :open="isModalOpen('passes')" @close="closeModal('passes')" />
    <DiagnosticsModal :open="isModalOpen('diagnostics')" @close="closeModal('diagnostics')" />
    <HelpModal :open="isModalOpen('help')" @close="closeModal('help')" />
    <CosmicEventsModal :open="isModalOpen('cosmic-events')" @close="closeModal('cosmic-events')" />
  </div>
</template>
