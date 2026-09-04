<template>
  <Transition name="modal_fade">
    <div v-if="open" class="modal_overlay" @click.self="$emit('close')">
      <div class="modal_box">
        <div class="modal_header">
          <h3>{{ t('qt_create_title') }}</h3>
          <button class="modal_close" @click="$emit('close')">✕</button>
        </div>
        <form @submit.prevent="$emit('create')" class="slideover_form">
          <div class="field_group"><label>{{ t('qt_field_title') }} *</label><input v-model="form.title" required class="field_input" /></div>
          <div class="field_group"><label>{{ t('qt_field_company') }}</label><input v-model="form.company" class="field_input" /></div>
          <div class="field_group"><label>{{ t('qt_field_client') }}</label>
            <select v-model="form.clientId" class="field_input">
              <option value="">—</option>
              <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="field_row">
            <div class="field_group"><label>{{ t('qt_field_amount') }} ({{ currencySymbol }})</label>
              <input v-model.number="form.amount" type="number" min="0" class="field_input" />
            </div>
            <div class="field_group"><label>{{ t('qt_field_tax') }} ({{ tva }}%)</label>
              <input v-model.number="form.tax" type="number" min="0" max="100" class="field_input" />
            </div>
          </div>
          <div class="field_group calculator_ttc">
            <span>{{ t('qt_ttc') }}:</span>
            <!-- CURRENCY-FORMAT: single formatter, ISO currency of the billing country -->
            <strong>{{ fmtCurrency(Math.round(form.amount * (1 + form.tax / 100)), { currency }) }}</strong>
          </div>
          <div class="field_group"><label>{{ t('qt_field_status') }}</label>
            <select v-model="form.status" class="field_input">
              <option value="draft">{{ t('qt_filter_draft') }}</option>
              <option value="sent">{{ t('qt_filter_sent') }}</option>
              <option value="won">{{ t('qt_filter_won') }}</option>
              <option value="lost">{{ t('qt_filter_lost') }}</option>
            </select>
          </div>
          <div class="field_group"><label>{{ t('qt_field_notes') }}</label><textarea v-model="form.notes" class="field_input textarea" rows="3" /></div>
          <div class="form_actions">
            <button type="button" class="button_outline" @click="$emit('close')">{{ t('cancel') }}</button>
            <button type="submit" class="button_primary">{{ t('create') }}</button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { fmtCurrency } from '@/lib/formatters'
const { t } = useI18n({ useScope: 'global' })

defineProps({
  open: { type: Boolean, default: false },
  form: { type: Object, required: true },
  clients: { type: Array, default: () => [] },
  currencySymbol: { type: String, default: '€' },
  currency: { type: String, default: 'EUR' },
  tva: { type: Number, default: 20 }
})
defineEmits(['close', 'create'])
</script>
