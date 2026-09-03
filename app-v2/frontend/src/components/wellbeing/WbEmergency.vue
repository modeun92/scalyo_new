<template>
  <div class="wb-emergency">
    <h3>🚨 {{ t('wb_emergency') }}</h3>
    <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px;">{{ t('wb_emergency_desc') }}</p>
    <div style="display:flex;flex-wrap:wrap;gap:12px;">
      <a v-for="line in lines" :key="line.key" :href="'tel:' + line.number" style="display:flex;align-items:center;gap:6px;font-size:0.82rem;">
        <span>{{ line.flag }}</span>
        <span style="font-weight:600;">{{ t(line.key) }}</span>
        <span style="color:var(--text-muted);">{{ line.number }}</span>
      </a>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })
const lines = [
  { key: 'wb_crisis_fr', flag: '\u{1F1EB}\u{1F1F7}', number: '3114' },
  { key: 'wb_crisis_en', flag: '\u{1F1EC}\u{1F1E7}', number: '116 123' },
  { key: 'wb_crisis_ko', flag: '\u{1F1F0}\u{1F1F7}', number: '1393' },
]
</script>
