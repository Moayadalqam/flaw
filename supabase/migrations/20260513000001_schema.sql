-- =============================================================================
-- Lex — Migration 001: Schema
-- =============================================================================
-- Establishes the 12-table foundation for the Cyprus-VAT-compliant legal
-- invoicing platform. Subsequent migrations (002 RLS, 003 invoice numbering,
-- 004 audit triggers + seed) layer onto this schema and assume:
--
--   * Every table has a workspace_id (workspaces itself uses id as the tenant).
--   * Monetary values are exact decimal NUMERIC(12,2) — never imprecise
--     binary fractional types or fixed-rate currency types.
--   * Trust ledger is a PHYSICALLY SEPARATE table from invoices (no shared
--     parent, no discriminator column on a unified table). Mixing client
--     funds with operating revenue is a disbarment-grade offense in Cyprus.
--   * `corrects_entry_id` self-FK on trust_ledger is the only legal correction
--     path — UPDATE/DELETE are denied at the RLS + trigger layer (Migration 002).
--   * `invoices.invoice_number` is NULL on draft; allocated by
--     `allocate_invoice_number()` (Migration 003) only on finalize. Cyprus VAT
--     law forbids gaps, so drafts must NEVER consume a number.
--
-- References:
--   * .planning/research/ARCHITECTURE.md §Data Model
--   * .planning/research/ARCHITECTURE.md §Trust ledger isolation
--   * .planning/CONTEXT.md (matter/Case naming — DB uses `matter`)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE invoice_status     AS ENUM ('draft', 'finalized', 'sent', 'paid', 'void');
CREATE TYPE quotation_status   AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');
CREATE TYPE retainer_status    AS ENUM ('active', 'depleted', 'closed');
CREATE TYPE time_entry_status  AS ENUM ('active', 'completed', 'billed');
CREATE TYPE actor_kind         AS ENUM ('user', 'ai');
CREATE TYPE preferred_language AS ENUM ('el', 'en');
CREATE TYPE trust_entry_kind   AS ENUM ('deposit', 'fee_transfer', 'refund', 'disbursement', 'reversal');

-- -----------------------------------------------------------------------------
-- workspaces — single-tenant per User (one row per authenticated lawyer)
-- -----------------------------------------------------------------------------

CREATE TABLE public.workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  vat_number        TEXT NULL,
  tax_id            TEXT NULL,
  iban              TEXT NULL,
  default_currency  TEXT NOT NULL DEFAULT 'EUR',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- clients — the lawyer's customers (NOT the framework's User)
-- -----------------------------------------------------------------------------

CREATE TABLE public.clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name_el             TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  vat_number          TEXT NULL,
  tax_id              TEXT NULL,
  email               TEXT NULL,
  phone               TEXT NULL,
  address             TEXT NULL,
  preferred_language  preferred_language NOT NULL DEFAULT 'el',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- matters — legal engagements (UI label: "Case" / "Υπόθεση")
-- -----------------------------------------------------------------------------

CREATE TABLE public.matters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id            UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  matter_number        TEXT NOT NULL,
  title                TEXT NOT NULL,
  matter_type          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'open',
  default_hourly_rate  NUMERIC(12,2) NULL,
  opened_at            DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at            DATE NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, matter_number)
);

-- -----------------------------------------------------------------------------
-- invoices — issued documents (Cyprus VAT-compliant)
-- -----------------------------------------------------------------------------
-- invoice_number is NULL on draft. It is allocated by
-- public.allocate_invoice_number() (Migration 003) ONLY on transition to
-- 'finalized'. The CHECK constraint enforces the invariant:
--   draft     => invoice_number IS NULL
--   non-draft => invoice_number IS NOT NULL
--
-- The UNIQUE (workspace_id, invoice_year, invoice_number) constraint is
-- DEFERRABLE INITIALLY IMMEDIATE: it fires at statement boundary normally,
-- but consumers can SET CONSTRAINTS ... DEFERRED if they need to swap numbers
-- in a single transaction (e.g. an admin reversal).
-- -----------------------------------------------------------------------------

CREATE TABLE public.invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL,
  client_id             UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  matter_id             UUID NOT NULL REFERENCES public.matters(id) ON DELETE RESTRICT,
  invoice_number        TEXT NULL,
  invoice_year          INT NULL,
  status                invoice_status NOT NULL DEFAULT 'draft',
  issued_at             DATE NULL,
  due_at                DATE NULL,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.1900,
  vat_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'EUR',
  notes                 TEXT NULL,
  language              preferred_language NOT NULL DEFAULT 'el',
  created_by_ai         BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at          TIMESTAMPTZ NULL,
  finalized_by_user_id  UUID NULL REFERENCES auth.users(id),
  CONSTRAINT invoices_workspace_year_number_uniq
    UNIQUE (workspace_id, invoice_year, invoice_number)
    DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT invoices_draft_number_consistency CHECK (
    (status = 'draft'  AND invoice_number IS NULL)
    OR
    (status <> 'draft' AND invoice_number IS NOT NULL)
  )
);

