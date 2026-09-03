/**
 * GET /api/account/export
 * GDPR Art. 20 — Right to data portability
 * Exports ALL user data as JSON. Auth required.
 */
export async function onRequestGet(context) {
  const { request, env } = context
  const supabaseUrl = env.SUPABASE_URL || 'https://hcqninmpmzpqjtedyjyj.supabase.co'
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return Response.json({ error: 'not_configured' }, { status: 503 })

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const userRes = await fetch(supabaseUrl + '/auth/v1/user', {
    headers: { 'Authorization': authHeader, 'apikey': serviceKey }
  })
  if (!userRes.ok) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const user = await userRes.json()
  const uid = user.id

  const headers = {
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey
  }

  const tables = [
    'profiles', 'clients', 'tasks', 'notifications',
    'playbooks', 'kpi_reports', 'roadmap_items', 'snapshots',
    'org_integrations', 'user_wellbeing', 'ai_usage'
  ]

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: uid,
    user_email: user.email,
    format: 'GDPR Art. 20 — Data Portability Export',
    data: {}
  }

  for (const table of tables) {
    try {
      const idCol = table === 'profiles' ? 'id' : 'user_id'
      const r = await fetch(supabaseUrl + '/rest/v1/' + table + '?' + idCol + '=eq.' + uid + '&select=*', { headers })
      if (r.ok) {
        const rows = await r.json()
        // Strip sensitive fields (tokens)
        const clean = rows.map(row => {
          const { access_token, refresh_token, provider_data, ...safe } = row
          return safe
        })
        exportData.data[table] = clean
      }
    } catch { /* skip failed tables */ }
  }

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="scalyo-export-' + uid.substring(0, 8) + '.json"'
    }
  })
}
