import { t } from '../_i18n/messages.js'

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

// Lot 6 — erreur TYPÉE : un code machine stable + les détails dont le front a
// besoin pour composer un message (nom d'organisation, adresse visée…).
// La traduction se fait côté client, qui connaît la langue de l'utilisateur ;
// la Function ne la devine pas. `error` reste rempli avec le code pour ne rien
// casser chez les appelants qui lisent déjà ce champ.
export function errorCode(status, code, details = {}) {
  return Response.json({ error: code, code, ...details }, { status })
}
