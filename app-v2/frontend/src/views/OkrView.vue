<template>
  <div class="okr_view">
    <div class="okr_header">
      <div>
        <h1>🎯 {{ t('okr_title') }}</h1>
        <div class="okr_global" v-if="okrs.length">
          <span class="okr_gauge_label">{{ t('okr_global') }}</span>
          <div class="okr_gauge_bar"><div class="okr_gauge_fill" :style="{ width: globalProgress + '%' }" /></div>
          <span class="okr_gauge_percent">{{ globalProgress }}%</span>
        </div>
      </div>
      <div class="okr_actions">
        <button class="button_outline" @click="resetFilters">{{ t('okr_reset') }}</button>
        <button class="button_primary" @click="openCreate">{{ t('okr_new') }}</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="okr_filters">
      <select v-model="filterPeriod" class="fsel"><option value="all">{{ t('okr_filter_all_periods') }}</option><option v-for="p in periods" :key="p" :value="p">{{ p }}</option></select>
      <select v-model="filterOwner" class="fsel"><option value="all">{{ t('okr_filter_all_owners') }}</option><option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select>
      <select v-model="filterStatus" class="fsel"><option value="all">{{ t('okr_filter_all_statuses') }}</option><option value="on_track">{{ t('okr_status_on_track') }}</option><option value="at_risk">{{ t('okr_status_at_risk') }}</option><option value="behind">{{ t('okr_status_behind') }}</option><option value="done">{{ t('okr_status_done') }}</option></select>
    </div>

    <!-- OKR list -->
    <div v-if="filtered.length" class="okr_list">
      <div v-for="okr in filtered" :key="okr.id" class="okr_card">
        <div class="okr_card_header">
          <div class="okr_card_left">
            <strong>{{ okr.title }}</strong>
            <div class="okr_card_meta">
              <span class="okr_card_period">{{ okr.period }}</span>
              <span class="okr_card_owner">{{ memberName(okr.ownerId) }}</span>
            </div>
          </div>
          <div class="okr_card_right">
            <span class="okr_card_status" :class="okr.status">{{ t('okr_status_' + okr.status) }}</span>
            <span class="okr_card_percent">{{ okrProgress(okr) }}%</span>
            <button class="rb" @click="openEdit(okr)">✏️</button>
            <button class="rb del" @click="pendingDeleteId = okr.id">🗑️</button>
          </div>
        </div>

        <!-- Confirmation inline suppression -->
        <div v-if="pendingDeleteId === okr.id" class="delete_confirm">
          <span>{{ t('okr_delete_confirm') }}</span>
          <button class="button_small_cancel" @click="pendingDeleteId = null">{{ t('cancel') }}</button>
          <button class="button_small_delete" @click="confirmDelete(okr.id)">{{ t('delete') }}</button>
        </div>

        <div class="okr_card_progress"><div class="okr_card_bar"><div class="okr_card_fill" :class="okr.status" :style="{ width: okrProgress(okr) + '%' }" /></div></div>
        <!-- Key Results -->
        <div class="key_result_list">
          <div v-for="kr in okr.keyResults" :key="kr.id" class="key_result_item">
            <div class="key_result_info">
              <span class="key_result_title">{{ kr.title }}</span>
              <span class="key_result_vals">{{ kr.current }} / {{ kr.target }}</span>
            </div>
            <div class="key_result_bar"><div class="key_result_fill" :style="{ width: krPct(kr) + '%' }" /></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="okr_empty">
      <div class="empty_icon">🎯</div>
      <h3>{{ t('okr_empty_title') }}</h3>
      <p>{{ t('okr_empty_desc') }}</p>
      <button class="button_primary" @click="openCreate">{{ t('okr_new') }}</button>
    </div>

    <!-- Slide-over -->
    <SlideOver :open="slideOpen" :title="editId ? t('okr_title') : t('okr_create_title')" @close="slideOpen = false" :width="520">
      <form @submit.prevent="saveOkr" class="slideover_form">
        <div class="field_group"><label>{{ t('okr_field_title') }} *</label><input v-model="form.title" required class="field_input" /></div>
        <div class="field_row">
          <div class="field_group"><label>{{ t('okr_field_period') }}</label><select v-model="form.period" class="field_input"><option v-for="p in periods" :key="p" :value="p">{{ p }}</option></select></div>
          <div class="field_group"><label>{{ t('okr_field_owner') }}</label><select v-model="form.ownerId" class="field_input"><option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select></div>
        </div>
        <div class="field_group"><label>{{ t('okr_field_status') }}</label>
          <select v-model="form.status" class="field_input">
            <option value="on_track">{{ t('okr_status_on_track') }}</option>
            <option value="at_risk">{{ t('okr_status_at_risk') }}</option>
            <option value="behind">{{ t('okr_status_behind') }}</option>
            <option value="done">{{ t('okr_status_done') }}</option>
          </select>
        </div>
        <div class="form_section">{{ t('okr_key_results') }}</div>
        <div v-for="(kr, i) in form.keyResults" :key="i" class="key_result_edit">
          <input v-model="kr.title" :placeholder="t('okr_kr_placeholder')" class="field_input key_result_title_input" />
          <div class="key_result_edit_row">
            <div class="field_group"><label>{{ t('okr_kr_target') }}</label><input v-model.number="kr.target" type="number" class="field_input" /></div>
            <div class="field_group"><label>{{ t('okr_kr_current') }}</label><input v-model.number="kr.current" type="number" class="field_input" /></div>
            <button type="button" class="button_small_delete_icon" @click="form.keyResults.splice(i, 1)">🗑️</button>
          </div>
        </div>
        <button type="button" class="button_add_kr" @click="form.keyResults.push({ id: Date.now(), title: '', target: 100, current: 0 })">{{ t('okr_add_kr') }}</button>
        <div class="form_actions">
          <button type="button" class="button_outline" @click="slideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="button_primary">{{ editId ? t('save') : t('create') }}</button>
        </div>
      </form>
    </SlideOver>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamStore } from '@/stores/team'
