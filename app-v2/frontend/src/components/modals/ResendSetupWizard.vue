<template>
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="handleClose">
<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4">
<div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
<div class="flex items-center gap-3">
<div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">R</div>
<div><h3 class="font-semibold text-slate-900 dark:text-white">{{ t('es_resend_wizard_title') }}</h3>
<p class="text-xs text-slate-500">{{ t('es_resend_wizard_subtitle') }}</p></div></div>
<button @click="handleClose" class="text-slate-400 hover:text-slate-600 p-1">&times;</button></div>
<div class="px-6 pt-5"><div class="flex items-center gap-2">
<div v-for="n in 3" :key="n" class="flex items-center flex-1">
<div :class="['w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold', step >= n ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500']">
<span v-if="step <= n">{{ n }}</span><span v-else>&#10003;</span></div>
<div v-if="n < 3" :class="['h-0.5 flex-1 mx-2', step > n ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700']"></div>
</div></div></div>
<div class="px-6 py-6 min-h-[220px]">
<div v-if="step===1" class="space-y-4">
<h4 class="font-semibold text-slate-900 dark:text-white">{{ t('es_resend_wizard_s1_title') }}</h4>
<p class="text-sm text-slate-600 dark:text-slate-400">{{ t('es_resend_wizard_s1_desc') }}</p>
<div class="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-lg p-4">
<p class="text-sm font-medium text-indigo-900 dark:text-indigo-200 mb-1">{{ t('es_resend_wizard_s1_free_title') }}</p>
<ul class="text-xs text-indigo-800 dark:text-indigo-300 space-y-1">
<li>{{ t('es_resend_wizard_s1_bullet1') }}</li>
<li>{{ t('es_resend_wizard_s1_bullet2') }}</li>
<li>{{ t('es_resend_wizard_s1_bullet3') }}</li></ul></div>
<div class="flex gap-2">
<a href="https://resend.com/signup" target="_blank" class="flex-1 text-center px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium">{{ t('es_resend_wizard_s1_cta_create') }}</a>
<button @click="step=2" class="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">{{ t('es_resend_wizard_s1_cta_have') }}</button>
</div></div>
<div v-if="step===2" class="space-y-4">
<h4 class="font-semibold text-slate-900 dark:text-white">{{ t('es_resend_wizard_s2_title') }}</h4>
<p class="text-sm text-slate-600 dark:text-slate-400">{{ t('es_resend_wizard_s2_desc') }}</p>
<div><label class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">{{ t('es_resend_wizard_s2_label') }}</label>
<input v-model.trim="apiKey" type="password" placeholder="re_xxx..." :disabled="testing" @keydown.enter="testKey" class="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"/>
<p v-if="error" class="mt-2 text-xs text-red-600">{{ error }}</p></div>
<div class="flex gap-2">
<button @click="step=1" :disabled="testing" class="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm">{{ t('common_back') }}</button>
<button @click="testKey" :disabled="!canTest||testing" class="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">{{ testing ? t('es_resend_wizard_s2_testing') : t('es_resend_wizard_s2_cta_test') }}</button>
</div></div>
<div v-if="step===3" class="space-y-4 text-center py-4">
<div class="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
<svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg></div>
<h4 class="font-semibold text-slate-900 dark:text-white text-lg">{{ t('es_resend_wizard_s3_title') }}</h4>
<p class="text-sm text-slate-600 dark:text-slate-400">{{ t('es_resend_wizard_s3_desc') }}</p>
<button @click="handleDone" class="w-full mt-4 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium">{{ t('es_resend_wizard_s3_cta_done') }}</button>
</div></div></div></div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
const { t } = useI18n()
const emit = defineEmits(['close', 'connected'])
const step = ref(1), apiKey = ref(''), testing = ref(false), error = ref('')
const canTest = computed(() => /^re_[A-Za-z0-9_-]{10,}$/.test(apiKey.value))
// CR-8 (E-08) : test + sauvegarde côté serveur (/api/email/*). La clé est chiffrée
// en base, n'est plus écrite dans profiles ni conservée dans le state Pinia.
async function apiFetch(path, body) {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body),
  })
}
async function testKey() {
  error.value = ''
  if (!canTest.value) { error.value = t('es_resend_wizard_err_format'); return }
  testing.value = true
  try {
    const testResp = await apiFetch('/api/email/test', { api_key: apiKey.value })
    const testData = await testResp.json().catch(() => ({}))
    if (!testResp.ok || !testData?.valid) { error.value = t('es_resend_wizard_err_invalid'); return }
    const saveResp = await apiFetch('/api/email/config', { api_key: apiKey.value })
    if (!saveResp.ok) {
      const saveData = await saveResp.json().catch(() => ({}))
      throw new Error(saveData.error || t('es_resend_wizard_err_generic'))
    }
    apiKey.value = ''
    step.value = 3
  } catch (e) { error.value = e.message || t('es_resend_wizard_err_generic') }
  finally { testing.value = false }
}
function handleDone() { emit('connected'); emit('close') }
function handleClose() { if (!testing.value) emit('close') }
</script>