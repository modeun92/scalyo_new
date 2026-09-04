<template>
  <div class="playbooks">
    <div v-if="!canAccessPlaybooks" class="playbook_upsell">
      <div class="empty_icon">🔒</div>

    <AiInsightPanel
      module="playbook"
      :title="t('ai_playbook_title')"
      :button-label="t('ai_playbook_btn')"
      :message="t('ai_playbook_prompt')"
    />

      <h3>{{ t('pb_plan_required', { plan: 'Growth' }) }}</h3>
      <p>{{ t('pb_empty_desc') }}</p>
      <button class="button_primary" @click="$router.push('/app/settings')">{{ t('pb_upgrade') }}</button>
    </div>
    <template v-else>
    <PbHeader
      :playbookCount="store.playbooks.length"
      v-model:search="search"
      @openTemplates="slideTemplate = true"
    />

    <PbFilters
      :filterTabs="filterTabs"
      v-model:activeFilter="activeFilter"
    />

    <PbKpis
      :activeCount="store.activePlaybooks.length"
      :doneMonth="store.doneThisMonth"
      :avgDuration="store.avgDuration"
      :successRate="store.successRate"
    />

    <div v-if="filteredPlaybooks.length" class="playbook_list">
      <PbCard
        v-for="pb in filteredPlaybooks"
        :key="pb.id"
        :pb="pb"
        :clientLabel="clientName(pb.clientId)"
        @open="openDetail"
        @toggleStep="store.toggleStep"
        @complete="store.completePlaybook"
        @delete="store.deletePlaybook"
      />
    </div>

    <PbEmptyState
      v-else
      @activate="slideTemplate = true"
    />

    <PbTemplateSlide
      :open="slideTemplate"
      :templates="availableTemplates"
      @close="slideTemplate = false"
      @selectTemplate="selectTemplate"
    />

    <PbActivateSlide
      :open="slideActivate"
      :template="activatingTpl"
      :clients="clients.clients"
      :teamMembers="team.members"
      :initial-client-id="prefillClientId"
      @close="slideActivate = false"
      @activate="doActivate"
    />
      </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlaybookStore } from '@/stores/playbooks'
import { useClientStore } from '@/stores/clients'
import { useCreatePrefillStore } from '@/stores/createPrefill'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import PbHeader from '@/components/playbooks/PbHeader.vue'
import PbFilters from '@/components/playbooks/PbFilters.vue'
import PbKpis from '@/components/playbooks/PbKpis.vue'
import PbCard from '@/components/playbooks/PbCard.vue'
import PbEmptyState from '@/components/playbooks/PbEmptyState.vue'
import PbTemplateSlide from '@/components/playbooks/PbTemplateSlide.vue'
import PbActivateSlide from '@/components/playbooks/PbActivateSlide.vue'
import AiInsightPanel from '@/components/ai/AiInsightPanel.vue'
import '@/assets/playbooks.css'

const { t, te } = useI18n({ useScope: 'global' })
const store = usePlaybookStore()
const clients = useClientStore()
const prefill = useCreatePrefillStore()
const team = useTeamStore()
const auth = useAuthStore()

const canAccessPlaybooks = computed(() => !!auth.currentPlan && auth.currentPlan !== 'starter')
const availableTemplates = computed(() => store.templatesForPlan(auth.currentPlan))

const search = ref('')
const activeFilter = ref('all')
const slideTemplate = ref(false)
const slideActivate = ref(false)
const activatingTpl = ref(null)
const prefillClientId = ref('')

// Prefill from the client record ("Playbook" button): opens the template
// picker; the client is pre-selected in the activation slide-over (initialClientId).
onMounted(() => {
  const p = prefill.consume()
  if (p.clientId) { prefillClientId.value = p.clientId; slideTemplate.value = true }
})

const filterTabs = computed(() => [
  { key: 'all', label: 'pb_filter_all', count: store.playbooks.length },
  { key: 'active', label: 'pb_filter_active', count: store.activePlaybooks.length },
  { key: 'done', label: 'pb_filter_done', count: store.donePlaybooks.length },
])

const filteredPlaybooks = computed(() => {
  let list = store.playbooks
  if (activeFilter.value === 'active')
    list = list.filter(p => p.status === 'active')
  else if (activeFilter.value === 'done')
    list = list.filter(p => p.status === 'done')
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(p => {
      const name = t('pb_template_' + p.templateKey).toLowerCase()
      const client = clientName(p.clientId).toLowerCase()
      return name.includes(q) || client.includes(q)
    })
  }
  return list
})

function clientName(id) {
  return clients.clients.find(c => c.id === id)?.name || ''
}

function selectTemplate(tpl) {
  activatingTpl.value = tpl
  slideTemplate.value = false
  slideActivate.value = true
}

// D-15: the slide-over only closes if the activation REALLY succeeded
// (failure → withWrite toast, panel left open to retry)
// Rework 21/07: the view supplies the localized step labels (stepTitles) —
// the store generates a dated task per step WITHOUT ever calling t() (rule C2/C6).
async function doActivate({ templateId, clientId, csmId }) {
  const tpl = store.templates.find(x => x.id === templateId)
  const stepTitles = {}
  const stepGuides = {}
  if (tpl) tpl.steps.forEach(s => {
    stepTitles[s.key] = t(s.key)
    // Step guide (key `<step>_g`) → description of the generated task
    stepGuides[s.key] = te(s.key + '_g') ? t(s.key + '_g') : ''
  })
  const res = await store.activateTemplate(templateId, clientId, csmId, auth.currentPlan, stepTitles, stepGuides)
  if (res && res.success) {
    slideActivate.value = false
    activatingTpl.value = null
  }
}

function openDetail(pb) {
  // Scroll into expanded view — already shown inline
}
</script>
