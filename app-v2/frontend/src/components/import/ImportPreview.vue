<template>
  <template v-if="currentStep === 2">
    <!-- Module reconnu -->
    <div v-if="analysisResult && analysisResult.module !== 'unknown'" class="imp-preview-wrap">
      <!-- Module détecté -->
      <div class="imp-module-card">
        <div class="imc-icon">{{ moduleIcons[analysisResult.module] || '📦' }}</div>
        <div class="imc-info">
          <span class="imc-label">{{ t('imp_detected_module') }}</span>
          <strong>{{ t('imp_module_' + analysisResult.module) }}</strong>
        </div>
        <div class="imc-confidence">
          <div class="conf-bar">
            <div class="conf-fill" :style="{ width: analysisResult.confidence + '%', background: confidenceColor }" />
          </div>
          <span class="conf-val">{{ analysisResult.confidence }}%</span>
        </div>
        <button class="btn-map" @click="$emit('show-mapping')">{{ t('imp_col_mapping') }} ↗</button>
      </div>

      <div class="imp-ai-reason">
        <span class="ai-badge">🤖 IA</span>
        <p>{{ analysisResult.reason }}</p>
      </div>

      <div class="imp-preview-section">
        <div class="preview-header">
          <h3>{{ t('imp_preview_title') }}</h3>
          <span class="badge-count">{{ allMappedRows.length }} {{ t('imp_rows') }}</span>
        </div>
        <div class="table-scroll">
          <table class="imp-table">
            <thead>
              <tr><th v-for="col in previewColumns" :key="col">{{ col }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in previewRows" :key="i">
                <td v-for="col in previewColumns" :key="col">{{ row[col] ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="allMappedRows.length > 5" class="preview-more">
          {{ t('imp_more_rows', { n: allMappedRows.length - 5 }) }}
        </p>
      </div>

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

      <div v-if="analysisResult && analysisResult.module === 'tasks'" class="imp-project-select">
        <label>{{ t('imp_assign_project') }}</label>
        <select v-model="localProjectId" class="fi">
          <option value="new">{{ t('imp_create_project') }}</option>
          <option value="">{{ t('imp_no_project') }}</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="imp-actions">
        <button class="btn-outline" @click="$emit('reset')">{{ t('cancel') }}</button>
        <button class="btn-primary btn-import" @click="$emit('import')" :disabled="importing">
          <span v-if="importing">⏳</span>
          <span v-else>✦ {{ t('imp_import_btn') }}</span>
        </button>
      </div>
    </div>

    <div v-else-if="analysisResult" class="imp-unknown">
      <div class="unk-icon">🚫</div>
      <h3>{{ t('imp_error') }}</h3>
      <p class="unk-desc">{{ t('imp_error_desc') }}</p>
      <div class="unk-reason"><span>🤖</span> {{ analysisResult.reason }}</div>
      <div class="unk-modules">
        <p>{{ t('imp_compatible_modules') }}</p>
        <div class="unk-chips">
          <span>👥 {{ t('imp_module_clients') }}</span>
          <span>✅ {{ t('imp_module_tasks') }}</span>
          <span>🙋 {{ t('imp_module_team') }}</span>
          <span>📊 {{ t('imp_module_copil') }}</span>
        </div>
      </div>
      <button class="btn-primary" @click="$emit('reset')">{{ t('imp_new_import') }}</button>
    </div>
  </template>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  currentStep:    { type: Number, default: 0 },
  analysisResult: { type: Object, default: null },
  allMappedRows:  { type: Array, default: () => [] },
  rejectedRows:   { type: Array, default: () => [] },
  importing:      { type: Boolean, default: false },
  projects:       { type: Array, default: () => [] },
  selectedProjectId: { type: String, default: 'new' }
})

const emit = defineEmits(['import', 'reset', 'show-mapping', 'update:selectedProjectId'])

const moduleIcons = { clients: '👥', tasks: '✅', team: '🙋', copil: '📊' }

const localProjectId = ref(props.selectedProjectId)
watch(localProjectId, v => emit('update:selectedProjectId', v))

const confidenceColor = computed(() => {
  const c = props.analysisResult?.confidence || 0
  if (c >= 80) return 'var(--green)'
  if (c >= 50) return '#f59e0b'
  return '#ef4444'
})

const previewColumns = computed(() => {
  if (!props.allMappedRows.length) return []
  return Object.keys(props.allMappedRows[0]).filter(k => k !== '_sheet').slice(0, 10)
})

const previewRows = computed(() => props.allMappedRows.slice(0, 5))
</script>
