<template>
  <div class="recursive_subtask_item" :style="{ paddingLeft: (depth * 20) + 'px' }">
    <div class="recursive_subtask_row" :class="{ done: subtask.done }">
      <button class="recursive_subtask_toggle" v-if="subtask.children?.length" @click="open = !open">{{ open ? '▾' : '▸' }}</button>
      <span v-else class="recursive_subtask_spacer" />
      <button class="recursive_subtask_check" @click="$emit('toggle', subtask.id)">{{ subtask.done ? '✅' : '⬜' }}</button>
      <span class="recursive_subtask_title">{{ subtask.title }}</span>
      <button class="recursive_subtask_add" @click="$emit('add-child', subtask.id)" :title="addLabel">+</button>
    </div>
    <transition name="slide_up">
      <div v-if="open && subtask.children?.length" class="recursive_subtask_children">
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
.recursive_subtask_row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; transition: background 0.15s; }
.recursive_subtask_row:hover { background: var(--bg-hover); }
.recursive_subtask_row.done .recursive_subtask_title { text-decoration: line-through; color: var(--text-muted); }
.recursive_subtask_toggle { background: none; border: none; font-size: 0.7rem; color: var(--text-muted); cursor: pointer; width: 16px; flex-shrink: 0; padding: 0; }
.recursive_subtask_spacer { width: 16px; flex-shrink: 0; }
.recursive_subtask_check { background: none; border: none; font-size: 0.85rem; cursor: pointer; padding: 0; flex-shrink: 0; }
.recursive_subtask_title { font-size: 0.82rem; flex: 1; }
.recursive_subtask_add { background: none; border: 1px dashed var(--border); width: 20px; height: 20px; border-radius: 4px; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.recursive_subtask_row:hover .recursive_subtask_add { opacity: 1; }
.recursive_subtask_add:hover { border-color: var(--purple); color: var(--purple); background: var(--purple-bg); }
.recursive_subtask_children { border-left: 1px solid var(--border-light); margin-left: 8px; }
</style>