-- -----------------------------------------------------------------------------
-- invoice_line_items — line items per invoice (services, hours, disbursements)
-- -----------------------------------------------------------------------------

CREATE TABLE public.invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL,
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL,
  line_total    NUMERIC(12,2) NOT NULL,
  vat_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.1900,
  position      INT NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL DEFAULT 'service',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- receipts — issued when an invoice is paid
-- -----------------------------------------------------------------------------

CREATE TABLE public.receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  invoice_id      UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  receipt_number  TEXT NOT NULL,
  receipt_year    INT NOT NULL,
  paid_at         DATE NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  payment_method  TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, receipt_year, receipt_number)
);

-- -----------------------------------------------------------------------------
-- quotations — pre-engagement estimates that convert to invoices on accept
-- -----------------------------------------------------------------------------

CREATE TABLE public.quotations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL,
  client_id              UUID NOT NULL REFERENCES public.clients(id),
  matter_id              UUID NULL REFERENCES public.matters(id),
  quotation_number       TEXT NULL,
  quotation_year         INT NULL,
  status                 quotation_status NOT NULL DEFAULT 'draft',
  subtotal               NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  issued_at              DATE NULL,
  valid_until            DATE NULL,
  converted_invoice_id   UUID NULL REFERENCES public.invoices(id),
  language               preferred_language NOT NULL DEFAULT 'el',
  notes                  TEXT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- retainers — pre-paid client deposits; back the trust ledger
-- -----------------------------------------------------------------------------

CREATE TABLE public.retainers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  client_id         UUID NOT NULL REFERENCES public.clients(id),
  matter_id         UUID NULL REFERENCES public.matters(id),
  agreement_number  TEXT NOT NULL,
  deposit_amount    NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'EUR',
  status            retainer_status NOT NULL DEFAULT 'active',
  signed_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  terms             TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- time_entries — billable-hour timers per matter
-- -----------------------------------------------------------------------------
-- A partial UNIQUE index enforces "only one active timer per user per
-- workspace at any time" — see CREATE UNIQUE INDEX below the table.
-- -----------------------------------------------------------------------------

CREATE TABLE public.time_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  matter_id         UUID NOT NULL REFERENCES public.matters(id) ON DELETE RESTRICT,
  user_id           UUID NOT NULL REFERENCES auth.users(id),
  description       TEXT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ NULL,
  duration_seconds  INT NULL,
  hourly_rate       NUMERIC(12,2) NOT NULL,
  status            time_entry_status NOT NULL DEFAULT 'active',
  invoice_id        UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- trust_ledger — Cyprus client-funds ledger (PHYSICALLY SEPARATE from invoices)
-- -----------------------------------------------------------------------------
-- This table holds funds that LEGALLY belong to the client, not the lawyer.
-- Mixing them with operating revenue (the invoices table) is a disbarment-
-- grade offense in Cyprus. Hence the physical separation: no shared parent,
-- no discriminator column on a unified table — just a dedicated table with
-- its own append-only contract.
--
-- The contract:
--   * Every entry is either a debit OR a credit (never both) — see CHECK.
--   * Corrections happen via reversing entries: insert a new row with
--     entry_kind='reversal' and corrects_entry_id pointing at the original.
--     UPDATE and DELETE are forbidden — enforced by RLS deny-by-omission and
--     a row-level trigger backstop in Migration 002 (the trigger catches
--     service_role too, which would otherwise bypass RLS).
--   * NO updated_at, NO soft-delete column — append-only by design.
-- -----------------------------------------------------------------------------

CREATE TABLE public.trust_ledger (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL,
  client_id            UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  matter_id            UUID NULL REFERENCES public.matters(id) ON DELETE RESTRICT,
  entry_kind           trust_entry_kind NOT NULL,
  debit_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'EUR',
  description          TEXT NOT NULL,
  related_invoice_id   UUID NULL REFERENCES public.invoices(id),
  related_retainer_id  UUID NULL REFERENCES public.retainers(id),
  corrects_entry_id    UUID NULL REFERENCES public.trust_ledger(id),
  occurred_at          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id   UUID NULL REFERENCES auth.users(id),
  CONSTRAINT trust_ledger_debit_xor_credit CHECK (
    (debit_amount  > 0 AND credit_amount = 0)
    OR
    (credit_amount > 0 AND debit_amount  = 0)
  )
);

