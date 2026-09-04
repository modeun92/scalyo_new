<template>
  <SlideOver
    :open="open"
    :title="template ? t('pb_template_' + template.key) : ''"
    @close="$emit('close')"
  >
    <form @submit.prevent="onSubmit" class="slideover_form" v-if="template">
      <div class="template_preview">
        <span
          class="template_icon_large"
          :style="{ background: template.color + '15', color: template.color }"
        >{{ template.icon }}</span>
        <p>{{ t('pb_template_' + template.key + '_desc') }}</p>
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
        <label>{{ t('pb_select_client') }} *</label>
        <select v-model="form.clientId" required class="field_input">
          <option value="" disabled>—</option>
          <option
            v-for="c in clients"
            :key="c.id"
            :value="c.id"
          >{{ c.name }}</option>
        </select>
      </div>

      <div class="field_group">
        <label>{{ t('pb_select_csm') }}</label>
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
          {{ t('pb_start') }}
        </button>
      </div>
    </form>
  </SlideOver>
</template>

<script setup>
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SlideOver from '@/components/SlideOver.vue'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  open: { type: Boolean, default: false },
  template: { type: Object, default: null },
  clients: { type: Array, default: () => [] },
  teamMembers: { type: Array, default: () => [] },
  initialClientId: { type: String, default: '' }
})

const emit = defineEmits(['close', 'activate'])

const form = reactive({ clientId: '', csmId: '' })

watch(() => props.template, (tpl) => {
  if (tpl) {
    // Increment B: client pre-selected when coming from the record (initialClientId),
    // otherwise empty as before.
    form.clientId = props.initialClientId || ''
    form.csmId = props.teamMembers[0]?.id || ''
  }
})

function onSubmit() {
  if (!form.clientId) return
  emit('activate', {
    templateId: props.template.id,
    clientId: form.clientId,
    csmId: form.csmId
  })
}
</script>
