<template>
  <div class="settings_view">
    <h1>⚙️ {{ t('sm_settings_title') }}</h1>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="toast" class="settings_toast">{{ toast }}</div>
    </transition>

    <!-- General info -->
    <div class="settings_card">
      <h3>{{ t('sm_firstname') }}</h3>
      <div class="settings_grid">
        <div class="field_group"><label>{{ t('sm_firstname') }}</label><input v-model="form.firstName" class="field_input" /></div>
        <div class="field_group"><label>{{ t('sm_country') }}</label>
          <select v-model="form.country" class="field_input">
            <option v-for="c in countryLaws.allCountries" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }}</option>
          </select>
        </div>
        <div class="field_group"><label>{{ t('sm_company') }}</label><input v-model="form.company" class="field_input" /></div>
        <div class="field_group"><label>{{ t('sm_contract') }}</label>
          <select v-model="form.contract" class="field_input">
            <option value="cdi">{{ t('sm_contract_cdi') }}</option>
            <option value="cdd">{{ t('sm_contract_cdd') }}</option>
            <option value="freelance">{{ t('sm_contract_freelance') }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Time organization -->
    <div class="settings_card">
      <h3>{{ t('sm_days_week') }}</h3>
      <div class="settings_grid">
        <div class="field_group">
          <label>{{ t('sm_days_week') }}</label>
          <input v-model.number="form.daysPerWeek" type="number" min="1" max="7" class="field_input" />
        </div>
        <div class="field_group">
          <label>{{ t('sm_hours_day') }}</label>
          <input v-model.number="form.hoursPerDay" type="number" min="1" max="24" step="0.5" class="field_input" />
          <span class="legal_hint">⚖️ {{ laws.hoursPerWeek }}h/{{ t('sm_days_week').toLowerCase() }}</span>
        </div>
        <div class="field_group">
          <label>{{ t('sm_vacation_days') }}</label>
          <input v-model.number="form.vacationDays" type="number" min="0" class="field_input" />
          <span class="legal_hint">⚖️ {{ t('cl_updated', { country: '' }) }} {{ laws.vacationDays }}j</span>
        </div>
        <div class="field_group">
          <label>{{ t('sm_holidays') }}</label>
          <input v-model.number="form.holidays" type="number" min="0" class="field_input" />
          <span class="legal_hint">⚖️ {{ laws.publicHolidays }} {{ t('sm_holidays').toLowerCase() }}</span>
        </div>
        <div class="field_group">
          <label>{{ t('sm_exceptional') }}</label>
          <input v-model.number="form.exceptionalLeave" type="number" min="0" class="field_input" />
        </div>
        <div class="field_group">
          <label>{{ t('sm_daily_tasks') }}</label>
          <input v-model.number="form.dailyFixedHours" type="number" min="0" max="8" step="0.5" class="field_input" />
        </div>
      </div>
    </div>

    <!-- Auto-calculated -->
    <div class="settings_card auto">
      <h3>{{ t('sm_auto_calculated') }}</h3>
      <div class="calculator_grid">
        <div class="calculator_item">
          <span class="calculator_label">{{ t('sm_working_days') }}</span>
          <span class="calculator_value">{{ workingDays }}</span>
          <span class="calculator_formula">52×{{ form.daysPerWeek }} - {{ form.vacationDays }} - {{ form.holidays }} - {{ form.exceptionalLeave }}</span>
        </div>
        <div class="calculator_item">
          <span class="calculator_label">{{ t('sm_project_hours_day') }}</span>
          <span class="calculator_value">{{ projectHoursDay }}h</span>
          <span class="calculator_formula">{{ form.hoursPerDay }} - {{ form.dailyFixedHours }}</span>
        </div>
        <div class="calculator_item">
          <span class="calculator_label">{{ t('sm_project_hours_year') }}</span>
          <span class="calculator_value purple">{{ projectHoursYear }}h</span>
          <span class="calculator_formula">{{ workingDays }} × {{ projectHoursDay }}</span>
        </div>
      </div>
    </div>

    <!-- Legal compliance -->
    <div class="settings_card legal">
      <h3>⚖️ {{ laws.flag }} {{ laws.name }} — {{ t('cl_work_law') }}</h3>
      <div class="legal_grid">
        <div class="legal_item"><span class="li_label">{{ t('cl_work_law') }}</span><span>{{ t('law_' + form.country.toLowerCase() + '_labor') }}</span></div>
        <div class="legal_item"><span class="li_label">{{ t('cl_data_law') }}</span><span>{{ t('law_' + form.country.toLowerCase() + '_privacy') }}</span></div>
        <div class="legal_item"><span class="li_label">{{ t('cl_hours_week') }}</span><span>{{ laws.hoursPerWeek }}h</span></div>
        <div class="legal_item"><span class="li_label">{{ t('cl_vacation') }}</span><span>{{ laws.vacationDays }} {{ t('sm_vacation_days').split('/')[0] }}</span></div>
        <div class="legal_item"><span class="li_label">{{ t('cl_holidays') }}</span><span>{{ laws.publicHolidays }}</span></div>
        <div class="legal_item"><span class="li_label">{{ t('cl_tva') }}</span><span>{{ laws.taxRate }}% ({{ laws.taxName }})</span></div>
      </div>
      <div class="legal_rights">
        <strong>{{ t('cl_rights_title') }}</strong>
        <ul>
          <li v-for="i in lawRightsCount" :key="i">{{ t('law_' + form.country.toLowerCase() + '_r' + i) }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useCountryLawStore } from '@/stores/countryLaws'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const countryLaws = useCountryLawStore()

const toast = ref('')

const form = reactive({
  // E-04 (same init bug): auth.user?.firstName does not exist on the GoTrue User object
  // — the real first name lives in auth.profile.first_name
  firstName: auth.profile?.first_name || '',
  country: auth.company?.country || 'FR',
  company: auth.company?.name || '',
  contract: 'cdi',
  daysPerWeek: 5,
  hoursPerDay: 7,
  vacationDays: 25,
  holidays: 11,
  exceptionalLeave: 2,
  dailyFixedHours: 1.5,
})

// D-16: settings persisted PER USER — user-scoped key (never the D-07
// cross-account leak), a device-local preference, zero new column.
// The overlay is applied BEFORE the country watch is registered (no re-fire).
const SETTINGS_KEY = 'scalyo_tasks_settings_' + (auth.user?.id || 'anon')
try { Object.assign(form, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) } catch (_) {}
watch(form, (v) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)) } catch (_) {} }, { deep: true })

