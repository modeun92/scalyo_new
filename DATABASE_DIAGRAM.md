# Database diagram

**Generated** 7 September 2026 · Companion to [`DATABASE_TABLES_REPORT.md`](DATABASE_TABLES_REPORT.md) and [`docs/SCHEMA_FROM_CODE.sql`](docs/SCHEMA_FROM_CODE.sql).

35 tables, 55 relationships. Everything here is derived from the 25 `.sql` files and the application's CRUD call sites — no documentation was used.

## How to read these diagrams

| Notation | Meaning |
|---|---|
| `A ||--o{ B` **solid line** | **Confirmed foreign key.** A `REFERENCES` clause exists in a `.sql` file. 16 of these. |
| `A ||..o{ B` **dashed line** | **Inferred relationship.** A `{table}_id` column exists and a table of that name exists — but no `REFERENCES` clause proves the constraint. 39 of these. |
| `PK` / `FK` | Primary / foreign key |
| `"confirmed"` | Column and type verbatim from `CREATE`/`ALTER TABLE` |
| `"inferred"` | Column name proven by a query; type inferred from naming |
| `"inferred-single"` | As above, and only one call site touches it |

> **A dashed line is a hypothesis, not a constraint.** The database may enforce it, may enforce it differently, or may not enforce it at all — application code cannot tell you. Only the 16 solid lines are established fact.

---

## 1. Overview — structural relationships

Every table also carries ownership columns (`user_id`, `organization_id`, `owner_id`); drawing those here would put 28 edges into `profiles` alone and hide everything else. They have their own section below. What remains are the 18 relationships that describe how the data is actually shaped.

```mermaid
flowchart LR
  classDef sqlT fill:#0F766E22,stroke:#0F766E,stroke-width:2px,color:#0F766E;
  classDef alterT fill:#A1620722,stroke:#A16207,stroke-width:1.5px,color:#A16207;
  classDef codeT fill:#9F123922,stroke:#9F1239,stroke-width:1px,color:#9F1239;
  classDef extT fill:#64748B22,stroke:#64748B,stroke-dasharray:5,color:#64748B;
  subgraph d0["Identity and organization"]
    profiles["profiles"]
    user_profiles["user_profiles"]
    organizations["organizations"]
    organization_members["organization_members"]
    invitations["invitations"]
    promo_codes["promo_codes"]
    activity_log["activity_log"]
    alpha_feedback["alpha_feedback"]
  end
  subgraph d1["Client portfolio"]
    clients["clients"]
    client_notes["client_notes"]
    client_metrics["client_metrics"]
    quotes["quotes"]
    snapshots["snapshots"]
  end
  subgraph d2["Work and delivery"]
    tasks["tasks"]
    projects["projects"]
    planning_events["planning_events"]
    playbooks["playbooks"]
    roadmaps["roadmaps"]
    copils["copils"]
  end
  subgraph d3["Oxygen (well-being)"]
    oxygen_checkins["oxygen_checkins"]
    oxygen_daily["oxygen_daily"]
    oxygen_recoveries["oxygen_recoveries"]
  end
  subgraph d4["Chat"]
    chat_channels["chat_channels"]
    chat_messages["chat_messages"]
    chat_channel_members["chat_channel_members"]
  end
  subgraph d5["Email"]
    email_templates["email_templates"]
    sent_emails["sent_emails"]
    org_email_config["org_email_config"]
  end
  subgraph d6["AI assistants"]
    ai_conversations["ai_conversations"]
    ai_messages["ai_messages"]
  end
  subgraph d7["Integrations (dormant)"]
    org_integrations["org_integrations"]
    api_keys["api_keys"]
    webhooks["webhooks"]
    team_members["team_members"]
  end
  subgraph d8["Notifications"]
    notifications["notifications"]
  end
  auth_users["auth.users - Supabase auth schema"]
  chat_channel_members -->|channel_id| chat_channels
  chat_channels -->|created_by| auth_users
  chat_messages -->|channel_id| chat_channels
  chat_messages -->|reply_to| chat_messages
  client_metrics -->|client_id| clients
  client_notes -->|author_id| profiles
  client_notes -->|client_id| clients
  clients -->|csm_id| profiles
  copils -->|client_id| clients
  email_templates -.->|created_by| profiles
  invitations -.->|invited_by| profiles
  planning_events -.->|client_id| clients
  playbooks -.->|client_id| clients
  playbooks -.->|csm_id| profiles
  quotes -->|client_id| clients
  tasks -.->|client_id| clients
  tasks -.->|project_id| projects
  user_profiles -->|id| auth_users
  class activity_log codeT;
  class ai_conversations codeT;
  class ai_messages codeT;
  class alpha_feedback codeT;
  class api_keys codeT;
  class chat_channel_members sqlT;
  class chat_channels sqlT;
  class chat_messages sqlT;
  class client_metrics sqlT;
  class client_notes sqlT;
  class clients alterT;
  class copils alterT;
  class email_templates alterT;
  class invitations codeT;
  class notifications alterT;
  class org_email_config codeT;
  class org_integrations codeT;
  class organization_members codeT;
  class organizations alterT;
  class oxygen_checkins codeT;
  class oxygen_daily codeT;
  class oxygen_recoveries codeT;
  class planning_events alterT;
  class playbooks codeT;
  class profiles alterT;
  class projects codeT;
  class promo_codes codeT;
  class quotes sqlT;
  class roadmaps codeT;
  class sent_emails sqlT;
  class snapshots codeT;
  class tasks codeT;
  class team_members codeT;
  class user_profiles sqlT;
  class webhooks codeT;
  class auth_users extT;
```

