<template>
  <div class="table-wrap">
    <div class="th">
      <span class="c-name">{{ t('port_field_name') }}</span>
      <span class="c-ind hide-sm">{{ t('port_field_industry') }}</span>
      <span class="c-arr">{{ t('kpi_arr') }}</span>
      <span class="c-h">{{ t('cd_health') }}</span>
      <span class="c-st hide-sm">{{ t('port_field_status') }}</span>
      <span class="c-csm hide-md">{{ t('port_field_agent') }}</span>
      <span class="c-ren hide-md">{{ t('port_renewal') }}</span>
      <span class="c-act hide-sm"></span>
    </div>
    <div v-for="c in clients" :key="c.id" class="tr" @click="$emit('open', c)">
      <div class="c-name">
        <div class="av" :class="statusOf(c)">{{ c.name[0] }}</div>
        <div>
          <strong>
            {{ c.name }}
            <span v-if="c.lifecycle === 'prospect'" class="lc-badge" :class="'stage-' + (c.pipeline_stage || 'new')">{{ t('port_stage_' + (c.pipeline_stage || 'new')) }}</span>
          </strong>
          <span class="sub" v-if="mainContact(c)">
            {{ mainContact(c).name }}<template v-if="mainContact(c).role"> · {{ mainContact(c).role }}</template>
          </span>
        </div>
      </div>
      <span class="c-ind hide-sm">{{ c.industry }}</span>
      <!-- CURRENCY-FORMAT : devise du compte, format de la locale (« 118 k€ » / « €118K »), plus de « € » en dur -->
      <span class="c-arr fw">{{ fmtCurrency(c.arr, { compact: true }) }}<small v-if="wonAmount(c.id) > 0" class="c-signed">{{ t('port_ca_signed') }} {{ fmtCurrency(wonAmount(c.id), { compact: true }) }}</small></span>
      <!-- HEALTH-SCALE : score /10 localisé, pill/badge/avatar colorés par le statut EFFECTIF
           (même fonction que les compteurs et filtres) — plus jamais c.status brut -->
      <span class="c-h">
        <span class="pill" :class="healthTone(statusOf(c))">{{ fmtHealth(c.health) }}</span>
      </span>
      <span class="c-st hide-sm">
        <span class="sbadge" :class="statusOf(c)">{{ t('status_' + statusOf(c)) }}</span>
      </span>
      <span class="c-csm hide-md">{{ c.csm }}</span>
      <span class="c-ren hide-md" :class="{ soon: renewSoon(c) }">
        {{ fmtDate(c.renewalDate) }}
      </span>
      <span class="c-act hide-sm">
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

// CA signée (계약 금액) : somme des devis gagnés du client, affichée sous l'ARR
function wonAmount(id) { return quoteStore.wonAmountForClient(id) }

function mainContact(c) {
  const l = Array.isArray(c.contacts) ? c.contacts : []
  return l.find(x => x.is_primary) || l[0] || null
}
</script>

<style scoped>
.c-signed { display: block; font-size: 0.66rem; font-weight: 600; color: var(--green, #10b981); margin-top: 2px; line-height: 1.2; }
</style>
