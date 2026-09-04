<template>
<div>
  <footer class="footer_section">
    <div class="container">
      <div class="footer_grid">
        <div class="footer_brand">
          <div class="footer_logo"><ScalyoLogo :size="28" /><span>Scalyo</span></div>
          <p>{{ t('footer_desc') }}</p>
          <p class="footer_markets">{{ t('footer_markets') }}</p>
        </div>
        <div class="footer_column">
          <h4>{{ t('footer_col_product') }}</h4>
          <a href="#features" @click.prevent="scrollTo('features')">{{ t('footer_features') }}</a>
          <a href="#pricing" @click.prevent="scrollTo('pricing')">{{ t('footer_pricing') }}</a>
          <a href="#roi" @click.prevent="scrollTo('roi')">{{ t('footer_roi_calc') }}</a>
          <a :href="appUrl + '/login'">{{ t('footer_signin') }}</a>
        </div>
        <div class="footer_column">
          <h4>{{ t('footer_col_resources') }}</h4>
          <router-link to="/blog">{{ t('footer_blog') }}</router-link>
          <a :href="t('footer_presse_url')">{{ t('footer_presse') }}</a>
        </div>
        <div class="footer_column">
          <h4>{{ t('footer_col_contact') }}</h4>
          <a href="mailto:contact@scalyo.app">contact@scalyo.app</a>
          <a href="mailto:support@scalyo.app">{{ t('footer_support') }}</a>
        </div>
      </div>
      <div class="footer_legal">
        <router-link to="/cgu">{{ t('footer_cgu') }}</router-link>
        <span class="footer_legal_separator">·</span>
        <router-link to="/privacy">{{ t('footer_rgpd') }}</router-link>
      </div>
      <div class="footer_bottom">
        <span>{{ t('footer_copy') }}</span>
      </div>
    </div>
  </footer>
</div>
</template>
<script setup>
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const props = defineProps({
  appUrl: { type: String, default: '' },
  locale: { type: String, default: 'fr' },
  t: { type: Function, required: true }
})

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}
</script>
<style scoped>
.footer_section{background:#080a14;padding:60px 0 0;color:#94a3b8}
.footer_grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px}
.footer_logo{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.footer_logo span{font-size:1.3rem;font-weight:800;color:#fff}
.footer_brand p{font-size:.85rem;line-height:1.6;color:#94a3b8;margin-bottom:8px}
.footer_markets{font-size:.8rem;color:#64748b}
.footer_column{display:flex;flex-direction:column;gap:10px}
.footer_column h4{font-size:.85rem;font-weight:700;color:#fff;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.footer_column a{font-size:.85rem;color:#94a3b8;text-decoration:none;transition:color .2s}
.footer_column a:hover{color:#a78bfa}
.footer_legal{border-top:1px solid #1e293b;padding:20px 0;text-align:center;display:flex;justify-content:center;gap:12px;align-items:center}
.footer_legal a{font-size:.8rem;color:#94a3b8;text-decoration:none;transition:color .2s}
.footer_legal a:hover{color:#a78bfa}
.footer_legal_separator{color:#475569;font-size:.8rem}
.footer_bottom{border-top:1px solid #1e293b;padding:20px 0;text-align:center}
.footer_bottom span{font-size:.8rem;color:#64748b}
.container{max-width:1200px;margin:0 auto;padding:0 24px}
@media(max-width:768px){.footer_grid{grid-template-columns:1fr 1fr;gap:32px}}
@media(max-width:480px){.footer_grid{grid-template-columns:1fr;gap:24px}}
</style>
