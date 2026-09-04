<template>
  <section class="why_section anim_section" data-anim="fade-up">
    <div class="container">
      <div class="section_header">
        <h2>{{ t('sell_title') }}</h2>
        <p class="section_sub">{{ t('sell_subtitle') }}</p>
      </div>
      <div class="sell_grid">
        <div v-for="(s, i) in sellingPoints" :key="i" class="sell_card">
          <span class="sell_icon emoji_3d">{{ s.icon }}</span>
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