<template>
  <div class="quotes_view">
    <div class="quote_header">
      <div><h1>📄 {{ t('qt_title') }}</h1><p class="quote_sub">{{ t('qt_subtitle') }}</p></div>
      <div class="quote_actions">
        <button class="button_outline" @click="configOpen = true">{{ t('qt_config') }}</button>
        <button class="button_primary" @click="slideOpen = true">{{ t('qt_new') }}</button>
      </div>
    </div>

    <!-- Country banner -->
    <div v-if="billingCountry" class="quote_country_banner">
      <span>{{ laws.flag }} {{ t(laws.nameKey) }}</span>
      <!-- QUOTE-VAT (27/08): the field is called taxRate — "laws.tva" never existed -->
      <span>{{ t('qt_field_tax') }}: {{ laws.taxRate }}% ({{ t('country_law_tax_name') }})</span>
      <span>{{ t('country_law_currency') }}: {{ laws.currencySymbol }}</span>
    </div>

    <!-- KPIs -->
    <div class="quote_kpis">
      <div class="kpi_quote"><span class="kpi_quote_value">{{ quotes.length }}</span><span class="kpi_quote_label">{{ t('qt_total') }}</span></div>
      <div class="kpi_quote"><span class="kpi_quote_value">{{ conversionRate }}%</span><span class="kpi_quote_label">{{ t('qt_conversion') }}</span></div>
      <!-- CURRENCY-FORMAT: a quote follows the currency of ITS billing country (ISO code from countryLaws), formatted to the locale -->
      <div class="kpi_quote"><span class="kpi_quote_value green">{{ fmtCurrency(wonAmount, { currency: laws.currency }) }}</span><span class="kpi_quote_label">{{ t('qt_won') }}</span></div>
    </div>

    <!-- Filters -->
    <div class="quote_filters">
      <button v-for="f in filters" :key="f.key" class="filter_tab" :class="{ active: activeFilter === f.key }" @click="activeFilter = f.key">{{ t(f.label) }}</button>
    </div>

    <!-- List -->
    <div v-if="filtered.length" class="quote_list">
      <div v-for="q in filtered" :key="q.id" class="quote_card">
        <div class="quote_card_left">
          <strong>{{ q.title }}</strong>
          <span class="quote_card_client quote_card_client_link" v-if="q.clientId" @click="clientModal.open(q.clientId)">{{ clientName(q.clientId) }}</span>
          <span class="quote_card_client" v-else>{{ clientName(q.clientId) }}</span>
          <span class="quote_card_company" v-if="q.company">{{ q.company }}</span>
        </div>
        <div class="quote_card_right">
          <span class="quote_card_amount">{{ fmtCurrency(q.amount, { currency: quoteCurrency(q) }) }}</span>
          <select class="quote_card_status" :class="q.status" :value="q.status" @change="changeStatus(q, $event.target.value)" :title="t('qt_field_status')">
            <option value="draft">{{ t('qt_filter_draft') }}</option>
            <option value="sent">{{ t('qt_filter_sent') }}</option>
            <option value="won">{{ t('qt_filter_won') }}</option>
            <option value="lost">{{ t('qt_filter_lost') }}</option>
          </select>
          <button class="button_pdf" @click="handlePdf(q)" :title="t('qt_download_pdf')">📄</button>
          <button class="button_delete" @click="deleteQuote(q.id)" :title="t('qt_delete')">🗑</button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="quote_empty">
      <div class="empty_icon">📄</div>
      <h3>{{ t('qt_empty_title') }}</h3>
      <p>{{ t('qt_empty_note') }}</p>
      <button class="button_primary" @click="slideOpen = true">{{ t('qt_new') }}</button>
    </div>

    <!-- Create Modal -->
    <QuoteCreateModal
      :open="slideOpen"
      :form="form"
      :clients="clients.clients"
      :currency-symbol="laws.currencySymbol"
      :currency="laws.currency"
      :tva="laws.taxRate"
      @close="slideOpen = false"
      @create="createQuote"
    />

    <!-- Country Config -->
    <QuoteCountryConfig
      :open="configOpen"
      :country="billingCountry"
      :laws="laws"
      :legal-label="legalLabel"
      :countries="countryLaws.allCountries"
      @close="configOpen = false"
      @update:country="billingCountry = $event"
    />
  </div>
</template>

