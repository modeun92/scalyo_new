<template>
  <div v-if="currentStep === 3" class="imp-success">
    <div class="success-icon">✅</div>
    <h3>{{ t('imp_success') }}</h3>
    <p>{{ t('imp_success_desc', { n: importedCount, module: t('imp_module_' + (moduleName || 'clients')) }) }}</p>

    <div v-if="rejectedRows.length > 0" class="imp-rejected">
      <div class="rej-header">
        <span>⚠️</span>
        <strong>{{ t('imp_rejected_count', { n: rejectedRows.length }) }}</strong>
      </div>
      <div class="rej-list">
        <div v-for="(row, i) in rejectedRows" :key="i" class="rej-row">
          <div class="rej-data">
            <span class="rej-num">{{ i + 1 }}</span>
            <span class="rej-content">
              {{ Object.entries(row.raw || {}).filter(([k]) => k !== '_sheet').slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ') }}
            </span>
          </div>
          <span class="rej-reason">{{ row.reason }}</span>
        </div>
      </div>
    </div>

    <div class="success-actions">
      <button class="btn-outline" @click="$emit('reset')">{{ t('imp_new_import') }}</button>
      <button class="btn-primary" @click="$emit('go-to-module')">{{ t('imp_go_to_module') }} →</button>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

defineProps({
  currentStep:   { type: Number, default: 0 },
  importedCount: { type: Number, default: 0 },
  moduleName:    { type: String, default: 'clients' },
  rejectedRows:  { type: Array, default: () => [] }
})

defineEmits(['reset', 'go-to-module'])
</script>
