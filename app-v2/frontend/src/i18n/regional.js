// REGIONAL-I18N (04/09): the ONLY home for a REGIONAL VARIANT of a translation — the same
// language, expressed differently in another country. It exists because "the language is French"
// stopped being enough: a Québec account reads `Soumissions` where a French account reads `Devis`,
// a Swiss account reads `Offres`, and all three are correct French. Before this file the product
// had ONE French, ONE English, and no way to say so.
//
// SHAPE — an OVERRIDE TABLE, never a dictionary. A regional pack holds ONLY the keys whose value
// really differs from the base language; everything else falls back to fr / en / ko through
// vue-i18n's fallbackLocale chain (src/i18n/index.js). Copying a base value in here unchanged is
// the mistake this file is designed to prevent: the copy stops following its original the day the
// original is reworded, and the region silently keeps the old wording.
//
// R25 §4 (no hard-coded translation) still holds — src/i18n/ is the only home for a translation,
// and this file is inside it. A regional key MUST already exist in its base language:
// scripts/check-i18n.mjs fails on a regional key that overrides nothing, because a typo in a key
// name would otherwise be an override that never fires — invisible, since the base value still
// renders exactly as before.
//
// NO IMPORTS, plain `export const` objects: this file is loaded by the Workers runtime too
// (functions/api/_i18n/translate.js) — no Vite alias, no vue-i18n, no DOM.
//
// Interpolation is `{name}`, as in the base files: an override must carry the SAME placeholders as
// the value it replaces (check-i18n-quality.mjs enforces it) or the value disappears mid-sentence.

