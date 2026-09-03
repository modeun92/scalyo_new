<template>
  <div class="planning-view">
    <!-- TOOLBAR -->
    <div class="pl-toolbar">
      <div class="pl-toolbar-left">
        <h1>📅 {{ t('pl_title') }}</h1>
        <div class="pl-nav-btns">
          <button class="nav-btn" @click="calPrev">‹</button>
          <button class="nav-btn today-btn" @click="calToday">{{ t('pl_today') }}</button>
          <button class="nav-btn" @click="calNext">›</button>
          <span class="pl-current-date">{{ currentTitle }}</span>
        </div>
      </div>
      <div class="pl-toolbar-right">
        <div class="pl-views">
          <button v-for="v in views" :key="v.key" :class="{ active: activeView === v.key }" @click="switchView(v.key)">{{ t(v.label) }}</button>
        </div>
        <div class="pl-actions">
          <!-- D-10 : bouton « Synchroniser » retiré — la synchro calendrier n'existe pas
               (le flux posait un faux badge ✓ sans OAuth). Précédent : Integrations 10/07. -->
          <button class="create-btn" @click="openCreate">{{ t('pl_create') }}</button>
          <!-- PLAN-BTN : libellé au survol — ⚙ = réglages du calendrier, distinct de « Créer » -->
          <button class="settings-btn" @click="settingsOpen = true" :title="t('pl_settings')" :aria-label="t('pl_settings')">⚙</button>
        </div>
      </div>
    </div>

    <!-- FULLCALENDAR (day/week/month/year/list) -->
    <div v-show="activeView !== 'gantt'" class="fc-wrapper">
      <FullCalendar ref="calRef" :options="calendarOptions" />
    </div>

    <!-- GANTT VIEW -->
    <div v-if="activeView === 'gantt'" class="gantt-view">
      <div class="gantt-toolbar-sub">
        <div class="gz-group">
          <span class="gz-label">Zoom:</span>
          <button v-for="z in zoomLevels" :key="z.key" class="gz-btn" :class="{ active: ganttZoom === z.key }" @click="ganttZoom = z.key">{{ t(z.label) }}</button>
        </div>
        <div class="gz-group">
          <span class="gz-label">{{ t('pl_color_by') }}:</span>
          <select v-model="ganttColorBy" class="gz-select">
            <option value="project">{{ t('pl_color_project') }}</option>
            <option value="status">{{ t('pl_color_status') }}</option>
            <option value="priority">{{ t('pl_color_priority') }}</option>
          </select>
        </div>
        <!-- GANTT-READ : tâches non plaçables comptées honnêtement, jamais masquées en silence -->
        <div class="gz-group" v-if="noDateCount">
          <span class="gz-label">{{ t('pl_gantt_nodates') }}: {{ noDateCount }}</span>
        </div>
      </div>
      <div class="gantt-container" ref="ganttRef">
        <!-- Timeline header -->
        <div class="g-header">
          <div class="g-labels-h">{{ t('sm_projects_title') }}</div>
          <div class="g-dates-h">
            <div v-for="d in ganttDates" :key="d.key" class="g-date-col" :class="{ today: d.isToday, weekend: d.isWeekend }">
              <span class="gdc-day">{{ d.dayName }}</span>
              <span class="gdc-num">{{ d.num }}</span>
            </div>
          </div>
        </div>
        <!-- Projects & tasks -->
        <div v-for="proj in tasks.projects" :key="proj.id" class="g-project">
          <div class="g-row g-project-row">
            <div class="g-label"><span class="gp-dot" :style="{ background: proj.color }" /><strong>{{ proj.name }}</strong></div>
            <div class="g-cells"><div v-for="d in ganttDates" :key="d.key" class="g-cell" :class="{ today: d.isToday, weekend: d.isWeekend }" /></div>
          </div>
          <div v-for="task in projectTasks(proj.id)" :key="task.id" class="g-row g-task-row">
            <div class="g-label g-task-label"><span class="gt-dot" :class="task.status" />{{ task.title }}</div>
            <div class="g-cells">
              <div v-for="d in ganttDates" :key="d.key" class="g-cell" :class="{ today: d.isToday, weekend: d.isWeekend }" />
              <!-- GANTT-READ : vraie barre start→end positionnée sur la rangée (l'ancienne
                   barre à largeur FIXE était posée sur la seule cellule dueDate) -->
              <div v-if="ganttBarStyle(task, proj)" class="g-bar" :style="ganttBarStyle(task, proj)" :title="task.title">
                <span class="gb-text">{{ task.title }}</span>
                <div class="gb-prog" :style="{ width: taskProg(task) + '%' }" />
              </div>
            </div>
          </div>
        </div>
        <!-- GANTT-READ : tâches sans projet — invisibles avant (la boucle ne parcourait que
             tasks.projects) ; groupe « non classées », clé i18n existante réutilisée -->
        <div v-if="unassignedTasks.length" class="g-project">
          <div class="g-row g-project-row">
            <div class="g-label"><span class="gp-dot" style="background: #9ca3af" /><strong>{{ t('sm_not_classified') }}</strong></div>
            <div class="g-cells"><div v-for="d in ganttDates" :key="d.key" class="g-cell" :class="{ today: d.isToday, weekend: d.isWeekend }" /></div>
          </div>
          <div v-for="task in unassignedTasks" :key="task.id" class="g-row g-task-row">
            <div class="g-label g-task-label"><span class="gt-dot" :class="task.status" />{{ task.title }}</div>
            <div class="g-cells">
              <div v-for="d in ganttDates" :key="d.key" class="g-cell" :class="{ today: d.isToday, weekend: d.isWeekend }" />
              <div v-if="ganttBarStyle(task, null)" class="g-bar" :style="ganttBarStyle(task, null)" :title="task.title">
                <span class="gb-text">{{ task.title }}</span>
                <div class="gb-prog" :style="{ width: taskProg(task) + '%' }" />
              </div>
            </div>
          </div>
        </div>
        <!-- Today line -->
        <div v-if="todayLineX > 0" class="g-today-line" :style="{ left: todayLineX + 'px' }">
          <span class="gtl">{{ t('pl_gantt_today') }}</span>
        </div>
      </div>
    </div>

    <!-- SLIDE-OVER: Create/Edit Event -->
    <SlideOver :open="eventSlideOpen" :title="editingEvent ? t('pl_event_edit') : t('pl_create')" @close="eventSlideOpen = false" :width="460">
      <form @submit.prevent="saveEvent" class="sf">
        <div class="fg"><label>{{ t('pl_event_title') }} *</label><input v-model="eventForm.title" required class="fi" /></div>
        <div class="fr">
          <div class="fg"><label>{{ t('pl_event_start') }}</label><input v-model="eventForm.start" type="datetime-local" class="fi" /></div>
          <div class="fg"><label>{{ t('pl_event_end') }}</label><input v-model="eventForm.end" type="datetime-local" class="fi" /></div>
        </div>
        <label class="fi-check"><input type="checkbox" v-model="eventForm.allDay" /> {{ t('pl_event_allday') }}</label>
        <div class="fg"><label>{{ t('pl_event_location') }}</label><input v-model="eventForm.location" class="fi" /></div>
        <div class="fg"><label>{{ t('pl_event_desc') }}</label><textarea v-model="eventForm.description" class="fi ta" rows="2" /></div>
        <div class="fr">
          <div class="fg"><label>{{ t('pl_event_client') }}</label>
            <select v-model="eventForm.clientId" class="fi"><option value="">—</option><option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          </div>
          <div class="fg"><label>{{ t('pl_event_project') }}</label>
            <select v-model="eventForm.projectId" class="fi"><option value="">—</option><option v-for="p in tasks.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select>
          </div>
        </div>
        <!-- PLAN-RECUR : « Rappel » RETIRÉ (champ fantôme — jamais persisté, aucune infra de
             notification planning) ; récurrence masquée en ÉDITION (v1 = occurrence seule) -->
        <div class="fr" v-if="!editingEvent">
          <div class="fg"><label>{{ t('pl_event_recurrence') }}</label>
            <select v-model="eventForm.recurrence" class="fi">
              <option value="none">{{ t('pl_recur_none') }}</option>
              <option value="daily">{{ t('pl_recur_daily') }}</option>
              <option value="weekly">{{ t('pl_recur_weekly') }}</option>
              <option value="monthly">{{ t('pl_recur_monthly') }}</option>
            </select>
          </div>
        </div>
        <div class="fg"><label>{{ t('pl_event_color') }}</label>
          <div class="color-row">
            <button v-for="c in eventColors" :key="c" type="button" class="cpick" :class="{ active: eventForm.color === c }" :style="{ background: c }" @click="eventForm.color = c" />
          </div>
        </div>
        <div class="fa">
          <!-- PLAN-RECUR : occurrence d'une série → choix occurrence seule / série entière -->
          <template v-if="editingEvent && editingSeriesId">
            <button type="button" class="btn-danger" @click="deleteEvent('one')">{{ t('pl_recur_del_one') }}</button>
            <button type="button" class="btn-danger" @click="deleteEvent('series')">{{ t('pl_recur_del_series') }}</button>
          </template>
          <button v-else-if="editingEvent" type="button" class="btn-danger" @click="deleteEvent('one')">{{ t('pl_event_delete') }}</button>
          <div style="flex:1" />
          <button type="button" class="btn-outline" @click="eventSlideOpen = false">{{ t('cancel') }}</button>
          <button type="submit" class="btn-primary">{{ t('pl_event_save') }}</button>
        </div>
      </form>
    </SlideOver>

    <!-- SLIDE-OVER: Settings -->
    <SlideOver :open="settingsOpen" :title="t('pl_settings')" @close="settingsOpen = false">
      <div class="sf">
        <div class="fg"><label>{{ t('pl_settings_first_day') }}</label>
          <select v-model="planningSettings.firstDay" class="fi"><option :value="1">{{ t('wb_mon') }}</option><option :value="0">{{ t('wb_fri') === 'Ven' ? 'Dimanche' : 'Sunday' }}</option></select>
        </div>
        <div class="fr">
          <div class="fg"><label>{{ t('pl_settings_work_hours') }} ({{ t('pl_event_start') }})</label><input v-model="planningSettings.workStart" type="time" class="fi" /></div>
          <div class="fg"><label>{{ t('pl_event_end') }}</label><input v-model="planningSettings.workEnd" type="time" class="fi" /></div>
        </div>
        <label class="fi-check"><input type="checkbox" v-model="planningSettings.hideWeekends" /> {{ t('pl_settings_hide_weekends') }}</label>
        <div class="fg"><label>{{ t('pl_settings_density') }}</label>
          <select v-model="planningSettings.density" class="fi">
            <option value="compact">{{ t('pl_density_compact') }}</option>
            <option value="normal">{{ t('pl_density_normal') }}</option>
            <option value="comfortable">{{ t('pl_density_comfortable') }}</option>
          </select>
        </div>
        <div class="fg"><label>{{ t('pl_settings_time_format') }}</label>
          <select v-model="planningSettings.timeFormat" class="fi"><option value="24h">24h</option><option value="12h">12h (AM/PM)</option></select>
        </div>
      </div>
    </SlideOver>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import multiMonthPlugin from '@fullcalendar/multimonth'
