<template>
  <div class="playbook_card" @click="$emit('open', pb)">
    <div class="playbook_card_header">
      <div class="playbook_card_left">
        <span
          class="playbook_card_icon"
          :style="{ background: pb.color + '15', color: pb.color }"
        >{{ pb.icon }}</span>
        <div>
          <strong>{{ t('pb_template_' + pb.templateKey) }}</strong>
          <span class="playbook_card_client" v-if="pb.clientId">
            {{ clientLabel }}
          </span>
        </div>
      </div>
      <span class="playbook_card_status" :class="pb.status">
        {{ t('pb_status_' + pb.status) }}
      </span>
    </div>

    <div class="playbook_card_progress">
      <div class="playbook_card_progress_header">
        <span>{{ t('pb_progress') }}</span>
        <span class="playbook_card_percent">{{ progressPct }}%</span>
      </div>
      <div class="playbook_card_bar">
        <div
          class="playbook_card_fill"
          :style="{ width: progressPct + '%', background: pb.color }"
        />
      </div>
    </div>

    <div class="playbook_card_steps">
      <template v-for="step in pb.steps" :key="step.id">
        <div
          class="playbook_card_step"
          :class="{ done: step.done, expandable: hasGuide(step) }"
          @click.stop="toggleGuide(step)"
        >
          <span
            class="step_check"
            @click.stop="$emit('toggleStep', pb.id, step.id)"
          >{{ step.done ? '✅' : '⬜' }}</span>
          <span class="step_title">{{ t(step.title) }}</span>
          <!-- Real due date of the step (set at activation); red if overdue and not done -->
          <span
            v-if="step.due"
            class="step_due"
            :class="{ late: !step.done && step.due < todayIso }"
          >{{ dueLabel(step.due) }}</span>
          <span v-if="hasGuide(step)" class="step_chevron">{{ openGuides.has(step.id) ? '▾' : '▸' }}</span>
        </div>
        <!-- Step guide: Goal / Method / Pitfall / Exit (click on the row) -->
        <div v-if="hasGuide(step) && openGuides.has(step.id)" class="step_guide" @click.stop>
          {{ t(step.title + '_g') }}
        </div>
      </template>
    </div>

    <div class="playbook_card_footer">
      <span class="playbook_card_date">
        {{ t('pb_started') }} {{ formattedDate }}
      </span>
      <div class="playbook_card_buttons">
        <button
          v-if="pb.status === 'active'"
          class="button_small green"
          @click.stop="$emit('complete', pb.id)"
        >{{ t('pb_complete') }}</button>
        <button
          class="button_small red"
          @click.stop="$emit('delete', pb.id)"
        >{{ t('pb_delete') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, te, locale } = useI18n({ useScope: 'global' })

const props = defineProps({
  pb: { type: Object, required: true },
  clientLabel: { type: String, default: '' }
})

defineEmits(['open', 'toggleStep', 'complete', 'delete'])

const progressPct = computed(() => {
  if (!props.pb.steps.length) return 0
  return Math.round(
    (props.pb.steps.filter(s => s.done).length / props.pb.steps.length) * 100
  )
})

const formattedDate = computed(() => {
  if (!props.pb.startedAt) return '—'
  const loc = locale.value === 'ko' ? 'ko-KR'
    : locale.value === 'en' ? 'en-US' : 'fr-FR'
  return new Date(props.pb.startedAt).toLocaleDateString(loc, {
    day: 'numeric',
    month: 'short'
  })
})

// Due dates per step (rework 21/07) — legacy without `due`: nothing displayed
const todayIso = new Date().toISOString().slice(0, 10)
function dueLabel(d) {
  const loc = locale.value === 'ko' ? 'ko-KR'
    : locale.value === 'en' ? 'en-US' : 'fr-FR'
  return new Date(d).toLocaleDateString(loc, { day: 'numeric', month: 'short' })
}

// Guides per step (key `<step>_g`): expanded by clicking the row.
// te() = the key exists in the current locale (legacy/custom: no chevron).
const openGuides = reactive(new Set())
function hasGuide(step) { return te(step.title + '_g') }
function toggleGuide(step) {
  if (!hasGuide(step)) return
  if (openGuides.has(step.id)) openGuides.delete(step.id)
  else openGuides.add(step.id)
}
</script>

<style scoped>
.step_due { margin-left: auto; font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; }
.step_due.late { color: #ef4444; font-weight: 600; }
.playbook_card_step.expandable { cursor: pointer; }
.step_chevron { font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
.step_guide {
  white-space: pre-line; font-size: 0.76rem; line-height: 1.5;
  color: var(--text-secondary); background: var(--bg);
  border-left: 3px solid var(--border); border-radius: 6px;
  padding: 8px 12px; margin: 0 0 6px 30px;
}
</style>