Border colour marks where each table's definition lives: **teal** = `CREATE TABLE` in the repo (8) · **amber** = only `ALTER`s in the repo (7) · **rose** = no SQL at all, reconstructed from code (20) · **grey dashed** = external (Supabase `auth` schema).

---

## 2. Tenancy

The 37 relationships held back from the overview. Almost every table carries an owner, and which owner column it carries determines what a row is scoped to — and therefore what any RLS policy has to key on.

```mermaid
flowchart TD
  profiles["profiles"]
  organizations["organizations"]
  u["18 tables scoped by user_id only"]
  b["5 tables scoped by BOTH user_id and organization_id"]
  o["6 tables scoped by organization_id only"]
  n["4 tables with no owner column"]
  profiles -.->|user_id| u
  profiles -.->|user_id| b
  organizations -.->|organization_id| b
  organizations -.->|organization_id| o
```

| Scope | Tables |
|---|---|
| `user_id` only | `ai_conversations`, `ai_messages`, `api_keys`, `chat_channel_members`, `clients`, `copils`, `org_integrations`, `oxygen_checkins`, `oxygen_daily`, `oxygen_recoveries`, `playbooks`, `projects`, `roadmaps`, `sent_emails`, `snapshots`, `tasks`, `team_members`, `webhooks` |
| Both | `activity_log`, `chat_messages`, `client_metrics`, `organization_members`, `quotes` |
| `organization_id` only | `chat_channels`, `client_notes`, `email_templates`, `invitations`, `profiles`, `promo_codes` |
| No owner column found | `alpha_feedback`, `notifications`, `planning_events`, `user_profiles` |

> A table with **both** columns can be filtered two ways, and the two do not always agree — this is exactly the split described in `DATABASE_TABLES_REPORT.md` §7.3, where three API endpoints scope by user while the SQL quota trigger scopes by organization. Tables listed as having no owner column may still have one that no code path reads.

---

## 3. Identity and organization

`profiles`, `user_profiles`, `organizations`, `organization_members`, `invitations`, `promo_codes`, `activity_log`, `alpha_feedback`. 1 confirmed relationship, 9 inferred.

