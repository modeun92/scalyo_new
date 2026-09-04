<template>
  <!-- Deep link /app/clients/:id: opens the record as a pop-up on top of the portfolio.
       We keep the URL shareable (meeting, Slack) while honoring the pop-up choice. -->
  <div class="cd_redirect">{{ t('cd_opening') }}</div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useClientModalStore } from '@/stores/clientModal'

const props = defineProps({ id: { type: String, required: true } })
const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const modal = useClientModalStore()

onMounted(async () => {
  await router.replace('/app/portfolio')
  modal.open(props.id)
})
</script>

<style scoped>
.cd_redirect { padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.9rem; }
</style>
