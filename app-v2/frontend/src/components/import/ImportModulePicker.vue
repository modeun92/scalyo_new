<template>
  <Transition name="modal-fade">
    <div v-if="show" class="mp-overlay" @click.self="$emit('cancel')">
      <div class="mp-panel">
        <div class="mp-head">
          <div class="mp-file-info">
            <span class="mp-file-icon">📄</span>
            <span class="mp-file-name">{{ fileName }}</span>
          </div>
          <button class="so-close" @click="$emit('cancel')">✕</button>
        </div>
        <div class="mp-body">
          <h3 class="mp-title">{{ t('imp_select_module_title') }}</h3>
          <p class="mp-hint">{{ t('imp_select_module_hint') }}</p>
          <div class="mp-grid">
            <button class="mp-card" @click="$emit('confirm', 'clients')">
              <span class="mp-card-icon">👥</span>
              <strong>{{ t('imp_module_clients') }}</strong>
              <span class="mp-card-desc">{{ t('imp_module_desc_clients') }}</span>
            </button>
            <button class="mp-card" @click="$emit('confirm', 'tasks')">
              <span class="mp-card-icon">✅</span>
              <strong>{{ t('imp_module_tasks') }}</strong>
              <span class="mp-card-desc">{{ t('imp_module_desc_tasks') }}</span>
            </button>
            <button class="mp-card" @click="$emit('confirm', 'team')">
              <span class="mp-card-icon">🙋</span>
              <strong>{{ t('imp_module_team') }}</strong>
              <span class="mp-card-desc">{{ t('imp_module_desc_team') }}</span>
            </button>
            <button class="mp-card" @click="$emit('confirm', 'copil')">
              <span class="mp-card-icon">📊</span>
              <strong>{{ t('imp_module_copil') }}</strong>
              <span class="mp-card-desc">{{ t('imp_module_desc_copil') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

defineProps({
  show:     { type: Boolean, default: false },
  fileName: { type: String, default: '' }
})

defineEmits(['confirm', 'cancel'])
</script>
