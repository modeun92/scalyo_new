<template>
  <Teleport to="body">
    <Transition name="client_modal_fade">
      <div v-if="modal.isOpen" class="client_modal_root" @keydown.esc="modal.close()">
        <div class="client_modal_overlay" @click="modal.close()" />

        <div v-if="client" class="client_modal_window" :style="windowStyle" role="dialog" aria-modal="true">
          <!-- Title bar = drag handle -->
          <div class="client_modal_titlebar" @pointerdown="startDrag">
            <div class="client_modal_title">
              <span class="client_modal_avatar" :style="{ background: statusColor }">{{ (form.name || '?')[0] }}</span>
              <span class="client_modal_name">{{ form.name || t('cd_untitled') }}</span>
              <span class="client_modal_badge" :class="'status_' + effectiveStatus">{{ statusLabel }}</span>
            </div>
            <button class="client_modal_close" @click="modal.close()" :title="t('cancel')">✕</button>
          </div>

          <div class="client_modal_body">
            <!-- ── Editable info (everything editable, here, right now) ── -->
            <div class="client_modal_grid">
              <label class="client_modal_f client_modal_f_wide"><span>{{ t('port_field_name') }}</span>
                <input v-model="form.name" class="client_modal_i" /></label>
              <label class="client_modal_f"><span>{{ t('port_field_industry') }}</span>
                <!-- FICHE-SECTEUR (29/08): a stored value outside the list (import, other language)
                     matched no option → EMPTY select even though the data exists.
                     Dynamic option = the value shows as-is and can be reclassified. -->
                <select v-model="form.industry" class="client_modal_i"><option value="">—</option>
                  <option v-if="form.industry && !industries.includes(form.industry)" :value="form.industry">{{ form.industry }}</option>
                  <option v-for="i in industries" :key="i" :value="i">{{ i }}</option></select></label>
              <label class="client_modal_f"><span>{{ t('port_field_status') }}</span>
                <select v-model="form.status" class="client_modal_i">
                  <option value="healthy">{{ t('status_healthy') }}</option>
                  <option value="watch">{{ t('status_watch') }}</option>
                  <option value="critical">{{ t('status_critical') }}</option></select></label>
              <label class="client_modal_f"><span>{{ t('cd_health') }} (0-10)</span>
                <input v-model.number="form.health" type="number" min="0" max="10" class="client_modal_i" /></label>
              <label class="client_modal_f"><span>NPS</span>
                <input v-model.number="form.nps" type="number" min="-100" max="100" class="client_modal_i" /></label>
              <!-- CURRENCY-FORMAT: currency symbol of the ACCOUNT (no more hard-coded "€"), amount through the single formatter -->
              <label class="client_modal_f"><span>{{ t('cd_arr') }} ({{ currencySymbol() }})</span>
                <input v-model.number="form.arr" type="number" min="0" class="client_modal_i" /></label>
              <label class="client_modal_f"><span>{{ t('cd_mrr') }} ({{ currencySymbol() }})</span>
                <input v-model.number="form.mrr" type="number" min="0" class="client_modal_i" /></label>
              <div class="client_modal_f"><span>{{ t('port_ca_signed') }}</span>
                <div class="client_modal_i client_modal_ro">{{ fmtCurrency(signedAmount) }}</div></div>
              <label class="client_modal_f"><span>{{ t('cd_renewal') }}</span>
                <input v-model="form.renewalDate" type="date" class="client_modal_i" /></label>
              <label class="client_modal_f"><span>{{ t('cd_csm') }}</span>
                <select v-model="form.csmId" class="client_modal_i"><option value="">{{ t('cd_no_csm') }}</option>
                  <option v-for="m in team.assignableMembers" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
            </div>

            <!-- ── Monthly metrics (client_metrics — contract 22/07) ── -->
            <div class="client_modal_section">
              <div class="client_modal_section_header">
                <h3>{{ t('cmet_title') }}</h3>
                <button class="client_modal_mini" @click="showMetricAdd = !showMetricAdd">＋ {{ t('cmet_add') }}</button>
              </div>
              <div v-if="showMetricAdd" class="client_modal_metric_form">
                <!-- P10 think-like-a-CSM: direct search (39 KPIs), tracked ones first, focus on value after selection -->
                <div class="client_modal_kpi_combo">
                  <input v-model="kpiSearch" class="client_modal_i" :placeholder="t('cmet_pick')"
                    @focus="kpiListOpen = true" @input="kpiListOpen = true; metricDraft.kpiId = ''"
                    @keydown.esc="kpiListOpen = false" @blur="closeKpiListSoon" />
                  <div v-if="kpiListOpen" class="client_modal_kpi_list">
                    <button v-for="k in filteredManualKpis" :key="k.id" class="client_modal_kpi_option" @mousedown.prevent="pickKpi(k)">
                      <span v-if="isTracked(k.id)" class="client_modal_kpi_tracked">●</span>
                      <span class="client_modal_kpi_option_label">{{ metricLabel(k.id) }}</span>
                      <span class="client_modal_kpi_unit">{{ k.unit }}</span>
                    </button>
                    <div v-if="!filteredManualKpis.length" class="client_modal_muted client_modal_kpi_none">—</div>
                  </div>
                </div>
                <input v-model="metricDraft.month" type="month" :max="curMonth" class="client_modal_i" />
                <input ref="valueInput" v-model="metricDraft.value" type="number" step="any" class="client_modal_i client_modal_metric_value"
                  :placeholder="t('cmet_value')" @keydown.enter="submitMetric" />
                <button class="button_primary client_modal_note_button" :disabled="!canSaveMetric || savingMetric" @click="submitMetric">
                  {{ savingMetric ? '…' : t('cd_note_add') }}
                </button>
              </div>
              <div v-if="!trackedKpis.length" class="client_modal_muted">{{ t('cmet_empty') }}</div>
              <div v-for="tk in trackedKpis" :key="tk.kpiId" class="client_modal_metric">
                <button class="client_modal_metric_row" @click="toggleMetric(tk.kpiId)">
                  <span class="client_modal_metric_chevron">{{ metricOpen[tk.kpiId] ? '▾' : '▸' }}</span>
                  <span class="client_modal_metric_label">{{ metricLabel(tk.kpiId) }}</span>
                  <span class="client_modal_metric_last">{{ fmtKpiValue(tk.last.value, kpiFormat(tk.kpiId)) }}<em> · {{ fmtMonth(tk.last.period) }}</em></span>
                </button>
                <div v-if="metricOpen[tk.kpiId]" class="client_modal_metric_hist">
                  <div v-for="p in tk.points.slice().reverse()" :key="p.id" class="client_modal_metric_pt">
                    <span class="client_modal_metric_month">{{ fmtMonth(p.period) }}</span>
                    <span>{{ fmtKpiValue(p.value, kpiFormat(tk.kpiId)) }}</span>
                    <button class="client_modal_remove" @click="removeMetric(p)" :title="t('cancel')">🗑️</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Interlocuteurs ── -->
            <div class="client_modal_section">
              <div class="client_modal_section_header">
                <h3>{{ t('port_contacts_title') }}</h3>
                <button class="client_modal_mini" @click="addContact">＋ {{ t('port_contact_add') }}</button>
              </div>
              <p v-if="!form.contacts.length" class="client_modal_muted">{{ t('port_contacts_empty') }}</p>
              <div v-for="(ct, i) in form.contacts" :key="i" class="client_modal_contact">
                <input v-model="ct.name" :placeholder="t('port_field_contact_name')" class="client_modal_i" />
                <input v-model="ct.role" :placeholder="t('port_field_contact_role')" class="client_modal_i" />
                <input v-model="ct.email" :placeholder="t('port_field_contact_email')" class="client_modal_i" />
                <button class="client_modal_remove" @click="form.contacts.splice(i, 1)" :title="t('cancel')">✕</button>
              </div>
            </div>

            <!-- ── Free-form notes (FB-03 v2) — call / email / meeting / note ── -->
            <div class="client_modal_section">
              <h3>{{ t('cd_notes') }}</h3>
              <div class="client_modal_note_add">
                <select v-model="noteKind" class="client_modal_i client_modal_note_kind">
                  <option value="note">📝 {{ t('cd_kind_note') }}</option>
                  <option value="call">📞 {{ t('cd_kind_call') }}</option>
                  <option value="email">✉️ {{ t('cd_kind_email') }}</option>
                  <option value="meeting">🤝 {{ t('cd_kind_meeting') }}</option>
                </select>
                <textarea v-model="noteDraft" class="client_modal_i client_modal_note_text" rows="2"
                  :placeholder="t('cd_note_placeholder')" @keydown.ctrl.enter="submitNote" @keydown.meta.enter="submitNote" />
                <button class="button_primary client_modal_note_button" :disabled="!noteDraft.trim() || savingNote" @click="submitNote">
                  {{ savingNote ? '…' : t('cd_note_add') }}
                </button>
              </div>
              <div v-if="!notes.length" class="client_modal_muted">{{ t('cd_notes_empty') }}</div>
              <div v-for="n in notes" :key="n.id" class="client_modal_note">
                <span class="client_modal_note_icon">{{ kindIcon(n.kind) }}</span>
                <div class="client_modal_note_main">
                  <div class="client_modal_note_content">{{ n.content }}</div>
                  <div class="client_modal_note_meta">{{ n.author_name || '—' }} · {{ fmtDate(n.created_at) }}</div>
                </div>
                <button class="client_modal_remove" @click="removeNote(n.id)" :title="t('cancel')">🗑️</button>
              </div>
            </div>

            <!-- ── Create & log (copil / task linked to this client) ── -->
            <div class="client_modal_section">
              <h3>{{ t('cd_add_title') }}</h3>
              <div class="client_modal_add_row">
                <button class="client_modal_add_button" :disabled="addingCopil" @click="addCopil">
                  <span class="client_modal_note_icon">📊</span>{{ addingCopil ? t('cd_opening') : t('cd_add_copil') }}
                </button>
                <button class="client_modal_add_button" :class="{ active: showTaskInput }" @click="showTaskInput = !showTaskInput">
                  <span class="client_modal_note_icon">📝</span>{{ t('cd_add_task') }}
                </button>
                <button class="client_modal_add_button" @click="goCreate('/app/quotes')">
                  <span class="client_modal_note_icon">📄</span>{{ t('cd_add_quote') }}
                </button>
                <button class="client_modal_add_button" @click="goCreate('/app/tasks/planning')">
                  <span class="client_modal_note_icon">📅</span>{{ t('cd_add_event') }}
                </button>
                <button class="client_modal_add_button" @click="goCreate('/app/playbooks')">
                  <span class="client_modal_note_icon">📋</span>{{ t('cd_add_playbook') }}
                </button>
              </div>
              <div v-if="showTaskInput" class="client_modal_task_add">
                <input v-model="taskDraft" class="client_modal_i" :placeholder="t('cd_task_placeholder')"
                  @keydown.enter="addQuickTask" />
                <button class="button_primary client_modal_note_button" :disabled="!taskDraft.trim() || savingTask" @click="addQuickTask">
                  {{ savingTask ? '…' : t('cd_note_add') }}
                </button>
              </div>
            </div>

            <!-- ── Derived history (tasks / planning / playbooks / copils) ── -->
            <div class="client_modal_section">
              <h3>{{ t('cd_timeline') }}</h3>
              <div v-if="!timeline.length" class="client_modal_muted">{{ t('cd_tl_empty') }}</div>
              <router-link v-for="(e, i) in timeline" :key="i" :to="e.to" class="client_modal_timeline" @click="modal.close()">
                <span class="client_modal_note_icon">{{ e.icon }}</span>
                <span class="client_modal_timeline_label">{{ e.label }}</span>
                <span class="client_modal_timeline_date">{{ e.date ? fmtDate(e.date) : '—' }}</span>
              </router-link>
            </div>
          </div>

          <div class="client_modal_footer">
            <span v-if="saved" class="client_modal_saved">✓ {{ t('cd_saved') }}</span>
            <button class="button_outline" @click="modal.close()">{{ t('cancel') }}</button>
            <button class="button_primary" @click="saveClient">{{ t('save') }}</button>
          </div>
        </div>

        <!-- Client introuvable -->
        <div v-else class="client_modal_window client_modal_window_small" :style="windowStyle" role="dialog">
          <div class="client_modal_titlebar"><span class="client_modal_name">{{ t('cd_not_found') }}</span>
            <button class="client_modal_close" @click="modal.close()">✕</button></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useClientModalStore } from '@/stores/clientModal'
