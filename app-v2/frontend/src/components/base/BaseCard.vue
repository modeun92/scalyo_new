<template>
  <div :class="['base_card', { flat, hoverable, compact }]">
    <div v-if="$slots.header || title" class="card_header">
      <div class="card_title_row">
        <h3 v-if="title" class="card_title">{{ title }}</h3>
        <slot name="header" />
      </div>
      <slot name="actions" />
    </div>
    <div class="card_body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="card_footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: null },
  flat: { type: Boolean, default: false },
  hoverable: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})
</script>

<style scoped>
.base_card {
  background: var(--bg-white, #fff); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
  transition: all var(--transition);
}
.base_card.flat { box-shadow: none; border-color: var(--border); }
.base_card.hoverable:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
.base_card.compact .card_body { padding: 12px 16px; }
.card_header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 0; gap: 12px;
}
.card_title_row { display: flex; align-items: center; gap: 8px; }
.card_title { font-size: 0.95rem; font-weight: 700; color: var(--text); margin: 0; }
.card_body { padding: 16px 20px; }
.card_footer {
  padding: 12px 20px; border-top: 1px solid var(--border-light);
  display: flex; justify-content: flex-end; gap: 8px;
}
</style>