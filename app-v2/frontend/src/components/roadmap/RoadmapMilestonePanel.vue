<template>
  <Transition name="so-slide">
    <div v-if="open" class="so-overlay" @click.self="$emit('close')">
      <div class="so-panel">
        <div class="so-head">
          <h3>{{ isEdit ? t('edit') : t('rm_add_milestone') }}</h3>
          <button class="so-close" @click="$emit('close')">✕</button>
        </div>
        <div class="so-body">
          <div class="fg">
            <label>{{ t('rm_milestone_title') }} *</label>
            <input v-model="form.title" class="fi" />
          </div>
          <div class="fr mt">
            <div class="fg">
              <label>{{ t('rm_milestone_start') }}</label>
              <input v-model="form.startDate" type="date" class="fi" />
            </div>
            <div class="fg">
              <label>{{ t('rm_milestone_end') }}</label>
              <input v-model="form.endDate" type="date" class="fi" />
            </div>
          </div>
          <div class="fg mt">
            <label>{{ t('rm_milestone_status') }}</label>
            <select v-model="form.status" class="fi">
              <option value="todo">{{ t('rm_ms_todo') }}</option>
              <option value="in_progress">{{ t('rm_ms_progress') }}</option>
              <option value="done">{{ t('rm_ms_done') }}</option>
              <option value="blocked">{{ t('rm_ms_blocked') }}</option>
            </select>
          </div>
          <div class="fg mt">
            <label>{{ t('rm_milestone_notes') }}</label>
            <textarea v-model="form.notes" class="fi ta" rows="3" />
          </div>
          <div class="so-actions">
            <button v-if="isEdit" class="btn-danger-outline" @click="doDelete">{{ t('delete') }}</button>
            <div style="flex:1" />
            <button class="btn-outline" @click="$emit('close')">{{ t('cancel') }}</button>
            <button class="btn-primary" @click="doSave" :disabled="!form.title">{{ t('save') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoadmapStore } from '@/stores/roadmap'

const { t } = useI18n({ useScope: 'global' })
const store = useRoadmapStore()

const props = defineProps({
  open: { type: Boolean, default: false },
  roadmapId: { type: [String, Number], default: null },
  milestone: { type: Object, default: null }
})

const emit = defineEmits(['close'])

const isEdit = computed(() => !!props.milestone)

const form = reactive({ title: '', startDate: '', endDate: '', status: 'todo', notes: '' })

watch(() => props.open, (val) => {
  if (val && props.milestone) {
    Object.assign(form, {
      title: props.milestone.title,
      startDate: props.milestone.startDate || '',
      endDate: props.milestone.endDate || '',
      status: props.milestone.status,
      notes: props.milestone.notes || ''
    })
  } else if (val) {
    Object.assign(form, { title: '', startDate: '', endDate: '', status: 'todo', notes: '' })
  }
})

// D-15: closes only if the write succeeded (failure → toast, panel stays open)
async function doSave() {
  if (!form.title) return
  const res = props.milestone
    ? await store.updateMilestone(props.roadmapId, props.milestone.id, {
        title: form.title, startDate: form.startDate, endDate: form.endDate,
        status: form.status, done: form.status === 'done', notes: form.notes
      })
    : await store.addMilestone(props.roadmapId, { ...form, done: form.status === 'done' })
  if (res && res.success) emit('close')
}

async function doDelete() {
  const res = await store.deleteMilestone(props.roadmapId, props.milestone.id)
  if (res && res.success) emit('close')
}
</script>
