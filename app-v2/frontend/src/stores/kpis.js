import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { withWrite } from '@/lib/supabaseWrite'
import { i18n } from '@/i18n'
import { localDateKey } from '@/lib/formatters'

function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// COPIL-RACE (audit 03/09/2026) : le builder écrit à chaque frappe ; sans file,
// les PATCH concurrents arrivent dans le désordre et la DERNIÈRE RÉPONSE ARRIVÉE
// gagne (titre tronqué en base sous un « ✓ Enregistré »). Doctrine :
//   • une seule écriture en vol par COPIL ;
//   • pendant qu'elle est en vol, les payloads suivants FUSIONNENT dans un
//     unique payload en attente (coalescence) ;
//   • le store local est la vérité de ce que le CSM voit : mis à jour AVANT
//     l'écriture, jamais réécrit par la réponse ;
//   • un échec est retenté UNE fois, immédiatement, puis abandonné — withWrite a
//     déjà toasté, la saisie reste à l'écran et la prochaine frappe renvoie tout.
const _inFlight = new Map()   // copilId → Promise de l'écriture en cours
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
        // repose le payload pour UN seul nouvel essai (drainWrites ci-dessous l'envoie)
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

// Vide la file d'un COPIL (départ de page). Borné par le timeout de withWrite (8 s)
// et par la règle « un seul nouvel essai » : ne peut pas boucler.
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
  // COPIL-SEED-DATA (D2①) : un graphique neuf ne porte AUCUN chiffre — un COPIL ne
  // présente jamais une valeur que personne n'a saisie. Les libellés restent des
  // exemples localisés (localizedSeed), les valeurs sont vides (null).
  chart_bar: { labels: ['Jan', 'Fév', 'Mar'], datasets: [{ label: 'Série 1', data: [null, null, null], color: '#7c3aed' }] },
  chart_line: { labels: ['Jan', 'Fév', 'Mar', 'Avr'], datasets: [{ label: 'Série 1', data: [null, null, null, null], color: '#3b82f6' }] },
  chart_donut: { labels: ['Sain', 'Vigilance', 'Critique'], data: [null, null, null], colors: ['#10b981', '#f59e0b', '#ef4444'] },
  text: { content: '', size: 'normal' },
  table: { headers: ['Col 1', 'Col 2', 'Col 3'], rows: [['', '', '']] },
  divider: { style: 'line' },
  image: { url: '', path: '', caption: '' },   // path = objet Storage (téléversé) ; url = lien externe
  checklist: { items: [{ text: '', done: false }] },
  timeline: { events: [{ date: '', title: '', desc: '', status: 'done' }] },
  quote: { text: '', author: '', role: '' },
  action_plan: { actions: [{ what: '', who: '', when: '', status: 'todo' }] },
}

// MIN-i18n : les exemples pre-remplis d'un NOUVEAU bloc suivent la langue de
// l'utilisateur (mois via Intl, series/segments via cles, donut via status_*).
// BLOCK_DEFAULTS reste la structure neutre de normalisation (G9-14) — les
// fallbacks FR n'apparaissent que sur une ligne corrompue, jamais a la creation.
function localizedSeed(type) {
  const base = JSON.parse(JSON.stringify(BLOCK_DEFAULTS[type] || {}))
  const t = i18n.global.t
  const tag = { fr: 'fr-FR', en: 'en-US', ko: 'ko-KR' }[i18n.global.locale.value] || 'fr-FR'
  const months = (n) => Array.from({ length: n }, (_, i) => new Date(2026, i, 1).toLocaleDateString(tag, { month: 'short' }))
  if (type === 'chart_bar') { base.labels = months(3); base.datasets[0].label = t('copil_sample_series') + ' 1' }
  if (type === 'chart_line') { base.labels = months(4); base.datasets[0].label = t('copil_sample_series') + ' 1' }
  if (type === 'chart_donut') { base.labels = [t('status_healthy'), t('status_watch'), t('status_critical')] }
  return base
}

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}

// G9-14 : un bloc jsonb mal formé en base ne doit JAMAIS planter le rendu
// (builder / preview / present / export PPTX lisent tous copil.blocks).
// Normalisation au chargement : data reconstruit clé par clé depuis
// BLOCK_DEFAULTS[type] — un array attendu reste un array (items objets filtrés),
// un objet reste un objet. Type inconnu → data vide, rendu neutre sans crash.
// Aucune écriture en base : la version saine ne persiste qu'au prochain save utilisateur.
function normalizeBlockData(type, data) {
  const defaults = BLOCK_DEFAULTS[type]
  if (!defaults) return {}
  const src = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {}
  const out = {}
  for (const [k, dv] of Object.entries(defaults)) {
    const v = src[k]
    if (Array.isArray(dv)) {
      let arr = Array.isArray(v) ? v : JSON.parse(JSON.stringify(dv))
      // arrays d'objets (kpis, datasets, rows, events…) : purge les items non-objets (null, string…)
      if (dv.length && typeof dv[0] === 'object') arr = arr.filter(x => x && typeof x === 'object')
      out[k] = arr
    } else if (dv && typeof dv === 'object') {
      out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? v : JSON.parse(JSON.stringify(dv))
    } else {
      out[k] = v !== undefined ? v : dv
    }
  }
  // conserve les clés posées par l'app hors defaults (jamais bloquantes au rendu)
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
      date: localDateKey(),   // DATE-KEY-UTC : jour local, pas jour UTC
      color: partial.color || '#7c3aed',
      presenter: partial.presenter || '',
      lang: partial.lang || i18n.global.locale.value || 'fr',   // COPIL-I18N : langue du deck = langue de l'utilisateur
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

  // D-14 : toute mutation rend {success}/{error} — un « ✓ » à l'écran n'a le droit
  // d'exister qu'après une réponse Supabase OK (withWrite = timeout G9-13 + toast).
  // COPIL-RACE : le store est mis à jour AVANT l'écriture (ce que le CSM voit fait
  // foi), l'écriture passe par la file séquencée du COPIL.
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
      title: orig.title + ' ' + i18n.global.t('copil_copy_suffix'),   // COPIL-I18N : plus de « (copie) » en dur
      subtitle: orig.subtitle,
      client_id: orig.clientId || null,                              // conservé (audit 03/09)
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

  // D-14 : écriture optimiste assumée (l'UI reste fluide) et revertée si Supabase
  // refuse sur les gestes de STRUCTURE (ajout, suppression, réordonnancement) —
  // plus aucun throw non rattrapé. Les ÉDITIONS de champ (updateBlock) ne sont
  // pas revertées : la saisie du CSM reste à l'écran, withWrite a toasté (COPIL-SAVE
  // état 5). Toutes passent par la file séquencée du COPIL (COPIL-RACE).
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

  // ── Images téléversées (COPIL-IMAGE-EXPORT, D1①) ──────────────────────────
  // Bucket privé `copil-media`, objet `<user_id>/<copil_id>/<block_id>.<ext>`,
  // RLS par préfixe utilisateur (migration 20260903100000). Le bloc stocke le
  // CHEMIN ; l'URL signée (1 h) est résolue à la lecture et mise en cache ici.
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

  // Rend {success, path} ou {error: code} — codes traduits par la vue (copil_image_*)
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
    // l'ancien objet (autre extension) est retiré ; l'échec n'est pas bloquant
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

  // Objet Storage → data URL (export PPTX). Rend null en cas d'échec (CORS, expiré).
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