```mermaid
erDiagram
    organizations ||..o{ activity_log : "organization_id (inferred)"
    profiles ||..o{ activity_log : "user_id (inferred)"
    profiles ||..o{ ai_conversations : "user_id (inferred)"
    profiles ||..o{ ai_messages : "user_id (inferred)"
    profiles ||..o{ api_keys : "user_id (inferred)"
    organizations ||..o{ chat_channels : "organization_id (inferred)"
    organizations ||..o{ chat_messages : "organization_id (inferred)"
    organizations ||..o{ client_metrics : "organization_id (inferred)"
    profiles ||--o{ client_metrics : "user_id"
    profiles ||--o{ client_notes : "author_id"
    organizations ||..o{ client_notes : "organization_id (inferred)"
    profiles ||--o{ clients : "csm_id"
    profiles ||..o{ clients : "user_id (inferred)"
    profiles ||..o{ copils : "user_id (inferred)"
    profiles ||..o{ email_templates : "created_by (inferred)"
    organizations ||..o{ email_templates : "organization_id (inferred)"
    profiles ||..o{ email_templates : "owner_id (inferred)"
    profiles ||..o{ invitations : "invited_by (inferred)"
    organizations ||..o{ invitations : "organization_id (inferred)"
    profiles ||..o{ org_email_config : "owner_id (inferred)"
    profiles ||..o{ org_integrations : "user_id (inferred)"
    organizations ||..o{ organization_members : "organization_id (inferred)"
    profiles ||..o{ organization_members : "user_id (inferred)"
    profiles ||..o{ organizations : "owner_id (inferred)"
    profiles ||..o{ oxygen_checkins : "user_id (inferred)"
    profiles ||..o{ oxygen_daily : "user_id (inferred)"
    profiles ||..o{ oxygen_recoveries : "user_id (inferred)"
    profiles ||..o{ playbooks : "csm_id (inferred)"
    profiles ||..o{ playbooks : "user_id (inferred)"
    organizations ||..o{ profiles : "organization_id (inferred)"
    profiles ||..o{ projects : "user_id (inferred)"
    organizations ||..o{ promo_codes : "organization_id (inferred)"
    organizations ||..o{ quotes : "organization_id (inferred)"
    profiles ||--o{ quotes : "user_id"
    profiles ||..o{ roadmaps : "user_id (inferred)"
    profiles ||..o{ snapshots : "user_id (inferred)"
    profiles ||..o{ tasks : "user_id (inferred)"
    profiles ||..o{ team_members : "user_id (inferred)"
    auth_users ||--o{ user_profiles : "id"
    profiles ||..o{ webhooks : "user_id (inferred)"
    profiles {
        uuid id PK "inferred"
        text company_name "inferred"
        text first_name "inferred"
        boolean is_alpha_tester "inferred-single"
        text last_name "inferred"
        text locale "inferred"
        boolean onboarding_completed "inferred-single"
        text org_role "inferred-single"
        uuid organization_id FK "inferred"
        text plan "inferred"
        text region "inferred-single"
        text resend_api_key "confirmed"
        text stripe_customer_id "inferred-single"
        text stripe_subscription_id "inferred"
        timestamptz trial_started_at "inferred-single"
        boolean trial_used "inferred-single"
    }
    user_profiles {
        UUID id PK "confirmed"
        TEXT ai_tone "confirmed"
        INTEGER avg_contract_value "confirmed"
        JSONB challenges "confirmed"
        TEXT company_size "confirmed"
        TIMESTAMPTZ created_at "confirmed"
        TEXT currency "confirmed"
        JSONB custom_data "confirmed"
        JSONB goals "confirmed"
        TEXT industry "confirmed"
        TEXT industry_custom "confirmed"
        TEXT market "confirmed"
        BOOLEAN onboarding_completed "confirmed"
        INTEGER portfolio_size "confirmed"
        TEXT preferred_language "confirmed"
        JSONB processes "confirmed"
        TEXT role "confirmed"
        TEXT role_custom "confirmed"
        TEXT seniority "confirmed"
        JSONB tools "confirmed"
        TIMESTAMPTZ updated_at "confirmed"
    }
    organizations {
        uuid id PK "inferred"
        boolean is_founding "inferred"
        integer max_clients "inferred"
        text name "inferred"
        uuid owner_id FK "inferred"
        boolean oxygen_team_enabled "confirmed"
        text plan "inferred"
        integer seats_paid "inferred"
        text stripe_subscription_id "inferred"
        timestamptz trial_ends_at "inferred"
    }
    organization_members {
        uuid id PK "inferred-single"
        boolean can_send_email "inferred"
        timestamptz joined_at "inferred"
        uuid organization_id FK "inferred"
        text role "inferred"
        uuid user_id FK "inferred"
    }
    invitations {
        uuid id PK "inferred-single"
        text email "inferred-single"
        timestamptz expires_at "inferred-single"
        text invited_by FK "inferred-single"
        uuid organization_id FK "inferred"
        text role "inferred-single"
        text status "inferred-single"
        text token "inferred-single"
    }
    promo_codes {
        uuid id PK "inferred-single"
        timestamptz activated_at "inferred-single"
        text code "inferred-single"
        timestamptz expires_at "inferred-single"
        uuid organization_id FK "inferred-single"
        text status "inferred-single"
    }
    activity_log {
        text action "inferred-single"
        text changes "inferred-single"
        uuid entity_id "inferred-single"
        text entity_type "inferred-single"
        uuid organization_id FK "inferred-single"
        uuid user_id FK "inferred-single"
    }
    alpha_feedback {
        text category "inferred-single"
        text message "inferred-single"
        text page_route "inferred-single"
    }
```