import SlideOver from '@/components/SlideOver.vue'
import { useTaskStore } from '@/stores/tasks'
import { useClientStore } from '@/stores/clients'
import { useCreatePrefillStore } from '@/stores/createPrefill'
import { useAuthStore } from '@/stores/auth'
import { withWrite } from '@/lib/supabaseWrite'

const { t, locale } = useI18n({ useScope: 'global' })
const tasks = useTaskStore()
const clients = useClientStore()
const prefill = useCreatePrefillStore()
const auth = useAuthStore()

const calRef = ref(null)
const ganttRef = ref(null)
const activeView = ref('week')
const currentTitle = ref('')
const eventSlideOpen = ref(false)
const editingEvent = ref(null)
const editingSeriesId = ref(null) // PLAN-RECUR : série de l'occurrence en édition
const settingsOpen = ref(false)
const ganttZoom = ref('day')
const ganttColorBy = ref('project')

const eventColors = ['#7c3aed', '#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6']

const views = [
  { key: 'day', label: 'pl_view_day' },
  { key: 'week', label: 'pl_view_week' },
  { key: 'month', label: 'pl_view_month' },
  { key: 'year', label: 'pl_view_year' },
  { key: 'list', label: 'pl_view_list' },
  { key: 'gantt', label: 'pl_view_gantt' },
]