const laws = computed(() => countryLaws.getLaws(form.country))
const lawRightsCount = computed(() => ({ fr: 4, be: 3, ch: 3, ca: 3, us: 3, kr: 3 })[form.country.toLowerCase()] || 3)

// Watch country → auto-fill fields + toast
watch(() => form.country, (newCountry) => {
  const law = countryLaws.getLaws(newCountry)
  if (!law) return
  form.hoursPerDay = law.hoursPerDay
  form.vacationDays = law.vacationDays
  form.holidays = law.publicHolidays
  form.daysPerWeek = law.workDaysPerWeek || 5
  toast.value = '✓ ' + law.flag + ' ' + law.name + ' — ' + law.hoursPerWeek + 'h/' + t('sm_days_week').toLowerCase() + ' · ' + law.vacationDays + 'j ' + t('sm_vacation_days').split('/')[0] + ' · ' + law.publicHolidays + ' ' + t('sm_holidays').toLowerCase()
  setTimeout(() => { toast.value = '' }, 4000)
})

const workingDays = computed(() => {
  return Math.round(52 * form.daysPerWeek - form.vacationDays - form.holidays - form.exceptionalLeave)
})

const projectHoursDay = computed(() => {
  return Math.max(0, form.hoursPerDay - form.dailyFixedHours).toFixed(1)
})

const projectHoursYear = computed(() => {
  return Math.round(workingDays.value * parseFloat(projectHoursDay.value))
})
</script>

<style scoped>
.settings_view { max-width: 700px; }
.settings_view h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; }

.settings_toast { position: fixed; top: 80px; right: 24px; background: var(--green); color: #fff; padding: 12px 20px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500; z-index: 1000; box-shadow: var(--shadow-lg); animation: slideIn 0.3s ease; }
@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

.settings_card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px; margin-bottom: 20px; }
.settings_card h3 { font-size: 0.9rem; font-weight: 700; margin-bottom: 16px; }
.settings_card.auto { background: var(--purple-bg); border-color: var(--purple-border); }
.settings_card.legal { border-left: 3px solid var(--purple); }

.settings_grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field_group { display: flex; flex-direction: column; gap: 4px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.field_input { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.field_input:focus { border-color: var(--purple); }

.legal_hint { font-size: 0.68rem; color: var(--purple); margin-top: 2px; }

.calculator_grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.calculator_item { text-align: center; padding: 14px; background: rgba(255,255,255,0.6); border-radius: var(--radius-sm); }
.calculator_label { font-size: 0.72rem; color: var(--text-secondary); display: block; margin-bottom: 4px; }
.calculator_value { font-size: 1.5rem; font-weight: 800; color: var(--text); display: block; }
.calculator_value.purple { color: var(--purple); }
.calculator_formula { font-size: 0.62rem; color: var(--text-muted); display: block; margin-top: 4px; }

/* Legal section */
.legal_grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.legal_item { display: flex; flex-direction: column; gap: 2px; padding: 10px; background: var(--bg); border-radius: var(--radius-sm); }
.li_label { font-size: 0.68rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.legal_item span:last-child { font-size: 0.82rem; }
.legal_rights { padding-top: 12px; border-top: 1px solid var(--border-light); }
.legal_rights strong { font-size: 0.78rem; display: block; margin-bottom: 8px; }
.legal_rights ul { display: flex; flex-direction: column; gap: 4px; list-style: none; }
.legal_rights li { font-size: 0.78rem; color: var(--text-secondary); padding-left: 14px; position: relative; }
.legal_rights li::before { content: '✓'; position: absolute; left: 0; color: var(--green); }

@media (max-width: 600px) { .settings_grid, .legal_grid { grid-template-columns: 1fr; } .calculator_grid { grid-template-columns: 1fr; } }
</style>
