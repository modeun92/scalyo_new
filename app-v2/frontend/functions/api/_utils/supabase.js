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

// CORE-V2-ME (04/10/2026): the caller's organization and role come from core_v2
// (core_v2_membership, 20261004100000) — organization_members and profiles are on their way out
// (stage 2). The fields the routes read keep their meaning: organization_id is the OLD organization
// uuid the kept tables still hold, role is owner / admin / member / viewer. Added: job_status,
// can_send_email, locale, core_organization_id. NULL = in no organization (or gone: ENDED).
export async function getUserMembership(db, userId) {
  const m = await db.rpc('core_v2_membership', { p_user: userId })
  return m && m.organization_id ? m : null
}

// JOB-STATUS-READ (04/10/2026): an INACTIVE / ON_LEAVE worker reads but changes nothing. A route that
// writes asks this first. The screen already greys itself and refuses the write in the browser
// (lib/supabase); this is what holds when the screen is bypassed and the API is called directly.
export function isReadOnlyMembership(m) {
  return !!m && m.job_status !== 'ACTIVE'
}

// CORE-V2-ME: the plan, for the caller's own token — the tier of the organization's current
// subscription period (core_v2_my_subscription), or NULL when there is none: no access. A failed read
// answers 'starter', the most restrictive plan, as the profiles.plan read it replaces did. ai.js,
// email.js and usage.js read profiles.plan — the personal plan, while the screen and the client-limit
// trigger read the organization's: a member of a paying organization was entitled on screen and
// 403'd by the API (the split source in CLAUDE.md, Traps). They now read the organization's period.
export async function getCurrentPlan(env, userJwt) {
  try {
    const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/core_v2_my_subscription', {
      method: 'POST',
      headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + userJwt, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!r.ok) return 'starter'
    const j = await r.json()
    const type = j && j.subscription && j.subscription.type
    return type ? String(type).toLowerCase() : null
  } catch (_) {
    return 'starter'
  }
}
