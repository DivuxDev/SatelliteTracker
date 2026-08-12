<script setup>
/**
 * DiagnosticsModal
 * ---------------------------------------------------------------------------
 * Estado de las fuentes de datos y del motor de propagacion. Es el diagnostico
 * de la app: de donde viene cada TLE, cuando se descargo, que grupos han
 * fallado y como va el worker de SGP4.
 *
 * Vive en un modal y no en una pestana propia porque la app es de una sola
 * pantalla: el visor nunca se pierde de vista, y el diagnostico se consulta de
 * forma puntual —cuando algo no cuadra— no de forma continua.
 */
import { computed } from 'vue'
import { CircleAlert, Database, RefreshCw, Signal, TriangleAlert, X, Zap } from '@lucide/vue'

import { useSatelliteStore } from '@/stores/satelliteStore'
import { CATEGORIES } from '@/services/celestrakService'
import BaseButton from '@/components/ui/BaseButton.vue'

defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const store = useSatelliteStore()

const lastSyncLabel = computed(() => {
  if (!store.lastSyncAt) return 'nunca'
  const minutes = (Date.now() - store.lastSyncAt) / 60_000
  if (minutes < 1) return 'hace menos de un minuto'
  if (minutes < 60) return `hace ${minutes.toFixed(0)} min`
  return `hace ${(minutes / 60).toFixed(1)} h`
})

const sources = computed(() =>
  CATEGORIES.map((category) => {
    const summary = store.categoryBreakdown.find((c) => c.id === category.id)
    const errors = store.loadErrors.filter((e) => e.categoryId === category.id)
    return {
      ...category,
      count: summary?.count ?? 0,
      loaded: summary?.loaded ?? false,
      loading: summary?.loading ?? false,
      active: summary?.active ?? false,
      stale: summary?.stale ?? false,
      errors,
    }
  }),
)

