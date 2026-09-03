<template>
  <SlideOver
    :open="open"
    :title="t('pb_templates_title')"
    @close="$emit('close')"
    :width="520"
  >
    <div class="tpl-list">
      <div v-for="tpl in templates" :key="tpl.id" class="tpl-card">
        <div class="tpl-header">
          <span
            class="tpl-icon"
            :style="{ background: tpl.color + '15', color: tpl.color }"
          >{{ tpl.icon }}</span>
          <div class="tpl-info">
            <strong>{{ t('pb_template_' + tpl.key) }}</strong>
            <p>{{ t('pb_template_' + tpl.key + '_desc') }}</p>
          </div>
        </div>
        <div class="tpl-meta">
          <span>{{ tpl.steps.length }} {{ t('pb_steps') }}</span>
          <span>~{{ tpl.avgDays }} {{ t('pb_avg_days') }}</span>
        </div>
        <button
          class="btn-outline tpl-use"
          @click="$emit('selectTemplate', tpl)"
        >{{ t('pb_use_template') }}</button>
      </div>
    </div>
  </SlideOver>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import SlideOver from '@/components/SlideOver.vue'

const { t } = useI18n({ useScope: 'global' })

defineProps({
  open: { type: Boolean, default: false },
  templates: { type: Array, default: () => [] }
})

defineEmits(['close', 'selectTemplate'])
</script>
