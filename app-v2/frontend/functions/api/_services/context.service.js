import { getConfig } from '../_config/index.js'

// === LYO-CONTEXT (3.1) — contexte portefeuille injecté aux 8 modules IA ===
// Contrat R23 validé le 29/08/2026 (Notion > Référence technique > CONTRAT — LYO-CONTEXT).
// D1 : périmètre = la RLS réelle de `clients` (SELECT org-wide depuis FB-05, migration
//      20260720230000) — AUCUN filtre user_id ici, la RLS décide. Le contexte IA est
//      exactement ce que l'écran Portefeuille montre à l'utilisateur.
// D3 : minimisation RGPD — liste EXPLICITE de colonnes, jamais notes ni contacts
//      (emails/téléphones) vers le provider IA ; listes capées.

// Seuils MIROIR de src/lib/health.js (HEALTH_THRESHOLDS, HEALTH_MAX).
// PARITÉ OBLIGATOIRE (pattern plans.config.js ×2) : toute modification se fait
// dans les DEUX fichiers, front et backend.
const HEALTH_THRESHOLDS = { critical: 3, watch: 6 }
const HEALTH_MAX = 10

// Caps de listes (D3) : le prompt reste lisible sur un portefeuille de 350+ comptes.
const MAX_URGENT = 15
const MAX_RENEWALS = 10
const MAX_OVERDUE = 5
const MAX_CITED = 3

// Minimisation RGPD (D3) : colonnes explicites — PAS de select=*.
const CLIENT_COLUMNS = 'id,name,arr,mrr,health,status,churn_risk,renewal_date,lifecycle,csm,csm_id'
const TASK_COLUMNS = 'id,title,due_date,status'

export function getUserIdFromJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.sub || null
  } catch { return null }
}

// GET REST avec le JWT UTILISATEUR + clé anon : la RLS s'applique (jamais la
// service role ici — le contexte IA ne doit rien voir de plus que l'utilisateur).
// null = échec de lecture (réseau, !ok) — jamais confondu avec « 0 ligne ».
async function restGet(env, path, userJwt) {
  const config = getConfig(env)
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null
  try {
    const res = await fetch(config.supabaseUrl + '/rest/v1/' + path, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: 'Bearer ' + userJwt,
      }
    })
    return res.ok ? res.json() : null
  } catch { return null }
}

