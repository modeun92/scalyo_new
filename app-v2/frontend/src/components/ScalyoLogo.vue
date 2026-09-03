<template>
  <svg :width="size" :height="size" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" :style="glowStyle">
    <defs>
      <!-- Orbe spectre (design 3a) : base violette + halos orange / rose / bleu fondus -->
      <radialGradient :id="gid + 'o'" cx="38%" cy="34%" r="62%">
        <stop offset="0%" stop-color="#FFB020"/>
        <stop offset="55%" stop-color="#FFB020" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#FFB020" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="gid + 'p'" cx="14%" cy="72%" r="70%">
        <stop offset="0%" stop-color="#FF4D8D" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#FF4D8D" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="gid + 'p2'" cx="82%" cy="12%" r="55%">
        <stop offset="0%" stop-color="#FF4D8D" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#FF4D8D" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="gid + 'b'" cx="84%" cy="80%" r="70%">
        <stop offset="0%" stop-color="#22B8F0" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#22B8F0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="150" cy="150" r="145" fill="#8B5CF6"/>
    <circle cx="150" cy="150" r="145" :fill="`url(#${gid}b)`"/>
    <circle cx="150" cy="150" r="145" :fill="`url(#${gid}p)`"/>
    <circle cx="150" cy="150" r="145" :fill="`url(#${gid}p2)`"/>
    <circle cx="150" cy="150" r="145" :fill="`url(#${gid}o)`"/>
    <text x="150" y="205" font-family="Georgia,serif" font-size="185" font-weight="700" fill="#FFF" text-anchor="middle">S</text>
  </svg>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ size: { type: [Number, String], default: 36 }, glow: { type: Boolean, default: true } })
const gid = 'sg' + Math.random().toString(36).slice(2, 6)
const glowStyle = computed(() => props.glow
  ? { filter: `drop-shadow(0 0 ${Math.min(24, Math.round(Number(props.size) * 0.5))}px rgba(139,92,246,0.45))` }
  : {})
</script>
