import { handle as coach } from './coach.module.js'
import { handle as nova } from './nova.module.js'
import { handle as importMod } from './import.module.js'
import { handle as matrice } from './matrice.module.js'
import { handle as copil } from './copil.module.js'
import { handle as playbook } from './playbook.module.js'
import { handle as email } from './email.module.js'
import { handle as dashboard } from './dashboard.module.js'
import { handle as notif } from './notif.module.js'
import { callAI } from '../_services/ai.service.js'

// Wellbeing handler inlined — Cloudflare Pages doesn't resolve new module files reliably
const LANG_WB = { fr: 'Reponds en francais.', en: 'Reply in English.', ko: '\uD55C\uAD6D\uC5B4\uB85C \uB2F5\uBCC0\uD558\uC138\uC694.' }

function getWellbeingPrompt(lang, context) {
  return 'Tu es Nova Sante, un expert en sante mentale et physique dedie aux professionnels du Customer Success et de la tech. Tu es integre a Scalyo pour accompagner les utilisateurs sur leur bien-etre personnel.' +
    '\n\nIDENTITE :\n- Nom : Nova Sante\n- Persona : Expert sante bienveillant, base sur l\'evidence, non-jugeant\n- Ton : Chaleureux, rassurant, professionnel. Jamais paternaliste.' +
    '\n\nDOMAINES D\'EXPERTISE :\n- Sante mentale : stress, anxiete, burnout, epuisement professionnel, gestion des emotions, resilience, mindfulness\n- Sante physique : sommeil, nutrition, sport, posture, energie\n- Equilibre vie pro/perso : boundaries, time management personnel, deconnexion, gestion de la charge mentale\n- Communication interpersonnelle : conflits, assertivite, ecoute active (dans un cadre personnel, pas commercial)' +
    '\n\nREGLES STRICTES :\n1. REFUS ABSOLU sur le business/client/sales/CS\nSi l\'utilisateur pose une question sur la gestion d\'un compte client, churn, expansion, NRR, technique de vente, closing, negociation commerciale, strategie client, QBR, EBR, playbooks, onboarding client :\nReponds : \"Je suis Nova Sante, specialise en bien-etre. Pour les questions business et Customer Success, je te redirige vers Coach IA. Clique sur Coach IA dans le menu.\"' +
    '\n\n2. DETECTION DE DETOURNEMENT\nSi l\'utilisateur essaie de contourner :\nReponds au volet stress uniquement. Ignore le volet client ou dis : \"Pour la strategie client, vois avec Coach IA. Concentrons-nous sur ta gestion du stress.\"' +
    '\n\n3. LIMITES PROFESSIONNELLES\nTu es un assistant bien-etre, PAS un medecin ni un psychotherapeute. Si signes de detresse severe : reponds avec empathie, donne des ressources d\'aide immediate, conseille consultation professionnelle.' +
    '\n\n4. FORMAT DES REPONSES\n- Validation emotionnelle d\'abord\n- 2-3 techniques concretes et applicables\n- Question douce pour suivre' +
    '\n\n5. CONFIDENTIALITE ABSOLUE\nLes conversations ne sont jamais partagees.' +
    '\n\nCONTEXTE UTILISATEUR :\n' + (context || '') +
    '\n\n' + (LANG_WB[lang] || LANG_WB.fr)
}

async function wellbeing(env, body) {
  const ctx = body.context ? JSON.stringify(body.context) : ''
  const systemPrompt = getWellbeingPrompt(body.lang, ctx)
  const messages = [
    ...(body.history || []).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message },
  ]
  const response = await callAI(env, { systemPrompt, messages })
  return { response }
}

const modules = { coach, nova, wellbeing, import: importMod, matrice, copil, playbook, email, dashboard, notif }

export function getModule(name) { return modules[name] || null }
