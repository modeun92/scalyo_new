<template>
  <section class="stats-section anim-section" data-anim="fade-up">
    <div class="container">
      <div class="stats-grid">
        <div v-for="(s, i) in statsData" :key="i" class="stat-card">
          <span class="stat-emoji emoji-3d">{{ s.icon }}</span>
          <div class="stat-number">{{ s.n }}</div>
          <div class="stat-label">{{ s.l }}</div>
          <div class="stat-note">{{ s.s }}</div>
        </div>
      </div>
      <p v-if="note" class="stats-note">{{ note }}</p>
    </div>
  </section>
</template>

<script setup>
defineProps({
  statsData: { type: Array, required: true },
  note: { type: String, default: '' }
})
</script>

<style scoped>
.stats-note {
  margin: 1.75rem auto 0;
  max-width: 62ch;
  text-align: center;
  font-size: 0.8125rem;
  line-height: 1.6;
  opacity: 0.55;
}
</style>