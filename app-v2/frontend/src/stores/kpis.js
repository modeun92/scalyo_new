import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { i18n } from '@/i18n'
import { baseLanguage } from '@/i18n/regional'
import { localDateKey, localeTag } from '@/lib/formatters'

function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// COPIL-RACE (audit 03/09/2026): the builder writes on every keystroke; without a queue,
// concurrent PATCHes arrive out of order and the LAST RESPONSE TO ARRIVE
// wins (truncated title in the database under a "✓ Saved"). Doctrine:
//   • a single in-flight write per COPIL;
//   • while one is in flight, subsequent payloads MERGE into a
//     single pending payload (coalescing);
//   • the local store is the truth of what the CSM sees: updated BEFORE
//     the write, never overwritten by the response;
//   • a failure is retried ONCE, immediately, then abandoned — withWrite has
//     already toasted, the input stays on screen and the next keystroke resends everything.
const _inFlight = new Map()   // copilId → Promise of the write in progress
const _pending = new Map()    // copilId → { row, label, waiters, retried }

function enqueueWrite(copilId, row, label) {
  return new Promise((resolve) => {
    const p = _pending.get(copilId)
    if (p) { Object.assign(p.row, row); p.label = label; p.waiters.push(resolve) }
    else _pending.set(copilId, { row: { ...row }, label, waiters: [resolve], retried: false })
    drainWrites(copilId)
  })
}

function drainWrites(copilId) {
  if (_inFlight.has(copilId)) return
  const p = _pending.get(copilId)
  if (!p) return
  _pending.delete(copilId)
  const run = (async () => {
    const res = await withWrite(() => supabase.from('copils').update(p.row).eq('id', copilId), { label: p.label })
    _inFlight.delete(copilId)
    if (res && res.error) {
      const out = { error: res.error.message || String(res.error) }
      if (!p.retried && !_pending.has(copilId)) {
        // re-arm the payload for ONE single retry (drainWrites below sends it)
        _pending.set(copilId, { row: p.row, label: p.label, waiters: [], retried: true })
      }
      p.waiters.forEach(w => w(out))
    } else {
      p.waiters.forEach(w => w({ success: true }))
    }
    drainWrites(copilId)
  })()
  _inFlight.set(copilId, run)
}

// Flushes a COPIL's queue (leaving the page). Bounded by the withWrite timeout (8 s)
// and by the "one single retry" rule: it cannot loop.
async function flushWrites(copilId) {
  for (let i = 0; i < 4 && (_inFlight.has(copilId) || _pending.has(copilId)); i++) {
    if (!_inFlight.has(copilId)) drainWrites(copilId)
    await _inFlight.get(copilId)
  }
}

function hasPendingWrite(copilId) { return _inFlight.has(copilId) || _pending.has(copilId) }

const BLOCK_DEFAULTS = {
  kpi_grid: { kpis: [{ label: '', value: '', unit: '', trend: 'up', color: '#10b981' }] },
  kpi_single: { label: '', value: '', unit: '', trend: 'up', previous: '', color: '#7c3aed' },
  // COPIL-SEED-DATA (D2①): a brand-new chart carries NO figures — a COPIL never
  // presents a value nobody entered. Labels stay localized
  // examples (localizedSeed), values are empty (null).
  // I18N-HARDCODE (04/09): these labels used to be French ('Jan/Fév/Mar', 'Série 1',
  // 'Sain/Vigilance/Critique'). localizedSeed() overwrites all three at creation, so the French
  // only surfaced on a corrupted row — i.e. exactly where a language nobody chose is most confusing.
  // The structure is what BLOCK_DEFAULTS is for; the words come from localizedSeed via t().
  chart_bar: { labels: ['', '', ''], datasets: [{ label: '', data: [null, null, null], color: '#7c3aed' }] },
  chart_line: { labels: ['', '', '', ''], datasets: [{ label: '', data: [null, null, null, null], color: '#3b82f6' }] },
  chart_donut: { labels: ['', '', ''], data: [null, null, null], colors: ['#10b981', '#f59e0b', '#ef4444'] },
  text: { content: '', size: 'normal' },
  table: { headers: ['', '', ''], rows: [['', '', '']] },
  divider: { style: 'line' },
  image: { url: '', path: '', caption: '' },   // path = Storage object (uploaded); url = external link
  checklist: { items: [{ text: '', done: false }] },
  timeline: { events: [{ date: '', title: '', desc: '', status: 'done' }] },
  quote: { text: '', author: '', role: '' },
  action_plan: { actions: [{ what: '', who: '', when: '', status: 'todo' }] },
}