/** Estado agregado del enlace de datos. */
const linkStatus = computed(() => {
  if (store.isDemoMode) {
    return {
      label: 'Sin enlace · datos sinteticos',
      color: '#c2760a',
      detail:
        'No se pudo alcanzar Celestrak. La constelacion mostrada se genera localmente y no corresponde a satelites reales.',
    }
  }
  if (store.loadErrors.length > 0) {
    return {
      label: 'Enlace degradado',
      color: '#ef4444',
      detail: 'Algunos conjuntos no se han podido descargar. El resto del catalogo es valido.',
    }
  }
  return {
    label: 'Enlace operativo',
    color: '#16a34a',
    detail: 'Descarga de TLE desde Celestrak correcta. Cache local de 2 horas.',
  }
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-space-950/80 p-2 backdrop-blur-sm sm:p-4"
    @click.self="emit('close')"
  >
    <div class="panel flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden sm:max-h-[88vh]">
      <div class="panel-header">
        <div class="flex min-w-0 items-center gap-2">
          <Signal :size="14" class="shrink-0 text-accent-400" />
          <h2 class="panel-title">Diagnostico de datos</h2>
        </div>
        <button
          type="button"
          class="text-ink-600 transition-colors hover:text-ink-100"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          <X :size="15" />
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        <!-- Estado del enlace -->
        <div class="rounded-md border border-grid-700 bg-space-800/40 p-3 sm:p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex gap-3">
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                :style="{ backgroundColor: `${linkStatus.color}1f`, color: linkStatus.color }"
              >
                <Signal :size="16" />
              </span>
              <div>
                <p class="text-sm font-semibold text-ink-100">{{ linkStatus.label }}</p>
                <p class="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-ink-500">
                  {{ linkStatus.detail }}
                </p>
                <p class="mt-1 font-mono text-[10px] text-ink-600">
                  Ultima sincronizacion: {{ lastSyncLabel }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <BaseButton
                variant="ghost"
                size="sm"
                title="Vacia la cache TLE local. Celestrak solo regenera los datos cada 2 horas, asi que tras purgar puede responder 403 hasta la siguiente actualizacion."
                @click="store.purgeCache()"
              >
                <Database :size="12" />
                Vaciar cache
              </BaseButton>
              <BaseButton variant="secondary" size="sm" @click="store.resync()">
                <RefreshCw :size="12" />
                Resincronizar
              </BaseButton>
            </div>
          </div>
        </div>

        <!-- Motor de propagacion -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div class="rounded-md border border-grid-700 bg-space-800/40 p-3">
            <p class="telemetry-label">Motor</p>
            <p class="mt-1 flex items-center gap-1.5 text-sm text-ink-100">
              <Zap :size="14" class="text-signal-500" />
              SGP4 / SDP4
            </p>
            <p class="mt-0.5 text-[11px] text-ink-600">satellite.js en Web Worker</p>
          </div>
          <div class="rounded-md border border-grid-700 bg-space-800/40 p-3">
            <p class="telemetry-label">Tasa de actualizacion</p>
            <p class="mt-1 font-mono text-2xl tabular-nums text-signal-500">
              {{ store.propagationRate }}<span class="text-sm text-ink-500"> Hz</span>
            </p>
            <p class="mt-0.5 text-[11px] text-ink-600">catalogo completo por ciclo</p>
          </div>
          <div class="rounded-md border border-grid-700 bg-space-800/40 p-3">
            <p class="telemetry-label">Objetos propagados</p>
            <p class="mt-1 font-mono text-2xl tabular-nums text-ink-100">
              {{ store.totalCount.toLocaleString('es-ES') }}
            </p>
            <p class="mt-0.5 text-[11px] text-ink-600">
              {{ store.frame.count.toLocaleString('es-ES') }} en el ultimo frame
            </p>
          </div>
          <div class="rounded-md border border-grid-700 bg-space-800/40 p-3">
            <p class="telemetry-label">Reloj</p>
            <p class="mt-1 font-mono text-2xl tabular-nums text-ink-100">
              {{ store.timeMultiplier }}x
            </p>
            <p
              class="mt-0.5 text-[11px]"
              :class="store.isPaused ? 'text-warn-500' : 'text-ink-600'"
            >
              {{ store.isPaused ? 'pausado' : 'en marcha' }}
            </p>
          </div>
        </div>

        <!-- Fuentes de datos -->
        <div class="overflow-hidden rounded-md border border-grid-700">
          <div class="panel-header">
            <div class="flex items-center gap-2">
              <Database :size="14" class="text-accent-400" />
              <h3 class="panel-title">Fuentes de datos · Celestrak</h3>
            </div>
            <span class="font-mono text-[10px] text-ink-600">GP · FORMAT=tle</span>
          </div>

          <div class="divide-y divide-grid-800">
            <div
              v-for="source in sources"
              :key="source.id"
              class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <span
                class="status-dot shrink-0"
                :style="{
                  backgroundColor: source.loaded ? source.color : '#4c5a72',
                  color: source.loaded ? source.color : '#4c5a72',
                }"
              />
              <div class="min-w-[180px] flex-1">
                <p class="text-xs font-medium text-ink-100">{{ source.label }}</p>
                <p class="mt-0.5 font-mono text-[10px] text-ink-600">
                  GROUP={{ source.groups.join(', ') }}
                </p>
              </div>

              <span class="w-20 text-right font-mono text-xs tabular-nums text-ink-300">
                {{ source.count.toLocaleString('es-ES') }}
              </span>

              <span
                class="w-28 rounded px-1.5 py-0.5 text-center text-[10px]"
                :class="{
                  'bg-signal-500/15 text-signal-500': source.loaded && !source.stale,
                  'bg-space-750 text-ink-600': !source.loaded && !source.loading,
                  'bg-accent-500/15 text-accent-400': source.loading,
                  'bg-warn-500/15 text-warn-500': source.stale,
                }"
                :title="
                  source.stale
                    ? 'Celestrak confirmo que no hay datos nuevos; se sirve la copia local'
                    : ''
                "
              >
                {{
                  source.loading
                    ? 'descargando'
                    : source.stale
                      ? 'desde cache'
                      : source.loaded
                        ? 'cargado'
                        : 'no cargado'
                }}
              </span>

              <span
                v-if="source.heavy"
                class="flex items-center gap-1 text-[10px] text-warn-500"
                title="Conjunto grande: miles de objetos"
              >
                <TriangleAlert :size="11" />
                conjunto grande
              </span>

              <button
                v-if="!source.loaded && !source.loading && !store.isDemoMode"
                type="button"
                class="text-[10px] text-accent-400 hover:underline"
                @click="store.loadCategory(source.id).catch(() => {})"
              >
                Cargar ahora
              </button>

              <p
                v-for="error in source.errors"
                :key="error.message"
                class="w-full font-mono text-[10px] text-alert-500"
              >
                {{ error.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Incidencias -->
        <div
          v-if="store.loadErrors.length > 0"
          class="rounded-md border border-grid-700 bg-space-800/40 p-3 sm:p-4"
        >
          <div class="mb-2 flex items-center gap-2">
            <CircleAlert :size="14" class="text-alert-500" />
            <h3 class="panel-title">Incidencias registradas</h3>
          </div>
          <ul class="space-y-1">
            <li
              v-for="(error, index) in store.loadErrors"
              :key="index"
              class="font-mono text-[11px] leading-relaxed text-ink-500"
            >
              <span class="text-alert-500">·</span>
              {{ error.categoryId ? `[${error.categoryId}] ` : '' }}{{ error.message }}
            </li>
          </ul>
          <p class="mt-3 text-[11px] leading-relaxed text-ink-600">
            Si todas las descargas fallan con errores de red o CORS, revisa el proxy inverso hacia
            <span class="font-mono">celestrak.org</span>. En desarrollo lo aporta Vite
            (<span class="font-mono">/celestrak</span>); en produccion hay que configurarlo en el
            servidor web.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
