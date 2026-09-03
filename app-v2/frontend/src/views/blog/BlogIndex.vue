<template>
<div class="blog-page">
  <div class="blog-container">
    <router-link to="/" class="blog-back">{{ t('blog_back') }}</router-link>
    <h1 class="blog-title">{{ t('blog_title') }}</h1>
    <p class="blog-subtitle">{{ t('blog_subtitle') }}</p>

    <div v-if="articles.length" class="blog-grid">
      <a v-for="article in articles" :key="article.slug" :href="'/blog/' + article.slug" class="blog-card">
        <span class="blog-card-cat">{{ article.category }}</span>
        <h2 class="blog-card-title">{{ article.title }}</h2>
        <p class="blog-card-desc">{{ article.description }}</p>
        <time class="blog-card-date">{{ formatDate(article.date) }}</time>
      </a>
    </div>

    <div v-else class="blog-coming">
      <div class="blog-coming-icon">\u{1F4DD}</div>
      <p class="blog-coming-text">{{ t('blog_coming') }}</p>
      <div class="blog-notify">
        <p class="blog-notify-label">{{ t('blog_notify') }}</p>
        <div class="blog-notify-form">
          <input v-model="email" type="email" :placeholder="t('blog_email_placeholder')" class="blog-input" @keyup.enter="subscribe" />
          <button class="blog-btn" @click="subscribe" :disabled="subscribed">
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
.blog-page { min-height: 100vh; background: #f8f9fb; padding: 60px 24px; }
.blog-container { max-width: 800px; margin: 0 auto; }
.blog-back { font-size: .85rem; color: #7c3aed; text-decoration: none; display: inline-block; margin-bottom: 32px; }
.blog-back:hover { text-decoration: underline; }
.blog-title { font-size: 2.4rem; font-weight: 800; color: #1a1a2e; margin-bottom: 12px; }
.blog-subtitle { font-size: 1.1rem; color: #64748b; line-height: 1.6; margin-bottom: 48px; }

.blog-grid { display: flex; flex-direction: column; gap: 24px; }
.blog-card { background: #fff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0; text-decoration: none; color: inherit; transition: box-shadow .2s, border-color .2s; display: block; }
.blog-card:hover { box-shadow: 0 4px 20px rgba(124,58,237,.08); border-color: #7c3aed; }
.blog-card-cat { display: inline-block; background: #f0ecfc; color: #7c3aed; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
.blog-card-title { font-size: 1.35rem; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; line-height: 1.3; }
.blog-card-desc { font-size: .95rem; color: #64748b; line-height: 1.5; margin-bottom: 12px; }
.blog-card-date { font-size: .8rem; color: #94a3b8; }

.blog-coming { background: #fff; border-radius: 16px; padding: 48px 40px; text-align: center; border: 1px solid #e2e8f0; }
.blog-coming-icon { font-size: 2.4rem; margin-bottom: 16px; }
.blog-coming-text { font-size: 1.15rem; color: #1a1a2e; font-weight: 600; margin-bottom: 32px; }
.blog-notify-label { font-size: .9rem; color: #64748b; margin-bottom: 16px; }
.blog-notify-form { display: flex; gap: 8px; max-width: 400px; margin: 0 auto; }
.blog-input { flex: 1; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: .9rem; outline: none; transition: border-color .2s; }
.blog-input:focus { border-color: #7c3aed; }
.blog-btn { padding: 12px 24px; background: #7c3aed; color: #fff; border: none; border-radius: 10px; font-size: .9rem; font-weight: 600; cursor: pointer; transition: background .2s; white-space: nowrap; }
.blog-btn:hover { background: #6d28d9; }
.blog-btn:disabled { background: #10b981; cursor: default; }
@media (max-width: 480px) {
  .blog-notify-form { flex-direction: column; }
  .blog-title { font-size: 1.8rem; }
}
</style>