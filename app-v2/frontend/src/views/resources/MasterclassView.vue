<template>
  <div class="mc">

    <!-- Si aucune masterclass sélectionnée : liste des masterclasses -->
    <div v-if="!activeMc" class="mc-list-view">
      <div class="mc-list-header">
        <h1>🎓 {{ t('nav.masterclass') }}</h1>
        <p>{{ t('nav.masterclassSub') }}</p>
      </div>

      <div class="mc-cards">
        <div v-for="mc in store.masterclasses" :key="mc.id"
             class="mc-card"
             :class="{ 'is-new': mc.isNew }"
             @click="selectMc(mc)">

          <div class="mc-card-accent" :class="mc.isNew ? 'accent-purple' : 'accent-green'" />

          <div class="mc-card-body">
            <div class="mc-card-top">
              <span class="mc-badge" :class="mc.isNew ? 'badge-new' : 'badge-done'">
                {{ mc.isNew ? '🆕 ' + mc.quarter : mc.quarter }}
              </span>
              <span class="mc-duration">⏱ {{ mc.totalDuration }}</span>
            </div>

            <h2>{{ t(mc.titleKey) }}</h2>
            <p>{{ t(mc.descKey) }}</p>

            <div class="mc-card-stats">
              <span>📚 {{ mc.modules.length }} {{ t('res_modules') }}</span>
              <span>·</span>
              <span>{{ totalLessonsCount(mc) }} {{ t('res_lessons') }}</span>
            </div>

            <div class="mc-progress-wrap">
              <div class="mc-progress-bar">
                <div class="mc-progress-fill"
                     :style="{ width: getMcProgress(mc.id) + '%' }"
                     :class="mc.isNew ? 'fill-purple' : 'fill-green'" />
              </div>
              <span class="mc-progress-pct">{{ getMcProgress(mc.id) }}%</span>
            </div>

            <button class="mc-start-btn" :class="{ 'btn-continue': getMcProgress(mc.id) > 0 }">
              {{ getMcProgress(mc.id) === 0 ? t('res_start') :
                 getMcProgress(mc.id) === 100 ? '🎓 ' + t('res_completed') :
                 t('res_continue') }}
            </button>
          </div>

          <div v-if="getMcProgress(mc.id) === 100" class="mc-card-badge">🏆</div>
        </div>
      </div>
    </div>

    <!-- Vue cours actif -->
    <div v-else class="mc-course-view">

      <!-- Sidebar -->
      <aside class="mc-sidebar">
        <button class="mc-back-btn" @click="activeMc = null; activeLesson = null">
          ← {{ t('back') }}
        </button>

        <div class="mc-sidebar-title">{{ t(activeMc.titleKey) }}</div>

        <div class="mc-sidebar-progress">
          <div class="mc-progress-bar">
            <div class="mc-progress-fill fill-purple"
                 :style="{ width: getMcProgress(activeMc.id) + '%' }" />
          </div>
          <span>{{ getMcProgress(activeMc.id) }}% {{ t('res_completed') }}</span>
        </div>

        <div class="mc-sidebar-modules">
          <div v-for="(mod, mi) in activeMc.modules" :key="mod.id" class="mc-sidebar-mod">

            <div class="mc-mod-header"
                 @click="openModules[mod.id] = !openModules[mod.id]"
                 :class="{ 'mod-done': isModuleDone(mod) }">
              <div class="mc-mod-num" :class="{ done: isModuleDone(mod) }">
                {{ isModuleDone(mod) ? '✓' : mi + 1 }}
              </div>
              <span class="mc-mod-title">{{ t(mod.titleKey) }}</span>
              <span class="mc-mod-chev">{{ openModules[mod.id] ? '▾' : '▸' }}</span>
            </div>

            <div v-if="openModules[mod.id]" class="mc-sidebar-lessons">
              <div v-for="lesson in mod.lessons" :key="lesson.id"
                   class="mc-sidebar-lesson"
                   :class="{ active: activeLesson?.id === lesson.id, done: completedLessons.includes(lesson.id) }"
                   @click="selectLesson(lesson, mod)">
                <span class="lesson-status">
                  {{ completedLessons.includes(lesson.id) ? '✓' : activeLesson?.id === lesson.id ? '▶' : '○' }}
                </span>
                <div class="lesson-info">
                  <span class="lesson-title">{{ t(lesson.titleKey) }}</span>
                  <span class="lesson-dur">{{ lesson.duration }}</span>
                </div>
              </div>

              <div v-for="ex in mod.exercises" :key="ex.id"
                   class="mc-sidebar-lesson exercise"
                   :class="{ active: activeLesson?.id === ex.id, done: completedLessons.includes(ex.id) }"
                   @click="selectLesson(ex, mod, true)">
                <span class="lesson-status">
                  {{ completedLessons.includes(ex.id) ? '✓' : activeLesson?.id === ex.id ? '▶' : '📝' }}
                </span>
                <div class="lesson-info">
                  <span class="lesson-title">{{ t(ex.titleKey) }}</span>
                  <span class="lesson-dur exercise-tag">{{ t('res_exercise_label') }} · {{ ex.duration }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Contenu principal -->
      <main class="mc-content" ref="contentRef">

        <!-- Welcome screen -->
        <div v-if="!activeLesson" class="mc-welcome">
          <div class="mc-welcome-inner">
            <div class="mc-welcome-icon">🎓</div>
            <h2>{{ t(activeMc.titleKey) }}</h2>
            <p>{{ t(activeMc.descKey) }}</p>
            <div class="mc-welcome-stats">
              <div class="stat"><strong>{{ activeMc.modules.length }}</strong><span>{{ t('res_modules') }}</span></div>
              <div class="stat"><strong>{{ totalLessonsCount(activeMc) }}</strong><span>{{ t('res_lessons') }}</span></div>
              <div class="stat"><strong>{{ activeMc.totalDuration }}</strong><span>{{ t('res_of_content') }}</span></div>
            </div>
            <button class="mc-start-btn" @click="startFirst">
              {{ getMcProgress(activeMc.id) > 0 ? t('res_continue') : t('res_start') }} →
            </button>
          </div>
        </div>

        <!-- Leçon active -->
        <div v-else class="mc-lesson">

          <div class="mc-lesson-header">
            <div class="mc-breadcrumb">
              <span>{{ t(activeMc.titleKey) }}</span>
              <span>›</span>
              <span>{{ activeModule ? t(activeModule.titleKey) : '' }}</span>
            </div>
            <div class="mc-lesson-meta">
              <span class="mc-lesson-type" :class="isExercise ? 'type-exercise' : 'type-lesson'">
                {{ isExercise ? '📝 ' + t('res_exercise_label') : '📖 ' + t('res_lesson_label') }}
              </span>
              <span class="mc-lesson-dur">{{ activeLesson.duration }}</span>
            </div>
          </div>

          <h1 class="mc-lesson-title">{{ t(activeLesson.titleKey) }}</h1>

          <!-- Contenu leçon -->
          <div v-if="!isExercise" class="mc-lesson-body">
            <div v-for="(block, i) in parsedContent" :key="i" class="mc-content-block">
              <p v-if="block.type === 'paragraph'" class="mc-paragraph">{{ block.text }}</p>
              <div v-else-if="block.type === 'list-item'" class="mc-list-item">
                <span class="mc-bullet" :class="getBulletClass(block.text)">{{ getBulletIcon(block.text) }}</span>
                <span>{{ cleanBullet(block.text) }}</span>
              </div>
              <h3 v-else-if="block.type === 'heading'" class="mc-heading">{{ block.text }}</h3>
              <div v-else-if="block.type === 'highlight'" class="mc-highlight">{{ block.text }}</div>
            </div>

            <div class="mc-lesson-actions">
              <button class="mc-mark-done" :class="{ done: completedLessons.includes(activeLesson.id) }"
                      @click="toggleLessonDone(activeLesson.id)">
                {{ completedLessons.includes(activeLesson.id) ? '✅ ' + t('res_completed') : '○ ' + t('res_mark_done') }}
              </button>
            </div>
          </div>

          <!-- Exercice -->
          <div v-else class="mc-exercise-body">

            <!-- Type checklist -->
            <div v-if="exerciseType === 'checklist'" class="ex-checklist">
              <p class="ex-intro">{{ exerciseIntro }}</p>
              <div class="ex-checks">
                <label v-for="(item, i) in checklistItems" :key="i" class="ex-check-item">
                  <input type="checkbox" v-model="checkedItems[i]" />
                  <span :class="{ checked: checkedItems[i] }">{{ item }}</span>
                </label>
              </div>
              <div class="ex-checklist-progress">
                <div class="mc-progress-bar">
                  <div class="mc-progress-fill fill-green" :style="{ width: (checkedItems.filter(Boolean).length / checklistItems.length * 100) + '%' }" />
                </div>
                <span>{{ checkedItems.filter(Boolean).length }}/{{ checklistItems.length }}</span>
              </div>
            </div>

            <!-- Type notes (défaut) -->
            <div v-else class="ex-notes">
              <div class="ex-instructions">
                <div v-for="(block, i) in parsedContent" :key="i">
                  <p v-if="block.type === 'paragraph'" class="mc-paragraph">{{ block.text }}</p>
                  <div v-else-if="block.type === 'list-item'" class="mc-list-item">
                    <span class="mc-bullet">→</span>
                    <span>{{ cleanBullet(block.text) }}</span>
                  </div>
                </div>
              </div>
              <div class="ex-notes-area">
                <label>📝 {{ t('res_my_notes') }}</label>
                <textarea v-model="exerciseNotes[activeLesson.id]" :placeholder="t('res_notes_ph')" @input="saveNotes" rows="6" />
                <span class="ex-notes-saved" v-if="notesSaved">✓ {{ t('res_saved') }}</span>
              </div>
            </div>

            <div class="mc-lesson-actions">
              <button class="mc-mark-done" :class="{ done: completedLessons.includes(activeLesson.id) }"
                      @click="toggleLessonDone(activeLesson.id)">
                {{ completedLessons.includes(activeLesson.id) ? '✅ ' + t('res_exercise_done') : '○ ' + t('res_mark_done') }}
              </button>
            </div>
          </div>

          <!-- Navigation leçons -->
          <div class="mc-nav">
            <button class="mc-nav-btn" @click="prevLesson" :disabled="!hasPrev">← {{ t('res_prev') }}</button>
            <span class="mc-nav-pos">{{ currentPosition }}</span>
            <button class="mc-nav-btn primary" @click="nextLesson" :disabled="!hasNext">{{ t('res_next') }} →</button>
          </div>

          <!-- Badge de module complété -->
          <transition name="badge-pop">
            <div v-if="showBadge" class="mc-badge-popup">
              <div class="badge-icon">🏅</div>
              <div><strong>{{ t('res_module_done') }}</strong><p>{{ badgeModuleName }}</p></div>
              <button @click="showBadge = false">✕</button>
            </div>
          </transition>

        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceStore } from '@/stores/resources'

