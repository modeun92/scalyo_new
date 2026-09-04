<template>
  <aside class="chat_panel_sidebar">
    <div class="chat_panel_sidebar_header">
      <span class="chat_panel_sidebar_title">{{ t('chat_channels') }}</span>
      <button v-if="canCreateChannel" class="chat_panel_sidebar_add" :title="t('chat_add_channel')" @click="$emit('create-channel')">+</button>
      <button v-if="showClose" class="chat_panel_sidebar_close" @click="$emit('close')">✕</button>
    </div>

    <div class="chat_panel_sidebar_list">
      <div
        v-for="ch in channelList"
        :key="ch.id"
        class="chat_panel_sidebar_item"
        :class="{ active: store.activeChannel === ch.id }"
        @click="$emit('select', ch.id)"
      >
        <span class="chat_panel_ch_icon">#</span>
        <span class="chat_panel_ch_name">{{ ch.name }}</span>
        <span v-if="store.unreadCounts[ch.id]" class="chat_panel_badge">{{ store.unreadCounts[ch.id] }}</span>
      </div>
    </div>

    <!-- DM contract 13/07 (replaces the D2/G9-19 decision): real 1-to-1 DMs,
         type='dm' channels + participant RLS. List = members of the org (RPC get_org_member_names). -->
    <div v-if="dmMembers.length" class="chat_panel_sidebar_section">{{ t('chat_direct') }}</div>
    <div v-if="dmMembers.length" class="chat_panel_sidebar_list chat_panel_dm_list">
      <div
        v-for="m in dmMembers"
        :key="m.id"
        class="chat_panel_sidebar_item"
        :class="{ active: activeDmUser === m.id }"
        @click="$emit('open-dm', m.id)"
      >
        <span class="chat_panel_dm_avatar">{{ m.name.charAt(0) }}</span>
        <span class="chat_panel_ch_name">{{ m.name }}</span>
        <span v-if="dmUnread(m.id)" class="chat_panel_badge">{{ dmUnread(m.id) }}</span>
      </div>
    </div>

    <div class="chat_panel_sidebar_footer">
      <span class="chat_panel_user_dot"></span>
      <span class="chat_panel_user_name">{{ userName }}</span>
      <span class="chat_panel_user_status">{{ t('chat_online') }}</span>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'

defineEmits(['select', 'create-channel', 'close', 'open-dm'])
defineProps({ showClose: { type: Boolean, default: true } })

const { t } = useI18n()
const store = useChatStore()
const authStore = useAuthStore()

const channelList = computed(() => store.channels.filter(c => c.type === 'channel'))
const userName = computed(() => authStore.profile?.first_name || (authStore.user?.email || '').split('@')[0] || '')
const canCreateChannel = computed(() => {
  const role = authStore.profile?.org_role
  return role === 'owner' || role === 'admin'
})

// DM contract 13/07: members of the org (excluding oneself), sorted by first name
const dmMembers = computed(() => {
  const me = authStore.user?.id
  return Object.entries(store.memberNames)
    .filter(([id]) => id !== me)
    .map(([id, name]) => ({ id, name }))
    .sort((x, y) => x.name.localeCompare(y.name))
})
const activeDmUser = computed(() => {
  const ch = store.channels.find(c => c.id === store.activeChannel)
  return ch && ch.type === 'dm' ? store.dmPartnerId(ch) : null
})
function dmUnread(userId) {
  const ch = store.dmChannelFor(userId)
  return ch ? (store.unreadCounts[ch.id] || 0) : 0
}
</script>

<style scoped>
.chat_panel_sidebar { width: 220px; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: var(--bg); }
.chat_panel_sidebar_header { display: flex; align-items: center; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--border-light); }
.chat_panel_sidebar_title { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
.chat_panel_sidebar_add { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-white); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
.chat_panel_sidebar_add:hover { background: var(--bg-hover); }
.chat_panel_sidebar_close { background: none; border: none; cursor: pointer; font-size: 13px; color: var(--text-muted); padding: 2px; }
.chat_panel_sidebar_section { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); padding: 12px 14px 4px; letter-spacing: 0.5px; }
.chat_panel_sidebar_list { display: flex; flex-direction: column; }
.chat_panel_sidebar_item { display: flex; align-items: center; gap: 8px; padding: 6px 14px; cursor: pointer; transition: background 0.12s; }
.chat_panel_sidebar_item:hover { background: var(--bg-hover); }
.chat_panel_sidebar_item.active { background: var(--purple-bg); }
.chat_panel_ch_icon { font-size: 14px; color: var(--text-muted); width: 18px; text-align: center; }
.chat_panel_ch_name { font-size: 13px; color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat_panel_sidebar_item.active .chat_panel_ch_name { color: var(--purple); font-weight: 500; }
.chat_panel_badge { background: var(--purple); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center; }
.chat_panel_sidebar_section { padding: 12px 14px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
.chat_panel_dm_list { flex: 0 0 auto; }
.chat_panel_dm_avatar { width: 18px; height: 18px; border-radius: 50%; background: #ede9fe; color: #7c3aed; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chat_panel_sidebar_footer { margin-top: auto; padding: 10px 14px; border-top: 1px solid var(--border-light); display: flex; align-items: center; gap: 6px; }
.chat_panel_user_dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.chat_panel_user_name { font-size: 12px; font-weight: 500; color: var(--text); }
.chat_panel_user_status { font-size: 11px; color: var(--text-muted); }
</style>
