<script setup>
/**
 * BaseModal
 * ---------------------------------------------------------------------------
 * Cascaron comun de los modales de la app: velo + superficie destacada HUD
 * (`hud-modal`), cabecera con titulo/subtitulo/cierre, cuerpo con scroll.
 *
 * Antes cada modal (Telemetria, Diagnostico, Pasadas) duplicaba este marcado
 * a mano, y se desincronizaron: Telemetria ya usa `hud-modal` pero los otros
 * dos se quedaron en el `.panel` opaco del sistema visual anterior. Los
 * modales NUEVOS parten de aqui; los tres existentes se migran aparte.
 */
import { X } from '@lucide/vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  /** Clase Tailwind de ancho maximo del panel. */
  maxWidth: { type: String, default: 'max-w-3xl' },
})
const emit = defineEmits(['close'])
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-space-950/80 p-2 backdrop-blur-sm sm:p-4"
    @click.self="emit('close')"
  >
    <div
      class="panel hud-modal flex max-h-[94vh] w-full flex-col overflow-hidden sm:max-h-[88vh]"
      :class="maxWidth"
    >
      <div class="panel-header border-b-[rgba(127,181,242,.16)] px-4 py-3.5">
        <div class="flex min-w-0 items-center gap-2.5">
          <component :is="icon" v-if="icon" :size="16" class="shrink-0 text-hud-ink-accent" />
          <div class="min-w-0">
            <h2 class="panel-title text-hud-ink-accent hud-title">{{ title }}</h2>
            <p v-if="subtitle" class="mt-0.5 truncate text-t4 font-semibold text-hud-ink-100">
              {{ subtitle }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-300/28 bg-[rgba(10,18,32,.55)] text-hud-ink-300 transition-colors hover:text-accent-400"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          <X :size="15" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </div>

      <div v-if="$slots.footer" class="shrink-0 border-t border-accent-300/16 px-4 py-3">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
