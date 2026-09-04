<template>
  <section class="final_cta_section anim_section" data-anim="fade-up">
    <div class="final_cta_glow" />
    <div class="container center">
      <span class="section_tag light">{{ t('end_section_tag') }}</span>
      <h2 class="final_cta_title" v-html="t('end_h2')"></h2>
      <p class="final_cta_sub">{{ t('end_sub') }}</p>
      <div class="final_cta_buttons">
        <a href="#pricing" class="button_primary large glow_button" @click.prevent="scrollTo('pricing')">{{ t('cta_start_free') }}</a>
        <a href="mailto:contact@scalyo.app" class="button_outline_light large">{{ t('cta_talk') }}</a>
      </div>
      <p class="final_cta_note">{{ t('end_note') }}</p>
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