const { t } = useI18n({ useScope: 'global' })
const store = useResourceStore()

const activeMc = ref(null)
const activeLesson = ref(null)
const activeModule = ref(null)
const isExercise = ref(false)
const contentRef = ref(null)

const completedLessons = ref(JSON.parse(localStorage.getItem('scalyo_mc_progress') || '[]'))
const exerciseNotes = ref(JSON.parse(localStorage.getItem('scalyo_mc_notes') || '{}'))
const openModules = ref({})

const showBadge = ref(false)
const badgeModuleName = ref('')
const notesSaved = ref(false)
const checkedItems = ref([])

// ── Helpers ──

function totalLessonsCount(mc) {
  return mc.modules.reduce((s, m) => s + (m.lessons?.length || 0) + (m.exercises?.length || 0), 0)
}

function getMcProgress(mcId) {
  const mc = store.masterclasses.find(m => m.id === mcId)
  if (!mc) return 0
  const total = totalLessonsCount(mc)
  if (!total) return 0
  const done = mc.modules.reduce((s, mod) => {
    return s + (mod.lessons || []).filter(l => completedLessons.value.includes(l.id)).length
             + (mod.exercises || []).filter(e => completedLessons.value.includes(e.id)).length
  }, 0)
  return Math.round(done / total * 100)
}

