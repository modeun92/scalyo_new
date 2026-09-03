<template>
  <div class="roadmap-view">
    <!-- Header -->
    <div class="rm-header">
      <div>
        <h1>🗺️ {{ t('rm_title') }}</h1>
        <p class="rm-sub">{{ t('rm_subtitle') }}</p>
      </div>
      <button class="btn-primary" @click="showCreate = true">{{ t('rm_new') }}</button>
    </div>

    <!-- KPIs -->
    <div class="rm-kpis">
      <div class="rmk">
        <span class="rmk-val blue">{{ store.activeRoadmaps.length }}</span>
        <span class="rmk-label">{{ t('rm_active_count') }}</span>
      </div>
      <div class="rmk">
        <span class="rmk-val green">{{ store.doneRoadmaps.length }}</span>
        <span class="rmk-label">{{ t('rm_done_count') }}</span>
      </div>
      <div class="rmk">
        <span class="rmk-val purple">{{ totalMilestones }}</span>
        <span class="rmk-label">{{ t('rm_total_milestones') }}</span>
      </div>
      <div class="rmk">
        <span class="rmk-val">{{ store.globalProgress }}%</span>
        <span class="rmk-label">{{ t('rm_global_progress') }}</span>
        <div class="rmk-bar">
          <div class="rmk-fill" :style="{ width: store.globalProgress + '%' }" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!store.roadmaps.length" class="rm-empty">
      <div class="rme-icon">🗺️</div>
      <h3>{{ t('rm_empty_title') }}</h3>
      <p>{{ t('rm_empty_desc') }}</p>
      <div class="rme-actions">
        <button class="btn-primary" @click="showCreate = true">{{ t('rm_choose_template') }}</button>
        <button class="btn-outline" @click="showCreate = true">{{ t('rm_blank') }}</button>
      </div>
    </div>

    <!-- Roadmaps list -->
    <div v-else class="rm-list">
      <RoadmapCard
        v-for="rm in store.roadmaps"
        :key="rm.id"
        :rm="rm"
        @edit-milestone="openEditMilestone"
        @add-milestone="openAddMilestone"
        @confirm-delete="confirmDelete"
      />
    </div>

    <!-- Slide-overs -->
    <RoadmapCreatePanel :open="showCreate" @close="showCreate = false" />

    <RoadmapMilestonePanel
      :open="showMilestone"
      :roadmap-id="currentRoadmapId"
      :milestone="currentMilestone"
      @close="showMilestone = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoadmapStore } from '@/stores/roadmap'
import RoadmapCard from '@/components/roadmap/RoadmapCard.vue'
import RoadmapCreatePanel from '@/components/roadmap/RoadmapCreatePanel.vue'
import RoadmapMilestonePanel from '@/components/roadmap/RoadmapMilestonePanel.vue'
import '@/assets/roadmap.css'

const { t } = useI18n({ useScope: 'global' })
const store = useRoadmapStore()

const showCreate = ref(false)
const showMilestone = ref(false)
const currentRoadmapId = ref(null)
const currentMilestone = ref(null)

const totalMilestones = computed(() =>
  store.roadmaps.reduce((s, r) => s + r.milestones.length, 0)
)

function openAddMilestone(rm) {
  currentRoadmapId.value = rm.id
  currentMilestone.value = null
  showMilestone.value = true
}

function openEditMilestone(rm, ms) {
  currentRoadmapId.value = rm.id
  currentMilestone.value = ms
  showMilestone.value = true
}

function confirmDelete(id) {
  store.deleteRoadmap(id)
}
</script>
