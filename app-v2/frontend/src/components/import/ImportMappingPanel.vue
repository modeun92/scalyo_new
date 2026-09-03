<template>
  <Transition name="so-slide">
    <div v-if="show" class="so-overlay" @click.self="$emit('close')">
      <div class="so-panel">
        <div class="so-head">
          <h3>{{ t('imp_col_mapping') }}</h3>
          <button class="so-close" @click="$emit('close')">✕</button>
        </div>
        <div class="so-body">
          <p class="so-hint">{{ t('imp_mapping_hint') }}</p>
          <table class="mapping-table">
            <thead>
              <tr>
                <th>{{ t('imp_col_source') }}</th>
                <th>{{ t('imp_col_target') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(target, source) in columnMapping" :key="source">
                <td class="col-source">{{ source }}</td>
                <td>
                  <span v-if="target" class="tag-mapped">{{ target }}</span>
                  <span v-else class="tag-ignored">{{ t('imp_col_ignored') }}</span>
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
