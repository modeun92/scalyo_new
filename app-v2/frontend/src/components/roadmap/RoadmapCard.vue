<template>
  <div class="rm-card">
    <!-- Card header -->
    <div class="rmc-header">
      <div class="rmc-left">
        <span class="rmc-icon" :style="{ background: rm.color + '22' }">{{ rm.icon }}</span>
        <div>
          <strong>{{ rm.name }}</strong>
          <!-- DATE-RAW: `rm.createdAt` did not exist (row spread `...r` → created_at) → empty label;
               the start date = that of the first milestone (entered at creation), otherwise created_at -->
          <span class="rmc-date">{{ t('rm_start_date') }} : {{ fmtDate(rm.milestones?.[0]?.startDate || rm.created_at) }}</span>
        </div>
      </div>
      <div class="rmc-right">
        <div class="rmc-progress">
          <div class="rmc-bar">
            <div class="rmc-fill" :style="{ width: store.roadmapProgress(rm) + '%', background: rm.color }" />
          </div>
          <span class="rmc-pct">{{ store.roadmapProgress(rm) }}%</span>
        </div>
        <!-- Delete flow -->
        <template v-if="step === 2">
          <span class="del-msg warn">{{ t('rm_delete_step2') }}</span>
          <button class="btn-danger" @click="$emit('confirm-delete', rm.id)">{{ t('rm_delete_confirm') }}</button>
          <button class="btn-outline-sm" @click="step = 0">{{ t('rm_delete_cancel') }}</button>
        </template>
        <template v-else-if="step === 1">
          <span class="del-msg">{{ t('rm_delete_step1') }}</span>
          <button class="btn-danger-outline-sm" @click="step = 2">{{ t('rm_delete_confirm') }}</button>
          <button class="btn-outline-sm" @click="step = 0">{{ t('rm_delete_cancel') }}</button>
        </template>
        <template v-else>
          <button class="btn-del" @click="step = 1" :title="t('rm_delete_roadmap')">🗑</button>
        </template>
      </div>
    </div>

    <!-- Timeline -->
    <div class="rmc-timeline">
      <div v-for="(ms, i) in rm.milestones" :key="ms.id" class="rmt-item">
        <div class="rmt-connector" v-if="i > 0" :class="{ done: rm.milestones[i-1].done }" />
        <div class="rmt-node" :class="ms.status" @click="$emit('edit-milestone', rm, ms)">
          <span v-if="ms.done">✓</span>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <div class="rmt-label">
          <span class="rmt-title">{{ ms.titleKey ? t(ms.titleKey) : ms.title }}</span>
          <span class="rmt-date">{{ fmtDate(ms.endDate) }}</span>
          <span v-if="daysInfo(ms)" class="rmt-days" :class="daysInfo(ms).late ? 'late' : 'ok'">
            {{ daysInfo(ms).days }} {{ daysInfo(ms).late ? t('rm_days_late') : t('rm_days_left') }}
          </span>
        </div>
      </div>
      <div class="rmt-add" @click="$emit('add-milestone', rm)">
        <span>{{ t('rm_add_milestone') }}</span>
      </div>
    </div>
    <div v-if="!rm.milestones.length" class="rmc-empty">{{ t('rm_no_milestones') }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoadmapStore } from '@/stores/roadmap'
import { fmtDate } from '@/lib/formatters' // DATE-RAW

const { t } = useI18n({ useScope: 'global' })
const store = useRoadmapStore()

defineProps({ rm: { type: Object, required: true } })
defineEmits(['edit-milestone', 'add-milestone', 'confirm-delete'])

const step = ref(0)

function daysInfo(ms) {
  if (!ms.endDate || ms.done) return null
  const end = new Date(ms.endDate)
  const now = new Date()
  const diff = Math.round((end - now) / 86400000)
  if (diff > 30) return null
  return { days: Math.abs(diff), late: diff < 0 }
}
</script>
