<template>
  <div class="nf-page">
    <div class="nf-card">
      <div class="nf-logo">
        <ScalyoLogo :size="36" />
        <span class="nf-brand">Scalyo</span>
      </div>

      <div class="nf-code">404</div>
      <div class="nf-illustration" aria-hidden="true">
        <svg viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg" width="200">
          <rect x="20" y="20" width="160" height="80" rx="12" fill="#ede9fe" stroke="#c4b5fd" stroke-width="1.5"/>
          <rect x="36" y="36" width="60" height="8" rx="4" fill="#a78bfa"/>
          <rect x="36" y="52" width="40" height="6" rx="3" fill="#c4b5fd"/>
          <rect x="36" y="66" width="50" height="6" rx="3" fill="#ddd6fe"/>
          <circle cx="148" cy="56" r="20" fill="#fff" stroke="#c4b5fd" stroke-width="1.5"/>
          <text x="141" y="62" font-size="18" fill="#7c3aed">?</text>
        </svg>
      </div>

      <h1 class="nf-title">{{ t('notfound_title') }}</h1>
      <p class="nf-desc">{{ t('notfound_desc') }}</p>

      <div class="nf-actions">
        <button class="btn-primary" @click="goBack">← {{ t('notfound_back') }}</button>
        <button class="btn-outline" @click="$router.push(auth.isAuthenticated ? '/app/dashboard' : '/')">
          {{ t('notfound_home') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ScalyoLogo from '@/components/ScalyoLogo.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const auth = useAuthStore()

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push(auth.isAuthenticated ? '/app/dashboard' : '/')
  }
}
</script>

<style scoped>
.nf-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f3ff 0%, #faf5ff 100%);
  padding: 24px;
}
.nf-card {
  background: var(--bg-card);
  border-radius: 24px;
  padding: 48px 40px;
  max-width: 440px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(124,58,237,0.1);
}
.nf-logo {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-bottom: 24px;
}
.nf-brand { font-size: 1.2rem; font-weight: 800; color: #7c3aed; letter-spacing: -0.5px; }
.nf-code {
  font-size: 5rem; font-weight: 900;
  background: linear-gradient(135deg, #7c3aed, #a78bfa);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1; margin-bottom: 16px;
}
.nf-illustration { margin-bottom: 24px; display: flex; justify-content: center; }
.nf-title { font-size: 1.3rem; font-weight: 800; margin-bottom: 8px; }
.nf-desc { font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 28px; line-height: 1.6; }
.nf-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.btn-primary {
  background: var(--purple); color: #fff; border: none;
  padding: 11px 24px; border-radius: 10px; font-size: 0.88rem; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.btn-primary:hover { background: #6d28d9; transform: translateY(-1px); }
.btn-outline {
  background: none; border: 1px solid #d1d5db; color: #374151;
  padding: 11px 24px; border-radius: 10px; font-size: 0.88rem;
  cursor: pointer; transition: all 0.2s;
}
.btn-outline:hover { border-color: #7c3aed; color: #7c3aed; }
</style>