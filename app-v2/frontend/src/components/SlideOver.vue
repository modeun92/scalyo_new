<template>
  <Teleport to="body">
    <Transition name="slide_over">
      <div v-if="open" class="slide_over_root">
        <div class="slide_over_overlay" @click="emit('close')" />
        <div class="slide_over_panel" :style="{ width: width + 'px' }">
          <div class="slide_over_header">
            <span class="slide_over_title">{{ title }}</span>
            <button class="slide_over_close" @click="emit('close')">✕</button>
          </div>
          <div class="slide_over_body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: Number, default: 480 },
})

const emit = defineEmits(['close'])

watch(() => props.open, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
})

const handleKey = (e) => {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => { document.addEventListener('keydown', handleKey) })
onUnmounted(() => {
  document.removeEventListener('keydown', handleKey)
  document.body.style.overflow = ''
})
</script>

<style scoped>
.slide_over_root { position: fixed; inset: 0; z-index: 9999; display: flex; justify-content: flex-end; }
.slide_over_overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); z-index: 9998; cursor: pointer; }
.slide_over_panel { position: fixed; top: 0; right: 16px; z-index: 10000; border-radius: 12px 0 0 12px; max-width: 100vw; height: 100vh; background: var(--bg-card); box-shadow: -4px 0 24px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; }
.slide_over_header { display: flex; align-items: center; justify-content: space-between; padding: 24px 40px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.slide_over_title { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.slide_over_close { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--bg-hover); color: var(--text-secondary); font-size: 1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; }
.slide_over_close:hover { background: var(--border); }
.slide_over_body { flex: 1 1 0; overflow-y: auto; padding: 32px 40px; min-height: 0; display: flex; flex-direction: column; }

/* Transitions */
.slide_over-enter-active .slide_over_overlay { transition: opacity 0.3s ease; }
.slide_over-enter-active .slide_over_panel { transition: transform 0.3s ease; }
.slide_over-leave-active .slide_over_overlay { transition: opacity 0.25s ease; }
.slide_over-leave-active .slide_over_panel { transition: transform 0.25s ease; }
.slide_over-enter-from .slide_over_overlay { opacity: 0; }
.slide_over-enter-from .slide_over_panel { transform: translateX(100%); }
.slide_over-leave-to .slide_over_overlay { opacity: 0; }
.slide_over-leave-to .slide_over_panel { transform: translateX(100%); }

@media (max-width: 600px) { .slide_over_panel { width: 100vw !important; } }
</style>
