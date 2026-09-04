<template>
  <div class="wellbeing_resources_view">
    <div class="wellbeing_resources_header">
      <h1>💚 {{ t('nav.wellbeing') }}</h1>
      <p>{{ t('nav.wellbeingSub') }}</p>
      <span class="wellbeing_resources_season">{{ currentQuarterLabel }}</span>
    </div>

    <div class="wellbeing_resources_grid">
      <div v-for="card in currentTips" :key="card.titleKey" class="wellbeing_resources_card" :class="'wellbeing_resources_' + card.color">
        <span class="wbrc_icon">{{ card.icon }}</span>
        <h3>{{ t(card.titleKey) }}</h3>
        <p>{{ t(card.descKey) }}</p>
        <ul>
          <li v-for="tipKey in card.tipKeys" :key="tipKey">{{ t(tipKey) }}</li>
        </ul>
      </div>
    </div>

    <div class="wellbeing_resources_books">
      <div class="wellbeing_resources_books_header">
        <div>
          <h2>📚 {{ t('wbr_readings') }}</h2>
          <span class="wellbeing_resources_refresh_note">✨ {{ t('wbr_refresh_note') }}</span>
        </div>
      </div>
      <div class="wellbeing_resources_book_grid">
        <div v-for="book in currentBooks" :key="book.title" class="wellbeing_resources_book">
          <div class="wellbeing_resources_book_cover" :style="{ background: book.color }">{{ book.emoji }}</div>
          <div class="wellbeing_resources_book_info">
            <strong>{{ book.title }}</strong>
            <span class="wbrb_author">{{ book.author }}</span>
            <p class="wbrb_why">{{ t(book.whyKey) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

const currentQuarter = computed(() => {
  const month = new Date().getMonth()
  if (month < 3) return 0
  if (month < 6) return 1
  if (month < 9) return 2
  return 3
})

const quarterLabelKeys = ['wbr_q1_label', 'wbr_q2_label', 'wbr_q3_label', 'wbr_q4_label']
const currentQuarterLabel = computed(() => t(quarterLabelKeys[currentQuarter.value]))

const allTips = [
  [
    { icon: '🌱', color: 'green',  titleKey: 'wbr_q1_c1_title', descKey: 'wbr_q1_c1_desc', tipKeys: ['wbr_q1_c1_t1', 'wbr_q1_c1_t2', 'wbr_q1_c1_t3'] },
    { icon: '🔥', color: 'red',    titleKey: 'wbr_q1_c2_title', descKey: 'wbr_q1_c2_desc', tipKeys: ['wbr_q1_c2_t1', 'wbr_q1_c2_t2', 'wbr_q1_c2_t3'] },
    { icon: '💬', color: 'blue',   titleKey: 'wbr_q1_c3_title', descKey: 'wbr_q1_c3_desc', tipKeys: ['wbr_q1_c3_t1', 'wbr_q1_c3_t2', 'wbr_q1_c3_t3'] },
    { icon: '⚖️', color: 'purple', titleKey: 'wbr_q1_c4_title', descKey: 'wbr_q1_c4_desc', tipKeys: ['wbr_q1_c4_t1', 'wbr_q1_c4_t2', 'wbr_q1_c4_t3'] },
    { icon: '🎭', color: 'amber',  titleKey: 'wbr_q1_c5_title', descKey: 'wbr_q1_c5_desc', tipKeys: ['wbr_q1_c5_t1', 'wbr_q1_c5_t2', 'wbr_q1_c5_t3'] },
  ],
  [
    { icon: '🧘', color: 'green',  titleKey: 'wbr_q2_c1_title', descKey: 'wbr_q2_c1_desc', tipKeys: ['wbr_q2_c1_t1', 'wbr_q2_c1_t2', 'wbr_q2_c1_t3'] },
    { icon: '🔥', color: 'red',    titleKey: 'wbr_q2_c2_title', descKey: 'wbr_q2_c2_desc', tipKeys: ['wbr_q2_c2_t1', 'wbr_q2_c2_t2', 'wbr_q2_c2_t3'] },
    { icon: '💬', color: 'blue',   titleKey: 'wbr_q2_c3_title', descKey: 'wbr_q2_c3_desc', tipKeys: ['wbr_q2_c3_t1', 'wbr_q2_c3_t2', 'wbr_q2_c3_t3'] },
    { icon: '⚖️', color: 'purple', titleKey: 'wbr_q2_c4_title', descKey: 'wbr_q2_c4_desc', tipKeys: ['wbr_q2_c4_t1', 'wbr_q2_c4_t2', 'wbr_q2_c4_t3'] },
    { icon: '🎭', color: 'amber',  titleKey: 'wbr_q2_c5_title', descKey: 'wbr_q2_c5_desc', tipKeys: ['wbr_q2_c5_t1', 'wbr_q2_c5_t2', 'wbr_q2_c5_t3'] },
  ],
  [
    { icon: '🌊', color: 'green',  titleKey: 'wbr_q3_c1_title', descKey: 'wbr_q3_c1_desc', tipKeys: ['wbr_q3_c1_t1', 'wbr_q3_c1_t2', 'wbr_q3_c1_t3'] },
    { icon: '🔥', color: 'red',    titleKey: 'wbr_q3_c2_title', descKey: 'wbr_q3_c2_desc', tipKeys: ['wbr_q3_c2_t1', 'wbr_q3_c2_t2', 'wbr_q3_c2_t3'] },
    { icon: '💬', color: 'blue',   titleKey: 'wbr_q3_c3_title', descKey: 'wbr_q3_c3_desc', tipKeys: ['wbr_q3_c3_t1', 'wbr_q3_c3_t2', 'wbr_q3_c3_t3'] },
    { icon: '⚖️', color: 'purple', titleKey: 'wbr_q3_c4_title', descKey: 'wbr_q3_c4_desc', tipKeys: ['wbr_q3_c4_t1', 'wbr_q3_c4_t2', 'wbr_q3_c4_t3'] },
    { icon: '🎭', color: 'amber',  titleKey: 'wbr_q3_c5_title', descKey: 'wbr_q3_c5_desc', tipKeys: ['wbr_q3_c5_t1', 'wbr_q3_c5_t2', 'wbr_q3_c5_t3'] },
  ],
  [
    { icon: '🕯️', color: 'green',  titleKey: 'wbr_q4_c1_title', descKey: 'wbr_q4_c1_desc', tipKeys: ['wbr_q4_c1_t1', 'wbr_q4_c1_t2', 'wbr_q4_c1_t3'] },
    { icon: '🔥', color: 'red',    titleKey: 'wbr_q4_c2_title', descKey: 'wbr_q4_c2_desc', tipKeys: ['wbr_q4_c2_t1', 'wbr_q4_c2_t2', 'wbr_q4_c2_t3'] },
    { icon: '💬', color: 'blue',   titleKey: 'wbr_q4_c3_title', descKey: 'wbr_q4_c3_desc', tipKeys: ['wbr_q4_c3_t1', 'wbr_q4_c3_t2', 'wbr_q4_c3_t3'] },
    { icon: '⚖️', color: 'purple', titleKey: 'wbr_q4_c4_title', descKey: 'wbr_q4_c4_desc', tipKeys: ['wbr_q4_c4_t1', 'wbr_q4_c4_t2', 'wbr_q4_c4_t3'] },
    { icon: '🎭', color: 'amber',  titleKey: 'wbr_q4_c5_title', descKey: 'wbr_q4_c5_desc', tipKeys: ['wbr_q4_c5_t1', 'wbr_q4_c5_t2', 'wbr_q4_c5_t3'] },
  ],
]

const allBooks = [
  [
    { title: 'Atomic Habits',             author: 'James Clear',           emoji: '⚛️', color: '#dbeafe', whyKey: 'wbr_book_q1_1_why' },
    { title: 'Deep Work',                 author: 'Cal Newport',           emoji: '🧠', color: '#f5f3ff', whyKey: 'wbr_book_q1_2_why' },
    { title: 'The ONE Thing',             author: 'Gary Keller',           emoji: '🎯', color: '#fef3c7', whyKey: 'wbr_book_q1_3_why' },
    { title: 'Mindset',                   author: 'Carol Dweck',           emoji: '🌱', color: '#d1fae5', whyKey: 'wbr_book_q1_4_why' },
  ],
  [
    { title: 'The Burnout Fix',           author: 'Jacinta Jiménez',       emoji: '🔋', color: '#fee2e2', whyKey: 'wbr_book_q2_1_why' },
    { title: 'Never Split the Difference',author: 'Chris Voss',            emoji: '🤝', color: '#fef3c7', whyKey: 'wbr_book_q2_2_why' },
    { title: 'Nonviolent Communication',  author: 'Marshall Rosenberg',    emoji: '💬', color: '#d1fae5', whyKey: 'wbr_book_q2_3_why' },
    { title: 'Range',                     author: 'David Epstein',         emoji: '🌈', color: '#e0e7ff', whyKey: 'wbr_book_q2_4_why' },
  ],
  [
    { title: 'Four Thousand Weeks',       author: 'Oliver Burkeman',       emoji: '⏳', color: '#fef3c7', whyKey: 'wbr_book_q3_1_why' },
    { title: 'The Art of Impossible',     author: 'Steven Kotler',         emoji: '🚀', color: '#f5f3ff', whyKey: 'wbr_book_q3_2_why' },
    { title: 'Rest',                      author: 'Alex Soojung-Kim Pang', emoji: '🌿', color: '#d1fae5', whyKey: 'wbr_book_q3_3_why' },
    { title: 'The Obstacle Is The Way',   author: 'Ryan Holiday',          emoji: '⚡', color: '#fee2e2', whyKey: 'wbr_book_q3_4_why' },
  ],
  [
    { title: 'Essentialism',              author: 'Greg McKeown',          emoji: '✂️', color: '#e0e7ff', whyKey: 'wbr_book_q4_1_why' },
    { title: 'When',                      author: 'Daniel Pink',           emoji: '🕐', color: '#fef3c7', whyKey: 'wbr_book_q4_2_why' },
    { title: "Man's Search for Meaning",  author: 'Viktor Frankl',         emoji: '🕯️', color: '#f5f3ff', whyKey: 'wbr_book_q4_3_why' },
    { title: 'Dare to Lead',              author: 'Brené Brown',           emoji: '🦁', color: '#d1fae5', whyKey: 'wbr_book_q4_4_why' },
  ],
]

const currentTips = computed(() => allTips[currentQuarter.value])
const currentBooks = computed(() => allBooks[currentQuarter.value])
</script>

<style scoped>
.wellbeing_resources_view { max-width: 900px; }
.wellbeing_resources_header { margin-bottom: 24px; }
.wellbeing_resources_header h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 4px; }
.wellbeing_resources_header p { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; }
.wellbeing_resources_season { font-size: 0.78rem; background: var(--purple-bg); color: var(--purple); padding: 4px 12px; border-radius: 99px; font-weight: 600; }
.wellbeing_resources_grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 40px; }
.wellbeing_resources_card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: all 0.2s; }
.wellbeing_resources_card:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
.wellbeing_resources_green { border-top: 3px solid var(--green); }
.wellbeing_resources_red { border-top: 3px solid #ef4444; }
.wellbeing_resources_blue { border-top: 3px solid #3b82f6; }
.wellbeing_resources_purple { border-top: 3px solid var(--purple); }
.wellbeing_resources_amber { border-top: 3px solid #f59e0b; }
.wbrc_icon { font-size: 2rem; display: block; margin-bottom: 10px; }
.wellbeing_resources_card h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 6px; }
.wellbeing_resources_card p { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px; }
.wellbeing_resources_card ul { list-style: none; display: flex; flex-direction: column; gap: 7px; }
.wellbeing_resources_card li { font-size: 0.78rem; padding-left: 16px; position: relative; line-height: 1.5; color: #374151; }
.wellbeing_resources_card li::before { content: '→'; position: absolute; left: 0; color: var(--text-muted); }
.wellbeing_resources_books { margin-bottom: 32px; }
.wellbeing_resources_books_header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.wellbeing_resources_books_header h2 { font-size: 1rem; font-weight: 700; margin-bottom: 4px; }
.wellbeing_resources_refresh_note { font-size: 0.72rem; color: var(--text-muted); }
.wellbeing_resources_book_grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.wellbeing_resources_book { display: flex; flex-direction: column; gap: 12px; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 16px; transition: all 0.2s; }
.wellbeing_resources_book:hover { box-shadow: var(--shadow-sm); transform: translateY(-2px); }
.wellbeing_resources_book_cover { width: 48px; height: 64px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; }
.wellbeing_resources_book strong { font-size: 0.85rem; display: block; margin-bottom: 2px; }
.wbrb_author { font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 6px; }
.wbrb_why { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; margin: 0; }
@media (max-width: 768px) {
  .wellbeing_resources_grid { grid-template-columns: 1fr; }
  .wellbeing_resources_book_grid { grid-template-columns: 1fr 1fr; }
}
</style>
