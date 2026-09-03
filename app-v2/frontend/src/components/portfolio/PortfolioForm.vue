<template>
  <SlideOver :open="open" :title="editId ? t('port_edit_title') : t('port_create_title')" @close="$emit('close')">
    <form @submit.prevent="$emit('save')" class="sf">
      <!-- Cycle de vie -->
      <div class="lifecycle-toggle">
        <button type="button" class="lc-btn" :class="{ active: form.lifecycle !== 'prospect' }" @click="setLifecycle('client')">
          {{ t('port_lifecycle_client') }}
        </button>
        <button type="button" class="lc-btn" :class="{ active: form.lifecycle === 'prospect' }" @click="setLifecycle('prospect')">
          {{ t('port_lifecycle_prospect') }}
        </button>
      </div>

      <div v-if="form.lifecycle === 'prospect'" class="fg">
        <label>{{ t('port_stage') }}</label>
        <select v-model="form.pipeline_stage" class="fi">
          <option v-for="s in stages" :key="s" :value="s">{{ t('port_stage_' + s) }}</option>
        </select>
      </div>

      <div class="fg">
        <label>{{ t('port_field_name') }} *</label>
        <input v-model="form.name" required class="fi" />
      </div>
      <div class="fr">
        <div class="fg">
          <label>{{ t('port_field_industry') }}</label>
          <!-- FICHE-SECTEUR (29/08): same fix as ClientModal — value outside the list is displayed -->
          <select v-model="form.industry" class="fi">
            <option v-if="form.industry && !industries.includes(form.industry)" :value="form.industry">{{ form.industry }}</option>
            <option v-for="i in industries" :key="i" :value="i">{{ i }}</option>
          </select>
        </div>
        <div class="fg">
          <label>{{ t('port_field_status') }}</label>
          <select v-model="form.status" class="fi">
            <option value="healthy">{{ t('status_healthy') }}</option>
            <option value="watch">{{ t('status_watch') }}</option>
            <option value="critical">{{ t('status_critical') }}</option>
          </select>
        </div>
      </div>
      <div class="fr">
        <div class="fg">
          <label>{{ t('port_field_arr') }}</label>
          <input v-model.number="form.arr" type="number" min="0" class="fi" />
        </div>
        <div class="fg">
          <label>{{ t('port_field_mrr') }}</label>
          <input v-model.number="form.mrr" type="number" min="0" class="fi" />
        </div>
      </div>
      <div class="fr">
        <div class="fg">
          <label>{{ t('port_field_health') }}</label>
          <input v-model.number="form.health" type="number" min="0" max="10" step="0.1" class="fi" />
        </div>
        <div class="fg">
          <label>{{ t('port_field_nps') }}</label>
          <input v-model.number="form.nps" type="number" min="-100" max="100" class="fi" />
        </div>
      </div>
      <div class="fr">
        <div class="fg">
          <label>{{ t('port_field_agent') }}</label>
          <select v-model="form.csmId" class="fi">
            <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
        <div class="fg">
          <label>{{ t('port_field_renewal') }}</label>
          <input v-model="form.renewalDate" type="date" class="fi" />
        </div>
      </div>

      <!-- Interlocuteurs (multi) -->
      <div class="fdiv contacts-head">
        <span>{{ t('port_contacts_title') }}</span>
        <button type="button" class="ct-add" @click="addContact">+ {{ t('port_contact_add') }}</button>
      </div>

      <p v-if="!form.contacts.length" class="ct-empty">{{ t('port_contacts_empty') }}</p>

      <div v-for="(ct, i) in form.contacts" :key="i" class="ct-card" :class="{ primary: ct.is_primary }">
        <div class="ct-card-top">
          <button type="button" class="ct-primary" :class="{ on: ct.is_primary }" @click="setPrimary(i)" :title="t('port_contact_primary')">
            ★ {{ ct.is_primary ? t('port_contact_is_primary') : t('port_contact_set_primary') }}
          </button>
          <button type="button" class="ct-remove" @click="removeContact(i)" :title="t('port_contact_remove')">✕</button>
        </div>
        <div class="fr">
          <div class="fg">
            <label>{{ t('port_field_contact_name') }}</label>
            <input v-model="ct.name" class="fi" />
          </div>
          <div class="fg">
            <label>{{ t('port_field_contact_role') }}</label>
            <input v-model="ct.role" class="fi" />
          </div>
        </div>
        <div class="fr">
          <div class="fg">
            <label>{{ t('port_field_contact_email') }}</label>
            <input v-model="ct.email" type="email" class="fi" />
          </div>
          <div class="fg">
            <label>{{ t('port_field_contact_phone') }}</label>
            <input v-model="ct.phone" type="tel" class="fi" />
          </div>
        </div>
      </div>

      <div class="fa">
        <button type="button" class="btn-outline" @click="$emit('close')">{{ t('cancel') }}</button>
        <button type="submit" class="btn-primary">{{ editId ? t('save') : t('create') }}</button>
      </div>
    </form>
  </SlideOver>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import SlideOver from '@/components/SlideOver.vue'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  open: { type: Boolean, default: false },
  editId: { type: [String, Number], default: null },
  form: { type: Object, required: true },
  industries: { type: Array, default: () => [] },
  members: { type: Array, default: () => [] }
})

defineEmits(['close', 'save'])

const stages = ['new', 'contacted', 'qualified', 'won', 'lost']

function setLifecycle(v) {
  props.form.lifecycle = v
  if (v === 'prospect' && !props.form.pipeline_stage) props.form.pipeline_stage = 'new'
  if (v === 'client') props.form.pipeline_stage = null
}

function addContact() {
  const isFirst = props.form.contacts.length === 0
  props.form.contacts.push({ name: '', role: '', email: '', phone: '', is_primary: isFirst })
}

function removeContact(i) {
  const wasPrimary = props.form.contacts[i]?.is_primary
  props.form.contacts.splice(i, 1)
  if (wasPrimary && props.form.contacts.length) props.form.contacts[0].is_primary = true
}

function setPrimary(i) {
  props.form.contacts.forEach((c, idx) => { c.is_primary = idx === i })
}
</script>
