<template>
  <div class="app_layout" :class="{ collapsed: app.sidebarCollapsed }">

    <!-- Global toast surface (G9-13 write guardrail + general notices) -->
    <GlobalToast />

    <div v-if="app.sidebarMobileOpen" class="sidebar_overlay" @click="app.closeMobileSidebar()" />

    <!-- SIDEBAR -->
    <aside class="sidebar" :class="{ open: app.sidebarMobileOpen }">
      <div class="sidebar_logo">
        <ScalyoLogo :size="app.sidebarCollapsed ? 28 : 32" />
        <span v-if="!app.sidebarCollapsed" class="logo_text">Scalyo</span>
      </div>
      <nav class="sidebar_navigation">
        <template v-for="section in sidebarSections" :key="section.label">
          <div v-if="!app.sidebarCollapsed && section.label" class="nav_section_label">{{ t(section.label) }}</div>
          <template v-for="item in section.items.filter(i => !i.ownerOnly || auth.isOrgOwner)" :key="item.name">
            <!-- D2: module outside the plan → greyed out + padlock, click goes to the paywall in upgrade mode -->
            <router-link v-if="isLocked(item)" :to="{ name: 'paywall', query: { reason: 'upgrade', module: item.module } }" class="nav_item nav_item_locked" @click="app.closeMobileSidebar()">
              <span class="nav_icon">{{ item.icon }}</span>
              <span v-if="!app.sidebarCollapsed" class="nav_label">{{ t(item.label) }}</span>
              <span v-if="!app.sidebarCollapsed" class="nav_lock">🔒</span>
            </router-link>
            <div v-else-if="item.children" class="nav_group">
              <router-link :to="item.to" class="nav_item" :class="{ active: isActiveGroup(item) }" @click="app.closeMobileSidebar()">
                <span class="nav_icon">{{ item.icon }}</span>
                <span v-if="!app.sidebarCollapsed" class="nav_label">{{ t(item.label) }}</span>
              </router-link>
              <div v-if="isActiveGroup(item) && !app.sidebarCollapsed" class="nav_subitems">
                <router-link v-for="sub in item.children" :key="sub.name" :to="sub.to" class="nav_subitem" :class="{ active: route.name === sub.name }" @click="app.closeMobileSidebar()">
                  {{ t(sub.label) }}
                </router-link>
              </div>
            </div>
            <router-link v-else :to="item.to" class="nav_item" :class="{ active: route.name === item.name }" @click="app.closeMobileSidebar()">
              <span class="nav_icon">{{ item.icon }}</span>
              <span v-if="!app.sidebarCollapsed" class="nav_label">{{ t(item.label) }}</span>
            </router-link>
          </template>
        </template>
      </nav>
      <button class="sidebar_logout" @click="handleLogout" :title="t('sidebar_logout')">
        <span class="nav_icon">🚪</span>
        <span v-if="!app.sidebarCollapsed" class="nav_label">{{ t('sidebar_logout') }}</span>
      </button>
      <button class="sidebar_toggle hide_mobile" @click="app.toggleSidebar()">
        {{ app.sidebarCollapsed ? '→' : '←' }}
      </button>
    </aside>

    <!-- MAIN -->
    <div class="main_wrapper">
      <!-- TOPBAR -->
      <header class="topbar">
        <button class="topbar_burger hide_desktop" @click="app.toggleMobileSidebar()">
          <span /><span /><span />
        </button>
        <div class="topbar_left">
          <ScalyoLogo :size="24" class="hide_desktop topbar_logo_mobile" />
        </div>
        <div class="topbar_right">
          <!-- OXYGEN Lot 2: Pulse dot (absorbs the Lot 1 renderless mount) -->
          <OxygenPulse />
          <!-- Notifications -->
          <div class="topbar_notif" ref="notifRef">
            <button class="notification_button" @click="notifOpen = !notifOpen">
              🔔
              <span v-if="notifications.unreadCount && !dndActive" class="notification_badge">{{ notifications.unreadCount }}</span>
            </button>
            <transition name="fade">
              <div v-if="notifOpen" class="notification_dropdown">
                <div class="notification_header">
                  <strong>{{ t('topbar_notifications') }}</strong>
                  <div class="notification_header_actions">
                    <button v-if="notifications.unreadCount" class="notification_mark_read" @click="notifications.markAllRead()">{{ t('topbar_mark_all_read') }}</button>
                    <button v-if="notifications.notifications.length" class="notification_clear" @click="notifications.clearAll()" title="Vider">🗑</button>
                  </div>
                </div>
                <div class="notification_list">
                  <div
                    v-for="g in groupedNotifications"
                    :key="g.type"
                    class="notification_item"
                    :class="{ unread: g.unread > 0 }"
                    @click="onNotifGroupClick(g)"
                  >
                    <span class="notification_icon">{{ g.icon }}</span>
                    <div class="notification_content">
                      <strong>{{ g.label }}</strong>
                      <p>{{ notifBody(g.latest, t) }}</p>
                      <span class="notification_time">{{ fmtNotifDate(g.latest.created_at) }}</span>
                    </div>
                    <span v-if="g.unread" class="notification_badge_mini">{{ g.unread }}</span>
                  </div>
                  <div v-if="!notifications.notifications.length" class="notification_empty">{{ t('topbar_no_notifications') }}</div>
                </div>
              </div>
            </transition>
          </div>


          <!-- Topbar actions -->
          <div class="topbar_actions">
            <FeedbackWidget />
            <AiAssistant v-if="isEliteOrAbove" />
          </div>
        </div>
      
      <!-- Beta (promo org) / Trial banner — D3 contrat gating 8/07 -->
      <div v-if="auth.isOnBetaAccess" class="trial_banner">
        🚀 {{ t('beta_banner', { days: auth.orgTrialDaysLeft }) }}
      </div>
      <div v-else-if="auth.isOnTrial" class="trial_banner">
        🕐 {{ t('trial_banner', { days: auth.trialDaysLeft }) }}
        <a href="/#pricing" class="trial_cta">{{ t('trial_choose_plan') }}</a>
      </div>
      </header>

      <!-- CONTENT -->
      <main class="main_content">
        <!-- NAV-SLOW (29/08): the <transition fade out-in> held the screen change
             HOSTAGE to a 0.2 s fade across 3 animation-frame phases — hidden tab or
             busy thread → frozen phases → the OLD screen stayed displayed (12 s observed,
             indefinitely in the background, class fade-leave-from stuck at runtime).
             The swap is synchronous and unconditional again; :key/.route-shell kept. -->
        <router-view v-slot="{ Component, route }">
          <div :key="route.fullPath" class="route_shell">
            <component :is="Component" />
          </div>
        </router-view>
      </main>
    </div>

    <!-- ONBOARDING -->
    <OnboardingWizard />

    <!-- FB-02: client record as a modal pop-up, opened from anywhere -->
    <ClientModal />
    <!-- CHAT FAB (hidden on /app/chat — G9-19/D1: a single surface at a time) -->
    <button v-if="route.name !== 'chat'" class="chat_fab" @click="app.toggleChat()" :class="{ active: app.chatOpen }">
      💬
      <span v-if="chatStore.totalUnread" class="chat_fab_badge">{{ chatStore.totalUnread }}</span>
    </button>
    <transition name="slide_right">
      <div v-if="app.chatOpen && route.name !== 'chat'" class="chat_panel_wrapper">
        <ChatPanel @close="app.toggleChat()" />
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import ScalyoLogo from '@/components/ScalyoLogo.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import AiAssistant from '@/components/ai/AiAssistant.vue'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard.vue'
import FeedbackWidget from '@/components/FeedbackWidget.vue'
import GlobalToast from '@/components/base/GlobalToast.vue'
// OXYGEN Lot 3b: bell badge hidden during the Closing (local DND)
import { dndActive } from '@/lib/toast'
import ClientModal from '@/components/clients/ClientModal.vue'
import OxygenPulse from '@/components/oxygen/OxygenPulse.vue'
import { isModuleAllowed } from '@/utils/planGating'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { notifTitle, notifBody } from '@/lib/notifText'
import { useChatStore } from '@/stores/chat'
import { useProfileStore } from '@/stores/profile'
import { localeTag } from '@/lib/formatters'
import { useClientStore } from '@/stores/clients'
import { useTaskStore } from '@/stores/tasks'
import { useTeamStore } from '@/stores/team'

