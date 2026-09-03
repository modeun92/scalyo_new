/**
 * POST /api/account/delete
 * GDPR Art. 17 — Right to erasure
 * Deletes ALL user data across all Supabase tables, then deletes auth account
 * Auth required. Irreversible.
 */
export async function onRequestPost(context) {
  const { request, env } = context
  const supabaseUrl = env.SUPABASE_URL || 'https://hcqninmpmzpqjtedyjyj.supabase.co'
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return Response.json({ error: 'not_configured' }, { status: 503 })

  // Verify auth
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': authHeader, 'apikey': serviceKey }
  })
  if (!userRes.ok) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const user = await userRes.json()
  const uid = user.id

  // Verify confirmation body
  const body = await request.json().catch(() => ({}))
  if (body.confirm !== 'DELETE_MY_ACCOUNT') {
    return Response.json({ error: 'confirmation_required', message: 'Send { confirm: "DELETE_MY_ACCOUNT" }' }, { status: 400 })
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey,
    'Prefer': 'return=minimal'
  }

  // Delete from all user-scoped tables (order matters for FK constraints)
  const tables = [
    'ai_messages', 'ai_usage', 'chat_messages',
    'client_contacts', 'client_notes', 'client_tasks',
    'email_drafts', 'email_templates',
    'kpi_reports', 'kpi_entries',
    'notifications', 'user_notifications',
    'playbook_steps', 'playbooks',
    'roadmap_items',
    'snapshots',
    'tasks',
    'org_integrations',
    'clients',
    'user_wellbeing'
  ]

  const results = []
  for (const table of tables) {
    try {
      const r = await fetch(supabaseUrl + '/rest/v1/' + table + '?user_id=eq.' + uid, {
        method: 'DELETE', headers
      })
      results.push({ table, status: r.status })
    } catch (err) {
      results.push({ table, status: 'error', message: err.message })
    }
  }

  // Delete profile
  try {
    await fetch(supabaseUrl + '/rest/v1/profiles?id=eq.' + uid, {
      method: 'DELETE', headers
    })
    results.push({ table: 'profiles', status: 200 })
  } catch (err) {
    results.push({ table: 'profiles', status: 'error' })
  }

  // Delete auth user via Admin API
  try {
    await fetch(supabaseUrl + '/auth/v1/admin/users/' + uid, {
      method: 'DELETE',
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
    })
    results.push({ table: 'auth.users', status: 200 })
  } catch (err) {
    results.push({ table: 'auth.users', status: 'error' })
  }

  return Response.json({ deleted: true, tables: results.length, details: results })
}
