<template>
  <section class="stats_section anim_section" data-anim="fade-up">
    <div class="container">
      <div class="stats_grid">
        <div v-for="(s, i) in statsData" :key="i" class="stat_card">
          <span class="stat_emoji emoji_3d">{{ s.icon }}</span>
          <div class="stat_number">{{ s.n }}</div>
          <div class="stat_label">{{ s.l }}</div>
          <div class="stat_note">{{ s.s }}</div>
        </div>
      </div>
      <p v-if="note" class="stats_note">{{ note }}</p>
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
.stats_note {
  margin: 1.75rem auto 0;
  max-width: 62ch;
  text-align: center;
  font-size: 0.8125rem;
  line-height: 1.6;
  opacity: 0.55;
}
</style>