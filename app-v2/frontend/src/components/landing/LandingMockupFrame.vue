<template>
  <div class="container mockup-wrapper anim-section" data-anim="fade-up-delay">
    <div class="browser-chrome">
      <div class="chrome-dots"><span /><span /><span /></div>
      <div class="chrome-url">
        <span class="chrome-lock">🔒</span>
        app.scalyo.app
      </div>
      <div class="chrome-live">
        <span class="live-dot" />
        {{ t('demo_live') }}
      </div>
    </div>

    <div class="mockup-body">
      <div class="mock-sidebar">
        <div class="mock-sidebar-logo"><ScalyoLogo :size="22" /><span>Scalyo</span></div>
        <div
          v-for="(tab, i) in demoTabs"
          :key="tab.key"
          class="mock-tab"
          :class="{ active: activeDemo === i }"
          @click="$emit('demo-change', i)"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label hide-mobile">{{ t(tab.labelKey) }}</span>
        </div>
      </div>

      <div class="mock-main">
        <transition name="mock-fade" mode="out-in">
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