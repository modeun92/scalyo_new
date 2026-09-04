<template>
  <div class="kpis_view">
    <div class="kpis_header">
      <div><h1>📊 {{ t('kpis_title') }}</h1><p class="kpis_sub">{{ t('kpis_subtitle') }}</p></div>
      <button class="button_primary" @click="createNew">{{ t('kpis_new') }}</button>
    </div>

    <AiInsightPanel
      module="copil"
      :title="t('ai_copil_title')"
      :button-label="t('ai_copil_btn')"
      :message="t('ai_copil_prompt')"
      :context="{ copils: store.copils?.length || 0 }"
    />

    <!-- Decks COPIL -->
    <div v-if="store.copils.length" class="copil_grid">
      <div v-for="c in store.copils" :key="c.id" class="copil_card">
        <div class="copil_card_band" :style="{ background: c.color || '#7c3aed' }" />
        <div class="copil_card_body" @click="openBuilder(c.id)">
          <strong class="copil_card_title">{{ c.title || t('copil_untitled') }}</strong>
          <div class="copil_card_meta">
            <span v-if="c.clientName" class="copil_card_client">{{ c.clientName }}</span>
            <span v-if="c.period" class="copil_card_period">{{ c.period }}</span>
          </div>
          <span class="copil_card_blocks">{{ t('copil_blocks_n', { n: (c.blocks || []).length }) }}</span>
        </div>
        <div class="copil_card_actions">
          <button class="cca_button present" @click.stop="present(c.id)" :title="t('copil_present_btn')">▶ {{ t('copil_present_btn') }}</button>
          <button class="cca_button" @click.stop="openBuilder(c.id)" :title="t('copil_edit')">✏️</button>
          <button class="cca_button" @click.stop="duplicate(c.id)" :title="t('copil_duplicate')">⧉</button>
          <button class="cca_button del" @click.stop="remove(c)" :title="t('copil_delete')">🗑️</button>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="kpis_empty">
      <div class="empty_icon">📊</div>
      <h3>{{ t('kpis_empty_title') }}</h3>
      <p>{{ t('kpis_empty_desc') }}</p>
      <button class="button_primary" @click="createNew">{{ t('kpis_create_first') }}</button>
    </div>

    <!-- NO-CONFIRM: deletion confirmed inside the product (ConfirmDialog), never a native confirm() -->
    <ConfirmDialog v-if="toDelete" :title="t('copil_delete_title')" :body="t('copil_delete_body', { title: toDelete.title || t('copil_untitled'), n: (toDelete.blocks || []).length })" :cta="t('cf_delete')" :busy="deleting" @confirm="confirmDelete" @cancel="toDelete = null" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useKpiStore } from '@/stores/kpis'
import AiInsightPanel from '@/components/ai/AiInsightPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const store = useKpiStore()

onMounted(() => { store.loadCopils() })

function createNew() { router.push('/app/kpis/new') }
function openBuilder(id) { router.push('/app/kpis/' + id) }
function present(id) { router.push('/app/kpis/' + id + '/present') }

async function duplicate(id) {
  const newId = await store.duplicateCopil(id)
  if (newId) router.push('/app/kpis/' + newId)
}

// NO-CONFIRM: product modal; the button stays busy during the write (D-14).
const toDelete = ref(null)
const deleting = ref(false)
function remove(c) { toDelete.value = c }
async function confirmDelete() {
  if (!toDelete.value || deleting.value) return
  deleting.value = true
  try { await store.deleteCopil(toDelete.value.id) }
  finally { deleting.value = false; toDelete.value = null }
}
</script>

<style scoped>
.kpis_view { max-width: 1000px; }
.kpis_header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
.kpis_header h1 { font-size: 1.5rem; font-weight: 800; }
.kpis_sub { font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px; }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.button_primary:hover { background: var(--purple-dark); }

.copil_grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.copil_card { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.2s, transform 0.2s; }
.copil_card:hover { box-shadow: 0 6px 24px rgba(0,0,0,0.08); transform: translateY(-2px); }
.copil_card_band { height: 6px; }
.copil_card_body { padding: 16px 18px 10px; cursor: pointer; flex: 1; }
.copil_card_title { font-size: 1.02rem; font-weight: 700; display: block; margin-bottom: 8px; }
.copil_card_meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.copil_card_client { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); background: var(--bg); padding: 2px 10px; border-radius: 6px; }
.copil_card_period { font-size: 0.75rem; color: var(--purple); background: var(--purple-bg); padding: 2px 10px; border-radius: 6px; }
.copil_card_blocks { font-size: 0.72rem; color: var(--text-muted); }
.copil_card_actions { display: flex; align-items: center; gap: 4px; padding: 10px 12px; border-top: 1px solid var(--border-light); }
.cca_button { background: none; border: none; font-size: 0.82rem; padding: 5px 8px; border-radius: 6px; cursor: pointer; opacity: 0.7; transition: all 0.15s; color: var(--text-secondary); }
.cca_button:hover { opacity: 1; background: var(--bg-hover); }
.cca_button.present { opacity: 1; color: var(--purple); font-weight: 600; margin-right: auto; }
.cca_button.present:hover { background: var(--purple-bg); }
.cca_button.del:hover { background: var(--red-bg); }

.kpis_empty { text-align: center; padding: 60px 20px; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); }
.empty_icon { font-size: 3rem; margin-bottom: 16px; }
.kpis_empty h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; }
.kpis_empty p { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 20px; }
</style>