**RLS in the repo:** `user_profiles` (3 policies).

---

## 4. Client portfolio

`clients`, `client_notes`, `client_metrics`, `quotes`, `snapshots`. 7 confirmed relationships, 5 inferred.

```mermaid
erDiagram
    clients ||--o{ client_metrics : "client_id"
    organizations ||..o{ client_metrics : "organization_id (inferred)"
    profiles ||--o{ client_metrics : "user_id"
    profiles ||--o{ client_notes : "author_id"
    clients ||--o{ client_notes : "client_id"
    organizations ||..o{ client_notes : "organization_id (inferred)"
    profiles ||--o{ clients : "csm_id"
    profiles ||..o{ clients : "user_id (inferred)"
    clients ||--o{ copils : "client_id"
    clients ||..o{ planning_events : "client_id (inferred)"
    clients ||..o{ playbooks : "client_id (inferred)"
    clients ||--o{ quotes : "client_id"
    organizations ||..o{ quotes : "organization_id (inferred)"
    profiles ||--o{ quotes : "user_id"
    profiles ||..o{ snapshots : "user_id (inferred)"
    clients ||..o{ tasks : "client_id (inferred)"
    clients {
        uuid id PK "inferred"
        numeric arr "inferred"
        numeric churn_risk "inferred"
        timestamptz churned_at "inferred"
        jsonb contacts "inferred"
        timestamptz created_at "inferred"
        text csm "inferred"
        uuid csm_id FK "confirmed"
        numeric health "inferred"
        text industry "inferred"
        text lifecycle "inferred-single"
        text logo "inferred"
        numeric mrr "inferred"
        text name "inferred"
        text notes "inferred"
        numeric nps "inferred"
        text pipeline_stage "inferred-single"
        date renewal_date "inferred"
        text status "inferred"
        timestamptz updated_at "inferred"
        uuid user_id FK "inferred"
    }
    client_notes {
        uuid id PK "confirmed"
        uuid author_id FK "confirmed"
        text author_name "confirmed"
        uuid client_id FK "confirmed"
        text content "confirmed"
        timestamptz created_at "confirmed"
        text kind "confirmed"
        uuid organization_id FK "confirmed"
    }
    client_metrics {
        uuid id PK "confirmed"
        uuid client_id FK "confirmed"
        timestamptz created_at "confirmed"
        text kpi_id "confirmed"
        uuid organization_id FK "confirmed"
        date period "confirmed"
        timestamptz updated_at "confirmed"
        uuid user_id FK "confirmed"
        numeric value "confirmed"
    }
    quotes {
        uuid id PK "confirmed"
        numeric amount "confirmed"
        uuid client_id FK "confirmed"
        text company "confirmed"
        text country "confirmed"
        timestamptz created_at "confirmed"
        text currency "confirmed"
        text notes "confirmed"
        uuid organization_id FK "confirmed"
        text status "confirmed"
        numeric tax "confirmed"
        text title "confirmed"
        uuid user_id FK "confirmed"
    }
    snapshots {
        uuid id PK "inferred"
        date date "inferred"
        jsonb kpis "inferred"
        uuid user_id FK "inferred-single"
    }
```

