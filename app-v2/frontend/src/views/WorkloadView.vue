<template>
  <div class="workload-view">
    <div class="wl-header">
      <div>
        <h1>💚 {{ t('wl_title') }}</h1>
      </div>
      <!-- B-02: CSV import removed — a team member is a real auth account, created by invitation (CONTRACT CR-6 D1) -->
      <RouterLink class="btn-outline" to="/app/team">{{ t('wl_invite_members') }}</RouterLink>
      <div class="wl-score-badge" :class="scoreClass">
        <span class="wlsb-label">{{ t('wl_team_score') }}</span>
        <span class="wlsb-val">{{ team.teamHealthScore ?? '—' }}</span>
      </div>
    </div>

    <div class="wl-kpis">
      <div class="wlk"><span class="wlk-icon">👥</span><span class="wlk-val">{{ team.members.length }}</span><span class="wlk-label">{{ t('kpi_members') }}</span></div>
      <div class="wlk"><span class="wlk-icon">💚</span><span class="wlk-val green">{{ team.hasWorkloadData ? team.healthyMembers.length : '—' }}</span><span class="wlk-label">{{ t('kpi_healthy_members') }}</span></div>
      <div class="wlk"><span class="wlk-icon">🔴</span><span class="wlk-val red">{{ team.hasWorkloadData ? team.overloadedMembers.length : '—' }}</span><span class="wlk-label">{{ t('kpi_overloaded') }}</span></div>
      <div class="wlk"><span class="wlk-icon">⚠️</span><span class="wlk-val amber">{{ clients.criticalCount }}</span><span class="wlk-label">{{ t('kpi_at_risk_clients') }}</span></div>
    </div>

    <div class="wl-filters">
      <button v-for="f in filters" :key="f.key" class="ftab" :class="{ active: activeFilter === f.key }" @click="activeFilter = f.key">{{ t(f.label) }}</button>
      <div class="search-box"><span>🔍</span><input v-model="search" :placeholder="t('search')" /></div>
    </div>

    <div v-if="filtered.length" class="wl-list">
      <div v-for="m in filtered" :key="m.id" class="wl-card">
        <div class="wlc-header">
          <div class="wlc-avatar" :class="statusClass(m)">{{ m.name[0] }}</div>
          <div class="wlc-info"><strong>{{ m.name }}</strong><span>{{ m.role }}</span></div>
          <span class="wlc-badge" :class="statusClass(m)">{{ statusText(m) }}</span>
        </div>
        <div class="wlc-metrics">
          <div class="wlc-m">
            <div class="wlcm-row"><span>{{ t('wb_score') }}</span><span :class="wellbeingClass(m.wellbeingScore)">{{ hasNum(m.wellbeingScore) ? m.wellbeingScore + '/100' : '—' }}</span></div>
            <div class="wlcm-bar"><div class="wlcm-fill" :class="wellbeingClass(m.wellbeingScore)" :style="{ width: (hasNum(m.wellbeingScore) ? m.wellbeingScore : 0) + '%' }" /></div>
          </div>
          <div class="wlc-m">
            <div class="wlcm-row"><span>{{ t('wb_charge') }}</span><span :class="workloadClass(m.workload)">{{ hasNum(m.workload) ? m.workload + '%' : '—' }}</span></div>
            <div class="wlcm-bar"><div class="wlcm-fill" :class="workloadClass(m.workload)" :style="{ width: (hasNum(m.workload) ? m.workload : 0) + '%' }" /></div>
          </div>
        </div>
        <div class="wlc-details">
          <!-- TEAM-METRICS (29/08): real values derived from the clients store by csm_id (B-09: team store = null) -->
          <span>{{ t('mgr_clients_managed') }}: <strong>{{ clientCountFor(m.id) }}</strong></span>
          <span>{{ t('mgr_arr_managed') }}: <strong>{{ fmtCurrency(arrManagedFor(m.id), { compact: true }) }}</strong></span>
          <span>{{ t('mgr_burnout_risk') }}: <span class="burnout-tag" :class="m.burnoutRisk || ''">{{ m.burnoutRisk ? t('mgr_burnout_' + m.burnoutRisk) : '—' }}</span></span>
        </div>
      </div>
    </div>

    <div v-else class="wl-empty">
      <div class="empty-icon">💚</div>
      <h3>{{ t('wl_empty') }}</h3>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTeamStore } from '@/stores/team'