-- -----------------------------------------------------------------------------
-- invoice_counters — backing store for allocate_invoice_number() (Migration 003)
-- -----------------------------------------------------------------------------
-- The advisory-lock SP (Migration 003) UPSERTs and increments per
-- (workspace_id, year). Postgres SEQUENCEs are deliberately NOT used — they
-- advance even on aborted transactions and would silently violate Cyprus VAT
-- gap-free numbering law.
-- -----------------------------------------------------------------------------

CREATE TABLE public.invoice_counters (
  workspace_id  UUID NOT NULL,
  year          INT  NOT NULL,
  last_seq      INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, year)
);

-- -----------------------------------------------------------------------------
-- audit_log — append-only audit trail (written by triggers, Migration 004)
-- -----------------------------------------------------------------------------
-- Triggers in Migration 004 INSERT here on every revenue + trust mutation.
-- The actor_kind column distinguishes user-originated writes from AI-assistant
-- writes (set via SET LOCAL app.actor_kind = 'ai'). Cyprus Bar inquiries need
-- to be able to answer "who changed this row, when, and what did it look like
-- before and after" — that's what before_json / after_json are for.
-- -----------------------------------------------------------------------------

CREATE TABLE public.audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,
  actor_kind    actor_kind NOT NULL DEFAULT 'user',
  actor_id      UUID NULL,
  table_name    TEXT NOT NULL,
  row_id        UUID NOT NULL,
  action        TEXT NOT NULL,
  before_json   JSONB NULL,
  after_json    JSONB NULL,
  ts            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- workspace_id on every tenanted table (workspaces itself uses id)
CREATE INDEX idx_clients_workspace            ON public.clients            (workspace_id);
CREATE INDEX idx_clients_workspace_name_el    ON public.clients            (workspace_id, name_el);
CREATE INDEX idx_matters_workspace            ON public.matters            (workspace_id);
CREATE INDEX idx_invoices_workspace           ON public.invoices           (workspace_id);
CREATE INDEX idx_invoice_line_items_workspace ON public.invoice_line_items (workspace_id);
CREATE INDEX idx_invoice_line_items_invoice   ON public.invoice_line_items (invoice_id);
CREATE INDEX idx_receipts_workspace           ON public.receipts           (workspace_id);
CREATE INDEX idx_receipts_invoice             ON public.receipts           (invoice_id);
CREATE INDEX idx_quotations_workspace         ON public.quotations         (workspace_id);
CREATE INDEX idx_retainers_workspace          ON public.retainers          (workspace_id);
CREATE INDEX idx_time_entries_workspace       ON public.time_entries       (workspace_id);
CREATE INDEX idx_trust_ledger_workspace       ON public.trust_ledger       (workspace_id);
CREATE INDEX idx_invoice_counters_workspace   ON public.invoice_counters   (workspace_id);
CREATE INDEX idx_audit_log_workspace          ON public.audit_log          (workspace_id);

-- client_id + matter_id where relevant
CREATE INDEX idx_matters_client          ON public.matters       (client_id);
CREATE INDEX idx_invoices_client         ON public.invoices      (client_id);
CREATE INDEX idx_invoices_matter         ON public.invoices      (matter_id);
CREATE INDEX idx_quotations_client       ON public.quotations    (client_id);
CREATE INDEX idx_quotations_matter       ON public.quotations    (matter_id);
CREATE INDEX idx_retainers_client        ON public.retainers     (client_id);
CREATE INDEX idx_retainers_matter        ON public.retainers     (matter_id);
CREATE INDEX idx_time_entries_matter     ON public.time_entries  (matter_id);
CREATE INDEX idx_trust_ledger_client     ON public.trust_ledger  (client_id);
CREATE INDEX idx_trust_ledger_matter     ON public.trust_ledger  (matter_id);

-- status on invoices (filter by draft/finalized/paid/etc.)
CREATE INDEX idx_invoices_status         ON public.invoices      (status);

-- occurred_at on trust_ledger (ledger reports by date range)
CREATE INDEX idx_trust_ledger_occurred   ON public.trust_ledger  (occurred_at);

-- Partial UNIQUE: at most one active timer per user per workspace
CREATE UNIQUE INDEX idx_time_entries_one_active_per_user
  ON public.time_entries (workspace_id, user_id)
  WHERE status = 'active';
