<template>
  <Teleport to="body">
    <Transition name="slide-over">
      <div v-if="open" class="slide-over-root">
        <div class="slide-over-overlay" @click="emit('close')" />
        <div class="slide-over-panel" :style="{ width: width + 'px' }">
          <div class="slide-over-header">
            <span class="slide-over-title">{{ title }}</span>
            <button class="slide-over-close" @click="emit('close')">✕</button>
          </div>
          <div class="slide-over-body">
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
.slide-over-root { position: fixed; inset: 0; z-index: 9999; display: flex; justify-content: flex-end; }
.slide-over-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); z-index: 9998; cursor: pointer; }
.slide-over-panel { position: fixed; top: 0; right: 16px; z-index: 10000; border-radius: 12px 0 0 12px; max-width: 100vw; height: 100vh; background: var(--bg-card); box-shadow: -4px 0 24px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; }
.slide-over-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 40px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.slide-over-title { font-size: 1.1rem; font-weight: 700; color: var(--text); }
.slide-over-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--bg-hover); color: var(--text-secondary); font-size: 1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; }
.slide-over-close:hover { background: var(--border); }
.slide-over-body { flex: 1 1 0; overflow-y: auto; padding: 32px 40px; min-height: 0; display: flex; flex-direction: column; }

/* Transitions */
.slide-over-enter-active .slide-over-overlay { transition: opacity 0.3s ease; }
.slide-over-enter-active .slide-over-panel { transition: transform 0.3s ease; }
.slide-over-leave-active .slide-over-overlay { transition: opacity 0.25s ease; }
.slide-over-leave-active .slide-over-panel { transition: transform 0.25s ease; }
.slide-over-enter-from .slide-over-overlay { opacity: 0; }
.slide-over-enter-from .slide-over-panel { transform: translateX(100%); }
.slide-over-leave-to .slide-over-overlay { opacity: 0; }
.slide-over-leave-to .slide-over-panel { transform: translateX(100%); }

@media (max-width: 600px) { .slide-over-panel { width: 100vw !important; } }
</style>