import { useClientNotesStore } from '@/stores/clientNotes'
import { useClientStore } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import { useTaskStore } from '@/stores/tasks'
import { useKpiStore } from '@/stores/kpis'
import { usePlaybookStore } from '@/stores/playbooks'
import { useNotificationStore } from '@/stores/notifications'
import { useQuoteStore } from '@/stores/quotes'
import { useCreatePrefillStore } from '@/stores/createPrefill'
import { useClientMetricsStore, currentMonth } from '@/stores/clientMetrics'
import { KPI_CATALOG } from '@/data/kpiCatalog'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtKpiValue, fmtMonth, fmtCurrency, currencySymbol } from '@/lib/formatters'
import { notifTitle } from '@/lib/notifText'

const { t, locale } = useI18n({ useScope: 'global' })
const router = useRouter()
const modal = useClientModalStore()
const notesStore = useClientNotesStore()
const clients = useClientStore()
const team = useTeamStore()
const notifStore = useNotificationStore()
const quoteStore = useQuoteStore()
const prefill = useCreatePrefillStore()
const tasksStore = useTaskStore()
const kpis = useKpiStore()
const playbooks = usePlaybookStore()

const client = computed(() => clients.clients.find(c => c.id === modal.clientId) || null)
const industries = computed(() => t('port_industries').split(','))
const effectiveStatus = computed(() => client.value ? clients.getEffectiveStatus({ ...client.value, ...form }) : 'healthy')
const statusLabel = computed(() => t('status_' + effectiveStatus.value))
const statusColor = computed(() => effectiveStatus.value === 'healthy' ? '#10b981' : effectiveStatus.value === 'watch' ? '#f59e0b' : '#ef4444')
// Signed revenue (계약 금액): sum of the client's won quotes (read-only; quotes loaded on open)
const signedAmount = computed(() => client.value ? quoteStore.wonAmountForClient(client.value.id) : 0)

