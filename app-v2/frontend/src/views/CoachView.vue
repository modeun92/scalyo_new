<template>
  <div class="coach_view">
    <div class="coach_header">
      <div><h1>🤖 {{ t('coach_title') }}</h1></div>
      <span class="coach_counter">{{ coachUsed }} / {{ coachQuota }} {{ t('coach_counter') }}</span>
    </div>
    <div class="coach_chat">
      <div class="chat_messages" ref="chatRef">
        <div v-if="!messages.length" class="chat_welcome">
          <div class="coach_window_avatar">🤖</div>
          <div class="coach_window_body">
            <p>{{ t('coach_welcome') }}</p>
            <ul class="coach_window_capabilities">
              <li v-for="i in 6" :key="i"><span class="coach_window_bullet">✦</span> {{ t('coach_cap' + i) }}</li>
            </ul>
          </div>
        </div>
        <div v-for="msg in messages" :key="msg.id" class="chat_message" :class="msg.role">
          <div class="message_avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="message_body">
            <div class="message_text" v-html="formatAiText(msg.content)" />
            <span class="message_time">{{ msg.time }}</span>
          </div>
        </div>
        <div v-if="thinking" class="chat_message assistant">
          <div class="message_avatar">🤖</div>
          <div class="message_body">
            <div class="message_thinking"><span /><span /><span /></div>
          </div>
        </div>
      </div>
      <div v-if="!messages.length" class="chat_suggestions">
        <button v-for="s in suggestions" :key="s" class="sug_button" @click="sendMessage(t(s))">{{ t(s) }}</button>
      </div>
      <div class="chat_input_area">
        <input v-model="input" :placeholder="t('coach_placeholder')" @keydown.enter="sendMessage(input)" :disabled="thinking || quotaExceeded" />
        <button class="send_button" @click="sendMessage(input)" :disabled="!input.trim() || thinking || quotaExceeded">→</button>
      </div>
      <div v-if="quotaExceeded" class="quota_warning">{{ t('coach_quota_exceeded') }}</div>
    </div>
    <!-- NO-CONFIRM: product modal (ConfirmDialog), never a native confirm() -->
    <ConfirmDialog v-if="clearAsked" :title="t('coach_clear_title')" :body="t('coach_clear_confirm')" :cta="t('coach_clear_cta')" :busy="clearing" @confirm="doClearHistory" @cancel="clearAsked = false" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatAiText } from '@/utils/sanitize'
import { askScalyoAI } from '@/utils/askScalyoAI'
import { supabase } from '@/lib/supabase'
import { fmtTime } from '@/lib/formatters'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t, locale } = useI18n({ useScope: 'global' })

const input = ref('')
const messages = ref([])
const thinking = ref(false)
const chatRef = ref(null)
const coachUsed = ref(0)
const coachQuota = ref(35)
const quotaExceeded = computed(() => coachUsed.value >= coachQuota.value)

const suggestions = ['coach_sug1', 'coach_sug2', 'coach_sug3', 'coach_sug4', 'coach_sug5']

// --- Quota from backend ---
async function loadUsage() {
  try {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s?.access_token) return
    const resp = await fetch('/api/usage', {
      headers: { 'Authorization': 'Bearer ' + s.access_token }
    })
    if (!resp.ok) return
    const data = await resp.json()
    if (data.modules?.coach) {
      coachUsed.value = data.modules.coach.used || 0
      coachQuota.value = data.modules.coach.quota || 35
    }
  } catch { /* silent */ }
}

// --- Supabase persistence ---
async function loadMessages() {
  const { data } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('module', 'coach')
    .order('created_at', { ascending: true })
  if (data) {
    messages.value = data.map(m => ({
      id: m.id, role: m.role, content: m.content,
      time: fmtTime(m.created_at), // MIN-C7: time in the app locale
    }))
  }
}

async function saveMessage(role, content) {
  // C-01 : ai_messages.user_id NOT NULL + RLS WITH CHECK (user_id = auth.uid())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) { console.error('[coach] saveMessage: no authenticated user'); return }
  const { error } = await supabase.from('ai_messages').insert({ user_id: user.id, module: 'coach', role, content })
  if (error) console.error('[coach] saveMessage error:', error)
}

onMounted(() => { loadMessages(); loadUsage() })

// LYO-CONTEXT (D2): buildContext() removed — the portfolio context is built
// server-side (context.service.buildRichContext, org-wide RLS, fresh data).
// The old front-end send was dead code: askScalyoAI spread the context at the root of the
// body, while coach.module read body.context, which never existed.

async function sendMessage(text) {
  if (!text?.trim() || thinking.value || quotaExceeded.value) return
  const now = fmtTime()
  const userMsg = { id: Date.now(), role: 'user', content: text.trim(), time: now }
  messages.value.push(userMsg)
  input.value = ''
  thinking.value = true
  await nextTick()
  scrollBottom()
  saveMessage('user', text.trim())
  coachUsed.value++

  try {
    const result = await askScalyoAI({
      module: 'coach',
      message: text.trim(),
      history: messages.value.slice(-10).map(m => ({ role: m.role, content: m.content })),
      lang: locale.value,
    })
    const reply = result.response || result.reply || result.content || t('coach_error')
    messages.value.push({
      id: Date.now() + 1, role: 'assistant', content: reply,
      time: fmtTime(),
    })
    saveMessage('assistant', reply)
  } catch {
    const errMsg = t('coach_error')
    messages.value.push({
      id: Date.now() + 1, role: 'assistant', content: errMsg,
      time: fmtTime(),
    })
    saveMessage('assistant', errMsg)
  }
  thinking.value = false
  await nextTick()
  scrollBottom()
}

