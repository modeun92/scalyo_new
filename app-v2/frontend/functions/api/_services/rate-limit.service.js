const MAX_REQUESTS = 10
const WINDOW_MS = 60 * 1000 // 1 minute

// In-memory store — resets when Worker cold-starts (acceptable for rate limiting)
const store = new Map()
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < WINDOW_MS * 2) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS * 5) store.delete(key)
  }
}

export function checkRateLimit(userId) {
  cleanup()
  const now = Date.now()

  if (!store.has(userId)) {
    store.set(userId, { count: 1, windowStart: now })
    return { allowed: true, remaining: MAX_REQUESTS - 1 }
  }

  const entry = store.get(userId)

  // Window expired — reset
  if (now - entry.windowStart > WINDOW_MS) {
    store.set(userId, { count: 1, windowStart: now })
    return { allowed: true, remaining: MAX_REQUESTS - 1 }
  }

  // Within window
  entry.count++
  const remaining = Math.max(0, MAX_REQUESTS - entry.count)
  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0 }
  }
  return { allowed: true, remaining }
}