// ── Regional packs ──────────────────────────────────────────────────────────────────────────
// Key of a pack = `<language>-<ISO 3166-1 alpha-2 country>`. The base country of a language has no
// pack on purpose (fr-FR, en-US, ko-KR ARE fr / en / ko) — see BASE_REGION below.
export const REGIONAL_MESSAGES = {
  // Belgium — French. Belgian French differs from French French in far fewer UI words than people
  // expect; what a Belgian user actually notices is `GSM` for a mobile number. Numbers written in
  // words (septante / nonante) would belong here too — the product has none today.
  'fr-BE': {
    port_field_contact_phone: 'Téléphone / GSM',
    imp_field_phone: 'Téléphone / GSM',
  },

  // Switzerland (Suisse romande) — French. A quote is an `offre`, not a `devis`, and a mobile is a
  // `natel`. The VAT label stays `TVA` (country_law_tax_CH already carries the Swiss rate).
  'fr-CH': {
    sidebar_quotes: 'Offres',
    qt_title: 'Offres & Propositions',
    qt_new: '+ Nouvelle offre',
    qt_total: 'Total offres',
    qt_empty_title: 'Aucune offre pour le moment',
    qt_empty_note: '0 offre enregistrée · Stockage illimité',
    qt_create_title: 'Nouvelle offre',
    qt_field_title: "Titre de l'offre",
    qt_download_pdf: "Télécharger l'offre PDF",
    qt_delete: 'Supprimer cette offre',
    cd_add_quote: 'Offre',
    cd_tl_quote: 'Offre : {title} ({status})',
    chat_share_quote: 'Partager une offre',
    ai_ctx_quotes: 'Offres',
    ai_sug_qt1: 'Aide-moi à préparer une offre',
    rt_quotes: 'Offres — Scalyo',
    oxy_ferm_p_quotes: '{n} offre(s) créée(s)',
    plan_enterprise_price: 'Sur offre',
    port_field_contact_phone: 'Téléphone / Natel',
    imp_field_phone: 'Téléphone / Natel',
  },

  // Québec — French. The widest gap of the three: `courriel` (not email), `clavardage` (not chat),
  // `soumission` (not devis), `fin de semaine` (not week-end), and TPS/TVQ instead of TVA.
  // `Email Studio` is NOT overridden: it is the product's module name, not a common noun.
  'fr-CA': {
    sidebar_quotes: 'Soumissions',
    qt_title: 'Soumissions & Propositions',
    qt_new: '+ Nouvelle soumission',
    qt_total: 'Total soumissions',
    qt_empty_title: 'Aucune soumission pour le moment',
    qt_empty_note: '0 soumission enregistrée · Stockage illimité',
    qt_create_title: 'Nouvelle soumission',
    qt_field_title: 'Titre de la soumission',
    qt_download_pdf: 'Télécharger la soumission PDF',
    qt_delete: 'Supprimer cette soumission',
    qt_field_tax: 'Taxes TPS/TVQ (%)',
    cd_add_quote: 'Soumission',
    cd_tl_quote: 'Soumission : {title} ({status})',
    chat_share_quote: 'Partager une soumission',
    ai_ctx_quotes: 'Soumissions',
    ai_sug_qt1: 'Aide-moi à préparer une soumission',
    rt_quotes: 'Soumissions — Scalyo',
    oxy_ferm_p_quotes: '{n} soumission(s) créée(s)',
    plan_enterprise_price: 'Sur soumission',
    profile_email: 'Courriel',
    stg_email: 'Courriel',
    es_copy: 'Copier le courriel',
    es_subject_placeholder: 'Objet du courriel...',
    es_body_placeholder: "Rédigez votre courriel ou utilisez l'IA pour générer le contenu...",
    es_send_title: 'Envoyer le courriel',
    es_send_btn: 'Envoyer le courriel →',
    es_send_success: 'Courriel envoyé avec succès !',
    es_history_sent: 'Courriels envoyés',
    es_history_opened: 'Courriels ouverts',
    es_history_empty: "Aucun courriel envoyé pour l'instant",
    success_email_sent: 'Un courriel de confirmation vous a été envoyé',
    login_email_verified: '✅ Courriel confirmé ! Vous pouvez maintenant vous connecter.',
    sidebar_chat: 'Clavardage',
    chat_title: "Clavardage d'équipe",
    chat_channels: 'Canaux',
    chat_err_init_failed: "Le clavardage n'a pas pu démarrer. Rechargez la page.",
    pl_settings_hide_weekends: 'Masquer les fins de semaine',
  },

  // United Kingdom — English. The base English file is US-spelled; this pack is the -ise / -our
  // half of the language, plus `organisation`. Nothing else about the product changes.
  'en-GB': {
    customize: 'Customise',
    dash_customize_kpis: 'Customise',
    kpi_cust_title: 'Customise my KPIs',
    kpi_cust_subtitle: 'Customise the KPIs displayed on your dashboard',
    ai_analyze: 'Analyse',
    ai_thinking: 'Scalyo is analysing your data...',
    imp_subtitle: 'Import any complex file — Scalyo automatically analyses and routes your data',
    rm_color: 'Colour',
    sm_project_color: 'Colour',
    copil_cover_color: 'Theme colour',
    pl_event_color: 'Colour',
    pl_color_by: 'Colour by',
    stg_billing_managed_by_owner: 'Billing is managed by the organisation owner',
    team_err_cannot_remove_owner: 'The organisation owner cannot be removed.',
    join_subtitle: 'Create your account to join this organisation.',
    join_success_subtitle: 'You have joined the organisation.',
    join_expired: 'This invitation has expired. Ask your organisation for a new link.',
    join_other_org_title: 'This account already belongs to an organisation',
    oxy_team_disabled_body: 'The Oxygen team view is not enabled for your organisation yet.',
    integration_resend_description: 'Connect your Resend account to send personalised emails from Scalyo.',
    integration_resend_managed_by_owner: 'Configuration is managed by the organisation owner.',
    not_org_owner: 'Only the organisation owner can modify this configuration.',
  },
}

// A country that reads ANOTHER country's pack rather than owning a copy of it. An alias is not a
// second pack: `en-IE` resolves to the exact same object as `en-GB`, so a wording fixed once is
// fixed for all of them. Canada in English is deliberately absent — Canadian English keeps the
// -ize endings, so it is closer to the base file than to en-GB and falls back to `en`.
export const REGIONAL_ALIASES = {
  'en-IE': 'en-GB',
  'en-AU': 'en-GB',
  'en-NZ': 'en-GB',
  'fr-LU': 'fr-BE',
  'fr-MC': 'fr-BE',
}

// The country whose wording IS the base file. Picking it stores the region and resolves to the
// bare language — there is no `fr-FR` pack to maintain and never should be.
export const BASE_REGION = { fr: 'FR', en: 'US', ko: 'KR' }

