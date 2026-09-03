<template>
  <div class="sv-panel">
    <!-- Email Config Section -->
    <div class="sv-section">
      <h3>{{ L('title') }}</h3>
      <p class="ei-desc">{{ L('desc') }}</p>

      <!-- Status badge -->
      <div class="ei-status-bar">
        <span class="ei-logo">📧</span>
        <strong>Resend</strong>
        <span :class="['ei-badge', isConfigured ? 'ei-active' : '']">
          {{ isConfigured ? L('active') : L('inactive') }}
        </span>
      </div>

      <!-- RESEND-STATE (27/08) : un membre voit le vrai statut de l'org (même source que
           Email Studio) mais pas la configuration — le serveur la refuse déjà (403 not_org_owner) -->
      <p v-if="!canManage" class="ei-desc">{{ L('managed_by_owner') }}</p>

      <!-- Setup Guide (shown when not configured) -->
      <div v-if="canManage && !isConfigured" class="ei-guide">
        <div v-for="(step, i) in steps" :key="i" class="ei-step">
          <div class="ei-step-num">{{ i + 1 }}</div>
          <div>
            <strong>{{ step.title }}</strong>
            <p>{{ step.desc }}</p>
            <a v-if="step.link" :href="step.link" target="_blank" rel="noopener" class="ei-link">
              {{ step.linkLabel }} →
            </a>
          </div>
        </div>
      </div>

      <!-- Config Form -->
      <div v-if="canManage" class="ei-form">
        <div class="ei-field">
          <label>{{ L('key_label') }}</label>
          <input v-model="form.key" type="password" :placeholder="isConfigured ? '••••••••••••' : L('key_ph')" class="fi" autocomplete="off" />
        </div>
        <div class="ei-row">
          <div class="ei-field">
            <label>{{ L('domain_label') }}</label>
            <input v-model="form.domain" type="text" :placeholder="L('domain_ph')" class="fi" />
          </div>
          <div class="ei-field">
            <label>{{ L('sender_label') }}</label>
            <input v-model="form.sender" type="text" :placeholder="L('sender_ph')" class="fi" />
          </div>
        </div>

        <div v-if="error" class="ei-error">{{ error }}</div>
        <div v-if="success" class="ei-success">{{ success }}</div>

        <div class="ei-actions">
          <button class="btn-secondary" @click="testConnection" :disabled="testing || (!form.key && !isConfigured)">
            {{ testing ? '...' : L('test') }}
          </button>
          <button class="btn-save" @click="saveConfig" :disabled="saving || (!form.key && !isConfigured)">
            {{ saving ? '...' : L('save') }}
          </button>
        </div>
      </div>

      <!-- Privacy note -->
      <div v-if="canManage" class="ei-privacy">
        <span>🔒</span>
        <span>{{ L('privacy') }}</span>
      </div>
    </div>

    <!-- Team Permissions (shown when configured) -->
    <div v-if="canManage && isConfigured && teamMembers.length" class="sv-section">
      <h3>{{ L('perm_title') }}</h3>
      <p class="ei-desc">{{ L('perm_desc') }}</p>
      <div class="ei-members">
        <div v-for="m in teamMembers" :key="m.id" class="ei-member">
          <div class="ei-member-info">
            <strong>{{ m.name }}</strong>
            <span class="ei-member-email">{{ m.email }}</span>
          </div>
          <label class="ei-toggle">
            <input type="checkbox" :checked="m.canSendEmail" @change="togglePermission(m)" />
            <span class="ei-toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const team = useTeamStore()
const auth = useAuthStore()
// Miroir de assertCanManage côté serveur (contrat CR-8 D2) : owner de l'org, ou compte sans org
const canManage = computed(() => auth.isOrgOwner || !auth.profile?.organization_id)

// ─── i18n inline (no useI18n dependency) ──────────────────────
const locale = ref(localStorage.getItem('scalyo_lang') || navigator.language?.slice(0, 2) || 'fr')

