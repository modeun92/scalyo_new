<template>
  <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-card">
      <h3>🔑 {{ t('integ_create_key') }}</h3>
      <div class="modal-form">
        <div class="fg">
          <label>{{ t('integ_key_name') }}</label>
          <input v-model="name" type="text" class="modal-input" placeholder="Ex: HubSpot, Zapier..." />
        </div>
        <div class="fg">
          <label>{{ t('integ_key_scopes') }}</label>
          <div class="scope-toggles">
            <label class="scope-toggle">
              <input type="checkbox" v-model="scopes" value="read" /> {{ t('integ_scope_read') }}
            </label>
            <label class="scope-toggle">
              <input type="checkbox" v-model="scopes" value="write" /> {{ t('integ_scope_write') }}
            </label>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" @click="$emit('close')">{{ t('cancel') }}</button>
        <button class="btn-save" @click="doCreate" :disabled="!name || scopes.length === 0">
          {{ t('integ_generate_key') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'create'])

const name = ref('')
const scopes = ref(['read', 'write'])

function doCreate() {
  if (!name.value || scopes.value.length === 0) return
  emit('create', { name: name.value, scopes: [...scopes.value] })
  name.value = ''
}
</script>