import SlideOver from '@/components/SlideOver.vue'

const { t } = useI18n({ useScope: 'global' })
const team = useTeamStore()

function loadData(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback } }
function saveData(key, value) { localStorage.setItem(key, JSON.stringify(value)) }

const okrs = ref(loadData('scalyo_okrs', []))
watch(okrs, val => saveData('scalyo_okrs', val), { deep: true })

const slideOpen = ref(false)
const editId = ref(null)
const pendingDeleteId = ref(null)
const filterPeriod = ref('all')
const filterOwner = ref('all')
const filterStatus = ref('all')
// OKR-QUARTER (29/08): DYNAMIC periods (current year) and default = the CURRENT quarter.
// The old list was hard-coded "Q1..Q4 2026" (E4) with "Q2 2026" as the default, wrong from Q3 on.
function currentQuarter() {
  const d = new Date()
  return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear()
}
const periods = computed(() => {
  const y = new Date().getFullYear()
  return ['Q1 ' + y, 'Q2 ' + y, 'Q3 ' + y, 'Q4 ' + y]
})

const initForm = () => ({ title: '', period: currentQuarter(), ownerId: team.assignableMembers[0]?.id || '', status: 'on_track', keyResults: [{ id: 1, title: '', target: 100, current: 0 }] })
const form = reactive(initForm())

const filtered = computed(() => {
  return okrs.value.filter(o => {
    if (filterPeriod.value !== 'all' && o.period !== filterPeriod.value) return false
    if (filterOwner.value !== 'all' && o.ownerId !== filterOwner.value) return false
    if (filterStatus.value !== 'all' && o.status !== filterStatus.value) return false
    return true
  })
})

const globalProgress = computed(() => {
  if (!okrs.value.length) return 0
  return Math.round(okrs.value.reduce((s, o) => s + okrProgress(o), 0) / okrs.value.length)
})

function okrProgress(okr) {
  if (!okr.keyResults.length) return 0
  return Math.round(okr.keyResults.reduce((s, kr) => s + krPct(kr), 0) / okr.keyResults.length)
}
function krPct(kr) { return kr.target ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0 }
function memberName(id) { return team.memberName(id) || '—' }
function resetFilters() { filterPeriod.value = 'all'; filterOwner.value = 'all'; filterStatus.value = 'all' }

function openCreate() { editId.value = null; Object.assign(form, initForm()); slideOpen.value = true }
function openEdit(okr) {
  editId.value = okr.id
  Object.assign(form, { title: okr.title, period: okr.period, ownerId: okr.ownerId, status: okr.status, keyResults: JSON.parse(JSON.stringify(okr.keyResults)) })
  slideOpen.value = true
}
function saveOkr() {
  if (editId.value) {
    const i = okrs.value.findIndex(o => o.id === editId.value)
    if (i !== -1) Object.assign(okrs.value[i], { ...form, keyResults: JSON.parse(JSON.stringify(form.keyResults)) })
  } else {
    okrs.value.push({ id: 'okr_' + Date.now(), ...form, keyResults: JSON.parse(JSON.stringify(form.keyResults)) })
  }
  slideOpen.value = false
}
function confirmDelete(id) { okrs.value = okrs.value.filter(o => o.id !== id); pendingDeleteId.value = null }
</script>

