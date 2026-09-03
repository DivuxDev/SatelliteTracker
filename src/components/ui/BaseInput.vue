<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  label: { type: String, default: '' },
  suffix: { type: String, default: '' },
  step: { type: [String, Number], default: undefined },
  min: { type: [String, Number], default: undefined },
  max: { type: [String, Number], default: undefined },
  mono: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])
const id = useId()

const inputClasses = computed(() => [
  'w-full h-9 rounded-full border border-accent-300/22 bg-[rgba(5,10,20,.5)] py-2 pl-3 text-t2 text-hud-ink-100',
  'placeholder:text-hud-ink-600 transition-colors',
  'focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400/30',
  props.suffix ? 'pr-12' : 'pr-3',
  props.mono ? 'font-mono tabular-nums' : '',
])

function onInput(event) {
  const raw = event.target.value
  emit('update:modelValue', props.type === 'number' && raw !== '' ? Number(raw) : raw)
}
</script>

<template>
  <div class="w-full">
    <label v-if="label" :for="id" class="telemetry-label mb-1.5 block">{{ label }}</label>
    <div class="relative">
      <span
        v-if="$slots.icon"
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500"
      >
        <slot name="icon" />
      </span>
      <input
        :id="id"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :step="step"
        :min="min"
        :max="max"
        :class="[inputClasses, $slots.icon ? '!pl-8' : '']"
        @input="onInput"
      />
      <span
        v-if="suffix"
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-500"
      >
        {{ suffix }}
      </span>
    </div>
  </div>
</template>