// What the manager can pick in Settings → Preferences, per interface language. The label is an
// i18n KEY (R25 §4 / §5) — and deliberately the `country_law_country_*` family that already names
// these countries elsewhere in the product (R25 §3, one source per concern): a country is named
// once, whether it is being named for its tax law or for its way of saying "devis".
export const REGION_OPTIONS = {
  fr: [
    { code: 'FR', flag: '🇫🇷', labelKey: 'country_law_country_FR' },
    { code: 'BE', flag: '🇧🇪', labelKey: 'country_law_country_BE' },
    { code: 'CH', flag: '🇨🇭', labelKey: 'country_law_country_CH' },
    { code: 'CA', flag: '🇨🇦', labelKey: 'country_law_country_CA' },
  ],
  en: [
    { code: 'US', flag: '🇺🇸', labelKey: 'country_law_country_US' },
    { code: 'GB', flag: '🇬🇧', labelKey: 'country_law_country_GB' },
    { code: 'CA', flag: '🇨🇦', labelKey: 'country_law_country_CA' },
  ],
  ko: [
    { code: 'KR', flag: '🇰🇷', labelKey: 'country_law_country_KR' },
  ],
}

export const SUPPORTED_LANGUAGES = Object.keys(REGION_OPTIONS)

// ── Resolution ──────────────────────────────────────────────────────────────────────────────

// The base language of any locale id: 'fr-CA' → 'fr', 'fr' → 'fr', junk → 'fr'.
// Everything that indexes a `{ fr, en, ko }` object by the current locale MUST go through this —
// `legal[locale]`, `LANG_PATHS[locale]`, the `lang` sent to /api/ai. Without it a UK account
// (locale 'en-GB') misses the `en` entry and lands on the FRENCH fallback: the exact bug this
// helper exists to make impossible.
export function baseLanguage(locale) {
  const lang = String(locale || '').trim().toLowerCase().split(/[-_]/)[0]
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'fr'
}

// The region of a locale id: 'fr-CA' → 'CA'; a bare 'fr' → its base region 'FR' (a French account
// that never opened the picker IS in France as far as wording goes).
export function regionOf(locale) {
  const parts = String(locale || '').trim().split(/[-_]/)
  const country = (parts[1] || '').toUpperCase()
  return /^[A-Z]{2}$/.test(country) ? country : BASE_REGION[baseLanguage(locale)]
}

// True only for a country the PICKER offers for that language. Deliberately narrower than
// resolveLocale(), which accepts any country and degrades: this one guards the WRITE
// (stores/auth.saveRegion) so an unpickable country never reaches the database.
export function isSupportedRegion(lang, country) {
  const options = REGION_OPTIONS[baseLanguage(lang)] || []
  return options.some(o => o.code === String(country || '').trim().toUpperCase())
}

// THE function the rest of the app calls: a language code + a country code in, the locale id
// vue-i18n and Intl are driven with out. Returns the BARE language whenever there is nothing
// region-specific to say — an unknown country, the base country, or a country with neither pack
// nor alias — so no unregistered locale is ever set and the fallback chain stays one link long.
export function resolveLocale(lang, country) {
  const base = baseLanguage(lang)
  const region = String(country || '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(region) || region === BASE_REGION[base]) return base
  const tag = base + '-' + region
  return (REGIONAL_MESSAGES[tag] || REGIONAL_ALIASES[tag]) ? tag : base
}

// Every locale id vue-i18n must know about: the packs, plus one entry per alias pointing at the
// SAME object (see REGIONAL_ALIASES). Built here rather than in index.js so the server resolver
// and the front end read one expansion, not two.
export function regionalMessages() {
  const out = {}
  for (const [tag, messages] of Object.entries(REGIONAL_MESSAGES)) out[tag] = messages
  for (const [alias, target] of Object.entries(REGIONAL_ALIASES)) {
    if (REGIONAL_MESSAGES[target]) out[alias] = REGIONAL_MESSAGES[target]
  }
  return out
}

// fallbackLocale chain: a regional locale falls back to its base language, which falls back to
// French. This is what makes a pack an OVERRIDE table — a key absent from 'fr-CA' is served by
// 'fr', so the pack never has to be complete and check-i18n.mjs never asks it to be.
export function regionalFallback() {
  const out = {}
  for (const tag of Object.keys(regionalMessages())) {
    const base = baseLanguage(tag)
    out[tag] = base === 'fr' ? ['fr'] : [base, 'fr']
  }
  return out
}
