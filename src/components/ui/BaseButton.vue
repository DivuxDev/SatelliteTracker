<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'secondary', // primary | secondary | ghost | danger
  },
  size: {
    type: String,
    default: 'md', // sm | md | icon
  },
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
})

const VARIANTS = {
  primary:
    'bg-accent-500 text-hud-ink-100 border-accent-400 hover:bg-accent-400 shadow-[0_0_18px_-4px_var(--color-accent-500)]',
  secondary: 'bg-space-750 text-ink-100 border-grid-700 hover:border-accent-300/50',
  ghost: 'bg-transparent text-ink-300 border-transparent hover:bg-space-750 hover:text-ink-100',
  danger: 'bg-transparent text-alert-500 border-alert-500/40 hover:bg-alert-500/10',
}

const SIZES = {
  sm: 'h-7 px-2.5 text-[11px] gap-1.5',
  md: 'h-9 px-3.5 text-xs gap-2',
  icon: 'h-8 w-8 justify-center',
}

const classes = computed(() => [
  'inline-flex items-center rounded-md border font-medium tracking-wide',
  'transition-colors duration-150 select-none',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  VARIANTS[props.variant] ?? VARIANTS.secondary,
  SIZES[props.size] ?? SIZES.md,
  props.block ? 'w-full justify-center' : '',
  props.active ? 'ring-1 ring-accent-500/60 border-accent-500/60 text-accent-400' : '',
])
</script>

<template>
  <button type="button" :class="classes" :disabled="disabled || loading">
    <span
      v-if="loading"
      class="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
