# Scalyo — Configuration de securite

## Provider IA

Mistral (Paris, EU) — RGPD conforme.
Aucun autre provider n'est configure. Les donnees ne quittent jamais l'UE.

### Env vars requises (Cloudflare Dashboard)

| Variable | Source | Usage |
|---|---|---|
| MISTRAL_API_KEY | console.mistral.ai | Provider IA |
| AI_MODEL | (optionnel) | Override le modele (defaut: mistral-medium-latest) |
| SUPABASE_JWT_SECRET | Supabase Dashboard | Verification auth |
| STRIPE_WEBHOOK_SECRET | Stripe Dashboard | Verification webhooks |
| SUPABASE_SERVICE_ROLE_KEY | Supabase Dashboard | Operations admin |

### Cles PUBLIQUES (constantes dans le code)

- SUPABASE_URL : URL publique du projet Supabase
- SUPABASE_ANON_KEY : cle publique Supabase (acces limite par RLS)

## Regles

1. Jamais de cle secrete dans le code source
2. Jamais de cle secrete dans les logs ou messages d'erreur
3. RLS actif sur toutes les tables utilisateur
4. Auth ES256 (jamais HMAC)
5. Consentement IA obligatoire avant traitement des donnees
6. HTTPS force via Cloudflare
7. Donnees IA hebergees exclusivement en UE (Mistral, Paris)
