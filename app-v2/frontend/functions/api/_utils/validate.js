const VALID_MODULES = [
  'coach', 'nova', 'import', 'matrice', 'copil',
  'playbook', 'email', 'dashboard', 'notif', 'wellbeing',
]

const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY_LENGTH = 10

export function validateAiRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, reason: 'invalid_request' }
  }
  if (!body.module || !VALID_MODULES.includes(body.module)) {
    return { valid: false, reason: 'module_not_found' }
  }

  // Sanitize message length
  if (body.message && typeof body.message === 'string' && body.message.length > MAX_MESSAGE_LENGTH) {
    body.message = body.message.slice(0, MAX_MESSAGE_LENGTH)
  }

  // Sanitize history length
  if (Array.isArray(body.history) && body.history.length > MAX_HISTORY_LENGTH) {
    body.history = body.history.slice(-MAX_HISTORY_LENGTH)
  }

  // Sanitize each history message
  if (Array.isArray(body.history)) {
    body.history = body.history
      .filter(m => m && typeof m === 'object' && typeof m.content === 'string')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.slice(0, MAX_MESSAGE_LENGTH),
      }))
  }

  return { valid: true }
}
