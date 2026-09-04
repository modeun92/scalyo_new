<template>
  <div class="legal_page">
    <div class="legal_container">
      <div class="legal_header">
        <router-link to="/" class="legal_back">{{ c.legal_back }}</router-link>
        <h1>{{ c.cgu_title }}</h1>
        <p class="legal_date">{{ c.legal_updated }}</p>
      </div>
      <div class="legal_content">
        <section v-for="s in sections" :key="s.key">
          <h2>{{ c[s.key + '_title'] }}</h2>
          <p v-if="s.key !== 'cgu_s6'">{{ c[s.key] }}</p>
          <template v-if="s.key === 'cgu_s6'">
            <p>{{ c.cgu_s6_intro }}</p>
            <ul>
              <li><strong>{{ c.cgu_price_starter }}</strong></li>
              <li><strong>{{ c.cgu_price_growth }}</strong></li>
              <li><strong>{{ c.cgu_price_elite }}</strong></li>
            </ul>
            <p>{{ c.cgu_s6_renewal }}</p>
            <p>{{ c.cgu_s6_founders }}</p>
          </template>
          <p v-if="s.key === 'cgu_s10'">
            {{ c.cgu_s10 }}
            <a href="mailto:contact@scalyo.app">contact@scalyo.app</a>
          </p>
        </section>
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
const sections = [{key:'cgu_s1'},{key:'cgu_s2'},{key:'cgu_s3'},{key:'cgu_s4'},{key:'cgu_s5'},{key:'cgu_s6'},{key:'cgu_s7'},{key:'cgu_s8'},{key:'cgu_s9'},{key:'cgu_s10'},{key:'cgu_s11'},{key:'cgu_s12'},{key:'cgu_s13'},{key:'cgu_s14'}]
onMounted(() => { document.title = c.value.cgu_title + ' — Scalyo' })
</script>
<style scoped>
.legal_page{min-height:100vh;background:var(--bg,#f8f9fb);padding:40px 20px}.legal_container{max-width:760px;margin:0 auto}.legal_header{margin-bottom:40px}.legal_back{color:var(--purple,#7c3aed);text-decoration:none;font-size:.9rem;font-weight:500}.legal_header h1{font-size:2rem;font-weight:800;margin-top:16px;margin-bottom:8px}.legal_date{color:var(--text-muted,#6b7280);font-size:.85rem}.legal_content{background:var(--bg-card,#fff);border-radius:16px;padding:40px;border:1px solid var(--border,#e5e7eb)}.legal_content section{margin-bottom:32px}.legal_content h2{font-size:1.1rem;font-weight:700;margin-bottom:12px;color:var(--text,#1a1a2e)}.legal_content p,.legal_content li{font-size:.9rem;line-height:1.7;color:var(--text,#1a1a2e);margin-bottom:8px}.legal_content ul{padding-left:20px}.legal_content a{color:var(--purple,#7c3aed)}
</style>