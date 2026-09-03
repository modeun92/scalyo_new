<template>
  <div :class="['base-field', { error: !!error, disabled }]">
    <label v-if="label" class="field-label">{{ label }}</label>
    <div class="field-wrap">
      <slot name="prefix" />
      <component
        :is="multiline ? 'textarea' : 'input'"
        :value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="rows"
        class="field-input"
        v-bind="$attrs"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <slot name="suffix" />
    </div>
    <p v-if="error" class="field-error">{{ error }}</p>
    <p v-else-if="hint" class="field-hint">{{ hint }}</p>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: null },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: null },
  hint: { type: String, default: null },
  multiline: { type: Boolean, default: false },
  rows: { type: Number, default: 3 }
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.base-field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }
.field-wrap {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-white, #fff); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 0 12px; transition: all var(--transition);
}
.field-wrap:focus-within { border-color: var(--purple); box-shadow: 0 0 0 3px var(--purple-bg); }
.base-field.error .field-wrap { border-color: var(--red); }
.base-field.error .field-wrap:focus-within { box-shadow: 0 0 0 3px var(--red-bg); }
.base-field.disabled .field-wrap { opacity: 0.5; cursor: not-allowed; }
.field-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 0.85rem; color: var(--text); padding: 10px 0;
  font-family: inherit; resize: vertical;
}
.field-input::placeholder { color: var(--text-muted); }
textarea.field-input { padding: 10px 0; }
.field-error { font-size: 0.75rem; color: var(--red); }
.field-hint { font-size: 0.75rem; color: var(--text-muted); }
</style>