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

  if (eventType.startsWith('task')) {
    const task = {
      user_id: userId,
      title: (data as any).title || (data as any).name || 'Tâche webhook',
      description: (data as any).description || (data as any).notes || '',
      status: (data as any).status || 'todo',
      priority: (data as any).priority || 'important',
      assignee: (data as any).assignee || (data as any).owner || '',
      due_date: (data as any).due_date || (data as any).deadline || null,
      updated_at: new Date().toISOString(),
    }
    const { data: created } = await supabase.from('tasks').insert([task]).select().single()
    return new Response(JSON.stringify({ success: true, action: 'task_created', id: created?.id }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Generic — store as note
  return new Response(JSON.stringify({ success: true, action: 'received', event: eventType, payload_keys: Object.keys(data) }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
