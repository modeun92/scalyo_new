<template>
<div class="es-history">
  <div v-if="!isElite" class="es-history-gate">
    <span class="es-elite-gate">
      <span>Elite</span>
      <span class="es-elite-lock">\ud83d\udd12 {{ t('es_history_elite') }}</span>
    </span>
  </div>
  <template v-else>
    <div class="es-history-kpis">
      <div class="es-kpi">
        <span class="es-kpi-value">{{ sentEmails.length }}</span>
        <span class="es-kpi-label">{{ t('es_history_sent') }}</span>
      </div>
      <div class="es-kpi">
        <span class="es-kpi-value">{{ openedCount }}</span>
        <span class="es-kpi-label">{{ t('es_history_opened') }}</span>
      </div>
      <div class="es-kpi">
        <span class="es-kpi-value">{{ openRate }}</span>
        <span class="es-kpi-label">{{ t('es_history_rate') }}</span>
      </div>
    </div>

    <div v-if="!sentEmails.length" class="es-history-empty">
      {{ t('es_history_empty') }}
    </div>

    <div v-else class="es-history-table">
      <div class="es-history-head">
        <span>{{ t('es_history_col_to') }}</span>
        <span>{{ t('es_history_col_subject') }}</span>
        <span>{{ t('es_history_col_sent') }}</span>
        <span>{{ t('es_history_col_status') }}</span>
        <span>{{ t('es_history_col_opens') }}</span>
      </div>
      <div v-for="email in sentEmails" :key="email.id" class="es-history-row">
        <span class="es-history-to" :title="email.recipient">{{ email.recipient }}</span>
        <span class="es-history-subject" :title="email.subject">{{ email.subject }}</span>
        <span class="es-history-date">{{ formatDate(email.sent_at) }}</span>
        <span :class="['es-history-status', email.opened_at ? 'opened' : 'pending']">
          {{ email.opened_at ? '\u2705 ' + t('es_history_read') : t('es_history_unread') }}
        </span>
        <span class="es-history-opens">{{ email.open_count || 0 }}x</span>
      </div>
    </div>
  </template>
</div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  isElite: { type: Boolean, default: false },
  sentEmails: { type: Array, default: () => [] },
})

const openedCount = computed(() => props.sentEmails.filter(e => e.opened_at).length)
const openRate = computed(() => {
  if (!props.sentEmails.length) return '0%'
  return Math.round((openedCount.value / props.sentEmails.length) * 100) + '%'
})

function formatDate(iso) {
  if (!iso) return '\u2014'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}
</script>