**RLS in the repo:** `clients` (5 policies), `client_notes` (3 policies), `client_metrics` (4 policies), `quotes` (4 policies).

---

## 5. Work and delivery

`tasks`, `projects`, `planning_events`, `playbooks`, `roadmaps`, `copils`. 1 confirmed relationship, 10 inferred.

```mermaid
erDiagram
    clients ||--o{ copils : "client_id"
    profiles ||..o{ copils : "user_id (inferred)"
    clients ||..o{ planning_events : "client_id (inferred)"
    clients ||..o{ playbooks : "client_id (inferred)"
    profiles ||..o{ playbooks : "csm_id (inferred)"
    profiles ||..o{ playbooks : "user_id (inferred)"
    profiles ||..o{ projects : "user_id (inferred)"
    profiles ||..o{ roadmaps : "user_id (inferred)"
    clients ||..o{ tasks : "client_id (inferred)"
    projects ||..o{ tasks : "project_id (inferred)"
    profiles ||..o{ tasks : "user_id (inferred)"
    tasks {
        uuid id PK "inferred"
        numeric actual_hours "inferred-single"
        text assignee "inferred-single"
        uuid client_id FK "inferred-single"
        text color "inferred-single"
        timestamptz created_at "inferred"
        text description "inferred-single"
        text difficulty "inferred-single"
        date due_date "inferred-single"
        date end_date "inferred-single"
        numeric expected_hours "inferred-single"
        boolean finished "inferred-single"
        text importance "inferred-single"
        text level "inferred-single"
        numeric max_hours "inferred-single"
        numeric min_hours "inferred-single"
        text name "inferred-single"
        uuid parent_id "inferred"
        text pended "inferred-single"
        text priority "inferred-single"
        uuid project_id FK "inferred"
        date start_date "inferred-single"
        text status "inferred"
        text subtasks "inferred-single"
        jsonb tags "inferred-single"
        text task_type "inferred-single"
        text title "inferred"
        timestamptz updated_at "inferred-single"
        text urgency "inferred-single"
        uuid user_id FK "inferred"
    }
    projects {
        uuid id PK "inferred"
        text color "inferred-single"
        timestamptz created_at "inferred"
        text name "inferred-single"
        text status "inferred-single"
        uuid user_id FK "inferred"
    }
    planning_events {
        uuid id PK "inferred"
        uuid client_id FK "inferred"
        text color "inferred-single"
        timestamptz end_at "inferred-single"
        text recurrence "confirmed"
        uuid series_id "confirmed"
        timestamptz start_at "inferred"
        text title "inferred"
    }
    playbooks {
        uuid id PK "inferred"
        uuid client_id FK "inferred"
        text color "inferred"
        timestamptz completed_at "inferred"
        timestamptz created_at "inferred"
        uuid csm_id FK "inferred"
        text icon "inferred"
        timestamptz started_at "inferred"
        text status "inferred"
        text steps "inferred"
        text template_id "inferred"
        text template_key "inferred"
        uuid user_id FK "inferred-single"
    }
    roadmaps {
        uuid id PK "inferred"
        text color "inferred-single"
        timestamptz created_at "inferred"
        text icon "inferred-single"
        jsonb milestones "inferred"
        text name "inferred-single"
        text status "inferred-single"
        text template_id "inferred-single"
        uuid user_id FK "inferred-single"
    }
    copils {
        uuid id PK "inferred"
        jsonb blocks "inferred"
        uuid client_id FK "confirmed"
        text client_logo "inferred"
        text client_name "inferred"
        text color "inferred"
        timestamptz created_at "inferred"
        date date "inferred"
        text error "inferred-single"
        text lang "inferred"
        date period "inferred"
        text presenter "inferred"
        boolean reverted "inferred-single"
        text share_token "inferred"
        text subtitle "inferred"
        text title "inferred"
        timestamptz updated_at "inferred"
        uuid user_id FK "inferred-single"
    }
```

---

## 6. Oxygen (well-being)