// MIN-i18n: the pre-filled examples of a NEW block follow the user's
// language (months via Intl, series/segments via keys, donut via status_*).
// BLOCK_DEFAULTS remains the neutral normalization structure (G9-14) — the
// FR fallbacks only show up on a corrupted row, never at creation time.
function localizedSeed(type) {
  const base = JSON.parse(JSON.stringify(BLOCK_DEFAULTS[type] || {}))
  const t = i18n.global.t
  // LOCALE-TAG (04/09): localeTag() — the ko-KR/en-US/fr-FR ladder existed in 9 copies.
  const tag = localeTag()
  const months = (n) => Array.from({ length: n }, (_, i) => new Date(2026, i, 1).toLocaleDateString(tag, { month: 'short' }))
  if (type === 'chart_bar') { base.labels = months(3); base.datasets[0].label = t('copil_sample_series') + ' 1' }
  if (type === 'chart_line') { base.labels = months(4); base.datasets[0].label = t('copil_sample_series') + ' 1' }
  if (type === 'chart_donut') { base.labels = [t('status_healthy'), t('status_watch'), t('status_critical')] }
  // I18N-HARDCODE (04/09): the table headers were the literal 'Col 1/2/3' — seeded through t() now.
  if (type === 'table') { base.headers = [1, 2, 3].map(n => t('copil_sample_column') + ' ' + n) }
  return base
}

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

// G9-14: a malformed jsonb block in the database must NEVER break rendering
// (builder / preview / present / PPTX export all read copil.blocks).
// Normalization at load time: data is rebuilt key by key from
// BLOCK_DEFAULTS[type] — an expected array stays an array (object items filtered),
// an object stays an object. Unknown type → empty data, neutral render without a crash.
// No database write: the sane version is only persisted on the user's next save.
function normalizeBlockData(type, data) {
  const defaults = BLOCK_DEFAULTS[type]
  if (!defaults) return {}
  const src = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {}
  const out = {}
  for (const [k, dv] of Object.entries(defaults)) {
    const v = src[k]
    if (Array.isArray(dv)) {
      let arr = Array.isArray(v) ? v : JSON.parse(JSON.stringify(dv))
      // arrays of objects (kpis, datasets, rows, events…): purge non-object items (null, string…)
      if (dv.length && typeof dv[0] === 'object') arr = arr.filter(x => x && typeof x === 'object')
      out[k] = arr
    } else if (dv && typeof dv === 'object') {
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? v : JSON.parse(JSON.stringify(dv))
    } else {
      out[k] = v !== undefined ? v : dv
    }
  }
  // keeps keys set by the app outside the defaults (never blocking at render time)
  for (const k of Object.keys(src)) if (!(k in out)) out[k] = src[k]
  return out
}

function normalizeBlocks(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(b => b && typeof b === 'object' && !Array.isArray(b)).map(b => {
    const type = typeof b.type === 'string' ? b.type : 'text'
    return {
      ...b,
      id: (typeof b.id === 'string' && b.id) ? b.id : uid(),
      type,
      title: typeof b.title === 'string' ? b.title : '',
      visible: b.visible !== false,
      data: normalizeBlockData(type, b.data),
    }
  })
}

