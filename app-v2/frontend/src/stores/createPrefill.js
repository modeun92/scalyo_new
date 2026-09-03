import { defineStore } from 'pinia'
import { ref } from 'vue'

// Increment B (feedback from Lidia: "create a quote / event / playbook linked to the client
// from the record"). A small intent relay between the client record (ClientModal)
// and the target modules (Quotes / Planning / Playbooks): the record sets the client,
// navigates to the module, and the module CONSUMES it once on mount to
// pre-select the client + open its creation form.
// "Consume once" pattern: reading empties the value → a prefill is never replayed
// on a later visit to the same module. No persistence.
export const useCreatePrefillStore = defineStore('createPrefill', () => {
  const clientId = ref('')
  const clientName = ref('')

  function set(id, name) {
    clientId.value = id || ''
    clientName.value = name || ''
  }

  // Returns the pending intent AND clears it (once). { clientId:'' } = nothing to do.
  function consume() {
    const v = { clientId: clientId.value, clientName: clientName.value }
    clientId.value = ''
    clientName.value = ''
    return v
  }

  return { clientId, clientName, set, consume }
}, { persist: false })
