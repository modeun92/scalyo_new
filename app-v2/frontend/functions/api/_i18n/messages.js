const messages = {
  ai_not_configured: {
    fr: "Le service IA n'est pas configuré.",
    en: 'AI service is not configured.',
    ko: 'AI 서비스가 구성되지 않았습니다.',
  },
  ai_unavailable: {
    fr: 'Le service IA est temporairement indisponible.',
    en: 'AI service is temporarily unavailable.',
    ko: 'AI 서비스를 일시적으로 사용할 수 없습니다.',
  },
  invalid_request: {
    fr: 'Requête invalide.',
    en: 'Invalid request.',
    ko: '잘못된 요청입니다.',
  },
  module_not_found: {
    fr: 'Module introuvable.',
    en: 'Module not found.',
    ko: '모듈을 찾을 수 없습니다.',
  },
  module_not_allowed: {
    fr: "Ce module n'est pas disponible dans votre plan.",
    en: 'This module is not available in your plan.',
    ko: '이 모듈은 현재 플랜에서 사용할 수 없습니다.',
  },
  email_not_configured: {
    fr: "Configurez votre service d'envoi dans les paramètres Email Studio.",
    en: 'Configure your sending service in Email Studio settings.',
    ko: '이메일 스튜디오 설정에서 발송 서비스를 구성하세요.',
  },
  not_org_owner: {
    fr: "Seul le propriétaire de l'organisation peut modifier cette configuration.",
    en: 'Only the organization owner can modify this configuration.',
    ko: '조직 소유자만 이 설정을 변경할 수 있습니다.',
  },
  invalid_key_format: {
    fr: 'La clé API doit commencer par re_.',
    en: 'API key must start with re_.',
    ko: 'API 키는 re_로 시작해야 합니다.',
  },
  email_send_failed: {
    fr: "L'envoi de l'email a échoué. Vérifiez votre clé Resend dans les paramètres.",
    en: 'Email sending failed. Check your Resend key in settings.',
    ko: '이메일 발송에 실패했습니다. 설정에서 Resend 키를 확인하세요.',
  },
  quota_exceeded: {
    fr: "Quota de messages IA dépassé pour aujourd'hui.",
    en: 'AI message quota exceeded for today.',
    ko: "오늘의 AI 메시지 한도를 초과했습니다.",
  },
  rate_limited: {
    fr: 'Trop de requêtes. Veuillez patienter quelques secondes.',
    en: 'Too many requests. Please wait a few seconds.',
    ko: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  server_error: {
    fr: 'Erreur serveur.',
    en: 'Server error.',
    ko: '서버 오류.',
  },
  unauthorized: {
    fr: 'Non autorisé.',
    en: 'Unauthorized.',
    ko: '인증되지 않았습니다.',
  },
  // Alpha invite system
  alpha_not_configured: {
    fr: "Le système d'invitation n'est pas configuré.",
    en: 'Invitation system is not configured.',
    ko: '초대 시스템이 구성되지 않았습니다.',
  },
  alpha_code_required: {
    fr: "Le code d'invitation est requis.",
    en: 'Invitation code is required.',
    ko: '초대 코드가 필요합니다.',
  },
  alpha_code_invalid: {
    fr: "Code d'invitation invalide.",
    en: 'Invalid invitation code.',
    ko: '유효하지 않은 초대 코드입니다.',
  },
  // Invite email
  invite_email_subject: {
    fr: 'Vous êtes invité(e) sur Scalyo',
    en: 'You are invited to Scalyo',
    ko: 'Scalyo에 초대되었습니다',
  },
  // Invite email (lot 6 — D4① : email d'invitation localisé FR/EN/KO,
  // durée d'expiration dérivée de ORG_SETTINGS.invitationExpiryDays)
  invite_mail_subject: {
    fr: '{org} vous invite sur Scalyo',
    en: '{org} invites you to Scalyo',
    ko: '{org}에서 Scalyo로 초대했습니다',
  },
  invite_mail_heading: {
    fr: 'Rejoignez {org} sur Scalyo',
    en: 'Join {org} on Scalyo',
    ko: 'Scalyo에서 {org}에 참여하세요',
  },
  invite_mail_body: {
    fr: 'Vous avez été invité(e) à rejoindre l’équipe en tant que {role}.',
    en: 'You have been invited to join the team as {role}.',
    ko: '{role} 역할로 팀에 참여하도록 초대되었습니다.',
  },
  invite_mail_cta: {
    fr: 'Accepter l’invitation',
    en: 'Accept the invitation',
    ko: '초대 수락하기',
  },
  invite_mail_expiry: {
    fr: 'Ce lien expire dans {days} jours. Si vous n’avez pas demandé cette invitation, ignorez cet email.',
    en: 'This link expires in {days} days. If you did not request this invitation, please ignore this email.',
    ko: '이 링크는 {days}일 후에 만료됩니다. 이 초대를 요청하지 않으셨다면 이 이메일을 무시하세요.',
  },
  invite_role_owner: { fr: 'propriétaire', en: 'owner', ko: '소유자' },
  invite_role_admin: { fr: 'administrateur', en: 'admin', ko: '관리자' },
  invite_role_member: { fr: 'membre', en: 'member', ko: '멤버' },
  invite_role_viewer: { fr: 'lecteur', en: 'viewer', ko: '열람자' },
}

// Lot 6 : interpolation {var}. Les appels existants t('key') / t('key', lang)
// sont inchangés.
export function t(key, lang = 'fr', vars = null) {
  const msg = messages[key]
  if (!msg) return key
  let out = msg[lang] || msg.en || key
  if (vars) {
    for (const k of Object.keys(vars)) {
      out = out.split('{' + k + '}').join(String(vars[k]))
    }
  }
  return out
}