function isModuleDone(mod) {
  const allIds = [...(mod.lessons || []).map(l => l.id), ...(mod.exercises || []).map(e => e.id)]
  return allIds.length > 0 && allIds.every(id => completedLessons.value.includes(id))
}

const flatLessons = computed(() => {
  if (!activeMc.value) return []
  const list = []
  activeMc.value.modules.forEach(mod => {
    ;(mod.lessons || []).forEach(l => list.push({ ...l, modId: mod.id, isEx: false }))
    ;(mod.exercises || []).forEach(e => list.push({ ...e, modId: mod.id, isEx: true }))
  })
  return list
})

const currentIndex = computed(() => activeLesson.value ? flatLessons.value.findIndex(l => l.id === activeLesson.value.id) : -1)
const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < flatLessons.value.length - 1)
const currentPosition = computed(() => currentIndex.value >= 0 ? `${currentIndex.value + 1} / ${flatLessons.value.length}` : '')

// Lesson/exercise body: content lives in i18n (*-content.js) under contentKey, resolved at the current locale.
const lessonBody = computed(() => activeLesson.value?.contentKey ? t(activeLesson.value.contentKey) : '')

const parsedContent = computed(() => {
  if (!lessonBody.value) return []
  return lessonBody.value.split('\n').filter(l => l.trim()).map(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('→') || trimmed.startsWith('-') || trimmed.match(/^\d+\./)) return { type: 'list-item', text: trimmed }
    if (trimmed.match(/^[A-Z][A-Z\s]+:/) || trimmed.endsWith(':')) return { type: 'heading', text: trimmed }
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return { type: 'highlight', text: trimmed }
    return { type: 'paragraph', text: trimmed }
  })
})

