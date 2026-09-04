import { t } from '../_i18n/translate.js'

export function jsonOk(data) {
  return Response.json(data, { status: 200 })
}

export function jsonError(messageKey, status = 400, lang = 'fr') {
  return Response.json({ error: t(messageKey, lang) }, { status })
}

// Aliases used by multi-seat endpoints
export function jsonResponse(data) {
  return Response.json(data, { status: 200 })
}

export function errorResponse(status, message) {
  return Response.json({ error: message }, { status })
}

// Lot 6 — TYPED error: a stable machine code + the details the front end
// needs to compose a message (organization name, targeted address…).
// Translation happens on the client, which knows the user's language;
// the Function does not guess it. `error` is still filled with the code so nothing
// breaks for callers that already read that field.
export function errorCode(status, code, details = {}) {
  return Response.json({ error: code, code, ...details }, { status })
}