`oxygen_checkins`, `oxygen_daily`, `oxygen_recoveries`. 0 confirmed relationships, 3 inferred.

```mermaid
erDiagram
    profiles ||..o{ oxygen_checkins : "user_id (inferred)"
    profiles ||..o{ oxygen_daily : "user_id (inferred)"
    profiles ||..o{ oxygen_recoveries : "user_id (inferred)"
    oxygen_checkins {
        date date "inferred"
        text energy "inferred"
        text felt_load "inferred"
        text mood "inferred"
        uuid user_id FK "inferred"
        text word "inferred"
    }
    oxygen_daily {
        date date "inferred"
        text index "inferred"
        numeric load_score "inferred"
        uuid user_id FK "inferred"
    }
    oxygen_recoveries {
        uuid id PK "inferred"
        boolean completed "inferred"
        timestamptz created_at "inferred"
        date date "inferred"
        text duration_s "inferred"
        text kind "inferred"
        integer progress_count "inferred"
        uuid user_id FK "inferred"
    }
```

---

## 7. Chat

`chat_channels`, `chat_messages`, `chat_channel_members`. 6 confirmed relationships, 2 inferred.

```mermaid
erDiagram
    chat_channels ||--o{ chat_channel_members : "channel_id"
    auth_users ||--o{ chat_channel_members : "user_id"
    auth_users ||--o{ chat_channels : "created_by"
    organizations ||..o{ chat_channels : "organization_id (inferred)"
    chat_channels ||--o{ chat_messages : "channel_id"
    organizations ||..o{ chat_messages : "organization_id (inferred)"
    chat_messages ||--o{ chat_messages : "reply_to"
    auth_users ||--o{ chat_messages : "user_id"
    chat_channels {
        uuid id PK "confirmed"
        timestamptz created_at "confirmed"
        uuid created_by FK "confirmed"
        text description "confirmed"
        text dm_key "confirmed"
        text name "confirmed"
        uuid organization_id FK "confirmed"
        uuid team_id "confirmed"
        text type "confirmed"
    }
    chat_messages {
        uuid id PK "confirmed"
        jsonb attachments "confirmed"
        text author_name "confirmed"
        uuid channel_id FK "confirmed"
        text content "confirmed"
        timestamptz created_at "confirmed"
        timestamptz edited_at "confirmed"
        uuid organization_id FK "confirmed"
        boolean pinned "confirmed"
        jsonb reactions "confirmed"
        uuid reply_to FK "confirmed"
        uuid user_id FK "confirmed"
    }
    chat_channel_members {
        timestamptz added_at "confirmed"
        uuid channel_id FK "confirmed"
        uuid user_id FK "confirmed"
    }
```

**RLS in the repo:** `chat_channels` (11 policies), `chat_messages` (11 policies), `chat_channel_members` (1 policies).

---

## 8. Email

`email_templates`, `sent_emails`, `org_email_config`. 1 confirmed relationship, 4 inferred.

```mermaid
erDiagram
    profiles ||..o{ email_templates : "created_by (inferred)"
    organizations ||..o{ email_templates : "organization_id (inferred)"
    profiles ||..o{ email_templates : "owner_id (inferred)"
    profiles ||..o{ org_email_config : "owner_id (inferred)"
    auth_users ||--o{ sent_emails : "user_id"
    email_templates {
        uuid id PK "inferred"
        timestamptz created_at "inferred"
        text created_by FK "inferred-single"
        boolean failed "inferred-single"
        uuid organization_id FK "confirmed"
        uuid owner_id FK "inferred-single"
        timestamptz updated_at "inferred-single"
    }
    sent_emails {
        uuid id PK "confirmed"
        timestamptz created_at "confirmed"
        text from_name "confirmed"
        timestamptz last_opened_at "confirmed"
        integer open_count "confirmed"
        timestamptz opened_at "confirmed"
        text resend_id "confirmed"
        timestamptz sent_at "confirmed"
        text subject "confirmed"
        integer template_id "confirmed"
        text to_email "confirmed"
        uuid tracking_id "confirmed"
        uuid user_id FK "confirmed"
    }
    org_email_config {
        uuid id PK "inferred"
        uuid owner_id FK "inferred"
        text resend_api_key "inferred"
        text sender_domain "inferred"
        text sender_name "inferred"
        timestamptz updated_at "inferred-single"
    }
```