function scrollBottom() {
  if (chatRef.value) chatRef.value.scrollTop = chatRef.value.scrollHeight
}

// NO-CONFIRM: the confirmation goes through ConfirmDialog. The Supabase error is read
// ({ error } destructured, MIN-T10): the history only disappears from the screen if the
// deletion actually happened.
const clearAsked = ref(false)
const clearing = ref(false)
function clearHistory() { clearAsked.value = true }
async function doClearHistory() {
  if (clearing.value) return
  clearing.value = true
  try {
    const { error } = await supabase.from('ai_messages').delete().eq('module', 'coach')
    if (error) { console.error('[coach] clearHistory error:', error.message); return }
    messages.value = []
  } finally { clearing.value = false; clearAsked.value = false }
}
</script>

<style scoped>
.coach_view { max-width: 800px; height: calc(100vh - var(--topbar-height) - 48px); display: flex; flex-direction: column; }
.coach_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0; }
.coach_header h1 { font-size: 1.5rem; font-weight: 800; }
.coach_counter { font-size: 0.82rem; color: var(--text-muted); background: var(--bg); padding: 6px 14px; border-radius: 8px; }
.coach_chat { flex: 1; display: flex; flex-direction: column; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.chat_messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.chat_welcome { display: flex; gap: 14px; padding: 20px; background: var(--purple-bg); border-radius: var(--radius-md); }
.coach_window_avatar { font-size: 2rem; flex-shrink: 0; }
.coach_window_body p { font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; }
.coach_window_capabilities { display: flex; flex-direction: column; gap: 6px; }
.coach_window_capabilities li { font-size: 0.82rem; display: flex; align-items: center; gap: 8px; }
.coach_window_bullet { color: var(--purple); font-size: 0.7rem; }
.chat_message { display: flex; gap: 10px; max-width: 85%; }
.chat_message.user { align-self: flex-end; flex-direction: row-reverse; }
.message_avatar { font-size: 1.4rem; flex-shrink: 0; margin-top: 2px; }
.message_text { padding: 12px 16px; border-radius: 16px; font-size: 0.88rem; line-height: 1.6; }
/* LYO-MARKDOWN (29/08): understated styles for the rendered markdown (headings, lists, separators) */
.message_text :deep(h2) { font-size: 1rem; font-weight: 700; margin: 10px 0 4px; }
.message_text :deep(h3) { font-size: 0.95rem; font-weight: 700; margin: 8px 0 4px; }
.message_text :deep(h4) { font-size: 0.9rem; font-weight: 600; margin: 8px 0 2px; }
.message_text :deep(ul), .message_text :deep(ol) { margin: 4px 0 8px; padding-left: 20px; }
.message_text :deep(li) { margin-bottom: 2px; }
.message_text :deep(hr) { border: none; border-top: 1px solid var(--border-light); margin: 10px 0; }
.message_text :deep(code) { background: var(--bg-hover); padding: 1px 5px; border-radius: 4px; font-size: 0.82em; }
.chat_message.user .message_text { background: var(--purple); color: #fff; border-bottom-right-radius: 4px; }
.chat_message.assistant .message_text { background: var(--bg); color: var(--text); border-bottom-left-radius: 4px; }
.message_time { font-size: 0.65rem; color: var(--text-muted); margin-top: 4px; display: block; }
.chat_message.user .message_time { text-align: right; }
.message_thinking { display: flex; gap: 4px; padding: 12px 16px; background: var(--bg); border-radius: 16px; border-bottom-left-radius: 4px; }
.message_thinking span { width: 8px; height: 8px; background: var(--text-muted); border-radius: 50%; animation: think-bounce 1.4s infinite; }
.message_thinking span:nth-child(2) { animation-delay: 0.2s; }
.message_thinking span:nth-child(3) { animation-delay: 0.4s; }
@keyframes think-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
.chat_suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-light); }
.sug_button { background: var(--purple-bg); border: 1px solid var(--purple-border); color: var(--purple); padding: 8px 16px; border-radius: 999px; font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.sug_button:hover { background: var(--purple); color: #fff; }
.chat_input_area { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-light); }
.chat_input_area input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.88rem; outline: none; }
.chat_input_area input:focus { border-color: var(--purple); }
.send_button { background: var(--purple); color: #fff; border: none; border-radius: var(--radius-sm); padding: 10px 18px; font-size: 1.1rem; cursor: pointer; transition: all 0.15s; }
.send_button:hover:not(:disabled) { background: var(--purple-dark); }
.send_button:disabled { opacity: 0.5; cursor: not-allowed; }
.quota_warning { text-align: center; padding: 8px; font-size: 0.78rem; color: var(--danger, #dc2626); background: var(--danger-bg, #fef2f2); border-top: 1px solid var(--danger-border, #fecaca); }
</style>