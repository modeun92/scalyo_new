<template>
  <section id="faq" class="faq-section">
    <div class="container">
      <div class="section-header anim-section" data-anim="fade-up">
        <span class="section-tag">{{ t('faq_tag') }}</span>
        <h2 v-html="t('faq_h2')"></h2>
      </div>

      <div class="faq-list anim-section" data-anim="fade-up">
        <div v-for="(item, i) in faqItems" :key="i" class="faq-item" :class="{ open: openFaq === i }" @click="openFaq = openFaq === i ? null : i">
          <div class="faq-q">
            <span>{{ item.q }}</span>
            <span class="faq-toggle">{{ openFaq === i ? '\u2212' : '+' }}</span>
          </div>
          <div class="faq-a">
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