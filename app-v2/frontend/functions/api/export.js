// === SCALYO — RGPD Data Export ===
// GET /api/export
// Droit a la portabilite (Art. 20 RGPD) — exporte toutes les donnees utilisateur en JSON.

import { getConfig } from './_config/index.js'
import { extractLang, extractAuth, verifyJwt } from './_services/auth.service.js'
import { jsonError } from './_utils/response.js'

const TABLES_TO_EXPORT = [
  'profiles',
  'clients',
  'tasks',
  'organization_members',
  'notifications',
  'playbooks',
  'playbook_executions',
  'roadmaps',
  'snapshots',
  'copils',
  'sent_emails',
  'chat_channels',
  'chat_messages',
  'ai_messages',
  'planning_events',
  'projects',
]

export async function onRequestGet(context) {
  const config = getConfig(context.env)
  const lang = extractLang(context.request)
  const { token } = extractAuth(context.request)
  const jwt = await verifyJwt(token, config)

  if (!jwt.valid) return jsonError('unauthorized', 401, lang)

  const userId = jwt.userId
  const exportData = { exported_at: new Date().toISOString(), user_id: userId }

  // Fetch data from each table (RLS applies via user token)
  for (const table of TABLES_TO_EXPORT) {
    const col = table === 'profiles' ? 'id' : 'user_id'
    const resp = await fetch(
      config.supabaseUrl + '/rest/v1/' + table + '?' + col + '=eq.' + userId + '&select=*',
      {
        headers: {
          'apikey': config.supabaseAnonKey,
          'Authorization': 'Bearer ' + token,
        },
      }
    )
    exportData[table] = resp.ok ? await resp.json() : []
  }

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="scalyo-export-' + userId.substring(0, 8) + '.json"',
    },
  })
}
