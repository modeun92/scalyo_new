/**
 * Import field configs per module.
 * Each field: { key, label (i18n key), type, required?, aliases (fuzzy match) }
 * Aliases include FR/EN variations for auto-mapping column headers.
 */

export var clientFields = [
  { key: 'name', label: 'imp_field_name', type: 'string', required: true, aliases: ['nom', 'client', 'account', 'compte', 'entreprise', 'societe', 'company', 'raison sociale', 'nom entreprise', 'company name', 'account name'] },
  { key: 'contactName', label: 'imp_field_contact_name', type: 'string', aliases: ['contact', 'interlocuteur', 'referent', 'nom du contact', 'nom contact', 'contact name', 'personne', 'nom interlocuteur'] },
  { key: 'email', label: 'imp_field_email', type: 'string', aliases: ['email', 'mail', 'courriel', 'e-mail', 'adresse email', 'adresse mail', 'email contact', 'mail contact'] },
  { key: 'phone', label: 'imp_field_phone', type: 'string', aliases: ['telephone', 'tel', 'phone', 'mobile', 'portable', 'numero', 'gsm', 'numero de telephone', 'phone number'] },
  { key: 'industry', label: 'imp_field_industry', type: 'string', aliases: ['secteur', 'industrie', 'sector'] },
  { key: 'arr', label: 'imp_field_arr', type: 'number', aliases: ['revenu annuel', 'annual revenue', 'ca annuel'] },
  { key: 'mrr', label: 'imp_field_mrr', type: 'number', aliases: ['revenu mensuel', 'monthly revenue'] },
  { key: 'health', label: 'imp_field_health', type: 'integer', aliases: ['sante', 'health score', 'score sante'] },
  { key: 'nps', label: 'imp_field_nps', type: 'integer', aliases: ['net promoter', 'score nps'] },
  { key: 'status', label: 'imp_field_status', type: 'status', aliases: ['statut', 'etat', 'state'] },
  { key: 'csm', label: 'imp_field_csm', type: 'string', aliases: ['customer success manager', 'responsable', 'manager'] },
  { key: 'churnRisk', label: 'imp_field_churn_risk', type: 'number', aliases: ['risque churn', 'churn risk', 'risque', 'attrition'] },
  { key: 'renewalDate', label: 'imp_field_renewal_date', type: 'date', aliases: ['date renouvellement', 'renewal date', 'echeance', 'renouvellement'] },
  { key: 'notes', label: 'imp_field_notes', type: 'string', aliases: ['commentaire', 'comment', 'remarque', 'note'] },
]

export var taskFields = [
  { key: 'title', label: 'imp_field_title', type: 'string', required: true, aliases: ['titre', 'nom', 'tache', 'task', 'sujet', 'subject'] },
  { key: 'description', label: 'imp_field_description', type: 'string', aliases: ['desc', 'detail', 'details'] },
  { key: 'status', label: 'imp_field_status', type: 'status', aliases: ['statut', 'etat', 'state'] },
  { key: 'priority', label: 'imp_field_priority', type: 'priority', aliases: ['priorite', 'prio', 'quadrant', 'eisenhower', 'matrice'] },
  { key: 'assignee', label: 'imp_field_assignee', type: 'string', aliases: ['assigne', 'responsable', 'owner', 'proprietaire'] },
  { key: 'dueDate', label: 'imp_field_due_date', type: 'date', aliases: ['echeance', 'deadline', 'date limite', 'due date'] },
  { key: 'startDate', label: 'imp_field_start_date', type: 'date', aliases: ['date debut', 'start date', 'debut'] },
  { key: 'endDate', label: 'imp_field_end_date', type: 'date', aliases: ['date fin', 'end date', 'fin'] },
  { key: 'urgency', label: 'imp_field_urgency', type: 'integer', aliases: ['urgence'] },
  { key: 'importance', label: 'imp_field_importance', type: 'integer', aliases: [] },
  { key: 'difficulty', label: 'imp_field_difficulty', type: 'integer', aliases: ['difficulte', 'complexite', 'complexity'] },
  { key: 'expectedHours', label: 'imp_field_expected_hours', type: 'number', aliases: ['heures estimees', 'estimated hours', 'estimation'] },
  { key: 'tags', label: 'imp_field_tags', type: 'tags', aliases: ['etiquettes', 'labels', 'categories'] },
  { key: 'taskType', label: 'imp_field_task_type', type: 'string', aliases: ['type tache', 'type', 'categorie'] },
]

export var teamFields = [
  { key: 'name', label: 'imp_field_name', type: 'string', required: true, aliases: ['nom', 'prenom', 'member', 'membre'] },
  { key: 'email', label: 'imp_field_email', type: 'string', aliases: ['mail', 'courriel', 'e-mail'] },
  { key: 'role', label: 'imp_field_role', type: 'string', aliases: ['poste', 'fonction', 'position', 'job'] },
  { key: 'wellbeingScore', label: 'imp_field_wellbeing', type: 'integer', aliases: ['bien-etre', 'wellbeing', 'bienetre', 'score bienetre'] },
  { key: 'workload', label: 'imp_field_workload', type: 'integer', aliases: ['charge', 'charge travail', 'occupation'] },
  { key: 'clientCount', label: 'imp_field_client_count', type: 'integer', aliases: ['nombre clients', 'client count', 'nb clients', 'portefeuille'] },
  { key: 'arrManaged', label: 'imp_field_arr_managed', type: 'number', aliases: ['arr gere', 'arr managed', 'ca gere', 'revenu gere'] },
]
