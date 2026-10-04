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
    'profiles', 'clients', 'notifications',
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

  // CORE-V2-ME (04/10/2026): the person's core_v2 data (name, e-mail, language, organization, role,
  // status) — read with THEIR token, so it is exactly what they can see of themselves.
  try {
    const meRes = await fetch(supabaseUrl + '/rest/v1/rpc/core_v2_me', {
      method: 'POST',
      headers: { 'apikey': serviceKey, 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: '{}',
    })
    exportData.data.core_v2_me = meRes.ok ? await meRes.json() : null
  } catch { exportData.data.core_v2_me = null }

  // CORE-V2-TASK (04/10/2026): projects and tasks live in core_v2 — what the person created, and the
  // tasks they are assigned to, read with THEIR token by their core_v2 personage.
  const pid = exportData.data.core_v2_me && exportData.data.core_v2_me.personage_id
  for (const [key, path] of [['project', 'project?created_by=eq.'], ['task', 'task?created_by=eq.'], ['task_assignee', 'task_assignee?member_id=eq.']]) {
    if (pid == null) { exportData.data[key] = []; continue }
    try {
      const r = await fetch(supabaseUrl + '/rest/v1/' + path + encodeURIComponent(pid) + '&select=*', {
        headers: { 'apikey': serviceKey, 'Authorization': authHeader },
      })
      exportData.data[key] = r.ok ? await r.json() : []
    } catch { exportData.data[key] = [] }
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
