<template>
  <!-- G9-19/D1 : surface unique — la page /app/chat rend la même implémentation que le
       panneau flottant (ChatPanel/Cp*). L'ancienne implémentation autonome (sidebar,
       composer, formatTime dupliqués, zéro gating de rôle) est supprimée.
       La classe .chat-layout est conservée : AppLayout s'appuie dessus
       (.main-content:has(.chat-layout) { padding: 0 } + hauteur). -->
  <div class="chat-layout">
    <ErrorBoundary>
      <ChatPanel :show-close="false" />
    </ErrorBoundary>
  </div>
</template>

<script setup>
import ChatPanel from '@/components/chat/ChatPanel.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
</script>