**RLS in the repo:** `email_templates` (4 policies), `sent_emails` (3 policies).

---

## 9. AI assistants

`ai_conversations`, `ai_messages`. 0 confirmed relationships, 2 inferred.

```mermaid
erDiagram
    profiles ||..o{ ai_conversations : "user_id (inferred)"
    profiles ||..o{ ai_messages : "user_id (inferred)"
    ai_conversations {
        uuid id PK "inferred"
        jsonb messages "inferred"
        text module "inferred"
        text title "inferred-single"
        timestamptz updated_at "inferred"
        uuid user_id FK "inferred"
    }
    ai_messages {
        uuid id PK "inferred"
        text content "inferred"
        timestamptz created_at "inferred"
        text module "inferred"
        text role "inferred"
        uuid user_id FK "inferred"
    }
```

---

## 10. Integrations (dormant)

`org_integrations`, `api_keys`, `webhooks`, `team_members`. 0 confirmed relationships, 4 inferred.

```mermaid
erDiagram
    profiles ||..o{ api_keys : "user_id (inferred)"
    profiles ||..o{ org_integrations : "user_id (inferred)"
    profiles ||..o{ team_members : "user_id (inferred)"
    profiles ||..o{ webhooks : "user_id (inferred)"
    org_integrations {
        uuid id PK "inferred"
        jsonb config "inferred"
        timestamptz connected_at "inferred"
        text integration_id "inferred"
        text status "inferred"
        timestamptz updated_at "inferred"
        uuid user_id FK "inferred"
    }
    api_keys {
        timestamptz expires_at "inferred"
        boolean is_active "inferred"
        text key_hash "inferred"
        timestamptz last_used_at "inferred-single"
        text scopes "inferred"
        uuid user_id FK "inferred"
    }
    webhooks {
        boolean is_active "inferred"
        timestamptz last_triggered_at "inferred-single"
        text secret "inferred"
        integer trigger_count "inferred-single"
        uuid user_id FK "inferred"
    }
    team_members {
        timestamptz created_at "inferred"
        uuid user_id FK "inferred"
    }
```

---

## 11. Notifications

`notifications`. 0 confirmed relationships, 0 inferred.

```mermaid
erDiagram
    notifications {
        uuid id PK "inferred"
        timestamptz created_at "inferred"
        jsonb payload "confirmed"
        boolean read "inferred"
        uuid target_id "inferred"
        text type "inferred"
    }
```

---

## 12. Relationship reference

### 12.1 Confirmed foreign keys

Every one has a `REFERENCES` clause in the SQL. These are the only relationships this repository proves.

| From | Column | References | On delete | Declared in |
|---|---|---|---|---|
| `chat_channel_members` | `channel_id` | `chat_channels` | cascade | `20260713160000_chat_dm.sql` |
| `chat_channel_members` | `user_id` | `auth.users` | cascade | `20260713160000_chat_dm.sql` |
| `chat_channels` | `created_by` | `auth.users` | set null | `20260421_chat_tables.sql` |
| `chat_messages` | `channel_id` | `chat_channels` | cascade | `20260421_chat_tables.sql` |
| `chat_messages` | `reply_to` | `chat_messages` | set null | `20260421_chat_tables.sql` |
| `chat_messages` | `user_id` | `auth.users` | cascade | `20260421_chat_tables.sql` |
| `client_metrics` | `client_id` | `clients` | cascade | `20260722200000_client_metrics.sql` |
| `client_metrics` | `user_id` | `profiles` | set null | `20260722200000_client_metrics.sql` |
| `client_notes` | `author_id` | `profiles` | set null | `20260720233000_client_notes_and_org_write.sql` |
| `client_notes` | `client_id` | `clients` | cascade | `20260720233000_client_notes_and_org_write.sql` |
| `clients` | `csm_id` | `profiles` | set null | `20260718200000_clients_csm_id.sql` |
| `copils` | `client_id` | `clients` | set null | `20260706220000_copils_client_id.sql` |
| `quotes` | `client_id` | `clients` | set null | `20260720240000_quotes_table.sql` |
| `quotes` | `user_id` | `profiles` | set null | `20260720240000_quotes_table.sql` |
| `sent_emails` | `user_id` | `auth.users` | cascade | `20260419_sent_emails.sql` |
| `user_profiles` | `id` | `auth.users` | cascade | `001_user_profiles.sql` |