<script setup>
import { reactive, computed, watch, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClientStore } from '@/stores/clients'
import { useClientModalStore } from '@/stores/clientModal'
import { useQuoteStore } from '@/stores/quotes'
import { useCreatePrefillStore } from '@/stores/createPrefill'
import { useCountryLawStore } from '@/stores/countryLaws'
import QuoteCreateModal from '@/components/quotes/QuoteCreateModal.vue'
import QuoteCountryConfig from '@/components/quotes/QuoteCountryConfig.vue'
import { downloadPdf } from '@/components/quotes/quotePdf.js'
import { fmtCurrency } from '@/lib/formatters'
import '@/assets/quotes.css'

const { t } = useI18n({ useScope: 'global' })

const clients = useClientStore()
const clientModal = useClientModalStore()
const quoteStore = useQuoteStore()
const prefill = useCreatePrefillStore()
const countryLaws = useCountryLawStore()
// D-08: quotes in the database (shared cross-CSM). The store imports the inherited localStorage quotes once.
const quotes = computed(() => quoteStore.quotes)
// Prefill from the client record ("Quote" button): client pre-selected +
// the creation form opened directly. consume() = once (no replay).
onMounted(() => {
  quoteStore.loadQuotes()
  const p = prefill.consume()
  if (p.clientId) { form.clientId = p.clientId; slideOpen.value = true }
})

const slideOpen = ref(false)
const configOpen = ref(false)
const activeFilter = ref('all')
const billingCountry = ref(countryLaws.currentCountry)

const laws = computed(() => countryLaws.getLaws(billingCountry.value))
const legalLabel = computed(() => {
  const map = { FR: t('country_law_legal_siret'), BE: t('country_law_legal_bce'), CH: t('country_law_legal_ide'), CA: t('country_law_legal_tps'), US: t('country_law_legal_ein'), KR: t('country_law_legal_krn') }
  return map[billingCountry.value] || t('country_law_legal_number')
})

const form = reactive({ title: '', clientId: '', company: '', amount: 0, tax: laws.value.taxRate, status: 'draft', notes: '' })
watch(billingCountry, (country) => { form.tax = countryLaws.getLaws(country).taxRate })

const filters = [
  { key: 'all', label: 'qt_filter_all' }, { key: 'draft', label: 'qt_filter_draft' },
  { key: 'sent', label: 'qt_filter_sent' }, { key: 'won', label: 'qt_filter_won' },
  { key: 'lost', label: 'qt_filter_lost' }
]

const filtered = computed(() => activeFilter.value === 'all' ? quotes.value : quotes.value.filter(q => q.status === activeFilter.value))
const conversionRate = computed(() => { const total = quotes.value.length; return total ? Math.round((quotes.value.filter(q => q.status === 'won').length / total) * 100) : 0 })
const wonAmount = computed(() => quotes.value.filter(q => q.status === 'won').reduce((s, q) => s + q.amount, 0))

function clientName(id) { return clients.clients.find(c => c.id === id)?.name || '—' }
// A quote's currency = that of its own country (q.country), not of the country selected today
function quoteCurrency(q) { return countryLaws.getLaws(q.country || billingCountry.value).currency }

function handlePdf(q) {
  const l = countryLaws.getLaws(q.country || billingCountry.value)
  downloadPdf(q, l, billingCountry.value, t, clientName(q.clientId))
}

async function deleteQuote(id) { await quoteStore.deleteQuote(id) }

// Quote status bug (21/07): the status was a read-only badge. The selector
// calls updateQuote, which persists to the database; on an RLS/network failure, withWrite
// shows a toast and the :value falls back to the real status (no visual desync).
async function changeStatus(q, status) {
  if (!status || status === q.status) return
  await quoteStore.updateQuote(q.id, { status })
}

async function createQuote() {
  const res = await quoteStore.addQuote({ ...form, country: billingCountry.value, currency: laws.value.currencySymbol })
  if (res?.error) return // toast already shown by withWrite; we do not close the form
  Object.assign(form, { title: '', clientId: '', company: '', amount: 0, tax: laws.value.taxRate, status: 'draft', notes: '' })
  slideOpen.value = false
}
</script>

<style scoped>
.quote_card_client_link { cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.quote_card_client_link:hover { color: var(--primary); }
/* Quote status bug: the badge becomes a selector; keeps the colored pill (.quote_card_status.*) */
select.quote_card_status { cursor: pointer; border: 1px solid var(--border); font-family: inherit; line-height: 1.2; }
</style>
