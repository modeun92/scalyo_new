<template>
  <div class="container mockup_wrapper anim_section" data-anim="fade-up-delay">
    <div class="browser_chrome">
      <div class="chrome_dots"><span /><span /><span /></div>
      <div class="chrome_url">
        <span class="chrome_lock">🔒</span>
        app.scalyo.app
      </div>
      <div class="chrome_live">
        <span class="live_dot" />
        {{ t('demo_live') }}
      </div>
    </div>

    <div class="mockup_body">
      <div class="mockup_sidebar">
        <div class="mockup_sidebar_logo"><ScalyoLogo :size="22" /><span>Scalyo</span></div>
        <div
          v-for="(tab, i) in demoTabs"
          :key="tab.key"
          class="mockup_tab"
          :class="{ active: activeDemo === i }"
          @click="$emit('demo-change', i)"
        >
          <span class="tab_icon">{{ tab.icon }}</span>
          <span class="tab_label hide_mobile">{{ t(tab.labelKey) }}</span>
        </div>
      </div>

      <div class="mockup_main">
        <transition name="mockup_fade" mode="out-in">
          <slot :active-demo="activeDemo" />
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import ScalyoLogo from '@/components/ScalyoLogo.vue'

defineProps({
  activeDemo: { type: Number, default: 0 },
  demoTabs:   { type: Array, required: true },
  t:          { type: Function, required: true }
})

defineEmits(['demo-change'])
</script>