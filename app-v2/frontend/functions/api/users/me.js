// === SCALYO — RGPD Delete Account ===
// DELETE /api/users/me
// Droit a l'effacement (Art. 17 RGPD) — supprime toutes les donnees utilisateur.

import { getConfig } from '../_config/index.js'
import { extractLang, extractAuth, verifyJwt } from '../_services/auth.service.js'
import { jsonOk, jsonError } from '../_utils/response.js'

const TABLES_TO_DELETE = [
  'ai_messages',
  'notifications',
  'playbooks',
  'playbook_executions',
  'playbook_rules',
  'roadmaps',
  'snapshots',
  'copils',
  'tasks',
  'clients',
  'organization_members',
  'sent_emails',
  'chat_messages',
  'chat_channels',
  'planning_events',
  'projects',
]

export async function onRequestDelete(context) {
  const config = getConfig(context.env)
  const lang = extractLang(context.request)
  const { token } = extractAuth(context.request)
  const jwt = await verifyJwt(token, config)

  if (!jwt.valid) return jsonError('unauthorized', 401, lang)

  if (!config.supabaseServiceRoleKey) {
    return jsonError('server_error', 503, lang)
  }

  const userId = jwt.userId
  const errors = []

  // Delete user data from all tables (RLS bypassed via service role)
  for (const table of TABLES_TO_DELETE) {
    const resp = await fetch(
      config.supabaseUrl + '/rest/v1/' + table + '?user_id=eq.' + userId,
      {
        method: 'DELETE',
        headers: {
          'apikey': config.supabaseServiceRoleKey,
          'Authorization': 'Bearer ' + config.supabaseServiceRoleKey,
          'Prefer': 'return=minimal',
        },
      }
    )
    if (!resp.ok) errors.push(table)
  }

  // Delete profile
  const profileResp = await fetch(
    config.supabaseUrl + '/rest/v1/profiles?id=eq.' + userId,
    {
      method: 'DELETE',
      headers: {
        'apikey': config.supabaseServiceRoleKey,
        'Authorization': 'Bearer ' + config.supabaseServiceRoleKey,
        'Prefer': 'return=minimal',
      },
    }
  )
  if (!profileResp.ok) errors.push('profiles')

  // Delete auth user via Supabase Admin API
  const authResp = await fetch(
    config.supabaseUrl + '/auth/v1/admin/users/' + userId,
    {
      method: 'DELETE',
      headers: {
        'apikey': config.supabaseServiceRoleKey,
        'Authorization': 'Bearer ' + config.supabaseServiceRoleKey,
      },
    }
  )
  if (!authResp.ok) errors.push('auth')

  if (errors.length > 0) {
    return Response.json({ deleted: true, partial: true, failed: errors }, { status: 207 })
  }

  return jsonOk({ deleted: true })
}
