<template>
  <Transition name="modal_fade">
    <div v-if="show" class="mp_overlay" @click.self="$emit('cancel')">
      <div class="mp_panel">
        <div class="mp_header">
          <div class="mp_file_info">
            <span class="mp_file_icon">📄</span>
            <span class="mp_file_name">{{ fileName }}</span>
          </div>
          <button class="roadmap_slide_over_close" @click="$emit('cancel')">✕</button>
        </div>
        <div class="mp_body">
          <h3 class="mp_title">{{ t('smart_import_select_module_title') }}</h3>
          <p class="mp_hint">{{ t('smart_import_select_module_hint') }}</p>
          <div class="mp_grid">
            <button class="mp_card" @click="$emit('confirm', 'clients')">
              <span class="mp_card_icon">👥</span>
              <strong>{{ t('smart_import_module_clients') }}</strong>
              <span class="mp_card_description">{{ t('smart_import_module_desc_clients') }}</span>
            </button>
            <button class="mp_card" @click="$emit('confirm', 'tasks')">
              <span class="mp_card_icon">✅</span>
              <strong>{{ t('smart_import_module_tasks') }}</strong>
              <span class="mp_card_description">{{ t('smart_import_module_desc_tasks') }}</span>
            </button>
            <button class="mp_card" @click="$emit('confirm', 'team')">
              <span class="mp_card_icon">🙋</span>
              <strong>{{ t('smart_import_module_team') }}</strong>
              <span class="mp_card_description">{{ t('smart_import_module_desc_team') }}</span>
            </button>
            <button class="mp_card" @click="$emit('confirm', 'copil')">
              <span class="mp_card_icon">📊</span>
              <strong>{{ t('smart_import_module_copil') }}</strong>
              <span class="mp_card_description">{{ t('smart_import_module_desc_copil') }}</span>
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
