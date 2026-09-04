<template>
  <div class="quick_actions">
    <h2>{{ t('dash_quick_actions') }}</h2>
    <div class="actions_grid">
      <button class="action_card" @click="$router.push('/app/tasks/kanban')">
        <span class="action_icon">✏️</span>
        <span>{{ t('dash_action_task') }}</span>
      </button>
      <button class="action_card" @click="$router.push('/app/portfolio')">
        <span class="action_icon">👤</span>
        <span>{{ t('dash_action_client') }}</span>
      </button>
      <button class="action_card" @click="$router.push({ path: '/app/portfolio', query: { import: '1' } })">
        <span class="action_icon">📥</span>
        <span>{{ t('dash_action_import') }}</span>
      </button>
      <button class="action_card" @click="$router.push('/app/kpis')">
        <span class="action_icon">📊</span>
        <span>{{ t('sidebar_kpis') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })
</script>

<style scoped>
.quick_actions { margin-top: 24px; }
.quick_actions h2 { font-size: 0.9rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
.actions_grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.action_card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 10px; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; transition: all 0.15s; font-size: 0.82rem; color: var(--text); }
.action_card:hover { border-color: var(--primary); box-shadow: var(--shadow-sm); }
.action_icon { font-size: 1.4rem; }
</style>