const route = useRoute()
const router = useRouter()
const { t } = useI18n({ useScope: 'global' })
const app = useAppStore()
const auth = useAuthStore()
const isEliteOrAbove = computed(() => ['elite', 'enterprise'].includes(auth.currentPlan))
// D2: an item carrying a module outside the plan is greyed out + padlocked (click → upgrade paywall)
function isLocked(item) { return !!item.module && !isModuleAllowed(auth.currentPlan, item.module) }
const notifications = useNotificationStore()
const chatStore = useChatStore()
const profileStore = useProfileStore()
const clientStore = useClientStore()
const taskStore = useTaskStore()
const teamStore = useTeamStore()

// ─── Notifications ─────────────────────────────────────────────────────────────
const notifOpen = ref(false)
const notifRef = ref(null)
onClickOutside(notifRef, () => { notifOpen.value = false })


const NOTIF_GROUP_KEYS = { nps_drop: 'notif_group_nps_drop', churn_risk: 'notif_group_churn_risk', renewal: 'notif_group_renewal', task_overdue: 'notif_group_task_overdue' }

const groupedNotifications = computed(() => {
  const groups = {}
  for (const n of notifications.notifications) {
    const k = n.type || 'other'
    if (!groups[k]) groups[k] = { type: k, icon: n.icon, count: 0, unread: 0, latest: n }
    groups[k].count++
    if (!n.read) groups[k].unread++
    if (new Date(n.created_at) > new Date(groups[k].latest.created_at)) groups[k].latest = n
  }
  return Object.values(groups).map(g => ({
    ...g,
    label: g.count === 1
      ? notifTitle(g.latest, t)
      : (NOTIF_GROUP_KEYS[g.type] ? t(NOTIF_GROUP_KEYS[g.type], { count: g.count }) : notifTitle(g.latest, t) + ' (+' + (g.count - 1) + ')')
  })).sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at))
})

