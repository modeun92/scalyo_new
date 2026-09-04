<template>
  <div class="table_wrapper">
    <div class="table_head">
      <span class="client_name">{{ t('port_field_name') }}</span>
      <span class="client_indicator hide_small">{{ t('port_field_industry') }}</span>
      <span class="client_arr">{{ t('kpi_arr') }}</span>
      <span class="client_header">{{ t('cd_health') }}</span>
      <span class="client_st hide_small">{{ t('port_field_status') }}</span>
      <span class="client_csm hide_medium">{{ t('port_field_agent') }}</span>
      <span class="client_renewal hide_medium">{{ t('port_renewal') }}</span>
      <span class="client_action hide_small"></span>
    </div>
    <div v-for="c in clients" :key="c.id" class="table_row" @click="$emit('open', c)">
      <div class="client_name">
        <div class="av" :class="statusOf(c)">{{ c.name[0] }}</div>
        <div>
          <strong>
            {{ c.name }}
            <span v-if="c.lifecycle === 'prospect'" class="library_card_badge" :class="'stage_' + (c.pipeline_stage || 'new')">{{ t('port_stage_' + (c.pipeline_stage || 'new')) }}</span>
          </strong>
          <span class="sub" v-if="mainContact(c)">
            {{ mainContact(c).name }}<template v-if="mainContact(c).role"> · {{ mainContact(c).role }}</template>
          </span>
        </div>
      </div>
      <span class="client_indicator hide_small">{{ c.industry }}</span>
      <!-- CURRENCY-FORMAT: account currency, locale formatting ("118 k€" / "€118K"), no more hard-coded "€" -->
      <span class="client_arr fw">{{ fmtCurrency(c.arr, { compact: true }) }}<small v-if="wonAmount(c.id) > 0" class="client_signed">{{ t('port_ca_signed') }} {{ fmtCurrency(wonAmount(c.id), { compact: true }) }}</small></span>
      <!-- HEALTH-SCALE: localized score out of 10, pill/badge/avatar colored by the EFFECTIVE status
           (the same function as the counters and filters) — never again a raw c.status -->
      <span class="client_header">
        <span class="pill" :class="healthTone(statusOf(c))">{{ fmtHealth(c.health) }}</span>
      </span>
      <span class="client_st hide_small">
        <span class="sbadge" :class="statusOf(c)">{{ t('status_' + statusOf(c)) }}</span>
      </span>
      <span class="client_csm hide_medium">{{ c.csm }}</span>
      <span class="client_renewal hide_medium" :class="{ soon: renewSoon(c) }">
        {{ fmtDate(c.renewalDate) }}
      </span>
      <span class="client_action hide_small">
        <button class="rb" @click.stop="$emit('edit', c)" :title="t('edit')">✏️</button>
        <template v-if="deleteId === c.id">
          <button class="rb del active" @click.stop="$emit('delete', c)" :title="t('port_delete_step2')">✓</button>
          <button class="rb" @click.stop="deleteId = null" :title="t('sm_reset_cancel')">✕</button>
        </template>
        <button v-else class="rb del" @click.stop="deleteId = c.id" :title="t('port_delete_step1')">🗑️</button>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuoteStore } from '@/stores/quotes'
import { renewSoon } from './portfolioHelpers.js'
import { healthStatus, healthTone } from '@/lib/health'
import { fmtHealth, fmtCurrency, fmtDate } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })

function statusOf(c) { return healthStatus(c.health, c.status) }

defineProps({ clients: { type: Array, required: true } })
defineEmits(['edit', 'delete', 'open'])

const deleteId = ref(null)
const quoteStore = useQuoteStore()

// Signed revenue (계약 금액): sum of the client's won quotes, displayed under the ARR
function wonAmount(id) { return quoteStore.wonAmountForClient(id) }

function mainContact(c) {
  const l = Array.isArray(c.contacts) ? c.contacts : []
  return l.find(x => x.is_primary) || l[0] || null
}
</script>

<style scoped>
.client_signed { display: block; font-size: 0.66rem; font-weight: 600; color: var(--green, #10b981); margin-top: 2px; line-height: 1.2; }
</style>
