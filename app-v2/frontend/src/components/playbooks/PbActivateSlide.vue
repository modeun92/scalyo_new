<template>
  <SlideOver
    :open="open"
    :title="template ? t('playbook_template_' + template.key) : ''"
    @close="$emit('close')"
  >
    <form @submit.prevent="onSubmit" class="slideover_form" v-if="template">
      <div class="template_preview">
        <span
          class="template_icon_large"
          :style="{ background: template.color + '15', color: template.color }"
        >{{ template.icon }}</span>
        <p>{{ t('playbook_template_' + template.key + '_desc') }}</p>
      </div>

      <div class="template_steps_preview">
        <!-- Rework 21/07: steps = objects { key, day } (the label carries the D+N timing) -->
        <div
          v-for="(s, i) in template.steps"
          :key="i"
          class="tsp_step"
        >
          <span class="tsp_number">{{ i + 1 }}</span>
          <span>{{ t(s.key || s) }}</span>
        </div>
      </div>

      <div class="field_group">
        <label>{{ t('playbook_select_client') }} *</label>
        <select v-model="form.clientId" required class="field_input">
          <option value="" disabled>—</option>
          <option
            v-for="c in clients"
            :key="c.id"
            :value="c.id"
          >{{ c.name }}</option>
        </select>
      </div>

      <!-- CORE-V2-TASK (decided 04/10/2026): the steps become tasks, and a task belongs to a project -->
      <div class="field_group">
        <label>{{ t('smart_matrix_task_project') }} *</label>
        <select v-model="form.projectId" required class="field_input">
          <option value="" disabled>—</option>
          <option v-for="p in taskStore.projects" :key="p.id" :value="p.id">{{ projectLabel({ t }, p) }}</option>
        </select>
      </div>

      <div class="field_group">
        <label>{{ t('playbook_select_csm') }}</label>
        <select v-model="form.csmId" class="field_input">
          <option
            v-for="m in teamMembers"
            :key="m.id"
            :value="m.id"
          >{{ m.name }}</option>
        </select>
      </div>

      <div class="form_actions">
        <button type="button" class="button_outline" @click="$emit('close')">
          {{ t('cancel') }}
        </button>
        <button type="submit" class="button_primary">
          {{ t('playbook_start') }}
        </button>
      </div>
    </form>
  </SlideOver>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SlideOver from '@/components/SlideOver.vue'
import { useTaskStore } from '@/stores/tasks'
import { projectLabel } from '@/lib/taskLabels'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  open: { type: Boolean, default: false },
  template: { type: Object, default: null },
  clients: { type: Array, default: () => [] },
  teamMembers: { type: Array, default: () => [] },
  initialClientId: { type: String, default: '' }
})

const emit = defineEmits(['close', 'activate'])

const taskStore = useTaskStore()
const form = reactive({ clientId: '', csmId: '', projectId: '' })

watch(() => props.template, (tpl) => {
  if (tpl) {
    // Increment B: client pre-selected when coming from the record (initialClientId),
    // otherwise empty as before.
    form.clientId = props.initialClientId || ''
    form.csmId = props.teamMembers[0]?.id || ''
    form.projectId = ''
  }
})

function onSubmit() {
  if (!form.clientId || !form.projectId) return
  emit('activate', {
    templateId: props.template.id,
    clientId: form.clientId,
    csmId: form.csmId,
    projectId: form.projectId
  })
}
</script>
