// _middleware.js — CORS + request handling for all /api/* endpoints
// Runs before every endpoint in functions/api/

const ALLOWED_ORIGINS = [
  'https://scalyo.app',
  'https://www.scalyo.app',
  'https://preprod.scalyo.app',
  'https://scalyo-app.pages.dev',
]

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.scalyo-app.pages.dev')
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export async function onRequest(context) {
  const { request } = context

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) })
  }

  // Process the request
  try {
    const response = await context.next()

    // Add CORS headers to all responses
    const cors = getCorsHeaders(request)
    const newHeaders = new Headers(response.headers)
    for (const [key, value] of Object.entries(cors)) {
      newHeaders.set(key, value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
    })
  }
}
