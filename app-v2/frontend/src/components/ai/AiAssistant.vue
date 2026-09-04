<template>
  <div v-if="showAgent" class="ai_agent">
    <button class="ai_fab" @click="open = !open" :title="t('ai_agent_title')">
      <span class="ai_fab_icon">🧠</span>
      <span v-if="ctxLabel" class="ai_fab_context">{{ ctxLabel }}</span>
    </button>

    <transition name="ai_slide">
      <div v-if="open" class="ai_panel">
        <div class="ai_header">
          <div class="ai_header_left">
            <span class="ai_header_icon">🧠</span>
            <div>
              <strong>{{ t('ai_agent_name') }}</strong>
              <span class="ai_context_badge">{{ ctxLabel }}</span>
            </div>
          </div>
          <button class="ai_new_conv" @click="newConversation" :title="t('ai_new_conv')">+</button>
          <button class="ai_close" @click="open = false">✕</button>
        </div>

        <div class="ai_messages" ref="msgsRef">
          <div v-if="!messages.length" class="ai_welcome">
            <p>{{ t('ai_agent_welcome') }}</p>
            <div class="ai_suggestions">
              <button v-for="s in suggestions" :key="s" class="ai_suggestion" @click="send(t(s))">{{ t(s) }}</button>
            </div>
          </div>
          <div v-for="msg in messages" :key="msg.id" class="ai_message" :class="msg.role">
            <div class="ai_message_avatar">{{ msg.role === 'user' ? '👤' : '🧠' }}</div>
            <div class="ai_message_body" v-html="fmt(msg.content)" />
          </div>
          <div v-if="thinking" class="ai_message assistant">
            <div class="ai_message_avatar">🧠</div>
            <div class="ai_message_body"><div class="ai_dots"><span /><span /><span /></div></div>
          </div>
        </div>

        <div class="ai_input_row">
          <input
            v-model="input"
            :placeholder="t('ai_agent_placeholder')"
            @keydown.enter="send(input)"
            :disabled="thinking"
          />
          <button class="ai_send" @click="send(input)" :disabled="!input.trim() || thinking">→</button>
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
  'tasks-stats':     { module: 'matrix',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-kanban':    { module: 'matrix',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-planning':  { module: 'matrix',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-projects':  { module: 'matrix',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-priorities':{ module: 'matrix',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
  'tasks-team':      { module: 'matrix',   ctx: 'ai_ctx_tasks',       sugs: ['ai_sug_task1', 'ai_sug_task2'] },
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
.ai_agent { position: fixed; bottom: 24px; right: 88px; z-index: 401; }
.ai_fab { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 28px; background: linear-gradient(135deg, #7c3aed, #a78bfa); color: #fff; border: none; font-size: 0.85rem; font-weight: 600; box-shadow: 0 4px 20px rgba(124,58,237,0.35); cursor: pointer; transition: all 0.2s; }
.ai_fab:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(124,58,237,0.45); }
.ai_fab_icon { font-size: 1.2rem; }
.ai_fab_context { font-size: 0.75rem; opacity: 0.9; }

.ai_panel { position: absolute; bottom: 56px; right: 0; width: 400px; height: 520px; background-color: var(--bg-card); border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,0.15); border: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.ai_header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-light); background: linear-gradient(135deg, #f5f3ff, #ede9fe); }
.ai_header_left { display: flex; align-items: center; gap: 10px; }
.ai_header_icon { font-size: 1.4rem; }
.ai_header_left strong { font-size: 0.9rem; display: block; }
.ai_context_badge { font-size: 0.7rem; color: var(--purple); font-weight: 600; }
.ai_new_conv {
  background: none; border: 1px solid var(--border-color, #e0e0e0); color: var(--text-secondary, #888);
  width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 18px; line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.ai_new_conv:hover { background: var(--bg-hover, #f0f0f0); color: var(--text-primary, #333); }
.ai_close { background: none; border: none; font-size: 1rem; color: var(--text-muted); cursor: pointer; padding: 4px 8px; }

.ai_messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.ai_welcome { text-align: center; padding: 20px 0; }
.ai_welcome p { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px; }
.ai_suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ai_suggestion { padding: 8px 14px; border-radius: 20px; border: 1px solid var(--border); background-color: var(--bg-card); font-size: 0.78rem; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.ai_suggestion:hover { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); }

.ai_message { display: flex; gap: 8px; }
.ai_message.user { flex-direction: row-reverse; }
.ai_message_avatar { font-size: 1.1rem; flex-shrink: 0; margin-top: 2px; }
.ai_message_body { padding: 10px 14px; border-radius: 14px; font-size: 0.84rem; line-height: 1.55; max-width: 80%; word-break: break-word; }
.ai_message.user .ai_message_body { background: var(--purple); color: #fff; border-bottom-right-radius: 4px; }
.ai_message.assistant .ai_message_body { background: var(--bg); color: var(--text); border-bottom-left-radius: 4px; }
.ai_message_body :deep(strong) { font-weight: 700; }

.ai_dots { display: flex; gap: 4px; padding: 4px 0; }
.ai_dots span { width: 6px; height: 6px; background: var(--purple); border-radius: 50%; animation: ai-bounce 1.4s infinite; }
.ai_dots span:nth-child(2) { animation-delay: 0.2s; }
.ai_dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes ai-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }

.ai_input_row { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border-light); }
.ai_input_row input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 24px; font-size: 0.84rem; outline: none; transition: border-color 0.15s; }
.ai_input_row input:focus { border-color: var(--purple); }
.ai_send { width: 38px; height: 38px; border-radius: 50%; background: var(--purple); color: #fff; border: none; font-size: 1rem; cursor: pointer; transition: opacity 0.15s; display: flex; align-items: center; justify-content: center; }
.ai_send:disabled { opacity: 0.4; cursor: not-allowed; }

.ai_slide-enter-active, .ai_slide-leave-active { transition: all 0.25s ease; }
.ai_slide-enter-from, .ai_slide-leave-to { opacity: 0; transform: translateY(12px) scale(0.95); }

@media (max-width: 768px) {
  .ai_agent { bottom: 88px; right: 16px; }
  .ai_panel { position: fixed; inset: 0; width: 100%; height: 100%; border-radius: 0; bottom: auto; right: auto; }
  .ai_fab_context { display: none; }
}
</style>