const exerciseType = computed(() => {
  if (!lessonBody.value) return 'notes'
  const c = lessonBody.value
  if (c.includes('☐') || c.includes('□')) return 'checklist'
  return 'notes'
})

const checklistItems = computed(() => {
  if (exerciseType.value !== 'checklist') return []
  return lessonBody.value.split('\n').filter(l => l.includes('☐') || l.includes('□')).map(l => l.replace(/☐|□/g, '').trim())
})

const exerciseIntro = computed(() => {
  if (!lessonBody.value) return ''
  return lessonBody.value.split('\n').find(l => !l.includes('☐') && !l.includes('□') && l.trim()) || ''
})

// ── Actions ──

function selectMc(mc) {
  activeMc.value = mc
  activeLesson.value = null
  if (mc.modules[0]) openModules.value[mc.modules[0].id] = true
}

function selectLesson(lesson, mod, asExercise = false) {
  activeLesson.value = lesson
  activeModule.value = mod
  isExercise.value = asExercise
  checkedItems.value = checklistItems.value.map(() => false)
  nextTick(() => contentRef.value?.scrollTo(0, 0))
}

function startFirst() {
  const first = flatLessons.value[0]
  if (!first) return
  const mod = activeMc.value.modules.find(m => m.id === first.modId)
  if (mod) { openModules.value[mod.id] = true; selectLesson(first, mod, first.isEx) }
}

