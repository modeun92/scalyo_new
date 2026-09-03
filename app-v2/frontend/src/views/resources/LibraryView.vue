<template>
  <div class="library-view">
    <div class="lib-header">
      <h1>📚 {{ t('nav.library') }}</h1>
      <p class="lib-sub">{{ t('nav.librarySub') }}</p>
    </div>
    <div class="lib-toolbar">
      <div class="lib-cats">
        <button v-for="c in cats" :key="c.key" class="ftab" :class="{ active: activeCat === c.key }" @click="activeCat = c.key">{{ c.label }}</button>
      </div>
      <div class="lib-filters">
        <select v-model="activeLevel" class="fsel">
          <option value="all">{{ t('res_all_levels') }}</option>
          <option value="beginner">{{ t('res_beginner') }}</option>
          <option value="intermediate">{{ t('res_intermediate') }}</option>
          <option value="expert">{{ t('res_expert') }}</option>
        </select>
        <div class="search-box"><span>🔍</span><input v-model="search" :placeholder="t('res_search_ph')" /></div>
      </div>
    </div>
    <div class="lib-grid">
      <div v-for="r in filtered" :key="r.id" class="lib-card" @click="selected = r">
        <div class="lc-top">
          <span class="lc-icon">{{ r.icon }}</span>
          <div class="lc-body">
            <strong>{{ t(r.titleKey) }}</strong>
            <p>{{ t(r.descKey) }}</p>
            <div class="lc-meta">
              <span class="lc-cat">{{ t('res_cat_' + r.category) }}</span>
              <span class="lc-level" :class="r.level">{{ levelLabel(r.level) }}</span>
              <span class="lc-dur">{{ r.duration }}</span>
            </div>
          </div>
          <span class="lc-chevron">▸</span>
        </div>
      </div>
    </div>
    <div v-if="!filtered.length" class="lib-empty">
      <span>📚</span><p>{{ t('res_no_results') }}</p>
    </div>

    <!-- Fiche ressource (popup) -->
    <div v-if="selected" class="lib-overlay" @click.self="selected = null">
      <div class="lib-modal" role="dialog" aria-modal="true">
        <button class="lm-close" @click="selected = null">✕</button>
        <div class="lm-head">
          <span class="lm-icon">{{ selected.icon }}</span>
          <div>
            <h3>{{ t(selected.titleKey) }}</h3>
            <div class="lc-meta">
              <span class="lc-cat">{{ t('res_cat_' + selected.category) }}</span>
              <span class="lc-level" :class="selected.level">{{ levelLabel(selected.level) }}</span>
              <span class="lc-dur">{{ selected.duration }}</span>
            </div>
          </div>
        </div>
        <p class="lm-desc">{{ t(selected.descKey) }}</p>
        <div v-if="selected.content" class="lm-body">
          <div v-for="section in selected.content" :key="section.weekKey" class="lc-section">
            <h4>{{ t(section.weekKey) }}</h4>
            <ul><li v-for="item in section.itemKeys" :key="item">{{ t(item) }}</li></ul>
          </div>
          <div v-if="selected.exerciseKey" class="lc-exercise">
            <strong>📝 {{ t('res_exercise') }}</strong>
            <p>{{ t(selected.exerciseKey) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceStore } from '@/stores/resources'

const { t } = useI18n({ useScope: 'global' })
const store = useResourceStore()
const activeCat = ref('all')
const activeLevel = ref('all')
const search = ref('')
const selected = ref(null)
const onKey = (e) => { if (e.key === 'Escape') selected.value = null }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
const cats = computed(() => [
  { key: 'all', label: t('all') }, { key: 'guide', label: '📘 ' + t('res_cat_guide') }, { key: 'checklist', label: '📋 ' + t('res_cat_checklist') },
  { key: 'framework', label: '🎯 ' + t('res_cat_framework') }, { key: 'script', label: '⚙️ ' + t('res_cat_script') }, { key: 'template', label: '📊 ' + t('res_cat_template') },
])
// Filtering lives here (not in the store) so search matches the RENDERED text (t(key)),
// and results stay reactive to locale changes. Structure is locale-invariant in the store.
const filtered = computed(() => {
  let r = store.resources
  if (activeCat.value !== 'all') r = r.filter(x => x.category === activeCat.value)
  if (activeLevel.value !== 'all') r = r.filter(x => x.level === activeLevel.value)
  const q = search.value.trim().toLowerCase()
  if (q) r = r.filter(x => t(x.titleKey).toLowerCase().includes(q) || t(x.descKey).toLowerCase().includes(q))
  return r
})
function levelLabel(l) { return l === 'beginner' ? t('res_beginner') : l === 'intermediate' ? t('res_intermediate') : t('res_expert') }
</script>

<style scoped>
.library-view { max-width: 1000px; }
.lib-header { margin-bottom: 24px; }
.lib-header h1 { font-size: 1.5rem; font-weight: 800; }
.lib-sub { font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; }
.lib-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.lib-cats { display: flex; gap: 4px; flex-wrap: wrap; }
.ftab { background: var(--bg); border: none; padding: 7px 14px; border-radius: 8px; font-size: 0.78rem; font-weight: 500; color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
.ftab.active { background: var(--purple-bg); color: var(--purple); font-weight: 600; }
.lib-filters { display: flex; gap: 8px; }
.fsel { padding: 7px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.82rem; background: #fff; outline: none; }
.search-box { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 10px; }
.search-box input { border: none; outline: none; padding: 7px 0; font-size: 0.82rem; width: 140px; background: transparent; }
.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.lib-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; transition: all 0.2s; cursor: pointer; }
.lib-card:hover { box-shadow: var(--shadow-sm); }
.lib-overlay { position: fixed; inset: 0; background: rgba(17, 17, 34, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; }
.lib-modal { background: #fff; border-radius: var(--radius-md); box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18); width: 100%; max-width: 640px; max-height: 82vh; overflow-y: auto; padding: 24px; position: relative; }
.lm-close { position: absolute; top: 14px; right: 14px; background: var(--bg); border: none; border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 0.85rem; color: var(--text-muted); }
.lm-close:hover { background: var(--bg-hover); }
.lm-head { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 10px; padding-right: 36px; }
.lm-icon { font-size: 2.2rem; flex-shrink: 0; }
.lm-head h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 6px; }
.lm-desc { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px; }
.lm-body { border-top: 1px solid var(--border-light); padding-top: 16px; }
.lc-top { display: flex; gap: 14px; align-items: flex-start; padding: 20px; cursor: pointer; transition: background 0.15s; }
.lc-top:hover { background: var(--bg-hover); }
.lc-chevron { font-size: 0.8rem; color: var(--text-muted); flex-shrink: 0; margin-top: 4px; }
.lc-content { border-top: 1px solid var(--border-light); padding: 16px 20px 20px 54px; }
.lc-section { margin-bottom: 14px; }
.lc-section h4 { font-size: 0.82rem; font-weight: 700; color: var(--purple); margin-bottom: 6px; }
.lc-section ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
.lc-section li { font-size: 0.8rem; line-height: 1.5; color: var(--text-secondary); padding-left: 14px; position: relative; }
.lc-section li::before { content: '→'; position: absolute; left: 0; color: var(--text-muted); }
.lc-exercise { background: var(--amber-bg); border-radius: var(--radius-sm); padding: 12px; margin-top: 10px; }
.lc-exercise strong { font-size: 0.78rem; display: block; margin-bottom: 4px; }
.lc-exercise p { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; }
.lc-icon { font-size: 2rem; flex-shrink: 0; }
.lc-body { flex: 1; min-width: 0; }
.lc-body strong { font-size: 0.9rem; display: block; margin-bottom: 4px; }
.lc-body p { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 8px; }
.lc-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.lc-cat { font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; background: var(--bg); color: var(--text-muted); text-transform: capitalize; }
.lc-level { font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.lc-level.beginner { background: var(--green-bg); color: var(--green); }
.lc-level.intermediate { background: var(--amber-bg); color: var(--amber); }
.lc-level.expert { background: var(--purple-bg); color: var(--purple); }
.lc-dur { font-size: 0.65rem; color: var(--text-muted); }
.btn-sm-green { background: var(--green); color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; align-self: center; }
.btn-sm-green:hover { background: var(--green-dark); }
.lib-empty { text-align: center; padding: 40px; color: var(--text-muted); }
.lib-empty span { font-size: 2.5rem; display: block; margin-bottom: 12px; }
@media (max-width: 768px) { .lib-grid { grid-template-columns: 1fr; } .lib-toolbar { flex-direction: column; align-items: stretch; } }
</style>
