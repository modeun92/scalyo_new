<template>
  <SlideOver :open="open" :title="t('qt_config')" @close="$emit('close')">
    <div class="slideover_form">
      <div class="field_group">
        <label>{{ t('country_law_country') }}</label>
        <select v-model="country" class="field_input" @change="$emit('update:country', country)">
          <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }}</option>
        </select>
      </div>
      <div class="quote_law_info">
        <!-- QUOTE-VAT (27/08): the store's real fields — taxRate and currency (ISO code) -->
        <div class="qli_row"><span>{{ t('country_law_tax') }}</span><strong>{{ laws.taxRate }}% ({{ t(laws.taxNameKey) }})</strong></div>
        <div class="qli_row"><span>{{ t('country_law_currency') }}</span><strong>{{ laws.currencySymbol }} ({{ laws.currency }})</strong></div>
        <div class="qli_row"><span>{{ t('country_law_legal_number') }}</span><strong>{{ legalLabel }}</strong></div>
      </div>
      <div class="field_group">
        <label>{{ legalLabel }}</label>
        <input v-model="legalNum" class="field_input" :placeholder="laws.legalNumberFormat" />
      </div>
      <div class="quote_law_mention">
        <strong>⚖️ {{ t('country_law_data_law') }}</strong>
        <p>{{ t(laws.privacyKey) }}</p>
      </div>
    </div>
  </SlideOver>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SlideOver from '@/components/SlideOver.vue'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  open: { type: Boolean, default: false },
  country: { type: String, default: 'FR' },
  laws: { type: Object, required: true },
  legalLabel: { type: String, default: '' },
  countries: { type: Array, default: () => [] }
})
defineEmits(['close', 'update:country'])

const country = ref(props.country)
const legalNum = ref('')
</script>
