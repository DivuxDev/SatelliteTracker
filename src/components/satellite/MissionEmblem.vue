<script setup>
/**
 * MissionEmblem
 * ---------------------------------------------------------------------------
 * Insignia circular de un satelite: glifo por tipo de mision (ver
 * `missionEmblems.js`) coloreado con el acento de su regimen orbital, sobre
 * un fondo con un arco de orbita tenue detras para que siga leyendose como
 * "objeto en orbita" y no como un icono suelto.
 */
import { computed } from 'vue'
import { MISSION_EMBLEMS, FALLBACK_EMBLEM } from './missionEmblems'

const props = defineProps({
  typeId: { type: String, required: true },
  color: { type: String, default: '#7fb5f2' },
  size: { type: Number, default: 50 },
})

const shape = computed(() => MISSION_EMBLEMS[props.typeId] ?? FALLBACK_EMBLEM)
const glyphSize = computed(() => Math.round(props.size * 0.56))
</script>

<template>
  <div
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-accent-300/45 bg-space-850"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <!-- Arco de orbita tenue, decorativo: da contexto de "en orbita" sin competir con el glifo. -->
    <svg viewBox="0 0 50 50" class="absolute inset-0 h-full w-full opacity-25">
      <ellipse cx="25" cy="25" rx="21" ry="10" fill="none" :stroke="color" stroke-width="1" />
    </svg>
    <svg
      :width="glyphSize"
      :height="glyphSize"
      viewBox="0 0 24 24"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="relative"
      v-html="shape"
    />
  </div>
</template>