async function onNotifGroupClick(g) {
  if (g.count === 1) { onNotifClick(g.latest); return }
  try { await notifications.markTypeRead(g.type) } catch (e) { console.error('[notif] markTypeRead:', e.message || e) }
}

function onNotifClick(n) {
  notifications.markRead(n.id)
  notifOpen.value = false
  if (n.route) router.push(n.route)
}

function fmtNotifDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.round((now - d) / 60000)
  if (diffMin < 2) return t('notif_just_now')
  if (diffMin < 60) return t('notif_minutes_ago', { n: diffMin })
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return t('notif_hours_ago', { n: diffH })
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return t('notif_days_ago', { n: diffD })
  // REGIONAL-I18N (04/09): localeTag() instead of a local ladder — it is the one place that knows
  // the locale may carry a country ('fr-CA'), which this ladder read as neither 'ko' nor 'en' and
  // formatted as France.
  return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' })
}
// ─── Sidebar ───────────────────────────────────────────────────────────────────
function isActiveGroup(item) {
  return item.children?.some(c => route.name === c.name) || route.name === item.name
}

const sidebarSections = [
  {
    label: 'sidebar_dashboard_section',
    items: [
      { name: 'dashboard', icon: '📊', label: 'sidebar_dashboard', to: '/app/dashboard' },
      { name: 'manager', icon: '👥', label: 'sidebar_manager', to: '/app/manager', ownerOnly: true },
    ],
  },
  {
    label: 'sidebar_clients_section',
    items: [
      { name: 'portfolio', icon: '💼', label: 'sidebar_portfolio', to: '/app/portfolio' },
      { name: 'satisfaction', icon: '⭐', label: 'sidebar_satisfaction', to: '/app/satisfaction' },
      { name: 'playbooks', icon: '📋', label: 'sidebar_playbooks', to: '/app/playbooks', module: 'playbook' },
    ],
  },
  {
    label: 'sidebar_performance_section',
    items: [
      { name: 'kpis', icon: '📈', label: 'sidebar_kpis', to: '/app/kpis' },
      { name: 'okr', icon: '🎯', label: 'sidebar_okr', to: '/app/okr', module: 'okr' },
      { name: 'roadmap', icon: '🗺️', label: 'sidebar_roadmap', to: '/app/roadmap', module: 'roadmap' },
    ],
  },
  {
    label: 'sidebar_projects_section',
    items: [
      {
        name: 'tasks', icon: '⚡', label: 'sidebar_smart_matrix', to: '/app/tasks/stats',
        children: [
          { name: 'tasks-stats', label: 'sidebar_stats', to: '/app/tasks/stats' },
          { name: 'tasks-planning', label: 'sidebar_planning', to: '/app/tasks/planning' },
          { name: 'tasks-projects', label: 'sidebar_projects', to: '/app/tasks/projects' },
          { name: 'tasks-kanban', label: 'sidebar_kanban', to: '/app/tasks/kanban' },
          { name: 'tasks-priorities', label: 'sidebar_priorities', to: '/app/tasks/priorities' },
          { name: 'tasks-team', label: 'sidebar_team_tasks', to: '/app/tasks/team' },
          { name: 'tasks-settings', label: 'sidebar_task_settings', to: '/app/tasks/settings' },
        ],
      },
    ],
  },
  {
    label: 'sidebar_team_section',
    items: [
      { name: 'workload', icon: '💚', label: 'sidebar_health_tracker', to: '/app/workload' },
      { name: 'oxygen', icon: '🫧', label: 'sidebar_oxygen', to: '/app/oxygen' },
      { name: 'coach', icon: '🤖', label: 'sidebar_coach', to: '/app/coach' },
    ],
  },
  {
    label: 'sidebar_tools_section',
    items: [
      { name: 'email-studio', icon: '📧', label: 'sidebar_email_studio', to: '/app/email-studio', module: 'email' },
      { name: 'quotes', icon: '📄', label: 'sidebar_quotes', to: '/app/quotes' },
    ],
  },
  {
    label: 'sidebar_resources_section',
    items: [
      {
        name: 'resources', icon: '📚', label: 'sidebar_resources', to: '/app/resources/library', module: 'resources',
        children: [
          { name: 'resources-library', label: 'sidebar_res_library', to: '/app/resources/library' },
          { name: 'resources-masterclass', label: 'sidebar_res_masterclass', to: '/app/resources/masterclass' },
          { name: 'resources-guides', label: 'sidebar_res_guides', to: '/app/resources/guides' },
          { name: 'resources-tools', label: 'sidebar_res_tools', to: '/app/resources/tools' },
          { name: 'resources-wellbeing', label: 'sidebar_res_wellbeing', to: '/app/resources/wellbeing' },
        ],
      },
    ],
  },
  {
    label: '',
    items: [
      { name: 'profile',  icon: '👤', label: 'sidebar_profile',  to: '/app/profile'  },
      { name: 'team', icon: '👥', label: 'nav_team', to: '/app/team' },
      { name: 'settings', icon: '⚙️', label: 'sidebar_settings', to: '/app/settings' },
    ],
  },
]