const zoomLevels = [
  { key: 'day', label: 'pl_zoom_day' },
  { key: 'week', label: 'pl_zoom_week' },
  { key: 'month', label: 'pl_zoom_month' },
]

const planningSettings = reactive({
  firstDay: 1,
  workStart: '09:00',
  workEnd: '18:00',
  hideWeekends: false,
  density: 'normal',
  timeFormat: '24h',
})
// D-16 (même famille) : préférences d'affichage persistées PAR utilisateur
// (clé user-scopée — jamais la fuite cross-comptes de D-07)
const PLAN_SETTINGS_KEY = 'scalyo_planning_settings_' + (auth.user?.id || 'anon')
try { Object.assign(planningSettings, JSON.parse(localStorage.getItem(PLAN_SETTINGS_KEY) || '{}')) } catch (_) {}
watch(planningSettings, (v) => { try { localStorage.setItem(PLAN_SETTINGS_KEY, JSON.stringify(v)) } catch (_) {} }, { deep: true })

const defaultEvent = () => ({
  title: '', start: '', end: '', allDay: false, location: '', description: '',
  clientId: '', projectId: '', recurrence: 'none', color: '#7c3aed',
})
const eventForm = reactive(defaultEvent())

// Mock events
const events = ref([])

const fcLocale = computed(() => locale.value === 'ko' ? 'ko' : locale.value === 'en' ? 'en' : 'fr')
const slotHeight = computed(() => planningSettings.density === 'compact' ? 32 : planningSettings.density === 'comfortable' ? 56 : 44)

