<template>
  <SlideOver
    :open="open"
    :title="template ? t('pb_template_' + template.key) : ''"
    @close="$emit('close')"
  >
    <form @submit.prevent="onSubmit" class="sf" v-if="template">
      <div class="tpl-preview">
        <span
          class="tpl-icon-lg"
          :style="{ background: template.color + '15', color: template.color }"
        >{{ template.icon }}</span>
        <p>{{ t('pb_template_' + template.key + '_desc') }}</p>
      </div>

      <div class="tpl-steps-preview">
        <!-- Refonte 21/07 : steps = objets { key, day } (le libellé porte le timing J+N) -->
        <div
          v-for="(s, i) in template.steps"
          :key="i"
          class="tsp-step"
        >
          <span class="tsp-num">{{ i + 1 }}</span>
          <span>{{ t(s.key || s) }}</span>
        </div>
      </div>

      <div class="fg">
        <label>{{ t('pb_select_client') }} *</label>
        <select v-model="form.clientId" required class="fi">
          <option value="" disabled>—</option>
          <option
            v-for="c in clients"
            :key="c.id"
            :value="c.id"
          >{{ c.name }}</option>
        </select>
      </div>

      <div class="fg">
        <label>{{ t('pb_select_csm') }}</label>
        <select v-model="form.csmId" class="fi">
          <option
            v-for="m in teamMembers"
            :key="m.id"
            :value="m.id"
          >{{ m.name }}</option>
        </select>
      </div>

      <div class="fa">
        <button type="button" class="btn-outline" @click="$emit('close')">
          {{ t('cancel') }}
        </button>
        <button type="submit" class="btn-primary">
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
    // Increment B : client pré-sélectionné quand on vient de la fiche (initialClientId),
    // sinon vide comme avant.
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