// ── Editable form (mirrors PortfolioView's save contract) ──
const form = reactive({
  name: '', industry: '', status: 'healthy', health: 5, nps: 0, arr: 0, mrr: 0,
  renewalDate: '', csmId: '', churnRisk: 0, lifecycle: 'client', pipeline_stage: null, contacts: []
})
const saved = ref(false)

function hydrate(c) {
  if (!c) return
  Object.assign(form, {
    name: c.name, industry: c.industry || '', status: c.status || 'healthy',
    health: c.health ?? 5, nps: c.nps ?? 0, arr: c.arr ?? 0, mrr: c.mrr ?? 0,
    renewalDate: c.renewalDate || '', csmId: c.csmId || '', churnRisk: c.churnRisk ?? c.churn_risk ?? 0,
    lifecycle: c.lifecycle || 'client', pipeline_stage: c.pipeline_stage || null,
    contacts: (Array.isArray(c.contacts) ? c.contacts : []).map(x => ({
      name: x.name || '', role: x.role || '', email: x.email || '', phone: x.phone || '', is_primary: !!x.is_primary
    }))
  })
  saved.value = false
}
function addContact() {
  const first = form.contacts.length === 0
  form.contacts.push({ name: '', role: '', email: '', phone: '', is_primary: first })
}
function saveClient() {
  const data = {
    name: form.name, industry: form.industry, arr: form.arr,
    mrr: form.mrr || Math.round((form.arr || 0) / 12), health: form.health, nps: form.nps,
    status: form.status, csmId: form.csmId, csm: team.memberName(form.csmId) || '',
    renewalDate: form.renewalDate, churnRisk: form.churnRisk,
    logo: form.status === 'healthy' ? '🟢' : form.status === 'watch' ? '🟡' : '🔴',
    lifecycle: form.lifecycle, pipeline_stage: form.pipeline_stage, contacts: form.contacts
  }
  clients.updateClient({ id: client.value.id, ...data })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2500)
}

