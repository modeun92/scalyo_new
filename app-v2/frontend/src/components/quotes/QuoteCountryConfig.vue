<template>
  <SlideOver :open="open" :title="t('qt_config')" @close="$emit('close')">
    <div class="sf">
      <div class="fg">
        <label>{{ t('cl_country') }}</label>
        <select v-model="country" class="fi" @change="$emit('update:country', country)">
          <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }}</option>
        </select>
      </div>
      <div class="qt-law-info">
        <!-- QUOTE-VAT (27/08) : champs réels du store — taxRate et currency (code ISO) -->
        <div class="qli-row"><span>{{ t('cl_tva') }}</span><strong>{{ laws.taxRate }}% ({{ laws.taxName }})</strong></div>
        <div class="qli-row"><span>{{ t('cl_currency') }}</span><strong>{{ laws.currencySymbol }} ({{ laws.currency }})</strong></div>
        <div class="qli-row"><span>{{ t('cl_legal_number') }}</span><strong>{{ legalLabel }}</strong></div>
      </div>
      <div class="fg">
        <label>{{ legalLabel }}</label>
        <input v-model="legalNum" class="fi" :placeholder="laws.legalNumberFormat" />
      </div>
      <div class="qt-law-mention">
        <strong>⚖️ {{ t('cl_data_law') }}</strong>
        <p>{{ laws.privacy }}</p>
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
