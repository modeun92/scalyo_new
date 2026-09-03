<template>
  <div v-if="showAgent" class="ai-agent">
    <button class="ai-fab" @click="open = !open" :title="t('ai_agent_title')">
      <span class="ai-fab-icon">🧠</span>
      <span v-if="ctxLabel" class="ai-fab-ctx">{{ ctxLabel }}</span>
    </button>

    <transition name="ai-slide">
      <div v-if="open" class="ai-panel">
        <div class="ai-header">
          <div class="ai-header-left">
            <span class="ai-header-icon">🧠</span>
            <div>
              <strong>{{ t('ai_agent_name') }}</strong>
              <span class="ai-ctx-badge">{{ ctxLabel }}</span>
            </div>
          </div>
          <button class="ai-new-conv" @click="newConversation" :title="t('ai_new_conv')">+</button>
          <button class="ai-close" @click="open = false">✕</button>
        </div>

        <div class="ai-messages" ref="msgsRef">
          <div v-if="!messages.length" class="ai-welcome">
            <p>{{ t('ai_agent_welcome') }}</p>
            <div class="ai-suggestions">
              <button v-for="s in suggestions" :key="s" class="ai-sug" @click="send(t(s))">{{ t(s) }}</button>
            </div>
          </div>
          <div v-for="msg in messages" :key="msg.id" class="ai-msg" :class="msg.role">
            <div class="ai-msg-av">{{ msg.role === 'user' ? '👤' : '🧠' }}</div>
            <div class="ai-msg-body" v-html="fmt(msg.content)" />
          </div>
          <div v-if="thinking" class="ai-msg assistant">
            <div class="ai-msg-av">🧠</div>
            <div class="ai-msg-body"><div class="ai-dots"><span /><span /><span /></div></div>
          </div>
        </div>

        <div class="ai-input-row">
          <input
            v-model="input"
            :placeholder="t('ai_agent_placeholder')"
            @keydown.enter="send(input)"
            :disabled="thinking"
          />
          <button class="ai-send" @click="send(input)" :disabled="!input.trim() || thinking">→</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { askScalyoAI } from '@/utils/askScalyoAI'
import { sanitizeHtml } from '@/utils/sanitize'
import { useProfileStore } from '@/stores/profile'
import { useAiHistoryStore } from '@/stores/aiHistory'

const { t, locale } = useI18n({ useScope: 'global' })
const route = useRoute()
const profileStore = useProfileStore()
const historyStore = useAiHistoryStore()
const currentConvId = ref(null)

const open = ref(false)

// --- AI History ---
onMounted(async () => {
  const mod = route.name || 'dashboard'
  await historyStore.loadConversations(mod)
  const convs = historyStore.conversations
  if (convs.length > 0) {
    currentConvId.value = convs[0].id
    messages.value = convs[0].messages || []
  }
})

async function newConversation() {
  const mod = route.name || 'dashboard'
  const conv = await historyStore.createConversation(mod)
  if (conv) {
    currentConvId.value = conv.id
    messages.value = []
  }
}

async function saveCurrentConversation() {
  if (currentConvId.value) {
    await historyStore.saveConversation(currentConvId.value, messages.value)
  }
}
const input = ref('')
const messages = ref([])
const thinking = ref(false)
const msgsRef = ref(null)

// ── Route-to-module mapping (single source of truth) ──
const HIDDEN_ROUTES = ['coach', 'wellbeing']
const showAgent = computed(() => !HIDDEN_ROUTES.includes(route.name))