// ── Notes ──
const noteDraft = ref('')
const noteKind = ref('note')
const savingNote = ref(false)
const notes = computed(() => notesStore.notesFor(modal.clientId))
function kindIcon(k) { return k === 'call' ? '📞' : k === 'email' ? '✉️' : k === 'meeting' ? '🤝' : '📝' }
async function submitNote() {
  if (!noteDraft.value.trim() || savingNote.value) return
  savingNote.value = true
  const res = await notesStore.addNote(modal.clientId, { content: noteDraft.value, kind: noteKind.value })
  savingNote.value = false
  if (res?.success) { noteDraft.value = ''; noteKind.value = 'note' }
}
async function removeNote(id) { await notesStore.deleteNote(modal.clientId, id) }

// ── Monthly metrics (contract 22/07): entry of the catalog's manual KPIs ──
// One data point per (kpi, month) — re-entering the same month corrects it (upsert). 'auto' KPIs
// (ARR, MRR, churn…) are NEVER offered here: they are computed from real data.
const metricsStore = useClientMetricsStore()
const showMetricAdd = ref(false)
const savingMetric = ref(false)
const metricOpen = reactive({})
const curMonth = currentMonth()
const metricDraft = reactive({ kpiId: '', month: curMonth, value: '' })
const KPI_BY_ID = Object.fromEntries(KPI_CATALOG.map(k => [k.id, k]))
const manualKpis = KPI_CATALOG.filter(k => k.source === 'manual')
const trackedKpis = computed(() => metricsStore.trackedFor(modal.clientId))