const calendarOptions = computed(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin, multiMonthPlugin],
  initialView: 'timeGridWeek',
  locale: fcLocale.value,
  firstDay: planningSettings.firstDay,
  headerToolbar: false,
  height: 'auto',
  editable: true,
  selectable: true,
  selectMirror: true,
  dayMaxEvents: 3,
  weekends: !planningSettings.hideWeekends,
  nowIndicator: true,
  slotMinTime: '07:00:00',
  slotMaxTime: '21:00:00',
  slotDuration: '00:30:00',
  slotLabelFormat: planningSettings.timeFormat === '12h'
    ? { hour: 'numeric', minute: '2-digit', meridiem: 'short' }
    : { hour: '2-digit', minute: '2-digit', hour12: false },
  businessHours: {
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: planningSettings.workStart,
    endTime: planningSettings.workEnd,
  },
  events: events.value,
  select: handleSelect,
  eventClick: handleEventClick,
  eventDrop: handleEventDrop,
  eventResize: handleEventResize,
  datesSet: handleDatesSet,
}))

function getApi() { return calRef.value?.getApi() }

function calPrev() { getApi()?.prev() }
function calNext() { getApi()?.next() }
function calToday() { getApi()?.today() }

function switchView(key) {
  activeView.value = key
  if (key === 'gantt') return
  const map = { day: 'timeGridDay', week: 'timeGridWeek', month: 'dayGridMonth', year: 'multiMonthYear', list: 'listWeek' }
  getApi()?.changeView(map[key] || 'timeGridWeek')
}

function handleDatesSet(info) {
  currentTitle.value = info.view.title
}

function handleSelect(info) {
  Object.assign(eventForm, defaultEvent())
  eventForm.start = info.startStr.slice(0, 16)
  eventForm.end = info.endStr.slice(0, 16)
  eventForm.allDay = info.allDay
  editingEvent.value = null
  editingSeriesId.value = null
  eventSlideOpen.value = true
  getApi()?.unselect()
}

function handleEventClick(info) {
  editingEvent.value = info.event.id
  // PLAN-RECUR : mémoriser la série pour proposer « supprimer toute la série »
  editingSeriesId.value = info.event.extendedProps?.seriesId || null
  Object.assign(eventForm, {
    title: info.event.title,
    start: info.event.startStr.slice(0, 16),
    end: info.event.endStr?.slice(0, 16) || '',
    allDay: info.event.allDay,
    color: info.event.backgroundColor || '#7c3aed',
    location: '', description: '', clientId: info.event.extendedProps?.clientId || '',
    projectId: info.event.extendedProps?.projectId || '', recurrence: 'none',
  })
  eventSlideOpen.value = true
}

// D-10 (même famille) : déplacer/redimensionner DOIT persister — l'ancien code ne
// modifiait que la mémoire. Échec → revert local + revert visuel FullCalendar + toast.
async function persistEventTimes(info) {
  const ev = events.value.find(e => e.id === info.event.id)
  if (!ev) { info.revert?.(); return }
  const prev = { start: ev.start, end: ev.end }
  ev.start = info.event.startStr
  ev.end = info.event.endStr || info.event.startStr
  const { error } = await withWrite(() => supabase.from('planning_events').update({ start_at: ev.start, end_at: ev.end }).eq('id', info.event.id), { label: 'planning.moveEvent' })
  if (error) { ev.start = prev.start; ev.end = prev.end; info.revert?.() }
}

function handleEventDrop(info) { persistEventTimes(info) }

function handleEventResize(info) { persistEventTimes(info) }

