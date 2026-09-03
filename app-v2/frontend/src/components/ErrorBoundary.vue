<template>
  <div v-if="error" class="error-boundary">
    <div class="error-boundary-content">
      <p class="error-boundary-title">{{ t('error_boundary_title') }}</p>
      <p class="error-boundary-desc">{{ t('error_boundary_desc') }}</p>
      <button class="btn-primary" @click="reset">{{ t('error_boundary_retry') }}</button>
    </div>
  </div>
  <slot v-else />
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const error = ref(null)

onErrorCaptured((err, instance, info) => {
  console.error('ErrorBoundary caught:', err.message || err, '| Component:', info)
  error.value = err
  return false
})

function reset() {
  error.value = null
}
</script>

<style scoped>
.error-boundary { display: flex; align-items: center; justify-content: center; min-height: 200px; padding: 32px; }
.error-boundary-content { text-align: center; max-width: 400px; }
.error-boundary-title { font-size: 16px; font-weight: 600; color: var(--text-primary, #111827); margin-bottom: 8px; }
.error-boundary-desc { font-size: 14px; color: var(--text-muted, #9ca3af); margin-bottom: 16px; }
</style>