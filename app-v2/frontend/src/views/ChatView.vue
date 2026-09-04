<template>
  <!-- G9-19/D1: a single surface — the /app/chat page renders the same implementation as the
       floating panel (ChatPanel/Cp*). The old standalone implementation (duplicated sidebar,
       composer, formatTime, zero role gating) has been removed.
       The .chat-layout class is kept: AppLayout relies on it
       (.main-content:has(.chat-layout) { padding: 0 } + height). -->
  <div class="chat_layout">
    <ErrorBoundary>
      <ChatPanel :show-close="false" />
    </ErrorBoundary>
  </div>
</template>

<script setup>
import ChatPanel from '@/components/chat/ChatPanel.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>
