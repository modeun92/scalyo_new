<template>
  <Transition name="slide_over_slide">
    <div v-if="show" class="roadmap_slide_over_overlay" @click.self="$emit('close')">
      <div class="main_slide_over_panel">
        <div class="roadmap_slide_over_header">
          <h3>{{ t('imp_col_mapping') }}</h3>
          <button class="roadmap_slide_over_close" @click="$emit('close')">✕</button>
        </div>
        <div class="roadmap_slide_over_body">
          <p class="slide_over_hint">{{ t('imp_mapping_hint') }}</p>
          <table class="mapping_table">
            <thead>
              <tr>
                <th>{{ t('imp_col_source') }}</th>
                <th>{{ t('imp_col_target') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(target, source) in columnMapping" :key="source">
                <td class="column_source">{{ source }}</td>
                <td>
                  <span v-if="target" class="tag_mapped">{{ target }}</span>
                  <span v-else class="tag_ignored">{{ t('imp_col_ignored') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

defineProps({
  show:          { type: Boolean, default: false },
  columnMapping: { type: Object, default: () => ({}) }
})

defineEmits(['close'])
</script>
