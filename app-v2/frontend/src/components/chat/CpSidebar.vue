<template>
  <aside class="cp-sidebar">
    <div class="cp-sidebar-header">
      <span class="cp-sidebar-title">{{ t('chat_channels') }}</span>
      <button v-if="canCreateChannel" class="cp-sidebar-add" :title="t('chat_add_channel')" @click="$emit('create-channel')">+</button>
      <button v-if="showClose" class="cp-sidebar-close" @click="$emit('close')">✕</button>
    </div>

    <div class="cp-sidebar-list">
      <div
        v-for="ch in channelList"
        :key="ch.id"
        class="cp-sidebar-item"
        :class="{ active: store.activeChannel === ch.id }"
        @click="$emit('select', ch.id)"
      >
        <span class="cp-ch-icon">#</span>
        <span class="cp-ch-name">{{ ch.name }}</span>
        <span v-if="store.unreadCounts[ch.id]" class="cp-badge">{{ store.unreadCounts[ch.id] }}</span>
      </div>
    </div>

    <!-- Contrat DM 13/07 (remplace la décision D2/G9-19) : DM 1-à-1 réels,
         canaux type='dm' + RLS participants. Liste = membres de l'org (RPC get_org_member_names). -->
    <div v-if="dmMembers.length" class="cp-sidebar-section">{{ t('chat_direct') }}</div>
    <div v-if="dmMembers.length" class="cp-sidebar-list cp-dm-list">
      <div
        v-for="m in dmMembers"
        :key="m.id"
        class="cp-sidebar-item"
        :class="{ active: activeDmUser === m.id }"
        @click="$emit('open-dm', m.id)"
      >
        <span class="cp-dm-avatar">{{ m.name.charAt(0) }}</span>
        <span class="cp-ch-name">{{ m.name }}</span>
        <span v-if="dmUnread(m.id)" class="cp-badge">{{ dmUnread(m.id) }}</span>
      </div>
    </div>

    <div class="cp-sidebar-footer">
      <span class="cp-user-dot"></span>
      <span class="cp-user-name">{{ userName }}</span>
      <span class="cp-user-status">{{ t('chat_online') }}</span>
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

// Contrat DM 13/07 : membres de l'org (hors soi), triés par prénom
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
.cp-sidebar { width: 220px; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: var(--bg); }
.cp-sidebar-header { display: flex; align-items: center; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--border-light); }
.cp-sidebar-title { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
.cp-sidebar-add { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-white); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
.cp-sidebar-add:hover { background: var(--bg-hover); }
.cp-sidebar-close { background: none; border: none; cursor: pointer; font-size: 13px; color: var(--text-muted); padding: 2px; }
.cp-sidebar-section { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); padding: 12px 14px 4px; letter-spacing: 0.5px; }
.cp-sidebar-list { display: flex; flex-direction: column; }
.cp-sidebar-item { display: flex; align-items: center; gap: 8px; padding: 6px 14px; cursor: pointer; transition: background 0.12s; }
.cp-sidebar-item:hover { background: var(--bg-hover); }
.cp-sidebar-item.active { background: var(--purple-bg); }
.cp-ch-icon { font-size: 14px; color: var(--text-muted); width: 18px; text-align: center; }
.cp-ch-name { font-size: 13px; color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-sidebar-item.active .cp-ch-name { color: var(--purple); font-weight: 500; }
.cp-badge { background: var(--purple); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center; }
.cp-sidebar-section { padding: 12px 14px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
.cp-dm-list { flex: 0 0 auto; }
.cp-dm-avatar { width: 18px; height: 18px; border-radius: 50%; background: #ede9fe; color: #7c3aed; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cp-sidebar-footer { margin-top: auto; padding: 10px 14px; border-top: 1px solid var(--border-light); display: flex; align-items: center; gap: 6px; }
.cp-user-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.cp-user-name { font-size: 12px; font-weight: 500; color: var(--text); }
.cp-user-status { font-size: 11px; color: var(--text-muted); }
</style>
