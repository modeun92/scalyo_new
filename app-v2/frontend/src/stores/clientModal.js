import { defineStore } from 'pinia'
import { ref } from 'vue'

// FB-02 (decision by Lidia 20/07): the client record is a modal POP-UP, opened
// from anywhere (Dashboard, Portfolio, Manager…). Light global state: a single
// opening point, the modal is mounted once in AppLayout.
export const useClientModalStore = defineStore('clientModal', () => {
  const isOpen = ref(false)
  const clientId = ref(null)

  function open(id) { clientId.value = id; isOpen.value = true }
  function close() { isOpen.value = false; clientId.value = null }

  return { isOpen, clientId, open, close }
}, { persist: false })
