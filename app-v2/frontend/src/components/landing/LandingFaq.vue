<template>
  <section id="faq" class="faq_section">
    <div class="container">
      <div class="section_header anim_section" data-anim="fade-up">
        <span class="section_tag">{{ t('faq_tag') }}</span>
        <h2 v-html="t('faq_h2')"></h2>
      </div>

      <div class="faq_list anim_section" data-anim="fade-up">
        <div v-for="(item, i) in faqItems" :key="i" class="faq_item" :class="{ open: openFaq === i }" @click="openFaq = openFaq === i ? null : i">
          <div class="faq_q">
            <span>{{ item.q }}</span>
            <span class="faq_toggle">{{ openFaq === i ? '−' : '+' }}</span>
          </div>
          <div class="faq_a">
            <p>{{ item.a }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  faqItems: { type: Array, required: true },
  t:        { type: Function, required: true }
})

const openFaq = ref(null)
</script>