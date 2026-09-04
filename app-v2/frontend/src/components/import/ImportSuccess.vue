<template>
  <div v-if="currentStep === 3" class="import_success">
    <div class="success_icon">✅</div>
    <h3>{{ t('imp_success') }}</h3>
    <p>{{ t('imp_success_desc', { n: importedCount, module: t('imp_module_' + (moduleName || 'clients')) }) }}</p>

    <div v-if="rejectedRows.length > 0" class="import_rejected">
      <div class="rej_header">
        <span>⚠️</span>
        <strong>{{ t('imp_rejected_count', { n: rejectedRows.length }) }}</strong>
      </div>
      <div class="rej_list">
        <div v-for="(row, i) in rejectedRows" :key="i" class="rej_row">
          <div class="rej_data">
            <span class="rej_number">{{ i + 1 }}</span>
            <span class="rej_content">
              {{ Object.entries(row.raw || {}).filter(([k]) => k !== '_sheet').slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ') }}
            </span>
          </div>
          <span class="rej_reason">{{ row.reason }}</span>
        </div>
      </div>
    </div>

    <div class="success_actions">
      <button class="button_outline" @click="$emit('reset')">{{ t('imp_new_import') }}</button>
      <button class="button_primary" @click="$emit('go-to-module')">{{ t('imp_go_to_module') }} →</button>
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