// ── KPI search (P10 think-like-a-CSM): direct filter, THIS client's tracked KPIs first ──
const kpiSearch = ref('')
const kpiListOpen = ref(false)
const valueInput = ref(null)
function normTxt(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }
const trackedIds = computed(() => new Set(trackedKpis.value.map(x => x.kpiId)))
function isTracked(id) { return trackedIds.value.has(id) }
const filteredManualKpis = computed(() => {
  const q = normTxt(kpiSearch.value)
  let list = manualKpis
  if (q) list = list.filter(k => normTxt(metricLabel(k.id)).includes(q) || k.id.includes(q))
  // the recurring gesture first: this client's already tracked KPIs at the top
  return [...list].sort((a, b) => (isTracked(b.id) ? 1 : 0) - (isTracked(a.id) ? 1 : 0)).slice(0, 12)
})
function pickKpi(k) {
  metricDraft.kpiId = k.id
  kpiSearch.value = metricLabel(k.id)
  kpiListOpen.value = false
  valueInput.value?.focus()
}
function closeKpiListSoon() { setTimeout(() => { kpiListOpen.value = false }, 150) }
const canSaveMetric = computed(() =>
  metricDraft.kpiId && metricDraft.month && metricDraft.value !== '' && !Number.isNaN(Number(metricDraft.value)))
function kpiFormat(id) { return KPI_BY_ID[id]?.format || 'number' }
function metricLabel(id) {
  const k = KPI_BY_ID[id]
  if (!k) return id
  return locale.value === 'en' ? (k.labelEN || k.label) : locale.value === 'ko' ? (k.labelKO || k.label) : k.label
}
function toggleMetric(id) { metricOpen[id] = !metricOpen[id] }
async function submitMetric() {
  if (!canSaveMetric.value || savingMetric.value || !client.value) return
  savingMetric.value = true
  const kpiId = metricDraft.kpiId
  const res = await metricsStore.upsertMetric({
    clientId: client.value.id, kpiId, month: metricDraft.month, value: metricDraft.value,
  })
  savingMetric.value = false
  if (res?.success) { metricDraft.value = ''; metricOpen[kpiId] = true }
}
async function removeMetric(p) { await metricsStore.deleteMetric(p.id) }

// ── Create & log (copil / task linked to this client) ──
// A copil created here carries client_id → it shows up in the timeline (kpis.copils
// filtered by clientId) AND in the client's copil list. We then open the
// builder to fill it in. The quick task is inserted (dbToTask) and appears immediately.
const addingCopil = ref(false)
async function addCopil() {
  if (addingCopil.value || !client.value) return
  addingCopil.value = true
  const name = form.name || client.value.name
  const id = await kpis.createCopil({ clientId: client.value.id, clientName: name, title: t('cd_new_copil_title', { name }) })
  addingCopil.value = false
  if (id) { modal.close(); router.push('/app/kpis/' + id) }
}