// TZ-PLANNING : un événement est un INSTANT (doctrine GANTT-TZ : instant vs date calendaire).
// La chaîne d'un champ datetime-local ('YYYY-MM-DDTHH:mm') est une heure LOCALE :
// - à l'ÉCRITURE, elle se convertit en instant ISO UTC (new Date la parse en local,
//   toISOString donne l'instant exact) — l'envoyer brute faisait interpréter l'heure
//   locale comme de l'UTC par Postgres → +2 h au rendu (Europe/Paris été) ;
// - une chaîne date-only (all-day, sans 'T') est une DATE CALENDAIRE : jamais convertie ;
// - le drag/resize (persistEventTimes) écrit startStr AVEC offset : déjà juste, non touché.
// null = chaîne invalide → on n'écrit PAS (pattern D-04 : pas de faux succès).
function localInputToIso(dt) {
  if (!dt || !dt.includes('T')) return dt || ''
  const d = new Date(dt)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
// TZ-PLANNING : pré-remplissage du datetime-local en heure LOCALE (composants padés) —
// l'ancien now.toISOString().slice(0,16) injectait l'heure UTC (−2 h affichées à Paris).
function localInputValue(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// PLAN-RECUR : décale une datetime-local 'YYYY-MM-DDTHH:mm' de i pas (jour/semaine/mois),
// heure conservée, mensuel clampé au dernier jour du mois (31 janv + 1 mois → 28/29 févr)
function shiftOccurrence(dt, kind, i) {
  if (!dt || !i) return dt
  const [datePart, timePart] = dt.split('T')
  const [y, m, day] = datePart.split('-').map(Number)
  let d
  if (kind === 'monthly') {
    const target = new Date(y, m - 1 + i, 1)
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    d = new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay))
  } else {
    d = new Date(y, m - 1, day)
    d.setDate(d.getDate() + (kind === 'weekly' ? 7 * i : i))
  }
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${timePart ? 'T' + timePart : ''}`
}

async function saveEvent() {
  if (editingEvent.value) {
    const ev = events.value.find(e => e.id === editingEvent.value)
    if (ev) {
      // TZ-PLANNING : l'heure LOCALE du formulaire devient un instant ISO — l'édition
      // corrompait la base exactement comme la création (chaîne naïve relue en UTC)
      const startIso = localInputToIso(eventForm.start)
      const endIso = localInputToIso(eventForm.end || eventForm.start)
      if (startIso === null || endIso === null) { console.error('[planning] saveEvent: invalid datetime'); return }
      const { error: updErr } = await withWrite(() => supabase.from('planning_events').update({
        title: eventForm.title, start_at: startIso, end_at: endIso, color: eventForm.color
      }).eq('id', editingEvent.value), { label: 'planning.saveEvent.update' })
      // D-04 : pas de faux succès — échec = slide-over ouvert, état local intact
      if (updErr) { console.error('[planning] saveEvent update error:', updErr); return }
      Object.assign(ev, { title: eventForm.title, start: startIso, end: endIso, color: eventForm.color })
    }
  } else {
    // D-04 : planning_events.user_id NOT NULL + RLS users_own_events (auth.uid() = user_id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) { console.error('[planning] saveEvent: no authenticated user'); return }
    const base = {
      user_id: user.id,
      title: eventForm.title,
      color: eventForm.color || '#7c3aed', all_day: eventForm.allDay || false,
      client_id: eventForm.clientId || '', project_id: eventForm.projectId || '',
    }
    const startStr = eventForm.start
    const endStr = eventForm.end || eventForm.start
    const rec = eventForm.recurrence || 'none'
    let rows
    if (rec === 'none') {
      // défensif : recurrence/series_id inclus SEULEMENT pour une série — le create simple
      // reste fonctionnel même si la migration n'est pas encore appliquée
      // TZ-PLANNING : conversion heure locale → instant ISO à l'écriture
      rows = [{ ...base, start_at: localInputToIso(startStr), end_at: localInputToIso(endStr) }]
    } else {
      // PLAN-RECUR : occurrences MATÉRIALISÉES, liées par series_id
      // (contrat 01/08 : quotidien 60 j · hebdo 26 sem · mensuel 12 mois)
      // TZ-PLANNING : shiftOccurrence opère sur la chaîne LOCALE (heure conservée par
      // occurrence), la conversion en instant vient APRÈS — une série hebdo 09:00 reste
      // à 09:00 locale à travers un changement d'heure été/hiver
      const counts = { daily: 60, weekly: 26, monthly: 12 }
      const seriesId = crypto.randomUUID()
      rows = Array.from({ length: counts[rec] }, (_, i) => ({
        ...base,
        start_at: localInputToIso(shiftOccurrence(startStr, rec, i)),
        end_at: localInputToIso(shiftOccurrence(endStr, rec, i)),
        recurrence: rec,
        series_id: seriesId,
      }))
    }
    // TZ-PLANNING : une chaîne invalide n'écrit RIEN (pattern D-04, jamais de faux succès)
    if (rows.some(r => r.start_at === null || r.end_at === null)) { console.error('[planning] saveEvent: invalid datetime'); return }
    const { data, error: insErr } = await withWrite(() => supabase.from('planning_events').insert(rows).select(), { label: 'planning.saveEvent.insert' })
    if (insErr) { console.error('[planning] saveEvent insert error:', insErr); return }
    if (data) data.forEach(d => events.value.push(dbEventToFc(d)))
  }
  eventForm.title = ''; eventForm.start = ''; eventForm.end = '';
  eventForm.color = '#7c3aed'; eventForm.allDay = false;
  eventForm.clientId = ''; eventForm.projectId = ''; eventForm.recurrence = 'none';
  eventSlideOpen.value = false; editingEvent.value = null; editingSeriesId.value = null
}

// D-10 : suppression RÉELLE en base — l'ancien code filtrait la mémoire seulement
// (l'événement revenait au reload) alors que le vrai delete existait sans être appelé.
// PLAN-RECUR : scope 'one' = cette occurrence · 'series' = toutes les lignes du series_id
// (RLS self-only : le delete par series_id ne peut toucher que les lignes de l'utilisateur)
async function deleteEvent(scope) {
  const id = editingEvent.value
  if (!id) { eventSlideOpen.value = false; return }
  if (scope === 'series' && editingSeriesId.value) {
    const sid = editingSeriesId.value
    const { error } = await withWrite(() => supabase.from('planning_events').delete().eq('series_id', sid), { label: 'planning.deleteSeries' })
    if (error) return // toast withWrite — slide-over reste ouvert, état local intact
    events.value = events.value.filter(e => e.extendedProps?.seriesId !== sid)
  } else {
    const { error } = await withWrite(() => supabase.from('planning_events').delete().eq('id', id), { label: 'planning.deleteEvent' })
    if (error) return // toast withWrite — slide-over reste ouvert, état local intact
    events.value = events.value.filter(e => e.id !== id)
  }
  eventSlideOpen.value = false
  editingEvent.value = null
  editingSeriesId.value = null
}

function openCreate() {
  Object.assign(eventForm, defaultEvent())
  const now = new Date()
  now.setMinutes(0, 0, 0)
  // TZ-PLANNING : heure LOCALE dans le champ (l'ancien toISOString pré-remplissait l'UTC,
  // −2 h à Paris — et le corriger seul aurait AGGRAVÉ le bug, piège consigné le 03/08)
  eventForm.start = localInputValue(now)
  now.setHours(now.getHours() + 1)
  eventForm.end = localInputValue(now)
  editingEvent.value = null
  editingSeriesId.value = null
  eventSlideOpen.value = true
}

// GANTT — GANTT-READ : barres réelles start→end (largeur = durée × cellule)
const GANTT_CELL_W = 36 // = largeur CSS de .g-cell / .g-date-col
const ganttDays = computed(() => ganttZoom.value === 'month' ? 60 : ganttZoom.value === 'week' ? 28 : 14)
// GANTT-TZ : date calendaire LOCALE 'YYYY-MM-DD'. toISOString() convertit en UTC —
// minuit local = 22 h UTC la veille en été → la CLÉ de la colonne reculait d'un jour
// pendant que son LIBELLÉ (getDate(), local) restait juste : tout le Gantt était
// décalé d'une colonne, et « Aujourd'hui » pointait le mauvais jour.
// Les dates de tâches (start_date/end_date) sont des dates calendaires, jamais des
// instants : elles se comparent en local, pas en UTC.
function localDate(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const ganttStart = computed(() => { const d = new Date(); d.setDate(d.getDate() - 3); d.setHours(0, 0, 0, 0); return d })
const ganttDates = computed(() => {
  const today = localDate(new Date()) // GANTT-TZ
  const loc = locale.value === 'ko' ? 'ko-KR' : locale.value === 'en' ? 'en-US' : 'fr-FR'
  return Array.from({ length: ganttDays.value }, (_, i) => {
    const d = new Date(ganttStart.value); d.setDate(d.getDate() + i)
    const date = localDate(d) // GANTT-TZ : même référentiel que le libellé affiché
    return { key: date, date, num: d.getDate(), dayName: d.toLocaleDateString(loc, { weekday: 'narrow' }), isToday: date === today, isWeekend: d.getDay() === 0 || d.getDay() === 6 }
  })
})
const todayLineX = computed(() => {
  const idx = ganttDates.value.findIndex(d => d.isToday)
  return idx >= 0 ? 180 + idx * 36 + 18 : 0
})

function projectTasks(pid) { return tasks.tasks.filter(t => t.projectId === pid) }
// GANTT-READ : tâches sans projet — rendues dans le groupe « non classées » (avant : invisibles)
const unassignedTasks = computed(() => tasks.tasks.filter(t => !t.projectId))
// GANTT-READ : tâches sans aucune date — implaçables, comptées honnêtement au bandeau
const noDateCount = computed(() => tasks.tasks.filter(t => !t.startDate && !t.dueDate && !t.endDate).length)
function ganttBarColor(task, proj) {
  if (ganttColorBy.value === 'status') return { todo: '#9ca3af', in_progress: '#3b82f6', blocked: '#ef4444', done: '#10b981' }[task.status] || '#7c3aed'
  if (ganttColorBy.value === 'priority') return { urgent_important: '#ef4444', important: '#3b82f6', urgent: '#f59e0b', not_urgent: '#9ca3af' }[task.priority] || '#7c3aed'
  return proj?.color || '#9ca3af'
}
// GANTT-READ : style de barre = intersection [start,end] × fenêtre visible, clip aux bords
// (coins carrés du côté tronqué). null = hors fenêtre ou sans date → pas de barre.
function ganttBarStyle(task, proj) {
  const dates = ganttDates.value
  const s = task.startDate || task.dueDate
  const e = task.endDate || task.dueDate || s
  if (!s || !e || !dates.length) return null
  const [lo, hi] = s <= e ? [s, e] : [e, s]
  const w0 = dates[0].date, w1 = dates[dates.length - 1].date
  if (hi < w0 || lo > w1) return null
  const from = lo < w0 ? w0 : lo
  const to = hi > w1 ? w1 : hi
  const i0 = dates.findIndex(d => d.date === from)
  const i1 = dates.findIndex(d => d.date === to)
  if (i0 < 0 || i1 < 0) return null
  return {
    left: (i0 * GANTT_CELL_W + 2) + 'px',
    width: ((i1 - i0 + 1) * GANTT_CELL_W - 4) + 'px',
    background: ganttBarColor(task, proj),
    borderTopLeftRadius: lo < w0 ? '0' : undefined,
    borderBottomLeftRadius: lo < w0 ? '0' : undefined,
    borderTopRightRadius: hi > w1 ? '0' : undefined,
    borderBottomRightRadius: hi > w1 ? '0' : undefined,
  }
}
function taskProg(task) {
  if (task.status === 'done') return 100
  if (!task.subtasks?.length) return task.status === 'in_progress' ? 50 : 0
  return Math.round((task.subtasks.filter(s => s.done).length / task.subtasks.length) * 100)
}

onMounted(() => { setTimeout(() => { currentTitle.value = getApi()?.view?.title || '' }, 100) })

// ─── Supabase sync ────────────────────────────────────────────
// PLAN-RECUR : mapper unique ligne DB → événement FullCalendar (load ET insert)
function dbEventToFc(r) {
  return {
    id: r.id, title: r.title,
    start: r.start_at, end: r.end_at,
    color: r.color || '#7c3aed', allDay: r.all_day || false,
    extendedProps: {
      clientId: r.client_id, projectId: r.project_id, description: r.description,
      recurrence: r.recurrence || 'none', seriesId: r.series_id || null,
    }
  }
}

async function loadEvents() {
  const { data, error } = await supabase.from('planning_events').select('*').order('start_at', { ascending: true })
  if (error) { console.error('[planning] loadEvents failed:', error.message); return }
  if (data) events.value = data.map(dbEventToFc)
}

onMounted(() => { loadEvents() })

// Prefill depuis la fiche client (bouton « Événement ») : ouvre le slide de
// création avec le client pré-sélectionné (un rdv = un événement planning).
onMounted(() => {
  const p = prefill.consume()
  if (p.clientId) { openCreate(); eventForm.clientId = p.clientId }
})

</script>

<style scoped>
.planning-view { max-width: 1300px; }

/* Toolbar */
.pl-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.pl-toolbar-left { display: flex; align-items: center; gap: 16px; }
.pl-toolbar-left h1 { font-size: 1.3rem; font-weight: 800; white-space: nowrap; }
.pl-nav-btns { display: flex; align-items: center; gap: 4px; }
.nav-btn { background: var(--bg-card); border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; font-size: 0.85rem; cursor: pointer; transition: all 0.15s; color: var(--text); }
.nav-btn:hover { border-color: var(--purple); color: var(--purple); }
.today-btn { font-weight: 600; }
.pl-current-date { font-size: 1rem; font-weight: 700; margin-left: 8px; text-transform: capitalize; }
.pl-toolbar-right { display: flex; align-items: center; gap: 8px; }
.pl-views { display: flex; gap: 1px; background: var(--border-light); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
.pl-views button { background: var(--bg-card); border: none; padding: 6px 12px; font-size: 0.75rem; cursor: pointer; color: var(--text-muted); font-weight: 500; transition: all 0.15s; }
.pl-views button.active { background: var(--purple); color: #fff; font-weight: 600; }
.pl-views button:hover:not(.active) { background: var(--bg-hover); }
.pl-actions { display: flex; gap: 6px; }
.create-btn { background: var(--purple); color: #fff; border: none; padding: 6px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.create-btn:hover { background: var(--purple-dark); }
.settings-btn { background: var(--bg-card); border: 1px solid var(--border); padding: 6px 10px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; }

/* FullCalendar overrides */
.fc-wrapper { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.fc-wrapper :deep(.fc) { font-family: 'Inter', -apple-system, sans-serif; }
.fc-wrapper :deep(.fc-timegrid-now-indicator-line) { border-color: #ef4444; border-width: 2px; }
.fc-wrapper :deep(.fc-timegrid-now-indicator-arrow) { border-color: #ef4444; }
.fc-wrapper :deep(.fc-day-today) { background: rgba(124, 58, 237, 0.03) !important; }
.fc-wrapper :deep(.fc-event) { border: none; border-radius: 6px; padding: 2px 6px; font-size: 0.78rem; cursor: pointer; }
.fc-wrapper :deep(.fc-timegrid-event) { border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
.fc-wrapper :deep(.fc-daygrid-event) { border-radius: 4px; }
.fc-wrapper :deep(.fc-col-header-cell) { font-size: 0.78rem; font-weight: 600; padding: 10px 0; }
.fc-wrapper :deep(.fc-timegrid-slot-label) { font-size: 0.72rem; color: var(--text-muted); }
.fc-wrapper :deep(.fc-daygrid-day-number) { font-size: 0.82rem; padding: 6px 8px; }
.fc-wrapper :deep(.fc-more-link) { font-size: 0.72rem; color: var(--purple); font-weight: 600; }
.fc-wrapper :deep(.fc-list-event) { cursor: pointer; }
.fc-wrapper :deep(.fc-highlight) { background: rgba(124, 58, 237, 0.08); }
.fc-wrapper :deep(.fc-business-container) { background: rgba(124, 58, 237, 0.02); }

/* Gantt (reused from before with improvements) */
.gantt-view { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.gantt-toolbar-sub { display: flex; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border-light); background: var(--bg); flex-wrap: wrap; gap: 8px; }
.gz-group { display: flex; align-items: center; gap: 6px; }
.gz-label { font-size: 0.75rem; color: var(--text-muted); }
.gz-btn { background: var(--bg-card); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 0.72rem; cursor: pointer; color: var(--text-muted); }
.gz-btn.active { background: var(--purple); color: #fff; border-color: var(--purple); }
.gz-select { padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.72rem; background: var(--bg-card); }
.gantt-container { overflow-x: auto; position: relative; }
.g-header { display: flex; position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--border); background: var(--bg-card); }
.g-labels-h { width: 180px; min-width: 180px; padding: 8px 12px; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); border-right: 1px solid var(--border-light); }
.g-dates-h { display: flex; }
.g-date-col { width: 36px; min-width: 36px; text-align: center; padding: 4px 0; border-right: 1px solid var(--border-light); }
.g-date-col.today { background: rgba(124,58,237,0.06); }
.g-date-col.weekend { background: var(--bg); }
.gdc-day { font-size: 0.55rem; color: var(--text-muted); display: block; text-transform: uppercase; }
.gdc-num { font-size: 0.68rem; font-weight: 600; display: block; }
.g-date-col.today .gdc-num { color: var(--purple); }
.g-project { border-bottom: 1px solid var(--border-light); }
.g-row { display: flex; border-bottom: 1px solid var(--border-light); }
.g-label { width: 180px; min-width: 180px; padding: 8px 12px; font-size: 0.78rem; display: flex; align-items: center; gap: 8px; border-right: 1px solid var(--border-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.g-task-label { padding-left: 28px; font-size: 0.72rem; color: var(--text-secondary); }
.gp-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.gt-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.gt-dot.todo { background: var(--text-muted); } .gt-dot.in_progress { background: #3b82f6; } .gt-dot.blocked { background: #ef4444; } .gt-dot.done { background: #10b981; }
.g-cells { display: flex; position: relative; }
.g-cell { width: 36px; min-width: 36px; height: 32px; border-right: 1px solid var(--border-light); position: relative; }
.g-cell.today { background: rgba(124,58,237,0.04); } .g-cell.weekend { background: rgba(0,0,0,0.015); }
.g-project-row .g-label { font-weight: 700; background: var(--bg); } .g-project-row .g-cell { background: var(--bg); }
.g-bar { position: absolute; top: 3px; left: 0; height: 26px; border-radius: 5px; display: flex; align-items: center; padding: 0 6px; z-index: 1; min-width: 0; cursor: pointer; overflow: hidden; transition: all 0.15s; }
.g-bar:hover { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.gb-text { font-size: 0.6rem; color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; z-index: 2; }
.gb-prog { position: absolute; top: 0; left: 0; height: 100%; background: rgba(255,255,255,0.25); border-radius: 5px; }
.g-today-line { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--purple); z-index: 10; pointer-events: none; }
.gtl { position: absolute; top: -2px; left: -12px; background: var(--purple); color: #fff; font-size: 0.5rem; padding: 1px 4px; border-radius: 3px; }

/* Form */
.sf { display: flex; flex-direction: column; gap: 14px; }
.fg { display: flex; flex-direction: column; gap: 4px; }
.fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.fi { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; outline: none; background: var(--bg-card); width: 100%; }
.fi:focus { border-color: var(--purple); }
.ta { resize: vertical; }
.fr { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fa { display: flex; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-light); }
.fi-check { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; }
.fi-check input { accent-color: var(--purple); }
.color-row { display: flex; gap: 6px; }
.cpick { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.cpick.active { border-color: var(--text); transform: scale(1.15); }
.btn-primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-outline { background: var(--bg-card); color: var(--text-secondary); border: 1px solid var(--border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; }
.btn-danger { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; cursor: pointer; font-weight: 600; }

@media (max-width: 900px) {
  .pl-toolbar { flex-direction: column; align-items: stretch; }
  .pl-toolbar-left, .pl-toolbar-right { flex-wrap: wrap; }
  .pl-views { overflow-x: auto; }
  .g-label, .g-labels-h { width: 120px; min-width: 120px; }
  .fr { grid-template-columns: 1fr; }
}
</style>
