<template>
  <div class="rst-item" :style="{ paddingLeft: (depth * 20) + 'px' }">
    <div class="rst-row" :class="{ done: subtask.done }">
      <button class="rst-toggle" v-if="subtask.children?.length" @click="open = !open">{{ open ? '▾' : '▸' }}</button>
      <span v-else class="rst-spacer" />
      <button class="rst-check" @click="$emit('toggle', subtask.id)">{{ subtask.done ? '✅' : '⬜' }}</button>
      <span class="rst-title">{{ subtask.title }}</span>
      <button class="rst-add" @click="$emit('add-child', subtask.id)" :title="addLabel">+</button>
    </div>
    <transition name="slide-up">
      <div v-if="open && subtask.children?.length" class="rst-children">
        <RecursiveSubtask
          v-for="child in subtask.children"
          :key="child.id"
          :subtask="child"
          :depth="depth + 1"
          :add-label="addLabel"
          @toggle="$emit('toggle', $event)"
          @add-child="$emit('add-child', $event)"
        />
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  subtask: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  addLabel: { type: String, default: '+' },
})

defineEmits(['toggle', 'add-child'])

const open = ref(true)
</script>

<style scoped>
.rst-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; transition: background 0.15s; }
.rst-row:hover { background: var(--bg-hover); }
.rst-row.done .rst-title { text-decoration: line-through; color: var(--text-muted); }
.rst-toggle { background: none; border: none; font-size: 0.7rem; color: var(--text-muted); cursor: pointer; width: 16px; flex-shrink: 0; padding: 0; }
.rst-spacer { width: 16px; flex-shrink: 0; }
.rst-check { background: none; border: none; font-size: 0.85rem; cursor: pointer; padding: 0; flex-shrink: 0; }
.rst-title { font-size: 0.82rem; flex: 1; }
.rst-add { background: none; border: 1px dashed var(--border); width: 20px; height: 20px; border-radius: 4px; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.rst-row:hover .rst-add { opacity: 1; }
.rst-add:hover { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); }
.rst-children { border-left: 1px solid var(--border-light); margin-left: 8px; }
</style>