function toggleLessonDone(lessonId) {
  const idx = completedLessons.value.indexOf(lessonId)
  if (idx >= 0) {
    completedLessons.value.splice(idx, 1)
  } else {
    completedLessons.value.push(lessonId)
    const mod = activeMc.value?.modules.find(m =>
      m.lessons?.some(l => l.id === lessonId) || m.exercises?.some(e => e.id === lessonId))
    if (mod && isModuleDone(mod)) {
      badgeModuleName.value = t(mod.titleKey)
      showBadge.value = true
      setTimeout(() => showBadge.value = false, 4000)
    }
  }
  localStorage.setItem('scalyo_mc_progress', JSON.stringify(completedLessons.value))
}

function saveNotes() {
  localStorage.setItem('scalyo_mc_notes', JSON.stringify(exerciseNotes.value))
  notesSaved.value = true
  setTimeout(() => notesSaved.value = false, 2000)
}

function prevLesson() {
  if (!hasPrev.value) return
  const prev = flatLessons.value[currentIndex.value - 1]
  const mod = activeMc.value.modules.find(m => m.id === prev.modId)
  if (mod) { openModules.value[mod.id] = true; selectLesson(prev, mod, prev.isEx) }
}

function nextLesson() {
  if (!hasNext.value) return
  if (!completedLessons.value.includes(activeLesson.value.id)) toggleLessonDone(activeLesson.value.id)
  const next = flatLessons.value[currentIndex.value + 1]
  const mod = activeMc.value.modules.find(m => m.id === next.modId)
  if (mod) { openModules.value[mod.id] = true; selectLesson(next, mod, next.isEx) }
}

function getBulletClass(text) {
  if (text.includes('🔴') || text.includes('❌')) return 'bullet-red'
  if (text.includes('🟠')) return 'bullet-orange'
  if (text.includes('🟡')) return 'bullet-yellow'
  if (text.includes('🟢') || text.includes('✅')) return 'bullet-green'
  return 'bullet-default'
}
function getBulletIcon(text) {
  if (text.startsWith('→')) return '→'
  if (text.match(/^\d+\./)) return text.match(/^\d+/)[0] + '.'
  return '·'
}
function cleanBullet(text) {
  return text.replace(/^→\s*/, '').replace(/^\d+\.\s*/, '').trim()
}
</script>

<style scoped>
.mc { height: 100%; }

/* ── Liste masterclasses ── */
.mc-list-view { max-width: 900px; }
.mc-list-header { margin-bottom: 32px; }
.mc-list-header h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 4px; }
.mc-list-header p { font-size: 0.85rem; color: var(--text-secondary); }