// Map DB snake_case row to frontend camelCase
function dbToCopil(r) {
  return {
    id: r.id,
    title: r.title || '',
    subtitle: r.subtitle || '',
    clientId: r.client_id || null,
    clientName: r.client_name || '',
    clientLogo: r.client_logo || null,
    period: r.period || '',
    date: r.date || localDateKey(),
    color: r.color || '#7c3aed',
    presenter: r.presenter || '',
    lang: r.lang || 'fr',
    blocks: normalizeBlocks(r.blocks),
    shareToken: r.share_token || '',
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString(),
  }
}

// Map frontend camelCase to DB snake_case
function copilToDb(c) {
  const row = {}
  if (c.title !== undefined) row.title = c.title
  if (c.subtitle !== undefined) row.subtitle = c.subtitle
  if (c.clientId !== undefined) row.client_id = c.clientId
  if (c.clientName !== undefined) row.client_name = c.clientName
  if (c.clientLogo !== undefined) row.client_logo = c.clientLogo
  if (c.period !== undefined) row.period = c.period
  if (c.date !== undefined) row.date = c.date
  if (c.color !== undefined) row.color = c.color
  if (c.presenter !== undefined) row.presenter = c.presenter
  if (c.lang !== undefined) row.lang = c.lang
  if (c.blocks !== undefined) row.blocks = c.blocks
  if (c.shareToken !== undefined) row.share_token = c.shareToken
  row.updated_at = new Date().toISOString()
  return row
}

