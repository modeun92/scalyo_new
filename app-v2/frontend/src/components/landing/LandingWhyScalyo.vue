<template>
  <section class="why-section anim-section" data-anim="fade-up">
    <div class="container">
      <div class="section-header">
        <h2>{{ t('sell_title') }}</h2>
        <p class="section-sub">{{ t('sell_subtitle') }}</p>
      </div>
      <div class="sell-grid">
        <div v-for="(s, i) in sellingPoints" :key="i" class="sell-card">
          <span class="sell-icon emoji-3d">{{ s.icon }}</span>
          <h4>{{ s.label }}</h4>
          <p>{{ s.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  sellingPoints: { type: Array, required: true },
  t:             { type: Function, required: true }
})
</script>