const translations = {
  fr: {
    title: 'Email Studio',
    desc: 'Connectez votre compte Resend pour envoyer des emails personnalisés depuis Scalyo.',
    active: 'Connecté',
    inactive: 'Non configuré',
    key_label: 'Clé API Resend',
    key_ph: 're_...',
    domain_label: 'Domaine vérifié',
    domain_ph: 'votreentreprise.com',
    sender_label: 'Nom expéditeur',
    sender_ph: 'Équipe CS',
    test: 'Tester',
    save: 'Enregistrer',
    test_ok: 'Connexion validée',
    test_fail: 'Échec de connexion. Vérifiez votre clé.',
    saved: 'Configuration enregistrée',
    invalid_key: 'La clé API doit commencer par re_',
    privacy: 'Votre clé API est chiffrée et stockée de manière sécurisée. Elle n\'est jamais exposée aux membres de votre équipe ni transmise à des tiers.',
    perm_title: 'Permissions d\'envoi',
    perm_desc: 'Choisissez quels membres de votre équipe peuvent envoyer des emails via Email Studio.',
    managed_by_owner: 'Configuration gérée par le propriétaire de l\'organisation.',
    step1_title: 'Créer un compte Resend',
    step1_desc: 'Inscrivez-vous gratuitement — 3 000 emails/mois inclus (plafond Resend : 100/jour).',
    step2_title: 'Vérifier votre domaine',
    step2_desc: 'Ajoutez les records DNS fournis par Resend pour envoyer depuis votre propre domaine.',
    step3_title: 'Créer une clé API',
    step3_desc: 'Dans Settings → API Keys, créez une clé avec les permissions d\'envoi.',
    step4_title: 'Coller ci-dessous',
    step4_desc: 'Collez votre clé, testez la connexion, et c\'est prêt.',
  },
  en: {
    title: 'Email Studio',
    desc: 'Connect your Resend account to send personalized emails from Scalyo.',
    active: 'Connected',
    inactive: 'Not configured',
    key_label: 'Resend API Key',
    key_ph: 're_...',
    domain_label: 'Verified domain',
    domain_ph: 'yourcompany.com',
    sender_label: 'Sender name',
    sender_ph: 'CS Team',
    test: 'Test',
    save: 'Save',
    test_ok: 'Connection verified',
    test_fail: 'Connection failed. Check your key.',
    saved: 'Configuration saved',
    invalid_key: 'API key must start with re_',
    privacy: 'Your API key is encrypted and securely stored. It is never exposed to team members or shared with third parties.',
    perm_title: 'Send permissions',
    perm_desc: 'Choose which team members can send emails via Email Studio.',
    managed_by_owner: 'Configuration is managed by the organization owner.',
    step1_title: 'Create a Resend account',
    step1_desc: 'Sign up for free — 3,000 emails/month included (Resend cap: 100/day).',
    step2_title: 'Verify your domain',
    step2_desc: 'Add the DNS records provided by Resend to send from your own domain.',
    step3_title: 'Create an API key',
    step3_desc: 'In Settings → API Keys, create a key with sending permissions.',
    step4_title: 'Paste below',
    step4_desc: 'Paste your key, test the connection, and you\'re ready.',
  },
  ko: {
    title: '이메일 스튜디오',
    desc: 'Resend 계정을 연결하여 Scalyo에서 맞춤형 이메일을 보내세요.',
    active: '연결됨',
    inactive: '미설정',
    key_label: 'Resend API 키',
    key_ph: 're_...',
    domain_label: '인증된 도메인',
    domain_ph: 'yourcompany.com',
    sender_label: '발신자 이름',
    sender_ph: 'CS 팀',
    test: '테스트',
    save: '저장',
    test_ok: '연결 확인됨',
    test_fail: '연결 실패. 키를 확인하세요.',
    saved: '설정이 저장되었습니다',
    invalid_key: 'API 키는 re_로 시작해야 합니다',
    privacy: 'API 키는 암호화되어 안전하게 저장됩니다. 팀원에게 노출되거나 제3자와 공유되지 않습니다.',
    perm_title: '발송 권한',
    perm_desc: '이메일 스튜디오를 통해 이메일을 보낼 수 있는 팀원을 선택하세요.',
    managed_by_owner: '설정은 조직 소유자가 관리합니다.',
    step1_title: 'Resend 계정 만들기',
    step1_desc: '무료로 가입하세요 — 월 3,000건 포함 (Resend 일일 한도 100건).',
    step2_title: '도메인 인증',
    step2_desc: 'Resend에서 제공하는 DNS 레코드를 추가하세요.',
    step3_title: 'API 키 생성',
    step3_desc: 'Settings → API Keys에서 발송 권한이 있는 키를 만드세요.',
    step4_title: '아래에 붙여넣기',
    step4_desc: '키를 붙여넣고 연결을 테스트하면 준비 완료.',
  }
}

function L(key) {
  const lang = ['fr', 'en', 'ko'].includes(locale.value) ? locale.value : 'fr'
  return translations[lang]?.[key] || translations.fr[key] || key
}

const steps = computed(() => [
  { title: L('step1_title'), desc: L('step1_desc'), link: 'https://resend.com/signup', linkLabel: 'resend.com' },
  { title: L('step2_title'), desc: L('step2_desc'), link: 'https://resend.com/domains', linkLabel: 'resend.com/domains' },
  { title: L('step3_title'), desc: L('step3_desc'), link: 'https://resend.com/api-keys', linkLabel: 'resend.com/api-keys' },
  { title: L('step4_title'), desc: L('step4_desc') },
])

// ─── State ────────────────────────────────────────────────────
const form = ref({ key: '', domain: '', sender: '' })
const saving = ref(false)
const testing = ref(false)
const error = ref('')
const success = ref('')
const isConfigured = ref(false)

const teamMembers = computed(() => team.members.map(m => ({
  ...m,
  canSendEmail: m.canSendEmail || false,
})))

// ─── API helper — CR-8 (E-08) : la clé ne transite que vers /api/*, jamais
// vers Supabase ni api.resend.com depuis le navigateur. Elle n'est jamais relue.
async function apiFetch(path, options = {}) {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  })
}