### 12.2 Inferred relationships

A `*_id` column whose name matches an existing table. **No `REFERENCES` clause proves any of these.** They are shown dashed throughout, and each should be confirmed against the live database before being relied on.

| From | Column | Probable target |
|---|---|---|
| `activity_log` | `organization_id` | `organizations` |
| `activity_log` | `user_id` | `profiles` |
| `ai_conversations` | `user_id` | `profiles` |
| `ai_messages` | `user_id` | `profiles` |
| `api_keys` | `user_id` | `profiles` |
| `chat_channels` | `organization_id` | `organizations` |
| `chat_messages` | `organization_id` | `organizations` |
| `client_metrics` | `organization_id` | `organizations` |
| `client_notes` | `organization_id` | `organizations` |
| `clients` | `user_id` | `profiles` |
| `copils` | `user_id` | `profiles` |
| `email_templates` | `created_by` | `profiles` |
| `email_templates` | `organization_id` | `organizations` |
| `email_templates` | `owner_id` | `profiles` |
| `invitations` | `invited_by` | `profiles` |
| `invitations` | `organization_id` | `organizations` |
| `org_email_config` | `owner_id` | `profiles` |
| `org_integrations` | `user_id` | `profiles` |
| `organization_members` | `organization_id` | `organizations` |
| `organization_members` | `user_id` | `profiles` |
| `organizations` | `owner_id` | `profiles` |
| `oxygen_checkins` | `user_id` | `profiles` |
| `oxygen_daily` | `user_id` | `profiles` |
| `oxygen_recoveries` | `user_id` | `profiles` |
| `planning_events` | `client_id` | `clients` |
| `playbooks` | `client_id` | `clients` |
| `playbooks` | `csm_id` | `profiles` |
| `playbooks` | `user_id` | `profiles` |
| `profiles` | `organization_id` | `organizations` |
| `projects` | `user_id` | `profiles` |
| `promo_codes` | `organization_id` | `organizations` |
| `quotes` | `organization_id` | `organizations` |
| `roadmaps` | `user_id` | `profiles` |
| `snapshots` | `user_id` | `profiles` |
| `tasks` | `client_id` | `clients` |
| `tasks` | `project_id` | `projects` |
| `tasks` | `user_id` | `profiles` |
| `team_members` | `user_id` | `profiles` |
| `webhooks` | `user_id` | `profiles` |

### 12.3 Key-shaped columns that are *not* keys

These end in `_id` but reference nothing. They are excluded from every diagram above.

| Column | Why it is not a foreign key |
|---|---|
| `stripe_customer_id`, `stripe_subscription_id` | Stripe identifiers — `cus_…` / `sub_…` strings |
| `template_id` | Slug naming a template in application config, not a row |
| `kpi_id` | Slug from `config/kpis.js` |
| `entity_id` | Polymorphic — `activity_log` stores `entity_type` beside it |
| `integration_id` | Provider slug (`hubspot`, `salesforce`) |
| `series_id` | Groups recurring `planning_events` rows; references no parent table |
| `resend_id`, `tracking_id`, `share_token`, `dm_key` | External or generated identifiers |

---

## 13. Limits

- **Cardinality is not proven.** Every relationship is drawn one-to-many because that is what a single `*_id` column implies. Uniqueness constraints that would make one one-to-one are not recoverable from code.
- **Only 16 of 55 relationships are confirmed.** The other 39 are name-matching.
- **Tables may have columns not shown.** Diagrams reflect what the code touches; a column no code path reads is invisible here.
- **`auth.users` is external.** It belongs to the Supabase auth schema and is drawn only where something references it.

Run `supabase db dump --schema public` to replace every dashed line and inferred type with fact.

