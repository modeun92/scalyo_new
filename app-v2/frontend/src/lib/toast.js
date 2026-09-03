// Minimal global toast store (chantier G9-13 UX guardrail).
// The existing BaseToast.vue is component-local (ref + defineExpose) so it can't be
// reached from a Pinia store. This module holds reactive toast state that any code
// (stores, libs) can push to; <GlobalToast> renders it, mounted once in AppLayout.
import { ref } from 'vue'

export const toasts = ref([])
let nextId = 0

// ── OXYGEN Lot 3b — local DND during the Closing (contract R23 29/07/2026) ──
// dndActive=true: toasts go into a QUEUE (nothing lost, nothing displayed);
// setDnd(false) replays the queue in order. AppLayout also hides the bell
// badge during DND. 100 % local mechanism — no writes.
export const dndActive = ref(false)
let queued = []

export function setDnd(on) {
  dndActive.value = !!on
  if (!dndActive.value && queued.length) {
    const q = queued
    queued = []
    for (const item of q) pushToast(item)
  }
}

function pushToast({ id, message, type, duration }) {
  toasts.value.push({ id, message, type })
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
}

// duration 0 = persistent (stays until dismissed / page reload).
export function showToast(message, type = 'info', duration = 4000) {
  const id = ++nextId
  if (dndActive.value) { queued.push({ id, message, type, duration }); return id }
  pushToast({ id, message, type, duration })
  return id
}

export function dismissToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
  queued = queued.filter(t => t.id !== id)
}
