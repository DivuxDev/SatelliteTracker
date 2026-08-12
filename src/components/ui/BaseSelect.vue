<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

const props = defineProps({
  /** @type {Array<{value:string,label:string,count?:number,color?:string}>} */
  options: { type: Array, required: true },
  /** Array de valores seleccionados. */
  modelValue: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  placeholder: { type: String, default: 'Todos' },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const root = ref(null)

const summary = computed(() => {
  if (props.modelValue.length === 0) return props.placeholder
  if (props.modelValue.length === 1) {
    return props.options.find((o) => o.value === props.modelValue[0])?.label ?? props.modelValue[0]
  }
  return `${props.modelValue.length} seleccionados`
})

function toggle(value) {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value]
  emit('update:modelValue', next)
}

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <div ref="root" class="relative w-full">
    <span v-if="label" class="telemetry-label mb-1.5 block">{{ label }}</span>
    <button
      type="button"
      class="flex h-9 w-full items-center justify-between rounded-md border border-grid-700 bg-space-850 px-3 text-xs transition-colors hover:border-grid-600"
      :class="modelValue.length > 0 ? 'text-accent-400' : 'text-ink-300'"
      @click="open = !open"
    >
      <span class="truncate">{{ summary }}</span>
      <ChevronDown :size="14" class="shrink-0 transition-transform" :class="open && 'rotate-180'" />
    </button>

    <div
      v-if="open"
      class="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-grid-700 bg-space-800 py-1 shadow-2xl shadow-black/60"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-300 transition-colors hover:bg-space-750 hover:text-ink-100"
        @click="toggle(option.value)"
      >
        <span
          class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border"
          :class="
            modelValue.includes(option.value)
              ? 'border-accent-500 bg-accent-600 text-white'
              : 'border-grid-600'
          "
        >
          <Check v-if="modelValue.includes(option.value)" :size="10" :stroke-width="3" />
        </span>
        <span
          v-if="option.color"
          class="status-dot"
          :style="{ backgroundColor: option.color, color: option.color }"
        />
        <span class="flex-1 truncate">{{ option.label }}</span>
        <span v-if="option.count !== undefined" class="font-mono text-[10px] text-ink-500">
          {{ option.count }}
        </span>
      </button>
      <p v-if="options.length === 0" class="px-3 py-2 text-[11px] text-ink-600">
        Sin opciones disponibles
      </p>
    </div>
  </div>
</template>
