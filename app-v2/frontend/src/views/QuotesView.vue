<template>
  <div class="quotes-view">
    <div class="qt-header">
      <div><h1>📄 {{ t('qt_title') }}</h1><p class="qt-sub">{{ t('qt_subtitle') }}</p></div>
      <div class="qt-actions">
        <button class="btn-outline" @click="configOpen = true">{{ t('qt_config') }}</button>
        <button class="btn-primary" @click="slideOpen = true">{{ t('qt_new') }}</button>
      </div>
    </div>

    <!-- Country banner -->
    <div v-if="billingCountry" class="qt-country-banner">
      <span>{{ laws.flag }} {{ laws.name }}</span>
      <!-- QUOTE-VAT (27/08) : le champ s'appelle taxRate — « laws.tva » n'a jamais existé -->
      <span>{{ t('qt_field_tax') }}: {{ laws.taxRate }}% ({{ laws.taxName }})</span>
      <span>{{ t('cl_currency') }}: {{ laws.currencySymbol }}</span>
    </div>

    <!-- KPIs -->
    <div class="qt-kpis">
      <div class="qtk"><span class="qtk-val">{{ quotes.length }}</span><span class="qtk-lbl">{{ t('qt_total') }}</span></div>
      <div class="qtk"><span class="qtk-val">{{ conversionRate }}%</span><span class="qtk-lbl">{{ t('qt_conversion') }}</span></div>
      <!-- CURRENCY-FORMAT : un devis suit la devise de SON pays de facturation (code ISO de countryLaws), formaté à la locale -->
      <div class="qtk"><span class="qtk-val green">{{ fmtCurrency(wonAmount, { currency: laws.currency }) }}</span><span class="qtk-lbl">{{ t('qt_won') }}</span></div>
    </div>

    <!-- Filters -->
    <div class="qt-filters">
      <button v-for="f in filters" :key="f.key" class="ftab" :class="{ active: activeFilter === f.key }" @click="activeFilter = f.key">{{ t(f.label) }}</button>
    </div>

    <!-- List -->
    <div v-if="filtered.length" class="qt-list">
      <div v-for="q in filtered" :key="q.id" class="qt-card">
        <div class="qtc-left">
          <strong>{{ q.title }}</strong>
          <span class="qtc-client qtc-client-link" v-if="q.clientId" @click="clientModal.open(q.clientId)">{{ clientName(q.clientId) }}</span>
          <span class="qtc-client" v-else>{{ clientName(q.clientId) }}</span>
          <span class="qtc-company" v-if="q.company">{{ q.company }}</span>
        </div>
        <div class="qtc-right">
          <span class="qtc-amount">{{ fmtCurrency(q.amount, { currency: quoteCurrency(q) }) }}</span>
          <select class="qtc-status" :class="q.status" :value="q.status" @change="changeStatus(q, $event.target.value)" :title="t('qt_field_status')">
            <option value="draft">{{ t('qt_filter_draft') }}</option>
            <option value="sent">{{ t('qt_filter_sent') }}</option>
            <option value="won">{{ t('qt_filter_won') }}</option>
            <option value="lost">{{ t('qt_filter_lost') }}</option>
          </select>
          <button class="btn-pdf" @click="handlePdf(q)" :title="t('qt_download_pdf')">📄</button>
          <button class="btn-delete" @click="deleteQuote(q.id)" :title="t('qt_delete')">🗑</button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="qt-empty">
      <div class="empty-icon">📄</div>
      <h3>{{ t('qt_empty_title') }}</h3>
      <p>{{ t('qt_empty_note') }}</p>
      <button class="btn-primary" @click="slideOpen = true">{{ t('qt_new') }}</button>
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
// D-08 : devis en base (partagés cross-CSM). Le store importe une fois les devis localStorage hérités.
const quotes = computed(() => quoteStore.quotes)
// Prefill depuis la fiche client (bouton « Devis ») : pré-sélection du client +
// ouverture directe du formulaire de création. consume() = once (pas de rejeu).
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
  const map = { FR: t('cl_legal_siret'), BE: t('cl_legal_bce'), CH: t('cl_legal_ide'), CA: t('cl_legal_tps'), US: t('cl_legal_ein'), KR: t('cl_legal_krn') }
  return map[billingCountry.value] || t('cl_legal_number')
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
// Devise d'un devis = celle de son pays (q.country), pas du pays sélectionné aujourd'hui
function quoteCurrency(q) { return countryLaws.getLaws(q.country || billingCountry.value).currency }

function handlePdf(q) {
  const l = countryLaws.getLaws(q.country || billingCountry.value)
  downloadPdf(q, l, billingCountry.value, t, clientName(q.clientId))
}

async function deleteQuote(id) { await quoteStore.deleteQuote(id) }

// Bug statut devis (21/07) : le statut était un badge en lecture seule. Le sélecteur
// appelle updateQuote qui persiste en base ; en cas d'échec RLS/réseau, withWrite
// affiche un toast et le :value revient au statut réel (pas de désync visuelle).
async function changeStatus(q, status) {
  if (!status || status === q.status) return
  await quoteStore.updateQuote(q.id, { status })
}

async function createQuote() {
  const res = await quoteStore.addQuote({ ...form, country: billingCountry.value, currency: laws.value.currencySymbol })
  if (res?.error) return // toast déjà affiché par withWrite ; on ne ferme pas le formulaire
  Object.assign(form, { title: '', clientId: '', company: '', amount: 0, tax: laws.value.taxRate, status: 'draft', notes: '' })
  slideOpen.value = false
}
</script>

<style scoped>
.qtc-client-link { cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.qtc-client-link:hover { color: var(--primary); }
/* Bug statut devis : le badge devient un sélecteur ; garde le pill coloré (.qtc-status.*) */
select.qtc-status { cursor: pointer; border: 1px solid var(--border); font-family: inherit; line-height: 1.2; }
</style>
