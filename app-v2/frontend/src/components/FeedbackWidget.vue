<template>
  <div class="feedback-widget">
    <!-- Floating button -->
    <button
      v-if="!open"
      class="feedback-trigger"
      :title="t('feedback_title')"
      @click="open = true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>

    <!-- Feedback panel -->
    <Transition name="fb-slide">
      <div v-if="open" class="feedback-panel">
        <div class="fb-header">
          <span class="fb-title">{{ t('feedback_title') }}</span>
          <button class="fb-close" @click="close">✕</button>
        </div>

        <!-- Success state -->
        <div v-if="sent" class="fb-success">
          <div class="fb-success-icon">✓</div>
          <p>{{ t('feedback_thanks') }}</p>
        </div>

        <!-- Form -->
        <template v-else>
          <div class="fb-cats">
            <button
              v-for="cat in categories"
              :key="cat.key"
              class="fb-cat"
              :class="{ active: category === cat.key }"
              @click="category = cat.key"
            >
              {{ t(cat.label) }}
            </button>
          </div>

          <textarea
            v-model="message"
            class="fb-textarea"
            :placeholder="t('feedback_placeholder')"
            rows="4"
            maxlength="2000"
          />

          <div class="fb-footer">
            <span class="fb-route">{{ currentRoute }}</span>
            <button
              class="fb-submit"
              :disabled="!message.trim() || sending"
              @click="submit"
            >
              <span v-if="sending" class="fb-spinner" />
              <span v-else>{{ t('feedback_send') }}</span>
            </button>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()

const open = ref(false)
const message = ref('')
const category = ref('bug')
const sending = ref(false)
const sent = ref(false)

const currentRoute = computed(() => route.path)

const categories = [
  { key: 'bug', label: 'feedback_cat_bug' },
  { key: 'ux', label: 'feedback_cat_ux' },
  { key: 'feature', label: 'feedback_cat_feature' },
  { key: 'other', label: 'feedback_cat_other' }
]

async function submit() {
  if (!message.value.trim() || sending.value) return

  sending.value = true

  try {
    const { error } = await supabase.from('alpha_feedback').insert({
      page_route: currentRoute.value,
      category: category.value,
      message: message.value.trim()
    })

    if (error) {
      console.error('Feedback insert error:', error.message)
      return
    }

    sent.value = true
    setTimeout(() => {
      close()
    }, 2000)
  } catch (err) {
    console.error('Feedback error:', err.message)
  } finally {
    sending.value = false
  }
}

function close() {
  open.value = false
  message.value = ''
  category.value = 'bug'
  sent.value = false
}
</script>

<style scoped>
.feedback-widget { position: fixed; bottom: 24px; right: 24px; z-index: 9999; }

/* Trigger button */
.feedback-trigger { width: 48px; height: 48px; border-radius: 50%; background: var(--purple); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(124,58,237,0.3); transition: all 0.2s; }
.feedback-trigger:hover { background: #6d28d9; transform: scale(1.08); box-shadow: 0 6px 20px rgba(124,58,237,0.4); }

/* Panel */
.feedback-panel { width: 340px; background: var(--bg-card); border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.12); overflow: hidden; }

/* Header */
.fb-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #f3f4f6; }
.fb-title { font-size: 0.88rem; font-weight: 700; color: var(--text); }
.fb-close { background: none; border: none; font-size: 1rem; color: var(--text-muted); cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.fb-close:hover { background: var(--bg-hover); color: #374151; }

/* Categories */
.fb-cats { display: flex; gap: 6px; padding: 12px 18px 0; flex-wrap: wrap; }
.fb-cat { padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.fb-cat:hover { border-color: var(--purple-light); color: var(--purple); }
.fb-cat.active { background: var(--purple); color: #fff; border-color: var(--purple); }

/* Textarea */
.fb-textarea { margin: 12px 18px 0; width: calc(100% - 36px); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 0.85rem; resize: none; outline: none; font-family: inherit; line-height: 1.5; }
.fb-textarea:focus { border-color: #7c3aed; }

/* Footer */
.fb-footer { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px 14px; }
.fb-route { font-size: 0.7rem; color: var(--text-muted); font-family: monospace; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb-submit { background: var(--purple); color: #fff; border: none; padding: 8px 18px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
.fb-submit:hover:not(:disabled) { background: #6d28d9; }
.fb-submit:disabled { opacity: 0.4; cursor: not-allowed; }

/* Spinner */
.fb-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: fb-spin 0.7s linear infinite; display: inline-block; }
@keyframes fb-spin { to { transform: rotate(360deg); } }

/* Success */
.fb-success { padding: 32px 18px; text-align: center; }
.fb-success-icon { width: 40px; height: 40px; border-radius: 50%; background: #059669; color: #fff; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
.fb-success p { font-size: 0.88rem; color: #374151; font-weight: 500; }

/* Slide transition */
.fb-slide-enter-active, .fb-slide-leave-active { transition: all 0.25s ease; }
.fb-slide-enter-from, .fb-slide-leave-to { opacity: 0; transform: translateY(12px) scale(0.96); }

@media (max-width: 640px) {
  .feedback-widget { bottom: 16px; right: 16px; }
  .feedback-panel { width: calc(100vw - 32px); max-width: 340px; }
}
</style>
