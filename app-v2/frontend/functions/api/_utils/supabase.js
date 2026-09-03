// Backend Supabase REST helper — used by all endpoints
// Uses service role key to bypass RLS when needed

export function createSupabaseClient(env) {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

  const headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }

  return {
    async select(table, query = '') {
      const r = await fetch(url + '/rest/v1/' + table + '?select=*' + (query ? '&' + query : ''), { headers: { ...headers, Prefer: undefined } })
      if (!r.ok) throw new Error('Select failed: ' + (await r.text()))
      return r.json()
    },
    async selectOne(table, query) {
      const rows = await this.select(table, query)
      return rows[0] || null
    },
    async insert(table, data) {
      const r = await fetch(url + '/rest/v1/' + table, { method: 'POST', headers, body: JSON.stringify(data) })
      if (!r.ok) throw new Error('Insert failed: ' + (await r.text()))
      return r.json()
    },
    async update(table, query, data) {
      const r = await fetch(url + '/rest/v1/' + table + '?' + query, { method: 'PATCH', headers, body: JSON.stringify(data) })
      if (!r.ok) throw new Error('Update failed: ' + (await r.text()))
      return r.json()
    },
    async remove(table, query) {
      const r = await fetch(url + '/rest/v1/' + table + '?' + query, { method: 'DELETE', headers })
      if (!r.ok) throw new Error('Delete failed: ' + (await r.text()))
      return true
    },
    async rpc(fn, params = {}) {
      const r = await fetch(url + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(params) })
      if (!r.ok) throw new Error('RPC failed: ' + (await r.text()))
      return r.json()
    }
  }
}

// Extract user from Supabase JWT (auth header from frontend)
export async function getAuthUser(request, env) {
  const auth = request.headers.get('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.replace('Bearer ', '')
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
    headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + token }
  })
  if (!r.ok) return null
  return r.json()
}

// Get user's org membership
export async function getUserMembership(db, userId) {
  return db.selectOne('organization_members', 'user_id=eq.' + userId)
}
