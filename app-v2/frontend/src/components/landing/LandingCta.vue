<template>
  <section class="final-cta-section anim-section" data-anim="fade-up">
    <div class="final-cta-glow" />
    <div class="container center">
      <span class="section-tag light">{{ t('end_section_tag') }}</span>
      <h2 class="final-cta-title" v-html="t('end_h2')"></h2>
      <p class="final-cta-sub">{{ t('end_sub') }}</p>
      <div class="final-cta-btns">
        <a href="#pricing" class="btn-primary lg glow-btn" @click.prevent="scrollTo('pricing')">{{ t('cta_start_free') }}</a>
        <a href="mailto:contact@scalyo.app" class="btn-outline-light lg">{{ t('cta_talk') }}</a>
      </div>
      <p class="final-cta-note">{{ t('end_note') }}</p>
    </div>
  </section>
</template>

<script setup>
function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

defineProps({
  appUrl: { type: String, default: '' },
  t:      { type: Function, required: true }
})
</script>