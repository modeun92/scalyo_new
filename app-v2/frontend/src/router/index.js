import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isModuleAllowed } from '@/utils/planGating'
import { i18n } from '@/i18n'
import { L } from '@/i18n/landing'

const routes = [
  // SEO-I18N : la landing existe a trois URLs. Le prefixe d'URL est la seule
  // autorite de langue ici — sans ces routes, /en/ et /ko/ tombent sur le
  // catch-all NotFound, donc en noindex, et le <head> statique genere au build
  // servirait une page qui se desindexe elle-meme apres hydratation.
  // Codes : l'URL et le hreflang portent 'ko' (ISO 639-1) ; landing.js indexe
  // ses libelles sous 'kr'. meta.landingLocale porte la cle landing.js.
  { path: '/', name: 'landing', component: () => import('@/views/LandingPage.vue'), meta: { guest: true, landingLocale: 'fr' } },
  { path: '/en', alias: '/en/', name: 'landing-en', component: () => import('@/views/LandingPage.vue'), meta: { guest: true, landingLocale: 'en' } },
  { path: '/ko', alias: '/ko/', name: 'landing-ko', component: () => import('@/views/LandingPage.vue'), meta: { guest: true, landingLocale: 'kr' } },
  { path: '/paywall', name: 'paywall', component: () => import('@/views/PaywallView.vue') },
  { path: '/payment-success', name: 'payment-success', component: () => import('@/views/PaymentSuccessView.vue') },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
  { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
  {
    path: '/app',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'dashboard' } },
      { path: 'onboarding', name: 'onboarding', component: () => import('@/views/OnboardingView.vue') },
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'manager', name: 'manager', component: () => import('@/views/ManagerView.vue') },
      { path: 'portfolio', name: 'portfolio', component: () => import('@/views/PortfolioView.vue') },
      { path: 'clients/:id', name: 'client-detail', component: () => import('@/views/ClientDetailView.vue'), props: true },
      { path: 'satisfaction', name: 'satisfaction', component: () => import('@/views/SatisfactionView.vue') },
      { path: 'playbooks', name: 'playbooks', component: () => import('@/views/PlaybooksView.vue'), meta: { requiredModule: 'playbook' } },
      { path: 'kpis', name: 'kpis', component: () => import('@/views/KpisView.vue') },
      { path: 'kpis/new', name: 'kpis-builder-new', component: () => import('@/views/kpis/KpisBuilder.vue') },
      { path: 'kpis/:id', name: 'kpis-builder', component: () => import('@/views/kpis/KpisBuilder.vue'), props: true },
      { path: 'kpis/:id/preview', name: 'kpis-preview', component: () => import('@/views/kpis/KpisPreview.vue'), props: true },
      { path: 'kpis/:id/present', name: 'kpis-present', component: () => import('@/views/kpis/KpisPresent.vue'), props: true },
      { path: 'okr', name: 'okr', component: () => import('@/views/OkrView.vue'), meta: { requiredModule: 'okr' } },
      { path: 'roadmap', name: 'roadmap', component: () => import('@/views/RoadmapView.vue'), meta: { requiredModule: 'roadmap' } },
      { path: 'tasks', name: 'tasks', redirect: { name: 'tasks-stats' } },
      { path: 'tasks/stats', name: 'tasks-stats', component: () => import('@/views/tasks/StatsView.vue') },
      { path: 'tasks/planning', name: 'tasks-planning', component: () => import('@/views/tasks/PlanningView.vue') },
      { path: 'tasks/projects', name: 'tasks-projects', component: () => import('@/views/tasks/ProjectsView.vue') },
      { path: 'tasks/kanban', name: 'tasks-kanban', component: () => import('@/views/tasks/KanbanView.vue') },
      { path: 'tasks/priorities', name: 'tasks-priorities', component: () => import('@/views/tasks/PrioritiesView.vue') },
      { path: 'tasks/team', name: 'tasks-team', component: () => import('@/views/tasks/TeamView.vue') },
      { path: 'tasks/settings', name: 'tasks-settings', component: () => import('@/views/tasks/SettingsView.vue') },
      { path: 'workload', name: 'workload', component: () => import('@/views/WorkloadView.vue') },
      // OXYGEN Lot 3a : page unique (absorbe Bien-être) — redirect pour les anciens liens
      { path: 'oxygen', name: 'oxygen', component: () => import('@/views/OxygenView.vue') },
      { path: 'wellbeing', redirect: { name: 'oxygen' } },
      { path: 'coach', name: 'coach', component: () => import('@/views/CoachView.vue') },
      { path: 'chat', name: 'chat', meta: { requiresAuth: true }, component: () => import('@/views/ChatView.vue') },
      { path: 'email-studio', name: 'email-studio', component: () => import('@/views/EmailStudioView.vue'), meta: { requiredModule: 'email' } },
      { path: 'quotes', name: 'quotes', component: () => import('@/views/QuotesView.vue') },
      // Import IA masqué — import standard désormais dans chaque module
      { path: 'import', redirect: { name: 'dashboard' } },
      // Module Integrations masqué (beta) — accès coupé, code conservé dormant (contrat R23 landing, D1)
      { path: 'integrations', redirect: { name: 'dashboard' } },
      { path: 'settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
      { path: 'team', name: 'team', component: () => import('@/views/TeamManagementView.vue') },
        { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { requiresAuth: true } },
      { path: 'resources', name: 'resources', redirect: { name: 'resources-library' } },
      { path: 'resources/library', name: 'resources-library', component: () => import('@/views/resources/LibraryView.vue'), meta: { requiredModule: 'resources' } },
      { path: 'resources/masterclass', name: 'resources-masterclass', component: () => import('@/views/resources/MasterclassView.vue'), meta: { requiredModule: 'resources' } },
      { path: 'resources/guides', name: 'resources-guides', component: () => import('@/views/resources/GuidesView.vue'), meta: { requiredModule: 'resources' } },
      { path: 'resources/tools', name: 'resources-tools', component: () => import('@/views/resources/ToolsView.vue'), meta: { requiredModule: 'resources' } },
      { path: 'resources/wellbeing', name: 'resources-wellbeing', component: () => import('@/views/resources/WellbeingResourcesView.vue'), meta: { requiredModule: 'resources' } },
    ],
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/auth/ResetPasswordView.vue'),
    meta: { guest: true }
  },
  {
    path: '/reset-password-confirm',
    name: 'ResetPasswordConfirm',
    component: () => import('@/views/auth/ResetPasswordConfirmView.vue')
  },
  {
    path: '/cgu',
    name: 'CGU',
    component: () => import('@/views/legal/CguView.vue')
  },
  {
    path: '/privacy',
    name: 'Privacy',
    component: () => import('@/views/legal/PrivacyView.vue')
    },
  { path: '/dpa', name: 'dpa', component: () => import('@/views/DpaView.vue'), meta: { guest: true } },
    {
      path: '/blog',
      name: 'Blog',
      component: () => import('@/views/blog/BlogIndex.vue')
  },
  {
    path: '/support',
    name: 'Support',
    component: () => import('@/views/SupportView.vue')
  },
  {
    // Lot 6 / INV-GUEST : PAS de meta.guest — un utilisateur deja connecte doit
    // pouvoir atteindre l'ecran d'acceptation (le guard le renvoyait au dashboard
    // et le jeton de l'URL etait perdu au rebond). Pas de requiresAuth non plus :
    // l'invite sans compte doit y acceder.
    path: '/join',
    name: 'join',
    component: () => import('@/views/JoinView.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue')
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  try {
    if (!authStore.user && !authStore.loading) {
      const hasToken = Object.keys(localStorage).some(k => k.startsWith('sb-'))
      if (!hasToken && to.meta.requiresAuth) {
        return { name: 'login' }
      }
      await authStore.init()
    }
  } catch (e) {
    console.error('Router guard — auth init failed:', e.message || e)
  }
  // Unauthenticated → login
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }
  // Authenticated + guest route → dashboard or paywall
  if (to.meta.guest && authStore.isAuthenticated) {
    if (authStore.needsPayment) return { name: 'paywall' }
    return { name: 'dashboard' }
  }
  // Paywall check is handled below via needsPayment (covers trial + stripe)

  if (to.meta.requiresAuth && to.name !== 'onboarding' && authStore.profile && !authStore.onboardingCompleted) {
    return { name: 'onboarding' }
  }
  // G9-3 (garde inverse) : onboarding déjà complété → dashboard, jamais de re-onboarding
  if (to.name === 'onboarding' && authStore.profile && authStore.onboardingCompleted) {
    return { name: 'dashboard' }
  }

  // Plan gating: check module access
  if (to.meta.requiredModule && authStore.isAuthenticated) {
    const plan = authStore.currentPlan || 'starter'
    if (!isModuleAllowed(plan, to.meta.requiredModule)) {
      // Chantier A : contexte upgrade (module gaté) vs essai expiré (needsPayment ci-dessous)
      return { name: 'paywall', query: { reason: 'upgrade', module: to.meta.requiredModule } }
    }
  }

  // Authenticated + requiresAuth + trial expired → paywall (except paywall itself)
  if (to.meta.requiresAuth && authStore.isAuthenticated && authStore.needsPayment && to.name !== 'paywall') {
    return { name: 'paywall' }
  }
})