import { onMounted, onUnmounted } from 'vue'
// G9-20: the chat realtime lives at the layout level (FAB badge outside the open surface).
// It is only destroyed when the layout unmounts (logout / leaving /app), no longer when the panel closes.
onUnmounted(() => { chatStore.destroy() })
onMounted(async () => {
    chatStore.init()
    profileStore.load()
  try {
    const { useClientStore } = await import('@/stores/clients')
    const { useTeamStore } = await import('@/stores/team')
    const { useTaskStore } = await import('@/stores/tasks')
    const cs = useClientStore(); const ts = useTeamStore(); const tk = useTaskStore()
    await Promise.all([cs.loadClients(), ts.loadMembers(), tk.loadTasks()])
    await notifications.loadNotifications()
    notifications.generateFromData(cs.clients, tk.tasks, ts.members)
  } catch(e) { console.error('AppLayout loadStores:', e) }
})

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
/* ═══ LAYOUT ═══ */
.app_layout { display: flex; min-height: 100vh; }
.main_wrapper { flex: 1; display: flex; flex-direction: column; min-width: 0; margin-left: var(--sidebar-width); transition: margin-left var(--transition-slow); }
.app_layout.collapsed .main_wrapper { margin-left: var(--sidebar-collapsed); }

/* ═══ SIDEBAR ═══ */
.sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: var(--sidebar-width); background-color: var(--bg-card); border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 100; transition: width var(--transition-slow); overflow-y: auto; overflow-x: hidden; }
.app_layout.collapsed .sidebar { width: var(--sidebar-collapsed); }
.sidebar_logo { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--border-light); flex-shrink: 0; }
.logo_text { font-weight: 800; font-size: 1.15rem; background: linear-gradient(135deg, var(--purple), #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.sidebar_navigation { flex: 1; padding: 8px; }
.nav_section_label { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.08em; padding: 16px 12px 6px; }
.nav_item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; transition: all 0.15s; }
.nav_item:hover { background: var(--bg-hover); color: var(--text); }
.nav_item.active { background: var(--purple-bg); color: var(--purple); font-weight: 600; }
.nav_item_locked { opacity: 0.45; }
.nav_item_locked:hover { opacity: 0.7; background: var(--bg-hover); }
.nav_lock { margin-left: auto; font-size: 0.72rem; }
.nav_icon { font-size: 1.1rem; width: 24px; text-align: center; flex-shrink: 0; }
.nav_label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav_subitems { margin-left: 34px; border-left: 2px solid var(--border-light); padding-left: 10px; margin-bottom: 4px; }
.nav_subitem { display: block; padding: 5px 8px; font-size: 0.8rem; color: var(--text-muted); border-radius: 6px; transition: all 0.15s; }
.nav_subitem:hover { color: var(--text); background: var(--bg-hover); }
.nav_subitem.active { color: var(--purple); font-weight: 600; }
.sidebar_toggle { width: 100%; padding: 12px; border: none; background: none; color: var(--text-muted); font-size: 0.85rem; border-top: 1px solid var(--border-light); transition: background 0.15s; }
.sidebar_logout { width: 100%; padding: 12px 16px; border: none; background: none; color: #ef4444; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s; text-align: left; }
.sidebar_logout:hover { background: #fef2f2; }
.sidebar_logout .nav_icon { font-size: 1rem; flex-shrink: 0; }
.sidebar_logout .nav_label { font-weight: 500; white-space: nowrap; }
.sidebar_toggle:hover { background: var(--bg-hover); }
.sidebar_overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 99; }

/* ═══ TOPBAR ═══ */
.topbar { height: var(--topbar-height); background-color: var(--bg-card); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 20px; gap: 12px; position: sticky; top: 0; z-index: 50; }
.topbar_burger { display: none; flex-direction: column; gap: 4px; background: none; border: none; padding: 6px; }
.topbar_burger span { display: block; width: 20px; height: 2px; background: var(--text); border-radius: 1px; }
.topbar_left { flex: 1; }
.topbar_right { display: flex; align-items: center; gap: 12px; }


/* ─── Notifications ────────────────────────────────────────────────────────── */
.topbar_notif { position: relative; }
.notification_button { background: none; border: none; font-size: 1.2rem; padding: 4px; position: relative; cursor: pointer; }
.notification_badge { position: absolute; top: -2px; right: -4px; background: var(--red); color: #fff; font-size: 0.6rem; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.notification_dropdown { position: absolute; top: 100%; right: 0; margin-top: 8px; width: 360px; background-color: var(--bg-card); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); border: 1px solid var(--border); z-index: 200; }
.notification_header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border-light); }
.notification_header strong { font-size: 0.9rem; }
.notification_header_actions { display: flex; align-items: center; gap: 8px; }
.notification_mark_read { background: none; border: none; color: var(--purple); font-size: 0.75rem; font-weight: 500; cursor: pointer; }
.notification_clear { background: none; border: none; font-size: 0.85rem; cursor: pointer; opacity: 0.5; transition: opacity 0.15s; padding: 0; }
.notification_clear:hover { opacity: 1; }
.notification_list { max-height: 320px; overflow-y: auto; }
.notification_item { display: flex; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border-light); cursor: pointer; transition: background 0.15s; align-items: flex-start; }
.notification_item:hover { background: var(--bg-hover); }
.notification_item.unread { background: var(--purple-bg); }
.notification_icon { font-size: 1.2rem; flex-shrink: 0; margin-top: 2px; }
.notification_content { flex: 1; min-width: 0; }
.notification_content strong { font-size: 0.82rem; display: block; margin-bottom: 2px; }
.notification_content p { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; margin: 0; }
.notification_time { font-size: 0.68rem; color: var(--text-muted); margin-top: 3px; display: block; }
.notification_unread_dot { width: 8px; height: 8px; border-radius: 50%; background: var(--purple); flex-shrink: 0; margin-top: 6px; }
.notification_empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
.notification_badge_mini { min-width: 18px; height: 18px; border-radius: 9px; background: var(--purple); color: #fff; font-size: 0.7rem; font-weight: 600; display: flex; align-items: center; justify-content: center; padding: 0 5px; flex-shrink: 0; margin-top: 4px; }

/* ═══ MAIN CONTENT ═══ */
.main_content { flex: 1; padding: 24px; max-width: 100%; }
.route_shell { width: 100%; }
.main_content:has(.chat_layout) { padding: 0; }
.chat_layout { height: calc(100vh - var(--topbar-height, 56px)); }

/* ═══ CHAT FAB ═══ */
.chat_fab { position: fixed; bottom: 24px; right: 24px; width: 52px; height: 52px; border-radius: 50%; background: var(--purple); color: #fff; border: none; font-size: 1.4rem; box-shadow: var(--shadow-lg); z-index: 400; transition: all 0.2s; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.chat_fab:hover { transform: scale(1.08); box-shadow: 0 8px 30px rgba(124,58,237,0.3); }
.chat_fab.active { background: var(--text); }
.chat_fab_badge { position: absolute; top: -4px; right: -4px; background: #ef4444; color: #fff; font-size: 0.6rem; font-weight: 700; min-width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.chat_panel_wrapper { position: fixed; bottom: 88px; right: 24px; width: 680px; height: 520px; background-color: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); z-index: 999; border: 1px solid var(--border); overflow: hidden; }

/* ═══ TOPBAR ACTIONS ═══ */
.topbar_actions { display: flex; align-items: center; gap: 8px; }
.topbar_actions :deep(.feedback_widget) { position: relative; bottom: auto; right: auto; z-index: 100; }
.topbar_actions :deep(.feedback_trigger) { width: 36px; height: 36px; font-size: 0.9rem; }
.topbar_actions :deep(.feedback_panel) { position: absolute; top: 100%; right: 0; z-index: 1000; }
.topbar_actions :deep(.ai_agent) { position: relative; bottom: auto; right: auto; z-index: 100; }
.topbar_actions :deep(.ai_panel) { bottom: auto; top: 100%; }
/* ═══ RESPONSIVE ═══ */
@media (max-width: 1024px) {
  .sidebar { width: var(--sidebar-collapsed); }
  .sidebar .nav_label, .sidebar .nav_section_label, .sidebar .logo_text, .sidebar .nav_subitems { display: none; }
  .main_wrapper { margin-left: var(--sidebar-collapsed); }
  .app_layout.collapsed .main_wrapper { margin-left: var(--sidebar-collapsed); }
}
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); width: var(--sidebar-width); z-index: 100; }
  .sidebar.open { transform: translateX(0); }
  .sidebar .nav_label, .sidebar .nav_section_label, .sidebar .logo_text, .sidebar .nav_subitems { display: unset; }
  .main_wrapper { margin-left: 0 !important; }
  .topbar_burger { display: flex; }
  .hide_mobile { display: none !important; }
  .main_content { padding: 16px; }
  .notification_dropdown { width: calc(100vw - 32px); right: -60px; }
  .chat_panel_wrapper { right: 0; left: 0; bottom: 0; top: 0; width: 100%; height: 100%; border-radius: 0; }
}
@media (min-width: 769px) { .hide_desktop { display: none !important; } }
@media (min-width: 769px) { .topbar_logo_mobile { display: none; } }

.trial_banner {
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
  color: #fff;
  text-align: center;
  padding: 8px 16px;
  font-size: 0.82rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.trial_cta {
  background: rgba(255,255,255,0.25);
  color: #fff;
  padding: 3px 12px;
  border-radius: 20px;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.78rem;
  transition: background 0.2s;
}
.trial_cta:hover { background: rgba(255,255,255,0.4); }

</style>
