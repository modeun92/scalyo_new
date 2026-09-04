<template>
  <section class="hero">
    <div class="hero_glow" />
    <div class="container hero_content anim_section" data-anim="fade-up">
      <div class="hero_badge">
        <span class="badge_dot" />
        {{ t('hero_badge') }}
      </div>

      <h1 class="hero_title" v-html="t('hero_h1')"></h1>

      <p class="hero_sub">{{ t('hero_sub') }}</p>

      <div class="hero_ctas">
        <a href="#pricing" class="button_primary large glow_button" @click.prevent="scrollTo('pricing')">{{ t('cta_free_14') }}</a>
        <a href="#pricing" class="button_outline large" @click.prevent="scrollTo('pricing')">{{ t('see_pricing') }}</a>
      </div>

      <div class="proof_row">
        <span class="proof_item">✓ {{ t('proof_14d') }}</span>
        <span class="proof_item">✓ {{ t('proof_rgpd') }}</span>
        <span class="proof_item">✓ {{ t('proof_support') }}</span>
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