<template>
  <div class="mc">

    <!-- If no masterclass is selected: list of masterclasses -->
    <div v-if="!activeMc" class="masterclass_list_view">
      <div class="masterclass_list_header">
        <h1>🎓 {{ t('nav.masterclass') }}</h1>
        <p>{{ t('nav.masterclassSub') }}</p>
      </div>

      <div class="masterclass_cards">
        <div v-for="mc in store.masterclasses" :key="mc.id"
             class="masterclass_card"
             :class="{ 'is_new': mc.isNew }"
             @click="selectMc(mc)">

          <div class="masterclass_card_accent" :class="mc.isNew ? 'accent_purple' : 'accent_green'" />

          <div class="masterclass_card_body">
            <div class="masterclass_card_top">
              <span class="masterclass_badge" :class="mc.isNew ? 'badge_new' : 'badge_done'">
                {{ mc.isNew ? '🆕 ' + mc.quarter : mc.quarter }}
              </span>
              <span class="masterclass_duration">⏱ {{ mc.totalDuration }}</span>
            </div>

            <h2>{{ t(mc.titleKey) }}</h2>
            <p>{{ t(mc.descKey) }}</p>

            <div class="masterclass_card_stats">
              <span>📚 {{ mc.modules.length }} {{ t('res_modules') }}</span>
              <span>·</span>
              <span>{{ totalLessonsCount(mc) }} {{ t('res_lessons') }}</span>
            </div>

            <div class="masterclass_progress_wrapper">
              <div class="masterclass_progress_bar">
                <div class="masterclass_progress_fill"
                     :style="{ width: getMcProgress(mc.id) + '%' }"
                     :class="mc.isNew ? 'fill_purple' : 'fill_green'" />
              </div>
              <span class="masterclass_progress_percent">{{ getMcProgress(mc.id) }}%</span>
            </div>

            <button class="masterclass_start_button" :class="{ 'button_continue': getMcProgress(mc.id) > 0 }">
              {{ getMcProgress(mc.id) === 0 ? t('res_start') :
                 getMcProgress(mc.id) === 100 ? '🎓 ' + t('res_completed') :
                 t('res_continue') }}
            </button>
          </div>

          <div v-if="getMcProgress(mc.id) === 100" class="masterclass_card_badge">🏆</div>
        </div>
      </div>
    </div>

    <!-- Vue cours actif -->
    <div v-else class="masterclass_course_view">

      <!-- Sidebar -->
      <aside class="masterclass_sidebar">
        <button class="masterclass_back_button" @click="activeMc = null; activeLesson = null">
          ← {{ t('back') }}
        </button>

        <div class="masterclass_sidebar_title">{{ t(activeMc.titleKey) }}</div>

        <div class="masterclass_sidebar_progress">
          <div class="masterclass_progress_bar">
            <div class="masterclass_progress_fill fill_purple"
                 :style="{ width: getMcProgress(activeMc.id) + '%' }" />
          </div>
          <span>{{ getMcProgress(activeMc.id) }}% {{ t('res_completed') }}</span>
        </div>

        <div class="masterclass_sidebar_modules">
          <div v-for="(mod, mi) in activeMc.modules" :key="mod.id" class="masterclass_sidebar_module">

            <div class="masterclass_module_header"
                 @click="openModules[mod.id] = !openModules[mod.id]"
                 :class="{ 'mod_done': isModuleDone(mod) }">
              <div class="masterclass_module_number" :class="{ done: isModuleDone(mod) }">
                {{ isModuleDone(mod) ? '✓' : mi + 1 }}
              </div>
              <span class="masterclass_module_title">{{ t(mod.titleKey) }}</span>
              <span class="masterclass_module_chevron">{{ openModules[mod.id] ? '▾' : '▸' }}</span>
            </div>

            <div v-if="openModules[mod.id]" class="masterclass_sidebar_lessons">
              <div v-for="lesson in mod.lessons" :key="lesson.id"
                   class="masterclass_sidebar_lesson"
                   :class="{ active: activeLesson?.id === lesson.id, done: completedLessons.includes(lesson.id) }"
                   @click="selectLesson(lesson, mod)">
                <span class="lesson_status">
                  {{ completedLessons.includes(lesson.id) ? '✓' : activeLesson?.id === lesson.id ? '▶' : '○' }}
                </span>
                <div class="lesson_info">
                  <span class="lesson_title">{{ t(lesson.titleKey) }}</span>
                  <span class="lesson_duration">{{ lesson.duration }}</span>
                </div>
              </div>

              <div v-for="ex in mod.exercises" :key="ex.id"
                   class="masterclass_sidebar_lesson exercise"
                   :class="{ active: activeLesson?.id === ex.id, done: completedLessons.includes(ex.id) }"
                   @click="selectLesson(ex, mod, true)">
                <span class="lesson_status">
                  {{ completedLessons.includes(ex.id) ? '✓' : activeLesson?.id === ex.id ? '▶' : '📝' }}
                </span>
                <div class="lesson_info">
                  <span class="lesson_title">{{ t(ex.titleKey) }}</span>
                  <span class="lesson_duration exercise_tag">{{ t('res_exercise_label') }} · {{ ex.duration }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Contenu principal -->
      <main class="masterclass_content" ref="contentRef">

        <!-- Welcome screen -->
        <div v-if="!activeLesson" class="masterclass_welcome">
          <div class="masterclass_welcome_inner">
            <div class="masterclass_welcome_icon">🎓</div>
            <h2>{{ t(activeMc.titleKey) }}</h2>
            <p>{{ t(activeMc.descKey) }}</p>
            <div class="masterclass_welcome_stats">
              <div class="stat"><strong>{{ activeMc.modules.length }}</strong><span>{{ t('res_modules') }}</span></div>
              <div class="stat"><strong>{{ totalLessonsCount(activeMc) }}</strong><span>{{ t('res_lessons') }}</span></div>
              <div class="stat"><strong>{{ activeMc.totalDuration }}</strong><span>{{ t('res_of_content') }}</span></div>
            </div>
            <button class="masterclass_start_button" @click="startFirst">
              {{ getMcProgress(activeMc.id) > 0 ? t('res_continue') : t('res_start') }} →
            </button>
          </div>
        </div>

        <!-- Active lesson -->
        <div v-else class="masterclass_lesson">

          <div class="masterclass_lesson_header">
            <div class="masterclass_breadcrumb">
              <span>{{ t(activeMc.titleKey) }}</span>
              <span>›</span>
              <span>{{ activeModule ? t(activeModule.titleKey) : '' }}</span>
            </div>
            <div class="masterclass_lesson_meta">
              <span class="masterclass_lesson_type" :class="isExercise ? 'type_exercise' : 'type_lesson'">
                {{ isExercise ? '📝 ' + t('res_exercise_label') : '📖 ' + t('res_lesson_label') }}
              </span>
              <span class="masterclass_lesson_duration">{{ activeLesson.duration }}</span>
            </div>
          </div>

          <h1 class="masterclass_lesson_title">{{ t(activeLesson.titleKey) }}</h1>

          <!-- Lesson content -->
          <div v-if="!isExercise" class="masterclass_lesson_body">
            <div v-for="(block, i) in parsedContent" :key="i" class="masterclass_content_block">
              <p v-if="block.type === 'paragraph'" class="masterclass_paragraph">{{ block.text }}</p>
              <div v-else-if="block.type === 'list-item'" class="masterclass_list_item">
                <span class="masterclass_bullet" :class="getBulletClass(block.text)">{{ getBulletIcon(block.text) }}</span>
                <span>{{ cleanBullet(block.text) }}</span>
              </div>
              <h3 v-else-if="block.type === 'heading'" class="masterclass_heading">{{ block.text }}</h3>
              <div v-else-if="block.type === 'highlight'" class="masterclass_highlight">{{ block.text }}</div>
            </div>

            <div class="masterclass_lesson_actions">
              <button class="masterclass_mark_done" :class="{ done: completedLessons.includes(activeLesson.id) }"
                      @click="toggleLessonDone(activeLesson.id)">
                {{ completedLessons.includes(activeLesson.id) ? '✅ ' + t('res_completed') : '○ ' + t('res_mark_done') }}
              </button>
            </div>
          </div>

          <!-- Exercice -->
          <div v-else class="masterclass_exercise_body">

            <!-- Type checklist -->
            <div v-if="exerciseType === 'checklist'" class="exercise_checklist">
              <p class="exercise_intro">{{ exerciseIntro }}</p>
              <div class="exercise_checks">
                <label v-for="(item, i) in checklistItems" :key="i" class="exercise_check_item">
                  <input type="checkbox" v-model="checkedItems[i]" />
                  <span :class="{ checked: checkedItems[i] }">{{ item }}</span>
                </label>
              </div>
              <div class="exercise_checklist_progress">
                <div class="masterclass_progress_bar">
                  <div class="masterclass_progress_fill fill_green" :style="{ width: (checkedItems.filter(Boolean).length / checklistItems.length * 100) + '%' }" />
                </div>
                <span>{{ checkedItems.filter(Boolean).length }}/{{ checklistItems.length }}</span>
              </div>
            </div>

            <!-- Notes type (default) -->
            <div v-else class="exercise_notes">
              <div class="exercise_instructions">
                <div v-for="(block, i) in parsedContent" :key="i">
                  <p v-if="block.type === 'paragraph'" class="masterclass_paragraph">{{ block.text }}</p>
                  <div v-else-if="block.type === 'list-item'" class="masterclass_list_item">
                    <span class="masterclass_bullet">→</span>
                    <span>{{ cleanBullet(block.text) }}</span>
                  </div>
                </div>
              </div>
              <div class="exercise_notes_area">
                <label>📝 {{ t('res_my_notes') }}</label>
                <textarea v-model="exerciseNotes[activeLesson.id]" :placeholder="t('res_notes_ph')" @input="saveNotes" rows="6" />
                <span class="exercise_notes_saved" v-if="notesSaved">✓ {{ t('res_saved') }}</span>
              </div>
            </div>

            <div class="masterclass_lesson_actions">
              <button class="masterclass_mark_done" :class="{ done: completedLessons.includes(activeLesson.id) }"
                      @click="toggleLessonDone(activeLesson.id)">
                {{ completedLessons.includes(activeLesson.id) ? '✅ ' + t('res_exercise_done') : '○ ' + t('res_mark_done') }}
              </button>
            </div>
          </div>

          <!-- Lesson navigation -->
          <div class="masterclass_navigation">
            <button class="masterclass_navigation_button" @click="prevLesson" :disabled="!hasPrev">← {{ t('res_prev') }}</button>
            <span class="masterclass_navigation_position">{{ currentPosition }}</span>
            <button class="masterclass_navigation_button primary" @click="nextLesson" :disabled="!hasNext">{{ t('res_next') }} →</button>
          </div>

          <!-- Completed module badge -->
          <transition name="badge_pop">
            <div v-if="showBadge" class="masterclass_badge_popup">
              <div class="badge_icon">🏅</div>
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
.masterclass_list_view { max-width: 900px; }
.masterclass_list_header { margin-bottom: 32px; }
.masterclass_list_header h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 4px; }
.masterclass_list_header p { font-size: 0.85rem; color: var(--text-secondary); }

