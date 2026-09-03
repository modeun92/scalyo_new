// ─── HOTFIX CAP-1000 (contract R23 29/07/2026) ────────────────────────
// PostgREST caps EVERY response at 1000 rows (max-rows) WITHOUT an error: the
// "whole dataset" reads (clients, notifications) go through this .range()
// loop in pages of 1000 until exhaustion.
//
// Requirements on the caller side:
//   - buildQuery() returns a query WITH select(..., { count: 'exact' })
//     and a STABLE sort (a batch insert shares the same created_at — Postgres
//     transactional now() → a secondary sort on id is MANDATORY).
// Safeguard: past maxRows we CUT and we SAY SO (truncated + exact
// total) — never silently (R21). Display belongs to the views (t()
// forbidden here).

export const PAGE_SIZE = 1000
export const MAX_ROWS = 5000

export async function fetchAllRows(buildQuery, { pageSize = PAGE_SIZE, maxRows = MAX_ROWS } = {}) {
  const rows = []
  let total = null
  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1
    const { data, error, count } = await buildQuery().range(from, to)
    if (error) {
      // End of range (dataset = an exact multiple of pageSize): PostgREST may answer
      // 416/PGRST103 on an out-of-bounds page — that is the end of the dataset, not a failure.
      if (rows.length && (error.code === 'PGRST103' || /range/i.test(error.message || ''))) break
      throw error
    }
    if (typeof count === 'number') total = count
    if (data && data.length) rows.push(...data)
    if (!data || data.length < to - from + 1) break        // incomplete page = end of the dataset
    if (total != null && rows.length >= total) break       // avoids the final empty request
  }
  const truncated = total != null && rows.length < total
  return { rows, total: total ?? rows.length, truncated }
}
