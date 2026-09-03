<template>
  <div class="nova-container">
    <div class="nova-header">
      <h3>💚 {{ t('wb_nova_title') }}</h3>
      <button v-if="store.novaMessages.length" @click="store.clearNovaHistory()" style="background:none;border:none;color:var(--text-muted);font-size:0.75rem;cursor:pointer;">{{ t('wb_nova_clear') }}</button>
    </div>
    <div class="nova-messages" ref="messagesEl">
      <div v-for="msg in store.novaMessages" :key="msg.id" class="nova-msg" :class="msg.role">
        <div class="nova-msg-av">{{ msg.role === 'user' ? '👤' : '💚' }}</div>
        <div class="nova-msg-body" v-html="sanitizeHtml(msg.content === '__error__' ? t('wb_nova_error') : msg.content)" />
      </div>
      <div v-if="store.novaLoading" class="nova-msg assistant">
        <div class="nova-msg-av">💚</div>
        <div class="nova-msg-body"><div class="nova-thinking"><span /><span /><span /></div></div>
      </div>
    </div>
    <div v-if="!store.novaMessages.length && !store.novaLoading" style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;">
      <button v-for="s in suggestions" :key="s" class="nova-sug" @click="send(t(s))">{{ t(s) }}</button>
    </div>
    <div class="nova-input">
      <input v-model="input" :placeholder="t('wb_nova_placeholder')" @keydown.enter="send(input)" :disabled="store.novaLoading" />
      <button class="nova-send" @click="send(input)" :disabled="!input.trim() || store.novaLoading">➡</button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWellbeingStore } from '@/stores/wellbeing'
import { sanitizeHtml } from '@/utils/sanitize'

const { t, locale } = useI18n({ useScope: 'global' })
const store = useWellbeingStore()
const input = ref('')
const messagesEl = ref(null)

const suggestions = ['wb_sug_stress', 'wb_sug_sleep', 'wb_sug_boundaries', 'wb_sug_motivation']

async function send(msg) {
  if (!msg?.trim()) return
  input.value = ''
  await store.sendNova(msg, locale.value)
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

watch(() => store.novaMessages.length, async () => {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
})
</script>
