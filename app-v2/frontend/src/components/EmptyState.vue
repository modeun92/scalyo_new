<template>
  <div class="empty-state">
    <div class="empty-state-icon">{{ icon }}</div>
    <h2 class="empty-state-title">{{ t(titleKey) }}</h2>
    <p class="empty-state-desc">{{ t(descKey) }}</p>
    <button v-if="ctaKey && ctaAction" class="empty-state-cta" @click="ctaAction">
      {{ t(ctaKey) }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
defineProps({
  icon: { type: String, default: '' },
  titleKey: { type: String, required: true },
  descKey: { type: String, required: true },
  ctaKey: { type: String, default: '' },
  ctaAction: { type: Function, default: null }
})
const { t } = useI18n()
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  min-height: 40vh;
}
.empty-state-icon {
  font-size: 4rem;
  margin-bottom: 1.5rem;
}
.empty-state-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a1a2e);
  margin-bottom: 0.5rem;
}
.empty-state-desc {
  font-size: 0.95rem;
  color: var(--text-secondary, #6b7280);
  max-width: 400px;
  margin-bottom: 1.5rem;
}
.empty-state-cta {
  padding: 0.65rem 1.5rem;
  border-radius: 8px;
  background: var(--primary, #6366f1);
  color: #fff;
  border: none;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}
.empty-state-cta:hover { opacity: 0.85; }
</style>