export const useKpiStore = defineStore('kpis', () => {
  const copils = ref([])
  const loading = ref(false)

  async function loadCopils() {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('copils')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      copils.value = (data || []).map(dbToCopil)
    } catch (e) {
      console.error('[kpis] loadCopils error:', e)
    } finally {
      loading.value = false
    }
  }

  async function createCopil(partial = {}) {
    const userId = await getCurrentUserId()
    if (!userId) return null
    const now = new Date().toISOString()
    const row = {
      user_id: userId,
      client_id: partial.clientId || null,
      title: partial.title || '',
      subtitle: partial.subtitle || '',
      client_name: partial.clientName || '',
      client_logo: null,
      period: partial.period || '',
      date: localDateKey(),   // DATE-KEY-UTC: local day, not UTC day
      color: partial.color || '#7c3aed',
      presenter: partial.presenter || '',
      // COPIL-I18N: deck language = user's language. REGIONAL-I18N (04/09): baseLanguage() —
      // copils.lang is a DECK_LANGS value ('fr'|'en'|'ko'), never a regional tag; storing 'fr-CA'
      // here would be persisted, re-read on every render and re-normalized forever after.
      lang: partial.lang || baseLanguage(i18n.global.locale.value) || 'fr',
      blocks: [],
      share_token: uid(),
      created_at: now,
      updated_at: now,
    }
    const { data, error } = await withWrite(() => supabase.from('copils').insert(row).select().single(), { label: 'kpis.createCopil' })
    if (error) { console.error('[kpis] createCopil error:', error); return null }
    const copil = dbToCopil(data)
    copils.value.unshift(copil)
    return copil.id
  }

  // D-14: every mutation returns {success}/{error} — a "✓" on screen is only allowed
  // to exist after an OK Supabase response (withWrite = G9-13 timeout + toast).
  // COPIL-RACE: the store is updated BEFORE the write (what the CSM sees is
  // authoritative), the write goes through the COPIL's sequenced queue.
  async function updateCopil(id, changes) {
    const c = copils.value.find(c => c.id === id)
    if (!c) return { error: 'not_found' }
    const dbChanges = copilToDb(changes)
    Object.assign(c, changes, { updatedAt: dbChanges.updated_at })
    const res = await enqueueWrite(id, dbChanges, 'kpis.updateCopil')
    if (res.error) console.error('[kpis] updateCopil error:', res.error)
    return res
  }

  async function deleteCopil(id) {
    const { error } = await withWrite(() => supabase.from('copils').delete().eq('id', id), { label: 'kpis.deleteCopil' })
    if (error) { console.error('[kpis] deleteCopil error:', error); return { error: error.message } }
    copils.value = copils.value.filter(c => c.id !== id)
    return { success: true }
  }

  async function duplicateCopil(id) {
    const orig = copils.value.find(c => c.id === id)
    if (!orig) return null
    const userId = await getCurrentUserId()
    if (!userId) return null
    const now = new Date().toISOString()
    const row = {
      user_id: userId,
      title: orig.title + ' ' + i18n.global.t('copil_copy_suffix'),   // COPIL-I18N: no more hard-coded "(copy)"
      subtitle: orig.subtitle,
      client_id: orig.clientId || null,                              // preserved (audit 03/09)
      client_name: orig.clientName,
      client_logo: orig.clientLogo,
      period: orig.period,
      date: orig.date,
      color: orig.color,
      presenter: orig.presenter,
      lang: orig.lang,
      blocks: JSON.parse(JSON.stringify(orig.blocks)),
      share_token: uid(),
      created_at: now,
      updated_at: now,
    }
    const { data, error } = await withWrite(() => supabase.from('copils').insert(row).select().single(), { label: 'kpis.duplicateCopil' })
    if (error) { console.error('[kpis] duplicateCopil error:', error); return null }
    const copil = dbToCopil(data)
    copils.value.unshift(copil)
    return copil.id
  }

  function getCopil(id) { return copils.value.find(c => c.id === id) }

  // D-14: deliberate optimistic write (the UI stays responsive), reverted if Supabase
  // refuses, for STRUCTURE gestures (add, delete, reorder) —
  // no more uncaught throws. Field EDITS (updateBlock) are not
  // reverted: the CSM's input stays on screen, withWrite has toasted (COPIL-SAVE
  // state 5). All of them go through the COPIL's sequenced queue (COPIL-RACE).
  async function persistBlocks(c, label) {
    c.updatedAt = new Date().toISOString()
    const res = await enqueueWrite(c.id, { blocks: c.blocks, updated_at: c.updatedAt }, label)
    return res.error ? { message: res.error } : null
  }

  async function addBlock(copilId, type) {
    const c = copils.value.find(c => c.id === copilId)
    if (!c) return { error: 'not_found' }
    const block = {
      id: uid(),
      type,
      title: '',
      data: localizedSeed(type),
      visible: true,
      width: 'full',
    }
    c.blocks.push(block)
    const err = await persistBlocks(c, 'kpis.addBlock')
    if (err) { c.blocks = c.blocks.filter(b => b.id !== block.id); return { error: err.message } }
    return { success: true, blockId: block.id }
  }

  async function updateBlock(copilId, blockId, changes) {
    const c = copils.value.find(c => c.id === copilId)
    if (!c) return { error: 'not_found' }
    const b = c.blocks.find(b => b.id === blockId)
    if (!b) return { error: 'not_found' }
    Object.assign(b, changes)
    const err = await persistBlocks(c, 'kpis.updateBlock')
    if (err) return { error: err.message }
    return { success: true }
  }

  async function deleteBlock(copilId, blockId) {
    const c = copils.value.find(c => c.id === copilId)
    if (!c) return { error: 'not_found' }
    const prev = c.blocks
    c.blocks = c.blocks.filter(b => b.id !== blockId)
    const err = await persistBlocks(c, 'kpis.deleteBlock')
    if (err) { c.blocks = prev; return { error: err.message } }
    return { success: true }
  }

  async function reorderBlocks(copilId, newOrder) {
    const c = copils.value.find(c => c.id === copilId)
    if (!c) return { error: 'not_found' }
    const prev = c.blocks
    const map = Object.fromEntries(c.blocks.map(b => [b.id, b]))
    c.blocks = newOrder.map(id => map[id]).filter(Boolean)
    const err = await persistBlocks(c, 'kpis.reorderBlocks')
    if (err) { c.blocks = prev; return { error: err.message } }
    return { success: true }
  }

  // ── Uploaded images (COPIL-IMAGE-EXPORT, D1①) ─────────────────────────
  // Private bucket `copil-media`, object `<user_id>/<copil_id>/<block_id>.<ext>`,
  // RLS by user prefix (migration 20260903100000). The block stores the
  // PATH; the signed URL (1 h) is resolved at read time and cached here.
  const MEDIA_BUCKET = 'copil-media'
  const MEDIA_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
  const MEDIA_MAX_BYTES = 5 * 1024 * 1024
  const mediaUrls = ref({})
  const _resolving = new Set()

  function resolveMedia(path) {
    if (!path || mediaUrls.value[path] || _resolving.has(path)) return
    _resolving.add(path)
    supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600).then(({ data, error }) => {
      _resolving.delete(path)
      if (error) { console.error('[kpis] signed url error:', error.message); return }
      mediaUrls.value = { ...mediaUrls.value, [path]: data.signedUrl }
    })
  }

  // Returns {success, path} or {error: code} — codes translated by the view (copil_image_*)
  async function uploadImage(copilId, blockId, file) {
    const ext = MEDIA_TYPES[file?.type]
    if (!ext) return { error: 'copil_image_type' }
    if (file.size > MEDIA_MAX_BYTES) return { error: 'copil_image_too_large' }
    const userId = await getCurrentUserId()
    if (!userId) return { error: 'not_authenticated' }
    const c = copils.value.find(c => c.id === copilId)
    const b = c?.blocks.find(b => b.id === blockId)
    if (!b) return { error: 'not_found' }
    const path = `${userId}/${copilId}/${blockId}.${ext}`
    const { error } = await withWrite(() => supabase.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: true, contentType: file.type }), { label: 'kpis.uploadImage' })
    if (error) return { error: error.message || String(error) }
    // the old object (different extension) is removed; failure here is not blocking
    if (b.data.path && b.data.path !== path) supabase.storage.from(MEDIA_BUCKET).remove([b.data.path]).catch(() => {})
    delete mediaUrls.value[path]
    mediaUrls.value = { ...mediaUrls.value }
    return updateBlock(copilId, blockId, { data: { ...b.data, path, url: '' } }).then(r => r.error ? r : { success: true, path })
  }

  async function removeImage(copilId, blockId) {
    const c = copils.value.find(c => c.id === copilId)
    const b = c?.blocks.find(b => b.id === blockId)
    if (!b) return { error: 'not_found' }
    const path = b.data.path
    const res = await updateBlock(copilId, blockId, { data: { ...b.data, path: '', url: '' } })
    if (res.error) return res
    if (path) supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {})
    return { success: true }
  }

  // Storage object → data URL (PPTX export). Returns null on failure (CORS, expired).
  async function mediaDataUrl(pathOrUrl, isPath) {
    try {
      let url = pathOrUrl
      if (isPath) {
        const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(pathOrUrl, 600)
        if (error) return null
        url = data.signedUrl
      }
      const resp = await fetch(url)
      if (!resp.ok) return null
      const blob = await resp.blob()
      if (!blob.type.startsWith('image/')) return null
      return await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(blob) })
    } catch (_) { return null }
  }

  return {
    copils, loading, loadCopils, createCopil, updateCopil, deleteCopil, duplicateCopil,
    getCopil, addBlock, updateBlock, deleteBlock, reorderBlocks, BLOCK_DEFAULTS,
    flushWrites, hasPendingWrite,
    mediaUrls, resolveMedia, uploadImage, removeImage, mediaDataUrl, MEDIA_MAX_BYTES,
  }
})
