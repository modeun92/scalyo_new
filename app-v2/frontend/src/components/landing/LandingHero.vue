<template>
  <section class="hero">
    <div class="hero-glow" />
    <div class="container hero-content anim-section" data-anim="fade-up">
      <div class="hero-badge">
        <span class="badge-dot" />
        {{ t('hero_badge') }}
      </div>

      <h1 class="hero-title" v-html="t('hero_h1')"></h1>

      <p class="hero-sub">{{ t('hero_sub') }}</p>

      <div class="hero-ctas">
        <a href="#pricing" class="btn-primary lg glow-btn" @click.prevent="scrollTo('pricing')">{{ t('cta_free_14') }}</a>
        <a href="#pricing" class="btn-outline lg" @click.prevent="scrollTo('pricing')">{{ t('see_pricing') }}</a>
      </div>

      <div class="proof-row">
        <span class="proof-item">✓ {{ t('proof_14d') }}</span>
        <span class="proof-item">✓ {{ t('proof_rgpd') }}</span>
        <span class="proof-item">✓ {{ t('proof_support') }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  appUrl: { type: String, default: '' },
  t:      { type: Function, required: true }
})

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}
</script>