// SEO: dynamic title per route
// L-13/E-13 : titres résolus à la locale courante via i18n.global (pattern
// supabaseWrite.js — pas de useI18n hors setup, T12). Le titre se met à jour
// à chaque navigation ; un changement de langue re-titre au clic suivant.
router.afterEach((to) => {
  const t = i18n.global.t

  // SEO-I18N : sur les trois URLs de la landing, titre et description viennent
  // de landing.js — la meme source que le <head> statique produit au build.
  // Passer par i18n.global ferait dependre le titre de localStorage, donc
  // divergerait du <head> servi : canonical et hreflang mentiraient.
  // Aucun effet de bord sur l'app : on ne touche ni i18n.global ni localStorage.
  const landingKey = to.meta?.landingLocale
  if (landingKey) {
    const S = L[landingKey] || L.fr
    document.documentElement.lang = landingKey === 'kr' ? 'ko' : landingKey
    document.title = S.seo_title || L.fr.seo_title
    let d = document.querySelector('meta[name="description"]')
    if (!d) { d = document.createElement('meta'); d.setAttribute('name', 'description'); document.head.appendChild(d) }
    d.setAttribute('content', S.seo_desc || L.fr.seo_desc)
    let r = document.querySelector('meta[name="robots"]')
    if (!r) { r = document.createElement('meta'); r.setAttribute('name', 'robots'); document.head.appendChild(r) }
    r.setAttribute('content', 'index, follow')
    return
  }

  const TITLE_KEYS = {
    'login': 'rt_login',
    'register': 'rt_register',
    'dashboard': 'rt_dashboard',
    'portfolio': 'rt_portfolio',
    'client-detail': 'rt_client_detail',
    'oxygen': 'rt_oxygen',
    'kpis': 'rt_kpis',
    'import': 'rt_import',
    'settings': 'rt_settings',
    'profile': 'rt_profile',
    'payment-success': 'rt_payment_success',
    'paywall': 'rt_paywall',
    'NotFound': 'rt_not_found',
    'ResetPassword': 'rt_reset',
    'ResetPasswordConfirm': 'rt_reset_confirm',
    'CGU': 'rt_cgu',
    'Support': 'rt_support',
    'Blog': 'rt_blog',
    'Privacy': 'rt_privacy',
    // HEADER-PILL (29/08) : ~30 routes nommées titraient l'onglet « rt_default » générique —
    // chaque écran nomme sa vue (clés rt_* ×3 langues, alignées sur les titres réels des vues).
    // 'landing' reste volontairement sur rt_default (titre SEO de la home).
    'onboarding': 'rt_onboarding',
    'manager': 'rt_manager',
    'satisfaction': 'rt_satisfaction',
    'playbooks': 'rt_playbooks',
    'kpis-builder-new': 'rt_kpis_builder',
    'kpis-builder': 'rt_kpis_builder',
    'kpis-preview': 'rt_kpis_preview',
    'kpis-present': 'rt_kpis_present',
    'okr': 'rt_okr',
    'roadmap': 'rt_roadmap',
    'tasks-stats': 'rt_tasks_stats',
    'tasks-planning': 'rt_tasks_planning',
    'tasks-projects': 'rt_tasks_projects',
    'tasks-kanban': 'rt_tasks_kanban',
    'tasks-priorities': 'rt_tasks_priorities',
    'tasks-team': 'rt_tasks_team',
    'tasks-settings': 'rt_tasks_settings',
    'workload': 'rt_workload',
    'coach': 'rt_coach',
    'chat': 'rt_chat',
    'email-studio': 'rt_email_studio',
    'quotes': 'rt_quotes',
    'team': 'rt_team',
    'resources-library': 'rt_res_library',
    'resources-masterclass': 'rt_res_masterclass',
    'resources-guides': 'rt_res_guides',
    'resources-tools': 'rt_res_tools',
    'resources-wellbeing': 'rt_res_wellbeing',
    'dpa': 'rt_dpa',
    'join': 'rt_join',
  }
  // Hors landing, <html lang> suit la locale de l'application : sans cette ligne,
  // une navigation interne depuis /ko/ vers /blog laisserait lang="ko" sur une
  // page francaise — attribut faux pour les lecteurs d'ecran comme pour Google.
  document.documentElement.lang = i18n.global.locale?.value || 'fr'

  const key = to.name && TITLE_KEYS[to.name]
  document.title = key ? t(key) : (to.meta?.title || t('rt_default'))
  let metaDesc = document.querySelector('meta[name="description"]')
  if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.setAttribute('name', 'description'); document.head.appendChild(metaDesc) }
  metaDesc.setAttribute('content', to.meta?.description || t('rt_meta_desc'))

  // SEO-404 : le fallback SPA de Cloudflare Pages renvoie 200 avec le HTML de la
  // landing pour toute URL inexistante. Search Console a ainsi decouvert des URLs
  // fantomes (/mois, /blog/customer-success-guide) qu'il traite comme des pages.
  // Servir un vrai 404 demanderait de reecrire le routage de production ; le
  // noindex, lui, suffit a les faire sortir de l'index : Googlebot execute le JS,
  // lit la balise et desindexe. Aucun risque cote produit.
  let metaRobots = document.querySelector('meta[name="robots"]')
  if (!metaRobots) { metaRobots = document.createElement('meta'); metaRobots.setAttribute('name', 'robots'); document.head.appendChild(metaRobots) }
  metaRobots.setAttribute('content', to.name === 'NotFound' ? 'noindex, follow' : 'index, follow')
})

export default router
