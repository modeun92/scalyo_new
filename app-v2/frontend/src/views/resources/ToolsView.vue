<template>
  <div class="tools_view">
    <div class="tools_view_header">
      <h1>🔖 {{ t('tools_title') }}</h1>
      <p>{{ t('nav.toolsSub') }}</p>
    </div>

    <!-- Mes bookmarks / liens utiles -->
    <div class="tools_view_bookmarks">
      <div class="tools_view_section_header">
        <h2>🔖 {{ t('tools_title') }}</h2>
        <button class="tools_view_add_button" @click="showAddLink = true">+ {{ t('tools_add') }}</button>
      </div>

      <div v-if="!myLinks.length" class="tools_view_empty">
        <span>🔗</span>
        <p>{{ t('tools_empty') }}</p>
        <button class="button_primary_small" @click="showAddLink = true">{{ t('tools_empty_cta') }}</button>
      </div>

      <div v-else class="tools_view_links">
        <a v-for="(link, i) in myLinks" :key="i"
           :href="link.url" target="_blank"
           class="tools_view_link">
          <span class="tools_view_link_icon">🔗</span>
          <div>
            <strong>{{ link.title }}</strong>
            <span>{{ link.desc }}</span>
          </div>
          <button class="tools_view_delete_small" @click.prevent="removeLink(i)">✕</button>
        </a>
      </div>
    </div>

    <!-- Slide-over : Ajouter lien -->
    <div v-if="showAddLink" class="tools_view_overlay" @click.self="showAddLink = false">
      <div class="tools_view_panel">
        <div class="tools_view_panel_header">
          <strong>{{ t('tools_add') }}</strong>
          <button @click="showAddLink = false">✕</button>
        </div>
        <div class="tools_view_panel_body">
          <div class="field_group"><label>{{ t('tools_field_title') }}</label>
            <input v-model="newLink.title" :placeholder="t('tools_ph_title')" /></div>
          <div class="field_group"><label>{{ t('tools_field_url') }}</label>
            <input v-model="newLink.url" placeholder="https://..." /></div>
          <div class="field_group"><label>{{ t('tools_field_desc') }}</label>
            <input v-model="newLink.desc" :placeholder="t('tools_ph_desc')" /></div>
          <button class="button_primary" @click="addLink">{{ t('tools_btn_add') }}</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n({ useScope: 'global' })

const showAddLink = ref(false)

const myLinks = ref(JSON.parse(localStorage.getItem('scalyo_my_links') || '[]'))

const newLink = ref({ title: '', url: '', desc: '' })
function addLink() {
  if (!newLink.value.title.trim() || !newLink.value.url.trim()) return
  myLinks.value.push({ ...newLink.value })
  localStorage.setItem('scalyo_my_links', JSON.stringify(myLinks.value))
  newLink.value = { title: '', url: '', desc: '' }
  showAddLink.value = false
}
function removeLink(i) {
  myLinks.value.splice(i, 1)
  localStorage.setItem('scalyo_my_links', JSON.stringify(myLinks.value))
}
</script>

<style scoped>
.tools_view { max-width: 900px; }
.tools_view_header { margin-bottom: 28px; }
.tools_view_header h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 4px; }
.tools_view_header p { font-size: 0.85rem; color: var(--text-secondary); }
.tools_view_bookmarks { margin-bottom: 36px; }
.tools_view_section_header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.tools_view_section_header h2 { font-size: 1rem; font-weight: 700; }
.tools_view_add_button { background: none; border: 1px dashed var(--border); padding: 6px 14px; border-radius: 6px; font-size: 0.78rem; color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
.tools_view_add_button:hover { border-color: var(--purple); color: var(--purple); }
.tools_view_empty { text-align: center; padding: 32px; background: var(--bg); border-radius: 12px; border: 1px dashed var(--border); }
.tools_view_empty span { font-size: 2rem; display: block; margin-bottom: 8px; }
.tools_view_empty p { font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px; }
.button_primary_small { background: var(--purple); color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.tools_view_links { display: flex; flex-direction: column; gap: 8px; }
.tools_view_link { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; text-decoration: none; color: var(--text); transition: all 0.15s; }
.tools_view_link:hover { border-color: var(--purple-border); background: var(--purple-bg); }
.tools_view_link_icon { font-size: 1.2rem; flex-shrink: 0; }
.tools_view_link strong { font-size: 0.85rem; display: block; }
.tools_view_link span { font-size: 0.72rem; color: var(--text-muted); }
.tools_view_delete_small { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.75rem; margin-left: auto; flex-shrink: 0; opacity: 0.4; }
.tools_view_delete_small:hover { opacity: 1; color: var(--red); }
.tools_view_overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 100; display: flex; justify-content: flex-end; }
.tools_view_panel { width: 360px; background: #fff; height: 100vh; box-shadow: -4px 0 20px rgba(0,0,0,0.1); display: flex; flex-direction: column; }
.tools_view_panel_header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border); }
.tools_view_panel_header button { background: none; border: none; cursor: pointer; font-size: 1rem; color: var(--text-muted); }
.tools_view_panel_body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.field_group { display: flex; flex-direction: column; gap: 6px; }
.field_group label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); }
.field_group input, .field_group select { padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; outline: none; }
.field_group input:focus, .field_group select:focus { border-color: var(--purple); }
.button_primary { background: var(--purple); color: #fff; border: none; padding: 10px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
</style>