const showTaskInput = ref(false)
const taskDraft = ref('')
const savingTask = ref(false)
async function addQuickTask() {
  if (!taskDraft.value.trim() || savingTask.value || !client.value) return
  savingTask.value = true
  const res = await tasksStore.addTask({ title: taskDraft.value.trim(), clientId: client.value.id, status: 'todo' })
  savingTask.value = false
  if (res) { taskDraft.value = ''; showTaskInput.value = false }
}

// Quote / Event / Playbook: rich forms that live in their own module.
// We record the intent (client) in the prefill store, close the record and
// navigate; the module consumes it on mount → client pre-selected + form open.
// The created object carries client_id → it then shows up in this history.
function goCreate(path) {
  if (!client.value) return
  prefill.set(client.value.id, form.name || client.value.name)
  modal.close()
  router.push(path)
}

// ── Planning (state local to PlanningView → targeted read) ──
const planningEvents = ref([])
async function loadPlanning(id) {
  planningEvents.value = []
  if (!id) return
  try {
    const { data, error } = await supabase.from('planning_events')
      .select('id,title,start_at').eq('client_id', id).order('start_at', { ascending: false }).limit(50)
    if (error) { console.error('[client-modal] planning load failed:', error.message); return }
    planningEvents.value = data || []
  } catch (e) { console.error('[client-modal] planning load failed:', e.message || e) }
}

// ── Derived timeline (contract R23 D3) ──
const timeline = computed(() => {
  const id = modal.clientId
  const out = []
  for (const tk of tasksStore.tasks.filter(x => x.clientId === id)) {
    out.push({ date: tk.createdAt?.slice(0, 10) || tk.startDate || '', icon: '📝', to: '/app/tasks', label: t('cd_tl_task_created', { title: tk.title }) })
    if (tk.finished || tk.status === 'done') out.push({ date: tk.endDate || tk.dueDate || '', icon: '✅', to: '/app/tasks', label: t('cd_tl_task_done', { title: tk.title }) })
  }
  for (const ev of planningEvents.value) out.push({ date: (ev.start_at || '').slice(0, 10), icon: '📅', to: '/app/tasks/planning', label: t('cd_tl_event', { title: ev.title }) })
  for (const pb of playbooks.playbooks.filter(x => (x.clientId ?? x.client_id) === id)) {
    const name = t('pb_template_' + (pb.templateKey ?? pb.template_key ?? ''))
    const started = pb.startedAt ?? pb.started_at, completed = pb.completedAt ?? pb.completed_at
    if (started) out.push({ date: started.slice(0, 10), icon: pb.icon || '📋', to: '/app/playbooks', label: t('cd_tl_pb_started', { name }) })
    if (completed) out.push({ date: completed.slice(0, 10), icon: '🏁', to: '/app/playbooks', label: t('cd_tl_pb_done', { name }) })
  }
  for (const cp of kpis.copils.filter(x => x.clientId === id)) out.push({ date: (cp.createdAt || '').slice(0, 10), icon: '📊', to: '/app/kpis', label: t('cd_tl_copil', { title: cp.title }) })
  // Devis (base, store quotes) — clientId + status + createdAt
  for (const q of quoteStore.quotesForClient(id)) out.push({ date: (q.createdAt || '').slice(0, 10), icon: '📄', to: '/app/quotes', label: t('cd_tl_quote', { title: q.title || '—', status: t('qt_filter_' + (q.status || 'draft')) }) })
  // Linked projects — derived from the client's tasks (no direct client_id on projects)
  const projByClient = {}
  for (const tk of tasksStore.tasks.filter(x => x.clientId === id && x.projectId)) {
    const d = tk.createdAt?.slice(0, 10) || ''
    if (!projByClient[tk.projectId] || d > projByClient[tk.projectId]) projByClient[tk.projectId] = d
  }
  for (const [pid, d] of Object.entries(projByClient)) {
    const proj = tasksStore.projects.find(p => p.id === pid)
    if (proj) out.push({ date: d, icon: '📁', to: '/app/tasks', label: t('cd_tl_project', { name: proj.name || proj.title }) })
  }
  // Situations / tickets = alerts raised on this client (churn, renewal, errors…)
  for (const n of notifStore.notifications.filter(x => x.target_id === id)) out.push({ date: (n.created_at || '').slice(0, 10), icon: '🔔', to: '/app/dashboard', label: t('cd_tl_alert', { title: notifTitle(n, t) }) })
  return out.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80)
})

