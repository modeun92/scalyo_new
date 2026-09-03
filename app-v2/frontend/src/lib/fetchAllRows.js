// ─── HOTFIX CAP-1000 (contrat R23 29/07/2026) ────────────────────────────────
// PostgREST plafonne TOUTE réponse à 1000 lignes (max-rows) SANS erreur : les
// lectures « tout le jeu » (clients, notifications) passent par cette boucle
// .range() en pages de 1000 jusqu'à épuisement.
//
// Exigences côté appelant :
//   - buildQuery() retourne une requête AVEC select(..., { count: 'exact' })
//     et un tri STABLE (un insert batch partage le même created_at — now()
//     transactionnel Postgres → tri secondaire sur id OBLIGATOIRE).
// Garde-fou : au-delà de maxRows on COUPE et on le DIT (truncated + total
// exact) — jamais silencieux (R21). L'affichage appartient aux vues (t()
// interdit ici).

export const PAGE_SIZE = 1000
export const MAX_ROWS = 5000

export async function fetchAllRows(buildQuery, { pageSize = PAGE_SIZE, maxRows = MAX_ROWS } = {}) {
  const rows = []
  let total = null
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1
    const { data, error, count } = await buildQuery().range(from, to)
    if (error) {
      // Fin de plage (jeu = multiple exact de pageSize) : PostgREST peut répondre
      // 416/PGRST103 sur une page hors bornes — c'est une fin de jeu, pas un échec.
      if (rows.length && (error.code === 'PGRST103' || /range/i.test(error.message || ''))) break
      throw error
    }
    if (typeof count === 'number') total = count
    if (data && data.length) rows.push(...data)
    if (!data || data.length < to - from + 1) break        // page incomplète = fin du jeu
    if (total != null && rows.length >= total) break       // évite la requête vide finale
  }
  const truncated = total != null && rows.length < total
  return { rows, total: total ?? rows.length, truncated }
}
