<template>
  <div class="legal_page">
    <div class="legal_container">
      <div class="legal_header">
        <router-link to="/" class="legal_back">{{ c.legal_back }}</router-link>
        <h1>{{ c.priv_title }}</h1>
        <p class="legal_date">{{ c.legal_updated }}</p>
        <p class="legal_regulation">{{ c.priv_regulation }}</p>
      </div>
      <div class="legal_content">
        <section><h2>{{ c.priv_s1_title }}</h2><p>{{ c.priv_s1 }}</p></section>
        <section><h2>{{ c.priv_s2_title }}</h2><ul><li><strong>{{ c.priv_s2_account }}</strong></li><li><strong>{{ c.priv_s2_usage }}</strong></li><li><strong>{{ c.priv_s2_tech }}</strong></li><li><strong>{{ c.priv_s2_payment }}</strong></li></ul></section>
        <section><h2>{{ c.priv_s3_title }}</h2><ul><li>{{ c.priv_s3_a }}</li><li>{{ c.priv_s3_b }}</li><li>{{ c.priv_s3_c }}</li><li>{{ c.priv_s3_d }}</li></ul></section>
        <section><h2>{{ c.priv_s4_title }}</h2><p>{{ c.priv_s4 }}</p></section>
        <section><h2>{{ c.priv_s5_title }}</h2><p>{{ c.priv_s5 }}</p></section>
        <section><h2>{{ c.priv_s6_title }}</h2><p>{{ c.priv_s6 }}</p></section>
        <section><h2>{{ c.priv_s7_title }}</h2><p>{{ c.priv_s7 }}</p></section>
        <section><h2>{{ c.priv_s8_title }}</h2><p>{{ c.priv_s8_intro }}</p><ul><li>{{ c.priv_s8_access }}</li><li>{{ c.priv_s8_rectify }}</li><li>{{ c.priv_s8_erase }}</li><li>{{ c.priv_s8_port }}</li><li>{{ c.priv_s8_object }}</li></ul><p>{{ c.priv_s8_contact }} <a href="mailto:contact@scalyo.app">contact@scalyo.app</a></p></section>
        <section><h2>{{ c.priv_s9_title }}</h2><p>{{ c.priv_s9 }}</p></section>
        <section><h2>{{ c.priv_s10_title }}</h2><p>{{ c.priv_s10 }} <a href="mailto:contact@scalyo.app">contact@scalyo.app</a></p></section>
        <section><h2>{{ c.priv_s11_title }}</h2><p>{{ c.priv_s11 }}</p></section>
        <section><h2>{{ c.priv_s12_title }}</h2><p>{{ c.priv_s12 }}</p></section>
        <section><h2>{{ c.priv_s13_title }}</h2><p>{{ c.priv_s13 }} <a href="mailto:dpo@scalyo.app">dpo@scalyo.app</a></p></section>
        <section><h2>{{ c.priv_s14_title }}</h2><p>{{ c.priv_s14 }}</p></section>
        <section><h2>{{ c.priv_s15_title }}</h2><p>{{ c.priv_s15 }}</p></section>
        <section><h2>{{ c.priv_s16_title }}</h2><p>{{ c.priv_s16 }}</p></section>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { legal } from '@/i18n/legal'
const { locale } = useI18n({ useScope: 'global' })
const c = computed(() => legal[locale.value] || legal.fr)
onMounted(() => { document.title = c.value.priv_title + ' — Scalyo' })
</script>
<style scoped>
.legal_page{min-height:100vh;background:var(--bg,#f8f9fb);padding:40px 20px}.legal_container{max-width:760px;margin:0 auto}.legal_header{margin-bottom:40px}.legal_back{color:var(--purple,#7c3aed);text-decoration:none;font-size:.9rem;font-weight:500}.legal_header h1{font-size:2rem;font-weight:800;margin-top:16px;margin-bottom:8px}.legal_date{color:var(--text-muted,#6b7280);font-size:.85rem}.legal_regulation{color:var(--text-muted,#6b7280);font-size:.85rem;font-style:italic;margin-top:4px}.legal_content{background:var(--bg-card,#fff);border-radius:16px;padding:40px;border:1px solid var(--border,#e5e7eb)}.legal_content section{margin-bottom:32px}.legal_content h2{font-size:1.1rem;font-weight:700;margin-bottom:12px;color:var(--text,#1a1a2e)}.legal_content p,.legal_content li{font-size:.9rem;line-height:1.7;color:var(--text,#1a1a2e);margin-bottom:8px}.legal_content ul{padding-left:20px}.legal_content a{color:var(--purple,#7c3aed)}
</style>