import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const sidebarMobileOpen = ref(false)
  const slideOver = ref({ open: false, component: null, props: {} })
  const chatOpen = ref(false)
  const locale = ref(localStorage.getItem('scalyo_locale') || 'fr')

  function toggleSidebar() { sidebarCollapsed.value = !sidebarCollapsed.value }
  function toggleMobileSidebar() { sidebarMobileOpen.value = !sidebarMobileOpen.value }
  function closeMobileSidebar() { sidebarMobileOpen.value = false }

  function openSlideOver(component, props = {}) {
    slideOver.value = { open: true, component, props }
  }
  function closeSlideOver() {
    slideOver.value = { open: false, component: null, props: {} }
  }

  function toggleChat() { chatOpen.value = !chatOpen.value }

  return {
    sidebarCollapsed, sidebarMobileOpen, slideOver, chatOpen, locale,
    toggleSidebar, toggleMobileSidebar, closeMobileSidebar,
    openSlideOver, closeSlideOver, toggleChat,
  }
}, { persist: true })
