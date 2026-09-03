<template>
  <Transition name="so-slide">
    <div v-if="open" class="so-overlay" @click.self="$emit('close')">
      <div class="so-panel">
        <div class="so-head">
          <h3>{{ t('rm_new') }}</h3>
          <button class="so-close" @click="$emit('close')">✕</button>
        </div>
        <div class="so-body">
          <p class="so-section-label">{{ t('rm_select_template') }}</p>
          <div class="tpl-grid">
            <div
              v-for="tpl in TEMPLATES"
              :key="tpl.id"
              class="tpl-card"
              :class="{ selected: selectedTpl === tpl.id }"
              :style="{ borderColor: selectedTpl === tpl.id ? tpl.color : '' }"
              @click="selectedTpl = tpl.id"
            >
              <span class="tpl-icon">{{ tpl.icon }}</span>
              <div>
                <strong>{{ t('rm_tpl_' + tpl.key) }}</strong>
                <p>{{ t('rm_tpl_' + tpl.key + '_desc') }}</p>
              </div>
            </div>
          </div>
          <div class="so-divider">{{ t('rm_or_blank') }}</div>
          <div class="fg">
            <label>{{ t('rm_roadmap_name') }} *</label>
            <input v-model="form.name" class="fi" :placeholder="t('rm_roadmap_name_ph')" />
          </div>
          <div class="fg mt">
            <label>{{ t('rm_start_date') }}</label>
            <input v-model="form.startDate" type="date" class="fi" />
          </div>
          <div class="so-actions">
            <button class="btn-outline" @click="$emit('close')">{{ t('cancel') }}</button>
            <button class="btn-primary" @click="doCreate" :disabled="!form.name">{{ t('rm_create') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoadmapStore, TEMPLATES } from '@/stores/roadmap'

const { t } = useI18n({ useScope: 'global' })
const store = useRoadmapStore()

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const selectedTpl = ref(null)
const form = reactive({ name: '', startDate: new Date().toISOString().slice(0, 10) })

watch(() => props.open, (val) => {
  if (val) {
    selectedTpl.value = null
    form.name = ''
    form.startDate = new Date().toISOString().slice(0, 10)
  }
})

// D-15: closes only if the creation succeeded (failure → toast, panel stays open)
async function doCreate() {
  if (!form.name) return
  const res = selectedTpl.value
    ? await store.createFromTemplate(selectedTpl.value, form.name, form.startDate)
    : await store.createBlank(form.name)
  if (res && res.success) emit('close')
}
</script>