// ─── Load existing config (statut + champs non sensibles uniquement) ──────────
onMounted(async () => {
  await team.loadMembers()
  // RESEND-STATE (27/08) : UNE source de statut pour tous les rôles — la même RPC
  // que le bandeau d'Email Studio (get_org_email_status, org-wide, booléen + champs
  // non sensibles). L'ancien GET /api/email/config répondait 403 à un membre et le
  // composant affichait « Non configuré » alors que l'org était connectée.
  try {
    const { data, error } = await supabase.rpc('get_org_email_status')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    isConfigured.value = !!row?.configured
    form.value.domain = row?.sender_domain || ''
    form.value.sender = row?.sender_name || ''
  } catch { /* statut indisponible → non configuré, jamais un état inventé */ }
})

// ─── Save ─────────────────────────────────────────────────────
async function saveConfig() {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    form.value.key = form.value.key.trim()
    if (form.value.key && !form.value.key.startsWith('re_')) {
      error.value = L('invalid_key')
      return
    }
    const r = await apiFetch('/api/email/config', {
      method: 'POST',
      body: JSON.stringify({
        api_key: form.value.key || undefined,
        sender_domain: form.value.domain || '',
        sender_name: form.value.sender || '',
      }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw new Error(data.error || L('test_fail'))
    }
    isConfigured.value = true
    form.value.key = ''
    success.value = L('saved')
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e) { error.value = e.message }
  finally { saving.value = false }
}

// ─── Test connection (côté serveur — la clé ne sort jamais vers un tiers) ─────
async function testConnection() {
  testing.value = true
  error.value = ''
  success.value = ''
  try {
    const r = await apiFetch('/api/email/test', {
      method: 'POST',
      body: JSON.stringify(form.value.key ? { api_key: form.value.key.trim() } : {}),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok && data.valid) { success.value = L('test_ok') }
    else { error.value = L('test_fail') }
    setTimeout(() => { success.value = ''; error.value = '' }, 4000)
  } catch { error.value = L('test_fail') }
  finally { testing.value = false }
}

// ─── Toggle team permission ───────────────────────────────────
async function togglePermission(member) {
  const newVal = !member.canSendEmail
  await supabase.from('organization_members')
    .update({ can_send_email: newVal })
    .eq('user_id', member.id)
  const idx = team.members.findIndex(m => m.id === member.id)
  if (idx > -1) team.members[idx].canSendEmail = newVal
}
</script>

<style scoped>
.ei-desc { color: var(--text-secondary); margin-bottom: 1.25rem; font-size: 0.9rem; }
.ei-status-bar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--bg-secondary, #f8f9fa); border-radius: 12px; margin-bottom: 1.25rem; }
.ei-logo { font-size: 1.5rem; }
.ei-badge { font-size: 0.75rem; padding: 2px 10px; border-radius: 999px; background: var(--bg-tertiary, #e5e7eb); color: var(--text-secondary); }
.ei-badge.ei-active { background: #dcfce7; color: #166534; }

.ei-guide { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; padding: 1.25rem; background: var(--bg-secondary, #f8f9fa); border-radius: 16px; }
.ei-step { display: flex; gap: 1rem; align-items: flex-start; }
.ei-step-num { min-width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--primary, #6366f1); color: white; font-size: 0.8rem; font-weight: 600; }
.ei-step p { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--text-secondary); }
.ei-link { font-size: 0.85rem; color: var(--primary, #6366f1); text-decoration: none; }

.ei-form { display: flex; flex-direction: column; gap: 1rem; }
.ei-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.ei-field label { display: block; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.35rem; color: var(--text-secondary); }
.ei-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
.btn-secondary { padding: 0.5rem 1.25rem; border-radius: 10px; border: 1px solid var(--border, #d1d5db); background: transparent; cursor: pointer; font-size: 0.85rem; }
.btn-save { padding: 0.5rem 1.25rem; border-radius: 10px; border: none; background: var(--primary, #6366f1); color: white; cursor: pointer; font-size: 0.85rem; }
.btn-save:disabled, .btn-secondary:disabled { opacity: 0.5; cursor: default; }

.ei-error { color: #dc2626; font-size: 0.85rem; }
.ei-success { color: #16a34a; font-size: 0.85rem; }

.ei-privacy { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.75rem 1rem; background: var(--bg-secondary, #f0f4ff); border-radius: 12px; margin-top: 1rem; font-size: 0.8rem; color: var(--text-secondary); }

.ei-members { display: flex; flex-direction: column; gap: 0.5rem; }
.ei-member { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: var(--bg-secondary, #f8f9fa); border-radius: 12px; }
.ei-member-info { display: flex; flex-direction: column; }
.ei-member-email { font-size: 0.8rem; color: var(--text-secondary); }

.ei-toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
.ei-toggle input { opacity: 0; width: 0; height: 0; }
.ei-toggle-slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 999px; transition: 0.2s; }
.ei-toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: var(--bg-card); border-radius: 50%; transition: 0.2s; }
.ei-toggle input:checked + .ei-toggle-slider { background: var(--primary, #6366f1); }
.ei-toggle input:checked + .ei-toggle-slider::before { transform: translateX(20px); }

@media (max-width: 640px) { .ei-row { grid-template-columns: 1fr; } }
</style>