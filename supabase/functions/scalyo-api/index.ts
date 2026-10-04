import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const path = url.pathname.replace('/functions/v1/scalyo-api', '')
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')

  if (!apiKey) return new Response(JSON.stringify({ error: 'Missing API key. Use header: x-api-key: sk_...' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Validate API key
  const keyHash = await hashKey(apiKey)
  const { data: keyData, error: keyError } = await supabase
    .from('api_keys')
    .select('user_id, scopes, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single()

  if (keyError || !keyData || !keyData.is_active) {
    return new Response(JSON.stringify({ error: 'Invalid or inactive API key' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: 'API key expired' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Update last_used_at
  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', keyHash)

  const userId = keyData.user_id
  const scopes = keyData.scopes || []
  const isWrite = ['POST','PUT','DELETE','PATCH'].includes(req.method)

  if (isWrite && !scopes.includes('write')) {
    return new Response(JSON.stringify({ error: 'This API key is read-only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let body = {}
  if (isWrite) { try { body = await req.json() } catch {} }

  // ─── ROUTES ────────────────────────────────────────────────
  // GET /clients
  if (path === '/clients' && req.method === 'GET') {
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    return respond(error ? { error: error.message } : { data, count: data?.length }, error ? 400 : 200, corsHeaders)
  }

  // POST /clients
  if (path === '/clients' && req.method === 'POST') {
    const { data, error } = await supabase.from('clients').insert([{ ...body, user_id: userId }]).select().single()
    return respond(error ? { error: error.message } : { data }, error ? 400 : 201, corsHeaders)
  }

  // PUT /clients/:id
  if (path.startsWith('/clients/') && req.method === 'PUT') {
    const id = path.split('/')[2]
    const { data, error } = await supabase.from('clients').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single()
    return respond(error ? { error: error.message } : { data }, error ? 400 : 200, corsHeaders)
  }

  // DELETE /clients/:id
  if (path.startsWith('/clients/') && req.method === 'DELETE') {
    const id = path.split('/')[2]
    const { error } = await supabase.from('clients').delete().eq('id', id).eq('user_id', userId)
    return respond(error ? { error: error.message } : { success: true }, error ? 400 : 200, corsHeaders)
  }

  // GET /team
  if (path === '/team' && req.method === 'GET') {
    const { data, error } = await supabase.from('team_members').select('*').eq('user_id', userId).order('created_at', { ascending: true })
    return respond(error ? { error: error.message } : { data, count: data?.length }, error ? 400 : 200, corsHeaders)
  }

  // POST /team
  if (path === '/team' && req.method === 'POST') {
    const { data, error } = await supabase.from('team_members').insert([{ ...body, user_id: userId }]).select().single()
    return respond(error ? { error: error.message } : { data }, error ? 400 : 201, corsHeaders)
  }

  // GET /tasks · POST /tasks
  // CORE-V2-TASK (04/10/2026): tasks live in core_v2 (20261004130000). This client holds the service
  // role, so the organization is filtered here, by hand: the key owner's tasks, in their organization.
  // A new task needs a project of that organization (decided: a task always has one), and only the
  // listed fields are taken — the old `{ ...body }` let a caller write any column, user_id included.
  if (path === '/tasks' && (req.method === 'GET' || req.method === 'POST')) {
    const { data: membership } = await supabase.rpc('core_v2_membership', { p_user: userId })
    if (!membership) return respond({ error: 'No organization' }, 404, corsHeaders)
    const org = membership.core_organization_id
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('task')
        .select('id, project_id, parent_task_id, title, status:task_status(text), due_at, created_at, updated_at')
        .eq('organization_id', org).eq('created_by', membership.personage_id)
        .order('created_at', { ascending: false })
      return respond(error ? { error: error.message } : { data, count: data?.length }, error ? 400 : 200, corsHeaders)
    }
    const b = body as Record<string, unknown>
    const projectId = String(b.project_id || '')
    if (!projectId) return respond({ error: 'project_id required' }, 400, corsHeaders)
    const { data: project } = await supabase.from('project').select('id').eq('id', projectId).eq('organization_id', org).maybeSingle()
    if (!project) return respond({ error: 'Unknown project' }, 400, corsHeaders)
    if (!b.title) return respond({ error: 'title required' }, 400, corsHeaders)
    const due = String(b.due_date || '')
    const { data, error } = await supabase.from('task').insert([{
      organization_id: org,
      project_id: projectId,
      created_by: membership.personage_id,
      title: String(b.title),
      description: b.description ? { text: String(b.description) } : {},
      // TASK-DATE-NOON: a calendar day is stored at noon UTC
      due_at: /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) + 'T12:00:00Z' : null,
    }]).select('id, project_id, title, due_at, created_at').single()
    return respond(error ? { error: error.message } : { data }, error ? 400 : 201, corsHeaders)
  }

  // GET /me
  // CORE-V2-ME (04/10/2026): the person and the plan from core_v2 — profiles is being retired
  // (stage 2). The plan is the ORGANIZATION's current period (none: null), the same answer the app and
  // the Pages Functions give; read from profiles.plan it was the personal one, which a paying
  // organization's members did not have. Same response shape as before.
  if (path === '/me' && req.method === 'GET') {
    const { data: membership, error: mErr } = await supabase.rpc('core_v2_membership', { p_user: userId })
    if (mErr) return respond({ error: mErr.message }, 400, corsHeaders)
    if (!membership) return respond({ error: 'No organization' }, 404, corsHeaders)
    const { data: person, error: pErr } = await supabase.from('personage')
      .select('first_name, last_name').eq('id', membership.personage_id).single()
    if (pErr) return respond({ error: pErr.message }, 400, corsHeaders)
    const { data: period } = await supabase.rpc('core_v2_current_subscription', { p_org: membership.core_organization_id })
    const plan = period?.id && period?.type ? String(period.type).toLowerCase() : null
    return respond({ data: { id: userId, first_name: person.first_name, last_name: person.last_name, plan, locale: membership.locale } }, 200, corsHeaders)
  }

  return respond({ error: 'Route not found', available: ['GET /clients', 'POST /clients', 'PUT /clients/:id', 'DELETE /clients/:id', 'GET /team', 'POST /team', 'GET /tasks', 'POST /tasks', 'GET /me'] }, 404, corsHeaders)
})

function respond(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
}

async function hashKey(key) {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
