<template>
<div class="blog_page">
  <div class="blog_container">
    <router-link to="/" class="blog_back">{{ t('blog_back') }}</router-link>
    <h1 class="blog_title">{{ t('blog_title') }}</h1>
    <p class="blog_subtitle">{{ t('blog_subtitle') }}</p>

    <div v-if="articles.length" class="blog_grid">
      <a v-for="article in articles" :key="article.slug" :href="'/blog/' + article.slug" class="blog_card">
        <span class="blog_card_category">{{ article.category }}</span>
        <h2 class="blog_card_title">{{ article.title }}</h2>
        <p class="blog_card_description">{{ article.description }}</p>
        <time class="blog_card_date">{{ formatDate(article.date) }}</time>
      </a>
    </div>

    <div v-else class="blog_coming">
      <div class="blog_coming_icon">\u{1F4DD}</div>
      <p class="blog_coming_text">{{ t('blog_coming') }}</p>
      <div class="blog_notify">
        <p class="blog_notify_label">{{ t('blog_notify') }}</p>
        <div class="blog_notify_form">
          <input v-model="email" type="email" :placeholder="t('blog_email_placeholder')" class="blog_input" @keyup.enter="subscribe" />
          <button class="blog_button" @click="subscribe" :disabled="subscribed">
            {{ subscribed ? '\u2713' : t('blog_cta') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { L } from '@/i18n/landing'

const locale = ref(navigator.language?.startsWith('ko') ? 'kr' : navigator.language?.startsWith('en') ? 'en' : 'fr')
function t(key) { return (L[locale.value] || L.fr)[key] || L.fr[key] || key }

const articles = ref([])
const email = ref('')
const subscribed = ref(false)

onMounted(async () => {
  try {
    const resp = await fetch('/blog/articles.json')
    if (resp.ok) articles.value = await resp.json()
  } catch (e) { /* fallback to empty */ }
})

function formatDate(d) {
  return new Date(d).toLocaleDateString(locale.value === 'kr' ? 'ko-KR' : locale.value === 'en' ? 'en-US' : 'fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function subscribe() {
  if (!email.value || subscribed.value) return
  subscribed.value = true
}
</script>

<style scoped>
.blog_page { min-height: 100vh; background: #f8f9fb; padding: 60px 24px; }
.blog_container { max-width: 800px; margin: 0 auto; }
.blog_back { font-size: .85rem; color: #7c3aed; text-decoration: none; display: inline-block; margin-bottom: 32px; }
.blog_back:hover { text-decoration: underline; }
.blog_title { font-size: 2.4rem; font-weight: 800; color: #1a1a2e; margin-bottom: 12px; }
.blog_subtitle { font-size: 1.1rem; color: #64748b; line-height: 1.6; margin-bottom: 48px; }

.blog_grid { display: flex; flex-direction: column; gap: 24px; }
.blog_card { background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0; text-decoration: none; color: inherit; transition: box-shadow .2s, border-color .2s; display: block; }
.blog_card:hover { box-shadow: 0 4px 20px rgba(124,58,237,.08); border-color: #7c3aed; }
.blog_card_category { display: inline-block; background: #f0ecfc; color: #7c3aed; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
.blog_card_title { font-size: 1.35rem; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; line-height: 1.3; }
.blog_card_description { font-size: .95rem; color: #64748b; line-height: 1.5; margin-bottom: 12px; }
.blog_card_date { font-size: .8rem; color: #94a3b8; }

.blog_coming { background: #fff; border-radius: 16px; padding: 48px 40px; text-align: center; border: 1px solid #e2e8f0; }
.blog_coming_icon { font-size: 2.4rem; margin-bottom: 16px; }
.blog_coming_text { font-size: 1.15rem; color: #1a1a2e; font-weight: 600; margin-bottom: 32px; }
.blog_notify_label { font-size: .9rem; color: #64748b; margin-bottom: 16px; }
.blog_notify_form { display: flex; gap: 8px; max-width: 400px; margin: 0 auto; }
.blog_input { flex: 1; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: .9rem; outline: none; transition: border-color .2s; }
.blog_input:focus { border-color: #7c3aed; }
.blog_button { padding: 12px 24px; background: #7c3aed; color: #fff; border: none; border-radius: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; transition: background .2s; white-space: nowrap; }
.blog_button:hover { background: #6d28d9; }
.blog_button:disabled { background: #10b981; cursor: default; }
@media (max-width: 480px) {
  .blog_notify_form { flex-direction: column; }
  .blog_title { font-size: 1.8rem; }
}
</style>