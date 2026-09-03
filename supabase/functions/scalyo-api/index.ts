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

  // GET /tasks
  if (path === '/tasks' && req.method === 'GET') {
    const { data, error } = await supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    return respond(error ? { error: error.message } : { data, count: data?.length }, error ? 400 : 200, corsHeaders)
  }

  // POST /tasks
  if (path === '/tasks' && req.method === 'POST') {
    const { data, error } = await supabase.from('tasks').insert([{ ...body, user_id: userId }]).select().single()
    return respond(error ? { error: error.message } : { data }, error ? 400 : 201, corsHeaders)
  }

  // GET /me
  if (path === '/me' && req.method === 'GET') {
    const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, plan, locale').eq('id', userId).single()
    return respond(error ? { error: error.message } : { data }, error ? 400 : 200, corsHeaders)
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
