<template>
  <SlideOver
    :open="open"
    :title="t('pb_templates_title')"
    @close="$emit('close')"
    :width="520"
  >
    <div class="template_list">
      <div v-for="tpl in templates" :key="tpl.id" class="template_card">
        <div class="template_header">
          <span
            class="template_icon"
            :style="{ background: tpl.color + '15', color: tpl.color }"
          >{{ tpl.icon }}</span>
          <div class="template_info">
            <strong>{{ t('pb_template_' + tpl.key) }}</strong>
            <p>{{ t('pb_template_' + tpl.key + '_desc') }}</p>
          </div>
        </div>
        <div class="template_meta">
          <span>{{ tpl.steps.length }} {{ t('pb_steps') }}</span>
          <span>~{{ tpl.avgDays }} {{ t('pb_avg_days') }}</span>
        </div>
        <button
          class="button_outline template_use"
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
