export function extractLang(request) {
  const accept = request.headers.get('Accept-Language') || 'fr'
  if (accept.startsWith('ko')) return 'ko'
  if (accept.startsWith('en')) return 'en'
  return 'fr'
}

export function extractAuth(request) {
  const header = request.headers.get('Authorization') || ''
  const token = header.replace('Bearer ', '')
  return { token, hasToken: !!token }
}

// Validate JWT via Supabase Auth API (handles HS256 + ES256)
export async function verifyJwt(token, config) {
  if (!token) return { valid: false, reason: 'unauthorized' }

  try {
    const res = await fetch(config.supabaseUrl + '/auth/v1/user', {
      headers: {
        'apikey': config.supabaseAnonKey,
        'Authorization': 'Bearer ' + token,
      }
    })

    if (!res.ok) return { valid: false, reason: 'unauthorized' }

    const user = await res.json()
    if (!user.id) return { valid: false, reason: 'unauthorized' }

    return { valid: true, userId: user.id, role: user.role, email: user.email }
  } catch {
    return { valid: false, reason: 'unauthorized' }
  }
}
