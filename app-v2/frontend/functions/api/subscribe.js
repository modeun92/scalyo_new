/**
 * POST /api/subscribe — Blog email capture
 * Public endpoint (no auth required)
 * CORS handled by _middleware.js
 */
export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const body = await request.json()
    const { email, locale, source } = body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'invalid_email' }, { status: 400 })
    }

    const validLocales = ['fr', 'en', 'ko']
    const safeLocale = validLocales.includes(locale) ? locale : 'fr'

    const supabaseUrl = env.SUPABASE_URL
    // ENV-FALLBACK-PROD (lot 6) : plus de repli en dur vers la base de PRODUCTION.
    if (!supabaseUrl) throw new Error('Missing required environment variable: SUPABASE_URL')
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return Response.json({ error: 'not_configured' }, { status: 500 })
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/blog_subscribers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        locale: safeLocale,
        source_article: source ? String(source).substring(0, 200) : null
      })
    })

    if (res.status === 409) {
      return Response.json({ ok: true, already: true })
    }

    if (!res.ok) {
      const txt = await res.text()
      if (txt.includes('duplicate') || txt.includes('unique')) {
        return Response.json({ ok: true, already: true })
      }
      return Response.json({ error: 'subscribe_failed' }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}