// Quotes loaded once on open (database-backed store)
function loadQuotesForClient() { if (!quoteStore.quotes.length) quoteStore.loadQuotes() }

// ── Window dragging (handle = title bar) ──
const pos = reactive({ x: 0, y: 0 })
const windowStyle = computed(() => ({ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }))
let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0
function startDrag(e) {
  if (e.target.closest('.cm-close')) return
  dragging = true; sx = e.clientX; sy = e.clientY; ox = pos.x; oy = pos.y
  window.addEventListener('pointermove', onDrag)
  window.addEventListener('pointerup', endDrag)
}
function onDrag(e) { if (dragging) { pos.x = ox + (e.clientX - sx); pos.y = oy + (e.clientY - sy) } }
function endDrag() { dragging = false; window.removeEventListener('pointermove', onDrag); window.removeEventListener('pointerup', endDrag) }

// On every open OR client change (opening B while A is displayed):
// re-center, re-hydrate the form, reload notes + planning. We watch
// isOpen AND clientId — otherwise the form would keep A's values (risk of writing A over B).
watch(() => [modal.isOpen, modal.clientId], ([open]) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open && modal.clientId) {
    pos.x = 0; pos.y = 0
    showTaskInput.value = false; taskDraft.value = ''
    hydrate(client.value)
    notesStore.loadNotes(modal.clientId)
    loadPlanning(modal.clientId)
    loadQuotesForClient()
    metricsStore.loadAll()
    showMetricAdd.value = false
    metricDraft.kpiId = ''; metricDraft.month = currentMonth(); metricDraft.value = ''
    kpiSearch.value = ''; kpiListOpen.value = false
  }
})
</script>

<style scoped>
.client_modal_root { position: fixed; inset: 0; z-index: 10050; }
.client_modal_overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); }
.client_modal_window { position: fixed; top: 50%; left: 50%; width: min(760px, 94vw); max-height: 88vh;
  background: var(--card-bg, var(--bg-card)); border: 1px solid var(--border); border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.28); display: flex; flex-direction: column; overflow: hidden; }
