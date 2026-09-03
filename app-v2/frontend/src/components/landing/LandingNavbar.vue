<template>
  <nav class="nav" :class="{ scrolled }">
    <div class="nav-inner">
      <router-link :to="homePath" class="logo-link">
        <ScalyoLogo :size="34" />
        <span class="logo-text">Scalyo</span>
      </router-link>

      <div class="nav-links hide-mobile">
        <a href="#features" @click.prevent="scrollTo('features')">{{ t('nav_features') }}</a>
        <a href="#roi" @click.prevent="scrollTo('roi')">{{ t('nav_roi') }}</a>
        <a href="#pricing" @click.prevent="scrollTo('pricing')">{{ t('nav_pricing') }}</a>
        <a href="#faq" @click.prevent="scrollTo('faq')">{{ t('nav_faq') }}</a>
      </div>

      <div class="nav-right hide-mobile">
        <div class="lang-switch">
          <button v-for="l in langs" :key="l.code" :class="{ active: locale === l.code }" @click="$emit('locale-change', l.code)">{{ l.label }}</button>
        </div>
        <a :href="appUrl + '/login'" class="btn-ghost-sm">{{ t('nav_login') }}</a>
        <a href="#pricing" class="btn-primary-sm" @click.prevent="scrollTo('pricing')">{{ t('nav_cta') }}</a>
      </div>

      <button class="burger hide-desktop" @click="mobileMenu = !mobileMenu" aria-label="Menu">
        <span /><span /><span />
      </button>
    </div>

    <!-- Mobile menu -->
    <transition name="slide-down">
      <div v-if="mobileMenu" class="mobile-menu">
        <a href="#features" @click.prevent="scrollTo('features')">{{ t('nav_features') }}</a>
        <a href="#roi" @click.prevent="scrollTo('roi')">{{ t('nav_roi') }}</a>
        <a href="#pricing" @click.prevent="scrollTo('pricing')">{{ t('nav_pricing') }}</a>
        <a href="#faq" @click.prevent="scrollTo('faq')">{{ t('nav_faq') }}</a>
        <div class="lang-switch">
          <button v-for="l in langs" :key="l.code" :class="{ active: locale === l.code }" @click="$emit('locale-change', l.code)">{{ l.label }}</button>
        </div>
        <a href="#pricing" class="btn-primary-sm" @click.prevent="scrollTo('pricing')">{{ t('nav_cta') }}</a>
        <a :href="appUrl + '/login'" class="btn-ghost-sm">{{ t('nav_login') }}</a>
      </div>
    </transition>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

defineProps({
  scrolled: { type: Boolean, default: false },
  locale:   { type: String, default: 'fr' },
  // SEO-I18N : sans cette prop, le logo renverrait de /ko/ vers la version
  // francaise — un lien interne qui contredit la langue de la page.
  homePath: { type: String, default: '/' },
  langs:    { type: Array, required: true },
  appUrl:   { type: String, default: '' },
  t:        { type: Function, required: true }
})

defineEmits(['locale-change'])

const mobileMenu = ref(false)

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  mobileMenu.value = false
}
</script>