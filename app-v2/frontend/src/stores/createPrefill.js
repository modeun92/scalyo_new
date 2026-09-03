import { defineStore } from 'pinia'
import { ref } from 'vue'

// Increment B (feedback Lidia « créer devis / événement / playbook liés au client
// depuis la fiche »). Petit relais d'intention entre la fiche client (ClientModal)
// et les modules cibles (Quotes / Planning / Playbooks) : la fiche pose le client,
// navigue vers le module, et le module CONSOMME une seule fois au montage pour
// pré-sélectionner le client + ouvrir son formulaire de création.
// Pattern « consume once » : lire vide toute la valeur → un prefill ne se rejoue
// jamais sur une visite ultérieure du même module. Pas de persistance.
export const useCreatePrefillStore = defineStore('createPrefill', () => {
  const clientId = ref('')
  const clientName = ref('')

  function set(id, name) {
    clientId.value = id || ''
    clientName.value = name || ''
  }

  // Retourne l'intention en attente ET la vide (once). { clientId:'' } = rien à faire.
  function consume() {
    const v = { clientId: clientId.value, clientName: clientName.value }
    clientId.value = ''
    clientName.value = ''
    return v
  }

  return { clientId, clientName, set, consume }
}, { persist: false })