.client_modal_window_small { width: 360px; }
.client_modal_titlebar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 18px; border-bottom: 1px solid var(--border); cursor: grab; user-select: none; touch-action: none; background: var(--bg); }
.client_modal_titlebar:active { cursor: grabbing; }
.client_modal_title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.client_modal_avatar { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; flex-shrink: 0; }
.client_modal_name { font-weight: 800; font-size: 1.02rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.client_modal_badge { font-size: 0.7rem; font-weight: 700; padding: 2px 9px; border-radius: 99px; flex-shrink: 0; }
.status_healthy { background: rgba(16,185,129,.14); color: #10b981; }
.status_watch { background: rgba(245,158,11,.14); color: #f59e0b; }
.status_critical { background: rgba(239,68,68,.14); color: #ef4444; }
.client_modal_close { width: 30px; height: 30px; border: none; border-radius: 8px; background: var(--bg-hover); color: var(--text-secondary); cursor: pointer; flex-shrink: 0; }
.client_modal_close:hover { background: var(--border); }
.client_modal_body { flex: 1 1 auto; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 22px; }
.client_modal_grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.client_modal_ro { display: flex; align-items: center; color: var(--text-muted, #64748b); background: var(--bg, #f8fafc); font-variant-numeric: tabular-nums; }
.client_modal_f { display: flex; flex-direction: column; gap: 5px; font-size: 0.78rem; color: var(--text-secondary); }
.client_modal_f_wide { grid-column: 1 / -1; }
.client_modal_i { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 0.9rem; width: 100%; }
.client_modal_section_header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.client_modal_section h3 { font-size: 0.9rem; font-weight: 700; margin: 0 0 10px; }
.client_modal_mini, .client_modal_note_button { border: none; border-radius: 8px; padding: 6px 12px; font-size: 0.8rem; cursor: pointer; }
.client_modal_mini { background: var(--bg-hover); color: var(--text); }
.client_modal_contact { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px; }
.client_modal_remove { border: none; background: transparent; cursor: pointer; font-size: 0.9rem; }
.client_modal_note_add { display: grid; grid-template-columns: 130px 1fr auto; gap: 8px; align-items: start; margin-bottom: 14px; }
.client_modal_note_text { resize: vertical; font-family: inherit; }
.client_modal_note_button { align-self: stretch; }
.client_modal_note { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
.client_modal_note_icon { flex-shrink: 0; }
.client_modal_note_main { flex: 1; min-width: 0; }
.client_modal_note_content { font-size: 0.88rem; white-space: pre-wrap; }
.client_modal_note_meta { font-size: 0.74rem; color: var(--text-muted); margin-top: 3px; }
.client_modal_timeline { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); text-decoration: none; color: var(--text); }
.client_modal_timeline:hover { background: var(--bg-hover); }
.client_modal_timeline_label { flex: 1; font-size: 0.86rem; min-width: 0; }
.client_modal_timeline_date { font-size: 0.76rem; color: var(--text-muted); flex-shrink: 0; }
.client_modal_muted { font-size: 0.85rem; color: var(--text-muted); }
.client_modal_footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--border); background: var(--bg); }
.client_modal_saved { margin-right: auto; color: #10b981; font-size: 0.82rem; font-weight: 700; }
.client_modal_fade-enter-active, .client_modal_fade-leave-active { transition: opacity .2s ease; }
.client_modal_fade-enter-from, .client_modal_fade-leave-to { opacity: 0; }
.client_modal_add_row { display: flex; gap: 8px; flex-wrap: wrap; }
.client_modal_add_button { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border);
  border-radius: 9px; padding: 8px 13px; background: var(--bg); color: var(--text);
  font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
.client_modal_add_button:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--primary); }
.client_modal_add_button.active { border-color: var(--primary); background: var(--bg-hover); }
.client_modal_add_button:disabled { opacity: .6; cursor: default; }
.client_modal_task_add { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 10px; }
/* ── Monthly metrics (client_metrics batch 22/07) ── */
.client_modal_metric_form { display: grid; grid-template-columns: 1fr auto 110px auto; gap: 6px; margin-bottom: 10px; }
.client_modal_kpi_combo { position: relative; }
.client_modal_kpi_list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30; background: var(--card-bg, var(--bg-card)); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 12px 32px rgba(0,0,0,0.14); max-height: 260px; overflow-y: auto; padding: 4px; }
.client_modal_kpi_option { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; background: none; border: none; padding: 7px 9px; border-radius: 6px; font-size: 0.84rem; color: var(--text); cursor: pointer; }
.client_modal_kpi_option:hover { background: var(--bg-hover); }
.client_modal_kpi_option_label { flex: 1; min-width: 0; }
.client_modal_kpi_tracked { color: var(--purple, #7c3aed); font-size: 0.6rem; }
.client_modal_kpi_unit { font-size: 0.68rem; color: var(--text-muted); }
.client_modal_kpi_none { padding: 8px; text-align: center; }
.client_modal_metric { border-top: 1px solid var(--border); }
.client_modal_metric_row { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; padding: 8px 2px; cursor: pointer; font-size: 0.86rem; color: var(--text); }
.client_modal_metric_chevron { font-size: 0.65rem; color: var(--text-muted); width: 12px; flex-shrink: 0; }
.client_modal_metric_label { flex: 1; text-align: left; font-weight: 500; min-width: 0; }
.client_modal_metric_last { font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.client_modal_metric_last em { font-style: normal; font-weight: 400; color: var(--text-muted); font-size: 0.75rem; }
.client_modal_metric_hist { padding: 0 0 8px 20px; display: flex; flex-direction: column; gap: 2px; }
.client_modal_metric_pt { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; padding: 2px 0; }
.client_modal_metric_month { color: var(--text-muted); min-width: 90px; }
@media (max-width: 640px) {
  .client_modal_note_add { grid-template-columns: 1fr; }
  .client_modal_contact { grid-template-columns: 1fr 1fr; }
}
</style>