import { useClientStore } from '@/stores/clients'
import { fmtCurrency } from '@/lib/formatters'

const { t } = useI18n({ useScope: 'global' })
const team = useTeamStore()
const clients = useClientStore()

const activeFilter = ref('all')
const search = ref('')

const filters = [
  { key: 'all', label: 'wl_filter_all' },
  { key: 'overloaded', label: 'wl_filter_overloaded' },
  { key: 'healthy', label: 'wl_filter_healthy' },
  { key: 'risk', label: 'wl_filter_risk' },
]

// B-09: no data → no color, no invented counter
const scoreClass = computed(() => { const s = team.teamHealthScore; if (typeof s !== 'number') return ''; return s >= 70 ? 'green' : s >= 50 ? 'amber' : 'red' })

const filtered = computed(() => {
  // TEAM-METRICS (D2, 29/08): statsMembers = self-inclusive (honest statusLabel/burnoutRisk, E-16/B-09)
  let list = team.statsMembers
  if (activeFilter.value === 'overloaded') list = list.filter(m => m.statusLabel === 'overloaded')
  else if (activeFilter.value === 'healthy') list = list.filter(m => m.statusLabel && m.statusLabel !== 'overloaded')
  else if (activeFilter.value === 'risk') list = list.filter(m => {
    const csmClients = clients.clients.filter(c => c.csmId === m.id)
    return csmClients.some(c => c.status === 'critical')
  })
  if (search.value) { const q = search.value.toLowerCase(); list = list.filter(m => m.name.toLowerCase().includes(q)) }
  return list
})

function hasNum(v) { return typeof v === 'number' }
function statusClass(m) { return m.statusLabel === 'overloaded' ? 'overloaded' : m.statusLabel ? 'healthy' : '' }
function statusText(m) { if (!m.statusLabel) return '—'; return m.statusLabel === 'overloaded' ? t('kpi_overloaded') : t('status_healthy') }
function wellbeingClass(s) { if (typeof s !== 'number') return ''; return s >= 70 ? 'green' : s >= 50 ? 'amber' : 'red' }
function workloadClass(l) { if (typeof l !== 'number') return ''; return l <= 60 ? 'green' : l <= 80 ? 'amber' : 'red' }

// TEAM-METRICS (29/08): real values derived by csm_id, active clients (R21 — 0 is a true value)
function clientCountFor(csmId) { return clients.clientsOnly.filter(c => c.csmId === csmId).length }
function arrManagedFor(csmId) { return clients.clientsOnly.filter(c => c.csmId === csmId).reduce((s, c) => s + (c.arr || 0), 0) }

// TEAM-METRICS (29/08): the "Member CRUD" block was removed — DEAD code (no button in the template
// called it, and B-02 had removed manual creation: a member = a real auth account
// created by invitation) and it carried a native confirm() (forbidden, NO-CONFIRM). Zero-dead-code mantra.
</script>

<style scoped>
.workload-view { max-width: 900px; }
.wl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
.wl-header h1 { font-size: 1.5rem; font-weight: 800; }
a.btn-outline { background-color: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; transition: all 0.2s; }
a.btn-outline:hover { border-color: var(--purple); color: var(--purple); }
.wl-score-badge { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 10px 20px; display: flex; align-items: center; gap: 10px; }
.wlsb-label { font-size: 0.78rem; color: var(--text-secondary); }
.wlsb-val { font-size: 1.8rem; font-weight: 800; }
.wl-score-badge.green .wlsb-val { color: var(--green); }
.wl-score-badge.amber .wlsb-val { color: var(--amber); }
.wl-score-badge.red .wlsb-val { color: var(--red); }

.wl-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.wlk { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: all 0.2s; }
.wlk:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.wlk-icon { font-size: 1.3rem; }
.wlk-val { font-size: 1.5rem; font-weight: 800; }
.wlk-val.green { color: var(--green); } .wlk-val.red { color: var(--red); } .wlk-val.amber { color: var(--amber); }
.wlk-label { font-size: 0.72rem; color: var(--text-secondary); }

