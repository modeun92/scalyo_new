<template>
  <div class="okr-view">
    <div class="okr-header">
      <div>
        <h1>🎯 {{ t('okr_title') }}</h1>
        <div class="okr-global" v-if="okrs.length">
          <span class="og-label">{{ t('okr_global') }}</span>
          <div class="og-bar"><div class="og-fill" :style="{ width: globalProgress + '%' }" /></div>
          <span class="og-pct">{{ globalProgress }}%</span>
        </div>
      </div>
      <div class="okr-actions">
        <button class="btn-outline" @click="resetFilters">{{ t('okr_reset') }}</button>
        <button class="btn-primary" @click="openCreate">{{ t('okr_new') }}</button>
      </div>
    </div>

    <!-- Filters -->
    <div class="okr-filters">
      <select v-model="filterPeriod" class="fsel"><option value="all">{{ t('okr_filter_all_periods') }}</option><option v-for="p in periods" :key="p" :value="p">{{ p }}</option></select>
      <select v-model="filterOwner" class="fsel"><option value="all">{{ t('okr_filter_all_owners') }}</option><option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select>
      <select v-model="filterStatus" class="fsel"><option value="all">{{ t('okr_filter_all_statuses') }}</option><option value="on_track">{{ t('okr_status_on_track') }}</option><option value="at_risk">{{ t('okr_status_at_risk') }}</option><option value="behind">{{ t('okr_status_behind') }}</option><option value="done">{{ t('okr_status_done') }}</option></select>
    </div>

    <!-- OKR list -->
    <div v-if="filtered.length" class="okr-list">
      <div v-for="okr in filtered" :key="okr.id" class="okr-card">
        <div class="oc-header">
          <div class="oc-left">
            <strong>{{ okr.title }}</strong>
            <div class="oc-meta">
              <span class="oc-period">{{ okr.period }}</span>
              <span class="oc-owner">{{ memberName(okr.ownerId) }}</span>
            </div>
          </div>
          <div class="oc-right">
            <span class="oc-status" :class="okr.status">{{ t('okr_status_' + okr.status) }}</span>
            <span class="oc-pct">{{ okrProgress(okr) }}%</span>
            <button class="rb" @click="openEdit(okr)">✏️</button>
            <button class="rb del" @click="pendingDeleteId = okr.id">🗑️</button>
          </div>
        </div>

        <!-- Confirmation inline suppression -->
        <div v-if="pendingDeleteId === okr.id" class="delete-confirm">
          <span>{{ t('okr_delete_confirm') }}</span>
          <button class="btn-sm-cancel" @click="pendingDeleteId = null">{{ t('cancel') }}</button>
          <button class="btn-sm-delete" @click="confirmDelete(okr.id)">{{ t('delete') }}</button>
        </div>

        <div class="oc-progress"><div class="oc-bar"><div class="oc-fill" :class="okr.status" :style="{ width: okrProgress(okr) + '%' }" /></div></div>
        <!-- Key Results -->
        <div class="kr-list">
          <div v-for="kr in okr.keyResults" :key="kr.id" class="kr-item">
            <div class="kr-info">
              <span class="kr-title">{{ kr.title }}</span>
              <span class="kr-vals">{{ kr.current }} / {{ kr.target }}</span>
            </div>
            <div class="kr-bar"><div class="kr-fill" :style="{ width: krPct(kr) + '%' }" /></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="okr-empty">
      <div class="empty-icon">🎯</div>
      <h3>{{ t('okr_empty_title') }}</h3>
      <p>{{ t('okr_empty_desc') }}</p>
      <button class="btn-primary" @click="openCreate">{{ t('okr_new') }}</button>
    </div>

    <!-- Slide-over -->
    <SlideOver :open="slideOpen" :title="editId ? t('okr_title') : t('okr_create_title')" @close="slideOpen = false" :width="520">
      <form @submit.prevent="saveOkr" class="sf">
        <div class="fg"><label>{{ t('okr_field_title') }} *</label><input v-model="form.title" required class="fi" /></div>
        <div class="fr">
          <div class="fg"><label>{{ t('okr_field_period') }}</label><select v-model="form.period" class="fi"><option v-for="p in periods" :key="p" :value="p">{{ p }}</option></select></div>
          <div class="fg"><label>{{ t('okr_field_owner') }}</label><select v-model="form.ownerId" class="fi"><option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select></div>
        </div>
        <div class="fg"><label>{{ t('okr_field_status') }}</label>
          <select v-model="form.status" class="fi">
            <option value="on_track">{{ t('okr_status_on_track') }}</option>
            <option value="at_risk">{{ t('okr_status_at_risk') }}</option>
            <option value="behind">{{ t('okr_status_behind') }}</option>
            <option value="done">{{ t('okr_status_done') }}</option>
          </select>
        </div>
        <div class="form-section">{{ t('okr_key_results') }}</div>
        <div v-for="(kr, i) in form.keyResults" :key="i" class="kr-edit">
          <input v-model="kr.title" :placeholder="t('okr_kr_placeholder')" class="fi kr-title-input" />
          <div class="kr-edit-row">
            <div class="fg"><label>{{ t('okr_kr_target') }}</label><input v-model.number="kr.target" type="number" class="fi" /></div>
            <div class="fg"><label>{{ t('okr_kr_current') }}</label><input v-model.number="kr.current" type="number" class="fi" /></div>
            <button type="button" class="btn-sm-del" @click="form.keyResults.splice(i, 1)">🗑️</button>
          </div>
        </div>
        <button type="button" class="btn-add-kr" @click="form.keyResults.push({ id: Date.now(), title: '', target: 100, current: 0 })">{{ t('okr_add_kr') }}</button>
        <div class="fa">
          <button type="button" class="btn-outline" @click="slideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="btn-primary">{{ editId ? t('save') : t('create') }}</button>
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
// OKR-QUARTER (29/08) : périodes DYNAMIQUES (année courante) et défaut = trimestre COURANT.
// L'ancienne liste était figée « Q1..Q4 2026 » (E4) avec « Q2 2026 » en défaut, faux dès Q3.
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
.okr-view { max-width: 900px; }
.okr-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.okr-header h1 { font-size: 1.5rem; font-weight: 800; }
.okr-actions { display: flex; gap: 8px; }
.btn-primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-primary:hover { background: var(--purple-dark); }
.btn-outline { background-color: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.btn-outline:hover { border-color: var(--purple); color: var(--purple); }
.og-label { font-size: 0.78rem; color: var(--text-secondary); margin-right: 10px; }
.okr-global { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.og-bar { width: 160px; height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; }
.og-fill { height: 100%; background: var(--purple); border-radius: 3px; transition: width 0.5s; }
.og-pct { font-size: 0.85rem; font-weight: 700; color: var(--purple); }
.okr-filters { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
.fsel { padding: 7px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.82rem; background-color: var(--bg-card); outline: none; cursor: pointer; }
.okr-list { display: flex; flex-direction: column; gap: 14px; }
.okr-card { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; }
.oc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 12px; }
.oc-left strong { font-size: 1rem; display: block; margin-bottom: 4px; }
.oc-meta { display: flex; gap: 8px; }
.oc-period { font-size: 0.72rem; color: var(--purple); background: var(--purple-bg); padding: 2px 8px; border-radius: 4px; }
.oc-owner { font-size: 0.72rem; color: var(--text-muted); }
.oc-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.oc-status { font-size: 0.7rem; font-weight: 600; padding: 3px 10px; border-radius: 6px; }
.oc-status.on_track { background: var(--green-bg); color: var(--green); }
.oc-status.at_risk { background: var(--amber-bg); color: var(--amber); }
.oc-status.behind { background: var(--red-bg); color: var(--red); }
.oc-status.done { background: var(--blue-bg); color: var(--blue); }
.oc-pct { font-size: 0.85rem; font-weight: 700; }
.rb { background: none; border: none; font-size: 0.85rem; padding: 4px; border-radius: 4px; opacity: 0.4; cursor: pointer; }
.rb:hover { opacity: 1; background: var(--bg-hover); }
.rb.del:hover { background: var(--red-bg); }
.delete-confirm { display: flex; align-items: center; gap: 10px; background: var(--red-bg); border: 1px solid var(--red); border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px; font-size: 0.82rem; color: var(--red); font-weight: 500; }
.delete-confirm span { flex: 1; }
.btn-sm-cancel { background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary); padding: 4px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; cursor: pointer; }
.btn-sm-delete { background: var(--red); border: none; color: #fff; padding: 4px 12px; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.oc-progress { margin-bottom: 14px; }
.oc-bar { height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; }
.oc-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.oc-fill.on_track { background: var(--green); }
.oc-fill.at_risk { background: var(--amber); }
.oc-fill.behind { background: var(--red); }
.oc-fill.done { background: var(--blue); }
.kr-list { display: flex; flex-direction: column; gap: 8px; }
.kr-item { padding: 10px; background: var(--bg); border-radius: var(--radius-sm); }
.kr-info { display: flex; justify-content: space-between; margin-bottom: 6px; }
.kr-title { font-size: 0.82rem; }
.kr-vals { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }
.kr-bar { height: 4px; background: var(--border-light); border-radius: 2px; overflow: hidden; }
.kr-fill { height: 100%; background: var(--purple); border-radius: 2px; transition: width 0.4s; }
.okr-empty { text-align: center; padding: 60px 20px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.empty-icon { font-size: 3rem; margin-bottom: 16px; }
.okr-empty h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; }
.okr-empty p { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 20px; }
.sf { display: flex; flex-direction: column; gap: 14px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.fi { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background-color: var(--bg-card); width: 100%; }
.fi:focus { border-color: var(--purple); }
.fr { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fa { display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--border-light); }
.form-section { font-size: 0.82rem; font-weight: 700; padding: 8px 0 0; border-top: 1px solid var(--border-light); }
.kr-edit { background: var(--bg); border-radius: var(--radius-sm); padding: 12px; }
.kr-title-input { margin-bottom: 8px; }
.kr-edit-row { display: flex; gap: 8px; align-items: flex-end; }
.kr-edit-row .fg { flex: 1; }
.btn-sm-del { background: none; border: none; font-size: 0.85rem; cursor: pointer; padding: 8px; opacity: 0.5; }
.btn-sm-del:hover { opacity: 1; }
.btn-add-kr { background: var(--purple-bg); color: var(--purple); border: 1px dashed var(--purple-border); padding: 10px; border-radius: var(--radius-sm); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.btn-add-kr:hover { background: rgba(124,58,237,0.1); }
@media (max-width: 768px) { .fr { grid-template-columns: 1fr; } }
</style>