.masterclass_cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
.masterclass_card { background: #fff; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; cursor: pointer; transition: all 0.2s; position: relative; }
.masterclass_card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.masterclass_card_accent { height: 4px; }
.accent_purple { background: linear-gradient(90deg, var(--purple), #a78bfa); }
.accent_green { background: linear-gradient(90deg, var(--green), #34d399); }
.masterclass_card_body { padding: 24px; }
.masterclass_card_top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.masterclass_badge { font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
.badge_new { background: var(--purple-bg); color: var(--purple); }
.badge_done { background: var(--bg); color: var(--text-muted); }
.masterclass_duration { font-size: 0.72rem; color: var(--text-muted); }
.masterclass_card h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; line-height: 1.4; }
.masterclass_card p { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px; }
.masterclass_card_stats { display: flex; gap: 8px; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 16px; }

.masterclass_progress_wrapper { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.masterclass_progress_bar { flex: 1; height: 6px; background: var(--bg); border-radius: 99px; overflow: hidden; }
.masterclass_progress_fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
.fill_purple { background: var(--purple); }
.fill_green { background: var(--green); }
.masterclass_progress_percent { font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; }

.masterclass_start_button { background: var(--purple); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.15s; width: 100%; }
.masterclass_start_button:hover { background: var(--purple-dark); }
.button_continue { background: var(--green); }
.button_continue:hover { background: #059669; }
.masterclass_card_badge { position: absolute; top: 16px; right: 16px; font-size: 1.8rem; }

/* ── Vue cours ── */
.masterclass_course_view { display: flex; height: calc(100vh - 80px); overflow: hidden; }

.masterclass_sidebar { width: 280px; flex-shrink: 0; background: #fff; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; }
.masterclass_back_button { background: none; border: none; cursor: pointer; padding: 16px 20px; text-align: left; font-size: 0.82rem; color: var(--text-muted); border-bottom: 1px solid var(--border-light); transition: color 0.15s; }
.masterclass_back_button:hover { color: var(--purple); }
.masterclass_sidebar_title { padding: 16px 20px 8px; font-size: 0.85rem; font-weight: 700; line-height: 1.4; }
.masterclass_sidebar_progress { padding: 0 20px 16px; display: flex; flex-direction: column; gap: 4px; }
.masterclass_sidebar_progress span { font-size: 0.7rem; color: var(--text-muted); }

.masterclass_sidebar_modules { flex: 1; padding: 8px 0; }
.masterclass_sidebar_module { border-bottom: 1px solid var(--border-light); }
.masterclass_module_header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; transition: background 0.12s; }
.masterclass_module_header:hover { background: var(--bg-hover); }
.masterclass_module_header.mod_done { opacity: 0.7; }
.masterclass_module_number { width: 22px; height: 22px; border-radius: 50%; background: var(--purple-bg); color: var(--purple); font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.masterclass_module_number.done { background: #d1fae5; color: #059669; }
.masterclass_module_title { flex: 1; font-size: 0.78rem; font-weight: 600; line-height: 1.3; }
.masterclass_module_chevron { font-size: 0.7rem; color: var(--text-muted); }

.masterclass_sidebar_lessons { background: var(--bg); padding: 4px 0; }
.masterclass_sidebar_lesson { display: flex; align-items: flex-start; gap: 10px; padding: 8px 16px 8px 24px; cursor: pointer; transition: background 0.12s; border-radius: 4px; }
.masterclass_sidebar_lesson:hover { background: var(--bg-hover); }
.masterclass_sidebar_lesson.active { background: var(--purple-bg); }
.masterclass_sidebar_lesson.done .lesson_title { color: var(--text-muted); text-decoration: line-through; }
.lesson_status { font-size: 0.75rem; color: var(--text-muted); width: 14px; flex-shrink: 0; margin-top: 1px; }
.masterclass_sidebar_lesson.active .lesson_status { color: var(--purple); }
.masterclass_sidebar_lesson.done .lesson_status { color: var(--green); }
.lesson_title { font-size: 0.78rem; display: block; line-height: 1.4; }
.lesson_duration { font-size: 0.65rem; color: var(--text-muted); }
.exercise_tag { color: var(--purple) !important; font-weight: 500; }

/* ── Contenu principal ── */
.masterclass_content { flex: 1; overflow-y: auto; background: #fafafa; }

.masterclass_welcome { display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 40px; }
.masterclass_welcome_inner { max-width: 500px; text-align: center; }
.masterclass_welcome_icon { font-size: 4rem; margin-bottom: 20px; }
.masterclass_welcome_inner h2 { font-size: 1.5rem; font-weight: 800; margin-bottom: 12px; }
.masterclass_welcome_inner p { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.7; margin-bottom: 28px; }
.masterclass_welcome_stats { display: flex; justify-content: center; gap: 32px; margin-bottom: 28px; }
.stat strong { display: block; font-size: 1.5rem; font-weight: 800; color: var(--purple); }
.stat span { font-size: 0.75rem; color: var(--text-muted); }

.masterclass_lesson { max-width: 700px; margin: 0 auto; padding: 32px 40px 80px; }
.masterclass_lesson_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.masterclass_breadcrumb { font-size: 0.72rem; color: var(--text-muted); display: flex; gap: 6px; align-items: center; }
.masterclass_lesson_meta { display: flex; gap: 10px; align-items: center; }
.masterclass_lesson_type { font-size: 0.68rem; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
.type_lesson { background: var(--purple-bg); color: var(--purple); }
.type_exercise { background: #fef3c7; color: #d97706; }
.masterclass_lesson_duration { font-size: 0.72rem; color: var(--text-muted); }
.masterclass_lesson_title { font-size: 1.6rem; font-weight: 800; line-height: 1.3; margin-bottom: 28px; color: #111; }

.masterclass_lesson_body { display: flex; flex-direction: column; gap: 4px; }
.masterclass_paragraph { font-size: 0.95rem; line-height: 1.8; color: #374151; margin: 8px 0; }
.masterclass_list_item { display: flex; gap: 12px; align-items: flex-start; padding: 6px 0; }
.masterclass_bullet { font-size: 0.8rem; color: var(--text-muted); width: 20px; flex-shrink: 0; margin-top: 3px; font-weight: 600; }
.bullet_red { color: #ef4444; }
.bullet_orange { color: #f97316; }
.bullet_yellow { color: #f59e0b; }
.bullet_green { color: #10b981; }
.masterclass_list_item span:last-child { font-size: 0.9rem; line-height: 1.7; color: #374151; }
.masterclass_heading { font-size: 1rem; font-weight: 700; color: var(--purple); margin: 20px 0 8px; padding-top: 16px; border-top: 1px solid var(--border-light); }
.masterclass_highlight { font-size: 0.95rem; font-style: italic; color: var(--purple); background: var(--purple-bg); padding: 14px 20px; border-radius: 8px; border-left: 3px solid var(--purple); margin: 12px 0; line-height: 1.7; }

.masterclass_lesson_actions { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border-light); }
.masterclass_mark_done { background: none; border: 2px solid var(--border); padding: 10px 24px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.15s; color: var(--text-muted); }
.masterclass_mark_done:hover { border-color: var(--green); color: var(--green); }
.masterclass_mark_done.done { border-color: var(--green); color: var(--green); background: #d1fae5; }

.masterclass_navigation { display: flex; justify-content: space-between; align-items: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border-light); }
.masterclass_navigation_button { background: none; border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
.masterclass_navigation_button:hover:not(:disabled) { border-color: var(--purple); color: var(--purple); }
.masterclass_navigation_button:disabled { opacity: 0.3; cursor: not-allowed; }
.masterclass_navigation_button.primary { background: var(--purple); color: #fff; border-color: var(--purple); }
.masterclass_navigation_button.primary:hover { background: var(--purple-dark); }
.masterclass_navigation_position { font-size: 0.78rem; color: var(--text-muted); }

/* ── Exercices ── */
.masterclass_exercise_body { display: flex; flex-direction: column; gap: 24px; }

.exercise_intro { font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.6; }
.exercise_checks { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.exercise_check_item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.15s; font-size: 0.88rem; }
.exercise_check_item:hover { border-color: var(--purple-border); }
.exercise_check_item input { accent-color: var(--green); width: 16px; height: 16px; }
.exercise_check_item span.checked { text-decoration: line-through; color: var(--text-muted); }
.exercise_checklist_progress { display: flex; align-items: center; gap: 12px; }
.exercise_checklist_progress span { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }

.exercise_instructions { margin-bottom: 20px; }
.exercise_notes_area { display: flex; flex-direction: column; gap: 8px; }
.exercise_notes_area label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); }
.exercise_notes_area textarea { padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px; font-size: 0.88rem; line-height: 1.7; outline: none; resize: vertical; font-family: inherit; background: #fff; }
.exercise_notes_area textarea:focus { border-color: var(--purple); }
.exercise_notes_saved { font-size: 0.72rem; color: var(--green); }

/* Badge popup */
.masterclass_badge_popup { position: fixed; bottom: 32px; right: 32px; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-xl); padding: 16px 20px; display: flex; align-items: center; gap: 14px; z-index: 100; max-width: 320px; }
.badge_icon { font-size: 2.5rem; flex-shrink: 0; }
.masterclass_badge_popup strong { font-size: 0.9rem; display: block; margin-bottom: 2px; }
.masterclass_badge_popup p { font-size: 0.78rem; color: var(--text-secondary); margin: 0; }
.masterclass_badge_popup button { background: none; border: none; cursor: pointer; color: var(--text-muted); margin-left: auto; flex-shrink: 0; }

.badge_pop-enter-active { animation: badge-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.badge_pop-leave-active { animation: badge-out 0.3s ease; }
@keyframes badge-in { from { opacity: 0; transform: translateY(20px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes badge-out { from { opacity: 1; } to { opacity: 0; transform: translateY(10px); } }

@media (max-width: 768px) {
  .masterclass_course_view { flex-direction: column; }
  .masterclass_sidebar { width: 100%; height: auto; max-height: 250px; }
  .masterclass_lesson { padding: 20px 16px 60px; }
  .masterclass_cards { grid-template-columns: 1fr; }
}
</style>