.wl-filters { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.ftab { background: var(--bg); border: none; padding: 7px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 500; color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
.ftab.active { background: var(--purple-bg); color: var(--purple); font-weight: 600; }
.search-box { display: flex; align-items: center; gap: 6px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 10px; margin-left: auto; }
.search-box input { border: none; outline: none; padding: 7px 0; font-size: 0.82rem; width: 140px; background: transparent; }

.wl-list { display: flex; flex-direction: column; gap: 14px; }
.wl-card { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; transition: all 0.2s; }
.wl-card:hover { box-shadow: var(--shadow-sm); }
.wlc-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.wlc-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1rem; flex-shrink: 0; background: var(--text-muted, #9ca3af); /* B-09: neutral without data */ }
.wlc-avatar.healthy { background: var(--green); } .wlc-avatar.overloaded { background: var(--red); }
.wlc-info { flex: 1; }
.wlc-info strong { font-size: 0.95rem; display: block; }
.wlc-info span { font-size: 0.75rem; color: var(--text-muted); }
.wlc-badge { font-size: 0.72rem; font-weight: 600; padding: 4px 12px; border-radius: 6px; }
.wlc-badge.healthy { background: var(--green-bg); color: var(--green); }
.wlc-badge.overloaded { background: var(--red-bg); color: var(--red); }

.wlc-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
.wlc-m { }
.wlcm-row { display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 4px; color: var(--text-secondary); }
.wlcm-row .green { color: var(--green); font-weight: 600; } .wlcm-row .amber { color: var(--amber); font-weight: 600; } .wlcm-row .red { color: var(--red); font-weight: 600; }
.wlcm-bar { height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; }
.wlcm-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
.wlcm-fill.green { background: var(--green); } .wlcm-fill.amber { background: var(--amber); } .wlcm-fill.red { background: var(--red); }

.wlc-details { display: flex; gap: 20px; font-size: 0.78rem; color: var(--text-secondary); flex-wrap: wrap; }
.wlc-details strong { color: var(--text); }
.burnout-tag { font-weight: 600; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; }
.burnout-tag.none, .burnout-tag.low { background: var(--green-bg); color: var(--green); }
.burnout-tag.medium { background: var(--amber-bg); color: var(--amber); }
.burnout-tag.high { background: var(--red-bg); color: var(--red); }

.wl-empty { text-align: center; padding: 60px 20px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.empty-icon { font-size: 3rem; margin-bottom: 16px; }
.wl-empty h3 { font-size: 1.2rem; font-weight: 700; color: var(--text-secondary); }

@media (max-width: 768px) { .wl-kpis { grid-template-columns: repeat(2, 1fr); } .wlc-metrics { grid-template-columns: 1fr; } }

.wl-header-actions { display:flex; justify-content:flex-end; margin-bottom:12px; }
.btn-add-member { background:var(--purple);color:#fff;border:none;padding:10px 18px;border-radius:10px;font-size:0.88rem;font-weight:600;cursor:pointer;transition:all 0.2s; }
.btn-add-member:hover { background:#6d28d9;transform:translateY(-1px); }
.member-actions { display:flex;gap:6px;position:absolute;top:12px;right:12px;opacity:0;transition:opacity 0.18s; }
.member-card:hover .member-actions { opacity:1; }
.member-card { position:relative; }
.btn-member-edit, .btn-member-delete { background:rgba(255,255,255,0.9);border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:0.8rem;transition:all 0.15s; }
.btn-member-edit:hover { background:#ede9fe; }
.btn-member-delete:hover { background:#fef2f2; }
.modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000; }
.modal-card { background:var(--bg-card,#fff);border-radius:16px;padding:32px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,0.15); }
.modal-title { font-size:1.1rem;font-weight:700;margin-bottom:20px; }
.modal-form { display:flex;flex-direction:column;gap:14px; }
.fg-row { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
.fg { display:flex;flex-direction:column;gap:4px; }
.fg label { font-size:0.78rem;font-weight:600;color:var(--text-muted,#6b7280); }
.modal-input { padding:10px 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;font-size:0.9rem;outline:none;background:var(--bg,#f8f9fb);color:var(--text,#1a1a2e); }
.modal-input:focus { border-color:var(--purple,#7c3aed); }
.modal-range { width:100%;accent-color:var(--purple,#7c3aed); }
.modal-actions { display:flex;gap:10px;justify-content:flex-end;margin-top:20px; }
.btn-cancel { background:none;border:1px solid var(--border,#e5e7eb);color:var(--text-muted,#6b7280);padding:9px 18px;border-radius:8px;cursor:pointer;font-size:0.88rem; }
.btn-save { background:var(--purple,#7c3aed);color:#fff;border:none;padding:9px 18px;border-radius:8px;cursor:pointer;font-size:0.88rem;font-weight:600; }

</style>