<style scoped>
.okr_view { max-width: 900px; }
.okr_header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.okr_header h1 { font-size: 1.5rem; font-weight: 800; }
.okr_actions { display: flex; gap: 8px; }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.button_primary:hover { background: var(--purple-dark); }
.button_outline { background-color: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.button_outline:hover { border-color: var(--purple); color: var(--purple); }
.okr_gauge_label { font-size: 0.78rem; color: var(--text-secondary); margin-right: 10px; }
.okr_global { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.okr_gauge_bar { width: 160px; height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; }
.okr_gauge_fill { height: 100%; background: var(--purple); border-radius: 3px; transition: width 0.5s; }
.okr_gauge_percent { font-size: 0.85rem; font-weight: 700; color: var(--purple); }
.okr_filters { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
.fsel { padding: 7px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.82rem; background-color: var(--bg-card); outline: none; cursor: pointer; }
.okr_list { display: flex; flex-direction: column; gap: 14px; }
.okr_card { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
.okr_card_header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 12px; }
.okr_card_left strong { font-size: 1rem; display: block; margin-bottom: 4px; }
.okr_card_meta { display: flex; gap: 8px; }
.okr_card_period { font-size: 0.72rem; color: var(--purple); background: var(--purple-bg); padding: 2px 8px; border-radius: 4px; }
.okr_card_owner { font-size: 0.72rem; color: var(--text-muted); }
.okr_card_right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.okr_card_status { font-size: 0.7rem; font-weight: 600; padding: 3px 10px; border-radius: 6px; }
.okr_card_status.on_track { background: var(--green-bg); color: var(--green); }
.okr_card_status.at_risk { background: var(--amber-bg); color: var(--amber); }
.okr_card_status.behind { background: var(--red-bg); color: var(--red); }
.okr_card_status.done { background: var(--blue-bg); color: var(--blue); }
.okr_card_percent { font-size: 0.85rem; font-weight: 700; }
.rb { background: none; border: none; font-size: 0.85rem; padding: 4px; border-radius: 4px; opacity: 0.4; cursor: pointer; }
.rb:hover { opacity: 1; background: var(--bg-hover); }
.rb.del:hover { background: var(--red-bg); }
.delete_confirm { display: flex; align-items: center; gap: 10px; background: var(--red-bg); border: 1px solid var(--red); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px; font-size: 0.82rem; color: var(--red); font-weight: 500; }
.delete_confirm span { flex: 1; }
.button_small_cancel { background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); padding: 4px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; cursor: pointer; }
.button_small_delete { background: var(--red); border: none; color: #fff; padding: 4px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.okr_card_progress { margin-bottom: 14px; }
.okr_card_bar { height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; }
.okr_card_fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.okr_card_fill.on_track { background: var(--green); }
.okr_card_fill.at_risk { background: var(--amber); }
.okr_card_fill.behind { background: var(--red); }
.okr_card_fill.done { background: var(--blue); }
.key_result_list { display: flex; flex-direction: column; gap: 8px; }
.key_result_item { padding: 10px; background: var(--bg); border-radius: var(--radius-sm); }
.key_result_info { display: flex; justify-content: space-between; margin-bottom: 6px; }
.key_result_title { font-size: 0.82rem; }
.key_result_vals { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.key_result_bar { height: 4px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.key_result_fill { height: 100%; background: var(--purple); border-radius: 2px; transition: width 0.4s; }
.okr_empty { text-align: center; padding: 60px 20px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.empty_icon { font-size: 3rem; margin-bottom: 16px; }
.okr_empty h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; }
.okr_empty p { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 20px; }
.slideover_form { display: flex; flex-direction: column; gap: 14px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.field_input { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background-color: var(--bg-card); width: 100%; }
.field_input:focus { border-color: var(--purple); }
.field_row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form_actions { display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--border-light); }
.form_section { font-size: 0.82rem; font-weight: 700; padding: 8px 0 0; border-top: 1px solid var(--border-light); }
.key_result_edit { background: var(--bg); border-radius: var(--radius-sm); padding: 12px; }
.key_result_title_input { margin-bottom: 8px; }
.key_result_edit_row { display: flex; gap: 8px; align-items: flex-end; }
.key_result_edit_row .field_group { flex: 1; }
.button_small_delete_icon { background: none; border: none; font-size: 0.85rem; cursor: pointer; padding: 8px; opacity: 0.5; }
.button_small_delete_icon:hover { opacity: 1; }
.button_add_kr { background: var(--purple-bg); color: var(--purple); border: 1px dashed var(--purple-border); padding: 10px; border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.button_add_kr:hover { background: rgba(124,58,237,0.1); }
@media (max-width: 768px) { .field_row { grid-template-columns: 1fr; } }
</style>
