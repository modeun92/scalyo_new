<template>
  <div>
    <!-- STEP 0 : Zone de dépôt -->
    <div v-if="currentStep === 0"
         class="imp-dropzone"
         :class="{ dragover }"
         @dragover.prevent="dragover = true"
         @dragleave="dragover = false"
         @drop.prevent="onDrop"
         @click="$refs.fileInput.click()">
      <input ref="fileInput" type="file" hidden @change="onFileSelect" accept=".xlsx,.xls,.csv,.txt,.json" />
      <div class="dz-icon">
        <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="12" width="48" height="40" rx="6" stroke="var(--purple)" stroke-width="2" fill="#ede9fe"/>
          <path d="M32 24v16m-8-8h16" stroke="var(--purple)" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="dz-main">{{ t('imp_drop') }}</p>
      <p class="dz-formats">{{ t('imp_formats') }}</p>
      <button class="btn-primary" @click.stop="$refs.fileInput.click()">{{ t('imp_choose') }}</button>
      <p v-if="errorMsg" class="imp-error-msg">⚠️ {{ errorMsg }}</p>
    </div>

    <!-- STEP 1 : Analyse en cours -->
    <div v-if="currentStep === 1" class="imp-analyzing">
      <div class="ai-orb">
        <div class="orb-ring r1" />
        <div class="orb-ring r2" />
        <div class="orb-core">🤖</div>
      </div>
      <p class="analyzing-title">{{ t('imp_analyzing') }}</p>
      <p class="analyzing-file">{{ fileName }}</p>
      <div class="analyzing-dots"><span /><span /><span /></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  currentStep: { type: Number, default: 0 },
  errorMsg:    { type: String, default: '' },
  fileName:    { type: String, default: '' }
})

const emit = defineEmits(['file-selected'])

const dragover = ref(false)

function onDrop(e) {
  dragover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  if (file.size > 10 * 1024 * 1024) return
  emit('file-selected', file)
}

function onFileSelect(e) {
  const file = e.target?.files?.[0]
  if (file && file.size <= 10 * 1024 * 1024) {
    emit('file-selected', file)
  }
  e.target.value = ''
}
</script>
