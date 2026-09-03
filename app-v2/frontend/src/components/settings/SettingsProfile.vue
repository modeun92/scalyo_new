<template>
  <div class="sv-panel">
    <!-- Account Info -->
    <div class="sv-section">
      <h3>{{ t('stg_account_info') }}</h3>
      <div class="sv-form">
        <div class="fg">
          <label>{{ t('reg_firstname') }}</label>
          <input v-model="localProfile.firstName" class="fi" />
        </div>
        <div class="fg">
          <label>{{ t('reg_lastname') }}</label>
          <input v-model="localProfile.lastName" class="fi" />
        </div>
        <div class="fg">
          <label>{{ t('stg_email') }}</label>
          <input v-model="localProfile.email" type="email" class="fi" disabled />
        </div>
        <button class="btn-primary" :disabled="profileSaving" @click="$emit('save')">
          {{ t('save') }}
        </button>
        <p v-if="profileSaved" class="stg-saved">✓ {{ t('stg_profile_saved') }}</p>
        <p v-if="profileError" class="sv-field-error">{{ t('stg_profile_error') }}</p>
      </div>
    </div>

    <!-- Company -->
    <div class="sv-section">
      <h3>{{ t('stg_company_name') }}</h3>
      <div class="sv-form">
        <div class="fg">
          <label>{{ t('stg_company_name') }}</label>
          <input v-model="localProfile.company" class="fi" />
        </div>
        <button class="btn-primary" :disabled="profileSaving" @click="$emit('save')">
          {{ t('save') }}
        </button>
        <p v-if="profileSaved" class="stg-saved">✓ {{ t('stg_profile_saved') }}</p>
        <p v-if="profileError" class="sv-field-error">{{ t('stg_profile_error') }}</p>
      </div>
    </div>

    <!-- Password -->
    <div class="sv-section">
      <h3>{{ t('stg_change_pwd') }}</h3>
      <div class="sv-form">
        <div class="fg">
          <label>{{ t('stg_current_pwd') }}</label>
          <input v-model="localPwd.current" type="password" class="fi" autocomplete="current-password" />
        </div>
        <div class="fg">
          <label>{{ t('stg_new_pwd') }}</label>
          <input v-model="localPwd.newPwd" type="password" class="fi" autocomplete="new-password" />
          <span class="fi-hint">{{ t('stg_pwd_hint') }}</span>
        </div>
        <div class="fg">
          <label>{{ t('stg_confirm_pwd') }}</label>
          <input v-model="localPwd.confirm" type="password" class="fi" autocomplete="new-password" />
        </div>
        <button
          class="btn-primary"
          :disabled="pwdSaving || !localPwd.current || !localPwd.newPwd || localPwd.newPwd.length < 8 || localPwd.newPwd !== localPwd.confirm"
          @click="$emit('change-pwd')"
        >
          {{ t('stg_change_btn') }}
        </button>
        <p v-if="pwdSaved" class="stg-saved">✓ {{ t('stg_pwd_changed') }}</p>
        <p v-if="pwdErrorKey" class="sv-field-error">{{ t(pwdErrorKey) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps({
  localProfile: { type: Object, required: true },
  localPwd: { type: Object, required: true },
  profileSaving: { type: Boolean, default: false },
  profileSaved: { type: Boolean, default: false },
  profileError: { type: Boolean, default: false },
  pwdSaving: { type: Boolean, default: false },
  pwdSaved: { type: Boolean, default: false },
  pwdErrorKey: { type: String, default: '' }
})

defineEmits(['save', 'change-pwd'])
</script>