const ROUTE_MAP = {
  dashboard:         { module: 'dashboard', ctx: 'ai_ctx_dashboard',   sugs: ['ai_sug_dash1', 'ai_sug_dash2'] },
  portfolio:         { module: 'nova',      ctx: 'ai_ctx_portfolio',   sugs: ['ai_sug_port1', 'ai_sug_port2'] },
  satisfaction:      { module: 'nova',      ctx: 'ai_ctx_satisfaction', sugs: ['ai_sug_sat1', 'ai_sug_sat2'] },
  playbooks:         { module: 'playbook',  ctx: 'ai_ctx_playbooks',   sugs: ['ai_sug_pb1', 'ai_sug_pb2'] },
  kpis:              { module: 'copil',     ctx: 'ai_ctx_kpis',        sugs: ['ai_sug_kpi1', 'ai_sug_kpi2'] },
  okr:               { module: 'dashboard', ctx: 'ai_ctx_okr',         sugs: ['ai_sug_okr1', 'ai_sug_okr2'] },
  roadmap:           { module: 'dashboard', ctx: 'ai_ctx_roadmap',     sugs: ['ai_sug_road1', 'ai_sug_road2'] },
  'email-studio':    { module: 'email',     ctx: 'ai_ctx_email',       sugs: ['ai_sug_email1', 'ai_sug_email2'] },
  import:            { module: 'import',    ctx: 'ai_ctx_import',      sugs: ['ai_sug_imp1', 'ai_sug_imp2'] },
  'tasks-stats':     { module: 'matrice',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-kanban':    { module: 'matrice',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-planning':  { module: 'matrice',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-projects':  { module: 'matrice',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-priorities':{ module: 'matrice',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-team':      { module: 'matrice',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  workload:          { module: 'dashboard', ctx: 'ai_ctx_workload',    sugs: ['ai_sug_wl1', 'ai_sug_wl2'] },
  quotes:            { module: 'email',     ctx: 'ai_ctx_quotes',      sugs: ['ai_sug_qt1', 'ai_sug_qt2'] },
  manager:           { module: 'dashboard', ctx: 'ai_ctx_manager',     sugs: ['ai_sug_mgr1', 'ai_sug_mgr2'] },
}

const DEFAULT_CTX = { module: 'coach', ctx: 'ai_ctx_default', sugs: ['ai_sug_def1', 'ai_sug_def2'] }

const currentCtx = computed(() => ROUTE_MAP[route.name] || DEFAULT_CTX)
const ctxLabel = computed(() => t(currentCtx.value.ctx))
const suggestions = computed(() => currentCtx.value.sugs)

// Reset messages when page changes
watch(() => route.name, () => { messages.value = [] })

// Auto-scroll
watch(messages, () => { nextTick(() => { if (msgsRef.value) msgsRef.value.scrollTop = msgsRef.value.scrollHeight }) }, { deep: true })

function fmt(text) {
  const html = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  return sanitizeHtml(html)
}

async function send(text) {
  if (!text?.trim() || thinking.value) return
  const userText = text.trim()
  messages.value.push({ id: Date.now(), role: 'user', content: userText })
  input.value = ''
  thinking.value = true
  try {
    const result = await askScalyoAI({
      module: currentCtx.value.module,
      message: userText,
      context: { userProfile: profileStore.toAIContext() },
      history: messages.value.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
      lang: locale.value || 'fr',
    })
    messages.value.push({ id: Date.now() + 1, role: 'assistant', content: result.response || result.reply || result.content || t('ai_agent_error') })
  } catch {
    messages.value.push({ id: Date.now() + 1, role: 'assistant', content: t('ai_agent_error') })
  }
  thinking.value = false
}
</script>

<style scoped>
.ai-agent { position: fixed; bottom: 24px; right: 88px; z-index: 401; }
.ai-fab { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 28px; background: linear-gradient(135deg, #7c3aed, #a78bfa); color: #fff; border: none; font-size: 0.85rem; font-weight: 600; box-shadow: 0 4px 20px rgba(124,58,237,0.35); cursor: pointer; transition: all 0.2s; }
.ai-fab:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(124,58,237,0.45); }
.ai-fab-icon { font-size: 1.2rem; }
.ai-fab-ctx { font-size: 0.75rem; opacity: 0.9; }

.ai-panel { position: absolute; bottom: 56px; right: 0; width: 400px; height: 520px; background-color: var(--bg-card); border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,0.15); border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.ai-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-light); background: linear-gradient(135deg, #f5f3ff, #ede9fe); }
.ai-header-left { display: flex; align-items: center; gap: 10px; }
.ai-header-icon { font-size: 1.4rem; }
.ai-header-left strong { font-size: 0.9rem; display: block; }
.ai-ctx-badge { font-size: 0.7rem; color: var(--purple); font-weight: 600; }
.ai-new-conv {
  background: none; border: 1px solid var(--border-color, #e0e0e0); color: var(--text-secondary, #888);
  width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.ai-new-conv:hover { background: var(--bg-hover, #f0f0f0); color: var(--text-primary, #333); }
.ai-close { background: none; border: none; font-size: 1rem; color: var(--text-muted); cursor: pointer; padding: 4px 8px; }

.ai-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.ai-welcome { text-align: center; padding: 20px 0; }
.ai-welcome p { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px; }
.ai-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ai-sug { padding: 8px 14px; border-radius: 20px; border: 1px solid var(--border); background-color: var(--bg-card); font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.ai-sug:hover { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); }

.ai-msg { display: flex; gap: 8px; }
.ai-msg.user { flex-direction: row-reverse; }
.ai-msg-av { font-size: 1.1rem; flex-shrink: 0; margin-top: 2px; }
.ai-msg-body { padding: 10px 14px; border-radius: 14px; font-size: 0.84rem; line-height: 1.55; max-width: 80%; word-break: break-word; }
.ai-msg.user .ai-msg-body { background: var(--purple); color: #fff; border-bottom-right-radius: 4px; }
.ai-msg.assistant .ai-msg-body { background: var(--bg); color: var(--text); border-bottom-left-radius: 4px; }
.ai-msg-body :deep(strong) { font-weight: 700; }

.ai-dots { display: flex; gap: 4px; padding: 4px 0; }
.ai-dots span { width: 6px; height: 6px; background: var(--purple); border-radius: 50%; animation: ai-bounce 1.4s infinite; }
.ai-dots span:nth-child(2) { animation-delay: 0.2s; }
.ai-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }

.ai-input-row { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border-light); }
.ai-input-row input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 24px; font-size: 0.84rem; outline: none; transition: border-color 0.15s; }
.ai-input-row input:focus { border-color: var(--purple); }
.ai-send { width: 38px; height: 38px; border-radius: 50%; background: var(--purple); color: #fff; border: none; font-size: 1rem; cursor: pointer; transition: opacity 0.15s; display: flex; align-items: center; justify-content: center; }
.ai-send:disabled { opacity: 0.4; cursor: not-allowed; }

.ai-slide-enter-active, .ai-slide-leave-active { transition: all 0.25s ease; }
.ai-slide-enter-from, .ai-slide-leave-to { opacity: 0; transform: translateY(12px) scale(0.95); }

@media (max-width: 768px) {
  .ai-agent { bottom: 88px; right: 16px; }
  .ai-panel { position: fixed; inset: 0; width: 100%; height: 100%; border-radius: 0; bottom: auto; right: auto; }
  .ai-fab-ctx { display: none; }
}
</style>
