import { defineStore } from 'pinia'
import { ref } from 'vue'

// FB-02 (arbitrage Lidia 20/07) : la fiche client est une POP-UP modale, ouverte
// depuis n'importe où (Dashboard, Portfolio, Manager…). État global léger : un seul
// point d'ouverture, la modale est montée une fois dans AppLayout.
export const useClientModalStore = defineStore('clientModal', () => {
  const isOpen = ref(false)
  const clientId = ref(null)

  function open(id) { clientId.value = id; isOpen.value = true }
  function close() { isOpen.value = false; clientId.value = null }

  return { isOpen, clientId, open, close }
}, { persist: false })
