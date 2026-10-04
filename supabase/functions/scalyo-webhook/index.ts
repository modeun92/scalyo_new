import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-webhook-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const url = new URL(req.url)
  // URL format: /functions/v1/scalyo-webhook?user=USER_ID&event=client.created
  const userId = url.searchParams.get('user')
  const eventType = url.searchParams.get('event') || 'data.received'
  const secret = req.headers.get('x-webhook-secret') || url.searchParams.get('secret')

  if (!userId) return new Response(JSON.stringify({ error: 'Missing user parameter' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Validate webhook secret if provided
  if (secret) {
    const { data: webhook } = await supabase.from('webhooks').select('secret, is_active').eq('user_id', userId).eq('is_active', true).limit(1).single()
    if (!webhook || webhook.secret !== secret) {
      return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    await supabase.from('webhooks').update({ last_triggered_at: new Date().toISOString(), trigger_count: (webhook.trigger_count || 0) + 1 }).eq('user_id', userId)
  }

  let payload = {}
  try { payload = await req.json() } catch {}

  // ─── MAP PAYLOAD TO SCALYO ENTITIES ────────────────────────
  // Accepts standard CRM format: { name, email, company, arr, health, status, ... }
  // Also accepts Zapier/Make format: { data: { ... } }
  const data = (payload as any).data || payload

  if (eventType.startsWith('client')) {
    const client = {
      user_id: userId,
      name: (data as any).company || (data as any).name || (data as any).account_name || 'Import webhook',
      industry: (data as any).industry || (data as any).sector || '',
      arr: parseFloat((data as any).arr || (data as any).annual_revenue || 0),
      mrr: parseFloat((data as any).mrr || (data as any).monthly_revenue || 0),
      health: parseInt((data as any).health || (data as any).health_score || 5),
      nps: parseInt((data as any).nps || (data as any).nps_score || 0),
      status: (data as any).status || 'healthy',
      csm: (data as any).csm || (data as any).owner || '',
      churn_risk: parseFloat((data as any).churn_risk || 0),
      contacts: (data as any).contacts || (data as any).contact ? [{ name: (data as any).contact, email: (data as any).email || '' }] : [],
      notes: (data as any).notes || (data as any).description || '',
      updated_at: new Date().toISOString(),
    }

    if (eventType === 'client.created') {
      const { data: created, error } = await supabase.from('clients').insert([client]).select().single()
      return new Response(JSON.stringify({ success: true, action: 'client_created', id: created?.id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (eventType === 'client.updated') {
      const clientId = (data as any).id || (data as any).scalyo_id
      if (clientId) {
        await supabase.from('clients').update(client).eq('id', clientId).eq('user_id', userId)
      } else {
        // Upsert by name
        await supabase.from('clients').upsert([{ ...client }], { onConflict: 'name,user_id' })
      }
      return new Response(JSON.stringify({ success: true, action: 'client_updated' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // CORE-V2-TASK (04/10/2026): tasks live in core_v2 (20261004130000) and always belong to a project
  // (decided): the payload must name one of the user's organization (project_id), or nothing is made.
  // Only these fields are taken; priority and a free-text assignee have no home in the model.
  if (eventType.startsWith('task')) {
    const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const projectId = String((data as any).project_id || (data as any).projectId || '')
    if (!projectId) return json({ error: 'project_id required' }, 400)
    const { data: membership } = await supabase.rpc('core_v2_membership', { p_user: userId })
    if (!membership) return json({ error: 'No organization' }, 404)
    const org = membership.core_organization_id
    const { data: project } = await supabase.from('project').select('id').eq('id', projectId).eq('organization_id', org).maybeSingle()
    if (!project) return json({ error: 'Unknown project' }, 400)
    const wanted = String((data as any).status || 'todo')
    const { data: statuses } = await supabase.from('task_status').select('id, text').eq('organization_id', org)
    const status = (statuses || []).find((s: any) => s.text === wanted) || (statuses || []).find((s: any) => s.text === 'todo')
    const due = String((data as any).due_date || (data as any).deadline || '')
    const description = (data as any).description || (data as any).notes || ''
    const { data: created, error } = await supabase.from('task').insert([{
      organization_id: org,
      project_id: projectId,
      created_by: membership.personage_id,
      title: (data as any).title || (data as any).name || 'Tâche webhook',
      description: description ? { text: String(description) } : {},
      status_id: status ? status.id : null,
      // TASK-DATE-NOON: a calendar day is stored at noon UTC
      due_at: /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) + 'T12:00:00Z' : null,
    }]).select('id').single()
    if (error) return json({ error: error.message }, 400)
    return json({ success: true, action: 'task_created', id: created?.id }, 201)
  }

  // Generic — store as note
  return new Response(JSON.stringify({ success: true, action: 'received', event: eventType, payload_keys: Object.keys(data) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