.mc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
.mc-card { background: #fff; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.2s; position: relative; }
.mc-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.mc-card-accent { height: 4px; }
.accent-purple { background: linear-gradient(90deg, var(--purple), #a78bfa); }
.accent-green { background: linear-gradient(90deg, var(--green), #34d399); }
.mc-card-body { padding: 24px; }
.mc-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.mc-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
.badge-new { background: var(--purple-bg); color: var(--purple); }
.badge-done { background: var(--bg); color: var(--text-muted); }
.mc-duration { font-size: 0.72rem; color: var(--text-muted); }
.mc-card h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; line-height: 1.4; }
.mc-card p { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px; }
.mc-card-stats { display: flex; gap: 8px; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 16px; }

.mc-progress-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.mc-progress-bar { flex: 1; height: 6px; background: var(--bg); border-radius: 99px; overflow: hidden; }
.mc-progress-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
.fill-purple { background: var(--purple); }
.fill-green { background: var(--green); }
.mc-progress-pct { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }

.mc-start-btn { background: var(--purple); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.15s; width: 100%; }
.mc-start-btn:hover { background: var(--purple-dark); }
.btn-continue { background: var(--green); }
.btn-continue:hover { background: #059669; }
.mc-card-badge { position: absolute; top: 16px; right: 16px; font-size: 1.8rem; }

/* ── Vue cours ── */
.mc-course-view { display: flex; height: calc(100vh - 80px); overflow: hidden; }

.mc-sidebar { width: 280px; flex-shrink: 0; background: #fff; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; }
.mc-back-btn { background: none; border: none; cursor: pointer; padding: 16px 20px; text-align: left; font-size: 0.82rem; color: var(--text-muted); border-bottom: 1px solid var(--border-light); transition: color 0.15s; }
.mc-back-btn:hover { color: var(--purple); }
.mc-sidebar-title { padding: 16px 20px 8px; font-size: 0.85rem; font-weight: 700; line-height: 1.4; }
.mc-sidebar-progress { padding: 0 20px 16px; display: flex; flex-direction: column; gap: 4px; }
.mc-sidebar-progress span { font-size: 0.7rem; color: var(--text-muted); }

.mc-sidebar-modules { flex: 1; padding: 8px 0; }
.mc-sidebar-mod { border-bottom: 1px solid var(--border-light); }
.mc-mod-header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: background 0.12s; }
.mc-mod-header:hover { background: var(--bg-hover); }
.mc-mod-header.mod-done { opacity: 0.7; }
.mc-mod-num { width: 22px; height: 22px; border-radius: 50%; background: var(--purple-bg); color: var(--purple); font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.mc-mod-num.done { background: #d1fae5; color: #059669; }
.mc-mod-title { flex: 1; font-size: 0.78rem; font-weight: 600; line-height: 1.3; }
.mc-mod-chev { font-size: 0.7rem; color: var(--text-muted); }

.mc-sidebar-lessons { background: var(--bg); padding: 4px 0; }
.mc-sidebar-lesson { display: flex; align-items: flex-start; gap: 10px; padding: 8px 16px 8px 24px; cursor: pointer; transition: background 0.12s; border-radius: 4px; }
.mc-sidebar-lesson:hover { background: var(--bg-hover); }
.mc-sidebar-lesson.active { background: var(--purple-bg); }
.mc-sidebar-lesson.done .lesson-title { color: var(--text-muted); text-decoration: line-through; }
.lesson-status { font-size: 0.75rem; color: var(--text-muted); width: 14px; flex-shrink: 0; margin-top: 1px; }
.mc-sidebar-lesson.active .lesson-status { color: var(--purple); }
.mc-sidebar-lesson.done .lesson-status { color: var(--green); }
.lesson-title { font-size: 0.78rem; display: block; line-height: 1.4; }
.lesson-dur { font-size: 0.65rem; color: var(--text-muted); }
.exercise-tag { color: var(--purple) !important; font-weight: 500; }

/* ── Contenu principal ── */
.mc-content { flex: 1; overflow-y: auto; background: #fafafa; }

.mc-welcome { display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 40px; }
.mc-welcome-inner { max-width: 500px; text-align: center; }
.mc-welcome-icon { font-size: 4rem; margin-bottom: 20px; }
.mc-welcome-inner h2 { font-size: 1.5rem; font-weight: 800; margin-bottom: 12px; }
.mc-welcome-inner p { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: 28px; }
.mc-welcome-stats { display: flex; justify-content: center; gap: 32px; margin-bottom: 28px; }
.stat strong { display: block; font-size: 1.5rem; font-weight: 800; color: var(--purple); }
.stat span { font-size: 0.75rem; color: var(--text-muted); }

.mc-lesson { max-width: 700px; margin: 0 auto; padding: 32px 40px 80px; }
.mc-lesson-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.mc-breadcrumb { font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
.mc-lesson-meta { display: flex; gap: 10px; align-items: center; }
.mc-lesson-type { font-size: 0.68rem; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
.type-lesson { background: var(--purple-bg); color: var(--purple); }
.type-exercise { background: #fef3c7; color: #d97706; }
.mc-lesson-dur { font-size: 0.72rem; color: var(--text-muted); }
.mc-lesson-title { font-size: 1.6rem; font-weight: 800; line-height: 1.3; margin-bottom: 28px; color: #111; }

.mc-lesson-body { display: flex; flex-direction: column; gap: 4px; }
.mc-paragraph { font-size: 0.95rem; line-height: 1.8; color: #374151; margin: 8px 0; }
.mc-list-item { display: flex; gap: 12px; align-items: flex-start; padding: 6px 0; }
.mc-bullet { font-size: 0.8rem; color: var(--text-muted); width: 20px; flex-shrink: 0; margin-top: 3px; font-weight: 600; }
.bullet-red { color: #ef4444; }
.bullet-orange { color: #f97316; }
.bullet-yellow { color: #f59e0b; }
.bullet-green { color: #10b981; }
.mc-list-item span:last-child { font-size: 0.9rem; line-height: 1.7; color: #374151; }
.mc-heading { font-size: 1rem; font-weight: 700; color: var(--purple); margin: 20px 0 8px; padding-top: 16px; border-top: 1px solid var(--border-light); }
.mc-highlight { font-size: 0.95rem; font-style: italic; color: var(--purple); background: var(--purple-bg); padding: 14px 20px; border-radius: 8px; border-left: 3px solid var(--purple); margin: 12px 0; line-height: 1.7; }

.mc-lesson-actions { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border-light); }
.mc-mark-done { background: none; border: 2px solid var(--border); padding: 10px 24px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.15s; color: var(--text-muted); }
.mc-mark-done:hover { border-color: var(--green); color: var(--green); }
.mc-mark-done.done { border-color: var(--green); color: var(--green); background: #d1fae5; }

.mc-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border-light); }
.mc-nav-btn { background: none; border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
.mc-nav-btn:hover:not(:disabled) { border-color: var(--purple); color: var(--purple); }
.mc-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.mc-nav-btn.primary { background: var(--purple); color: #fff; border-color: var(--purple); }
.mc-nav-btn.primary:hover { background: var(--purple-dark); }
.mc-nav-pos { font-size: 0.78rem; color: var(--text-muted); }

/* ── Exercices ── */
.mc-exercise-body { display: flex; flex-direction: column; gap: 24px; }

.ex-intro { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6; }
.ex-checks { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.ex-check-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.15s; font-size: 0.88rem; }
.ex-check-item:hover { border-color: var(--purple-border); }
.ex-check-item input { accent-color: var(--green); width: 16px; height: 16px; }
.ex-check-item span.checked { text-decoration: line-through; color: var(--text-muted); }
.ex-checklist-progress { display: flex; align-items: center; gap: 12px; }
.ex-checklist-progress span { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }

.ex-instructions { margin-bottom: 20px; }
.ex-notes-area { display: flex; flex-direction: column; gap: 8px; }
.ex-notes-area label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }
.ex-notes-area textarea { padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.88rem; line-height: 1.7; outline: none; resize: vertical; font-family: inherit; background: #fff; }
.ex-notes-area textarea:focus { border-color: var(--purple); }
.ex-notes-saved { font-size: 0.72rem; color: var(--green); }

/* Badge popup */
.mc-badge-popup { position: fixed; bottom: 32px; right: 32px; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-xl); padding: 16px 20px; display: flex; align-items: center; gap: 14px; z-index: 100; max-width: 320px; }
.badge-icon { font-size: 2.5rem; flex-shrink: 0; }
.mc-badge-popup strong { font-size: 0.9rem; display: block; margin-bottom: 2px; }
.mc-badge-popup p { font-size: 0.78rem; color: var(--text-secondary); margin: 0; }
.mc-badge-popup button { background: none; border: none; cursor: pointer; color: var(--text-muted); margin-left: auto; flex-shrink: 0; }

.badge-pop-enter-active { animation: badge-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.badge-pop-leave-active { animation: badge-out 0.3s ease; }
@keyframes badge-in { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes badge-out { from { opacity: 1; } to { opacity: 0; transform: translateY(10px); } }

@media (max-width: 768px) {
  .mc-course-view { flex-direction: column; }
  .mc-sidebar { width: 100%; height: auto; max-height: 250px; }
  .mc-lesson { padding: 20px 16px 60px; }
  .mc-cards { grid-template-columns: 1fr; }
}
</style>
