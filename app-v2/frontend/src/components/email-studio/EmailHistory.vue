<template>
<div class="email_studio_history">
  <div v-if="!isElite" class="email_studio_history_gate">
    <span class="email_studio_elite_gate">
      <span>Elite</span>
      <span class="email_studio_elite_lock">🔒 {{ t('es_history_elite') }}</span>
    </span>
  </div>
  <template v-else>
    <div class="email_studio_history_kpis">
      <div class="email_studio_kpi">
        <span class="email_studio_kpi_value">{{ sentEmails.length }}</span>
        <span class="email_studio_kpi_label">{{ t('es_history_sent') }}</span>
      </div>
      <div class="email_studio_kpi">
        <span class="email_studio_kpi_value">{{ openedCount }}</span>
        <span class="email_studio_kpi_label">{{ t('es_history_opened') }}</span>
      </div>
      <div class="email_studio_kpi">
        <span class="email_studio_kpi_value">{{ openRate }}</span>
        <span class="email_studio_kpi_label">{{ t('es_history_rate') }}</span>
      </div>
    </div>

    <div v-if="!sentEmails.length" class="email_studio_history_empty">
      {{ t('es_history_empty') }}
    </div>

    <div v-else class="email_studio_history_table">
      <div class="email_studio_history_header">
        <span>{{ t('es_history_col_to') }}</span>
        <span>{{ t('es_history_col_subject') }}</span>
        <span>{{ t('es_history_col_sent') }}</span>
        <span>{{ t('es_history_col_status') }}</span>
        <span>{{ t('es_history_col_opens') }}</span>
      </div>
      <div v-for="email in sentEmails" :key="email.id" class="email_studio_history_row">
        <span class="email_studio_history_to" :title="email.recipient">{{ email.recipient }}</span>
        <span class="email_studio_history_subject" :title="email.subject">{{ email.subject }}</span>
        <span class="email_studio_history_date">{{ formatDate(email.sent_at) }}</span>
        <span :class="['email_studio_history_status', email.opened_at ? 'opened' : 'pending']">
          {{ email.opened_at ? '✅ ' + t('es_history_read') : t('es_history_unread') }}
        </span>
        <span class="email_studio_history_opens">{{ email.open_count || 0 }}x</span>
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
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}
</script>
