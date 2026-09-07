<template>
  <div class="settings_view_panel">
    <!-- Account Info -->
    <div class="settings_view_section">
      <h3>{{ t('setting_account_info') }}</h3>
      <div class="settings_view_form">
        <div class="field_group">
          <label>{{ t('register_firstname') }}</label>
          <input v-model="localProfile.firstName" class="field_input" />
        </div>
        <div class="field_group">
          <label>{{ t('register_lastname') }}</label>
          <input v-model="localProfile.lastName" class="field_input" />
        </div>
        <div class="field_group">
          <label>{{ t('setting_email') }}</label>
          <input v-model="localProfile.email" type="email" class="field_input" disabled />
        </div>
        <button class="button_primary" :disabled="profileSaving" @click="$emit('save')">
          {{ t('save') }}
        </button>
        <p v-if="profileSaved" class="settings_saved">✓ {{ t('setting_profile_saved') }}</p>
        <p v-if="profileError" class="settings_view_field_error">{{ t('setting_profile_error') }}</p>
      </div>
    </div>

    <!-- Company -->
    <div class="settings_view_section">
      <h3>{{ t('setting_company_name') }}</h3>
      <div class="settings_view_form">
        <div class="field_group">
          <label>{{ t('setting_company_name') }}</label>
          <input v-model="localProfile.company" class="field_input" />
        </div>
        <button class="button_primary" :disabled="profileSaving" @click="$emit('save')">
          {{ t('save') }}
        </button>
        <p v-if="profileSaved" class="settings_saved">✓ {{ t('setting_profile_saved') }}</p>
        <p v-if="profileError" class="settings_view_field_error">{{ t('setting_profile_error') }}</p>
      </div>
    </div>

    <!-- Password -->
    <div class="settings_view_section">
      <h3>{{ t('setting_change_pwd') }}</h3>
      <div class="settings_view_form">
        <div class="field_group">
          <label>{{ t('setting_current_pwd') }}</label>
          <input v-model="localPwd.current" type="password" class="field_input" autocomplete="current-password" />
        </div>
        <div class="field_group">
          <label>{{ t('setting_new_pwd') }}</label>
          <input v-model="localPwd.newPwd" type="password" class="field_input" autocomplete="new-password" />
          <span class="field_input_hint">{{ t('setting_pwd_hint') }}</span>
        </div>
        <div class="field_group">
          <label>{{ t('setting_confirm_pwd') }}</label>
          <input v-model="localPwd.confirm" type="password" class="field_input" autocomplete="new-password" />
        </div>
        <button
          class="button_primary"
          :disabled="pwdSaving || !localPwd.current || !localPwd.newPwd || localPwd.newPwd.length < 8 || localPwd.newPwd !== localPwd.confirm"
          @click="$emit('change-pwd')"
        >
          {{ t('setting_change_btn') }}
        </button>
        <p v-if="pwdSaved" class="settings_saved">✓ {{ t('setting_pwd_changed') }}</p>
        <p v-if="pwdErrorKey" class="settings_view_field_error">{{ t(pwdErrorKey) }}</p>
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