// Miroir de lib/health.js — un score 0 réel compte (jamais de `|| n` sur le health).
function toHealthNumber(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Statut effectif « le pire des deux gagne » — même sémantique que lib/health.healthStatus.
function healthStatus(health, status) {
  const h = toHealthNumber(health)
  if (status === 'critical' || (h !== null && h <= HEALTH_THRESHOLDS.critical)) return 'critical'
  if (status === 'watch' || status === 'todo' || (h !== null && h <= HEALTH_THRESHOLDS.watch)) return 'watch'
  return 'healthy'
}

const STATUS_LABEL = { critical: 'CRITIQUE', watch: 'VIGILANCE', healthy: 'SAIN' }

function clientArr(c) {
  return c.arr || (c.mrr || 0) * 12 || 0
}

function healthLabel(c) {
  const h = toHealthNumber(c.health)
  return h === null ? 'health ?' : 'health ' + h + '/' + HEALTH_MAX
}

function clientLine(c) {
  let line = '- ' + c.name + ': ' + healthLabel(c) + ', statut ' + STATUS_LABEL[healthStatus(c.health, c.status)] + ', ARR ' + clientArr(c)
  // LYO-CONTEXT-2 : une date de renouvellement passée est dite DEPASSEE — les 4 réponses
  // de preuve présentaient « 2026-05-04 » comme un renouvellement à venir (4 mois de retard).
  if (c.renewal_date) {
    const d = new Date(c.renewal_date)
    line += ', renouvellement ' + c.renewal_date + (!Number.isNaN(d.getTime()) && d < new Date() ? ' (DEPASSE)' : '')
  }
  return line
}

export async function buildRichContext(env, userId, userJwt, message = '') {
  if (!userId || !userJwt) return { summary: '' }

  const [clients, tasks, profile] = await Promise.all([
    restGet(env, 'clients?select=' + CLIENT_COLUMNS, userJwt),
    restGet(env, 'tasks?select=' + TASK_COLUMNS + '&user_id=eq.' + userId, userJwt),
    restGet(env, 'user_profiles?select=currency&id=eq.' + userId, userJwt),
  ])

  // Échec de lecture du portefeuille → contexte VIDE : le prompt dira « pas de
  // données chargées ». On n'affirme JAMAIS « 0 clients » sur une erreur.
  if (clients === null) return { summary: '' }

  const cl = clients
  const currency = (Array.isArray(profile) && profile[0] && profile[0].currency) || 'EUR'
  // Leçon COUNT-353-352 : les stats portefeuille EXCLUENT les prospects (clientsOnly).
  const portfolio = cl.filter(c => c.lifecycle !== 'prospect')
  const now = new Date()

  const totalArr = portfolio.reduce((s, c) => s + clientArr(c), 0)
  const healths = portfolio.map(c => toHealthNumber(c.health)).filter(h => h !== null)
  const avgHealth = healths.length ? (healths.reduce((s, h) => s + h, 0) / healths.length).toFixed(1) : null

  const byStatus = { critical: 0, watch: 0, healthy: 0 }
  portfolio.forEach(c => { byStatus[healthStatus(c.health, c.status)]++ })

  const urgent = portfolio
    .filter(c => healthStatus(c.health, c.status) === 'critical')
    .sort((a, b) => clientArr(b) - clientArr(a))

  // Fenêtre 0-30 j STRICTE : une date passée n'est pas « un renouvellement à venir ».
  const renewSoon = portfolio
    .filter(c => {
      if (!c.renewal_date) return false
      const d = new Date(c.renewal_date)
      if (Number.isNaN(d.getTime())) return false
      const days = (d - now) / 86400000
      return days >= 0 && days < 30
    })
    .sort((a, b) => new Date(a.renewal_date) - new Date(b.renewal_date))

  const overdue = (tasks || []).filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'done')

  // COMPTE CITÉ : si un nom du portefeuille (≥ 3 caractères) apparaît dans la
  // question, ses données réelles sont injectées — elles font foi face aux
  // chiffres avancés par l'utilisateur (critère OmniWare4). Prospects inclus :
  // on peut poser une question sur un prospect, le bloc dit son lifecycle.
  const msg = (message || '').toLowerCase()
  const cited = msg
    ? cl.filter(c => c.name && c.name.trim().length >= 3 && msg.includes(c.name.trim().toLowerCase()))
        .sort((a, b) => (b.name || '').length - (a.name || '').length)
        .slice(0, MAX_CITED)
    : []

  // Première ligne = l'échelle : elle voyage dans ctx.summary, donc les 8 modules
  // IA consommateurs la reçoivent sans modification de leurs prompts.
  let summary = 'ECHELLE: health /' + HEALTH_MAX + ' — <=' + HEALTH_THRESHOLDS.critical + ' critique, ' +
    (HEALTH_THRESHOLDS.critical + 1) + '-' + HEALTH_THRESHOLDS.watch + ' vigilance, >' + HEALTH_THRESHOLDS.watch +
    ' sain. Statut effectif = le pire de (score, statut saisi). Ces donnees font foi.'

  summary += '\nPORTFOLIO: ' + portfolio.length + ' clients, ARR ' + totalArr + ' ' + currency +
    (avgHealth !== null ? ', Health moyen ' + avgHealth + '/' + HEALTH_MAX : '') +
    ', ' + byStatus.critical + ' critiques / ' + byStatus.watch + ' vigilance / ' + byStatus.healthy + ' sains'

  if (cited.length) {
    summary += '\nCOMPTE CITE (' + cited.length + ') — donnees reelles, elles font foi:'
    cited.forEach(c => {
      let line = clientLine(c)
      if (c.churn_risk) line += ', churn risk ' + c.churn_risk
      if (c.csm) line += ', CSM ' + c.csm
      if (c.lifecycle === 'prospect') line += ' [prospect]'
      summary += '\n' + line
    })
  }
  if (urgent.length) {
    summary += '\nURGENCES (' + urgent.length + ' comptes critiques, top ' + Math.min(urgent.length, MAX_URGENT) + ' par ARR):'
    urgent.slice(0, MAX_URGENT).forEach(c => { summary += '\n' + clientLine(c) })
    if (urgent.length > MAX_URGENT) summary += '\n- +' + (urgent.length - MAX_URGENT) + ' autres comptes critiques'
  }
  if (renewSoon.length) {
    summary += '\nRENOUVELLEMENTS < 30j (' + renewSoon.length + '):'
    renewSoon.slice(0, MAX_RENEWALS).forEach(c => {
      summary += '\n- ' + c.name + ': ' + c.renewal_date + ', ' + healthLabel(c) + ', statut ' + STATUS_LABEL[healthStatus(c.health, c.status)]
    })
    if (renewSoon.length > MAX_RENEWALS) summary += '\n- +' + (renewSoon.length - MAX_RENEWALS) + ' autres renouvellements'
  }
  if (overdue.length) {
    summary += '\nTACHES EN RETARD (' + overdue.length + '):'
    overdue.slice(0, MAX_OVERDUE).forEach(t => { summary += '\n- ' + t.title + ' (due: ' + t.due_date + ')' })
  }
  return { summary }
}
