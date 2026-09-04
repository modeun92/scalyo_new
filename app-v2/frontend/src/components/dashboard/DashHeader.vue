<template>
  <div class="dashboard_header">
    <div class="dashboard_greeting">
      <h1>{{ t(`greeting_${greeting}`) }}, {{ firstName }} 👋</h1>
      <p class="dashboard_date">{{ formattedDate }}</p>
    </div>
    <div class="dashboard_header_right">
      <div class="dashboard_badges">
        <span class="badge plan">{{ planLabel }}</span>
        <span class="badge role">{{ roleLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  greeting:      { type: String, required: true },
  firstName:     { type: String, default: '' },
  planLabel:     { type: String, default: '' },
  roleLabel:     { type: String, default: '' },
  formattedDate: { type: String, default: '' }
})
</script>

<style scoped>
.dashboard_header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; flex-wrap: wrap; gap: 12px; }
.dashboard_greeting h1 { font-size: 1.6rem; font-weight: 800; color: var(--text); }
.dashboard_date { font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; text-transform: capitalize; }
.dashboard_header_right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.dashboard_badges { display: flex; gap: 6px; }
.badge { font-size: 0.7rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; }
.badge.plan { background: var(--purple-bg); color: var(--purple); }
.badge.role { background: var(--green-bg); color: var(--green); }
</style>