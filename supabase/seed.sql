-- =============================================================================
-- Lex — Seed data (demo workspace + 10 clients + 5 matters + 3 invoices)
-- =============================================================================
-- Auto-runs after `supabase db reset` (config.toml [db.seed].sql_paths).
--
-- Goals (verified by supabase/tests/run.sh):
--
--   1. Demo corpus for Fotini Kandri's pitch — real-looking Cyprus legal data
--      with names containing Greek diacritics (Χριστοδουλίδης et al.) so
--      Phase 3's PDF font-hardening has live test inputs.
--
--   2. Verification corpus:
--      * 10 clients, ≥ 3 with Greek-diacritic names (PDF test inputs).
--      * 5 matters with realistic matter_numbers + hourly rates.
--      * 3 finalized invoices using the gap-free allocator (Migration 003).
--      * VAT 19% computed server-side, matches Cyprus VAT law.
--      * 1 trust-only client (#10): retainer + trust_ledger deposit, NO
--        invoices. Used by revenue_isolation.sql to prove the trust ⟂
--        revenue invariant — SUM(invoices.total) for that client = 0,
--        SUM(trust_ledger.debit_amount) for that client = 5000.
--      * Every insert below traverses an audited table (Migration 004), so
--        audit_coverage.sql sees ≥ 1 audit_log row per audited table after
--        the seed completes.
--
-- Deterministic UUIDs:
--   * workspace_id  = 00000000-0000-0000-0000-000000000001
--   * owner_user_id = 00000000-0000-0000-0000-000000000099  (placeholder)
--
-- The owner_user_id is a PLACEHOLDER. Post Supabase cloud link, the operator
-- replaces it with Fotini's real auth.users.id after she completes the magic-
-- link signup — see OPERATOR.md §4. The local stack accepts seeding auth.users
-- directly, which the cloud project does not.
--
-- Idempotency:
--   The whole seed is wrapped in a single transaction. ON CONFLICT DO NOTHING
--   on the auth.users row makes re-running `db reset` safe even though seed
--   re-applies (db reset rebuilds public from scratch so collisions in the
--   public schema cannot happen; auth schema persists across resets).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. auth.users placeholder (workspaces.owner_user_id FK target)
-- -----------------------------------------------------------------------------
-- Replace UUID 00000000-0000-0000-0000-000000000099 with Fotini's real
-- auth.users.id post-cloud-link. See OPERATOR.md §4 for the procedure.
-- -----------------------------------------------------------------------------

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  is_sso_user,
  is_anonymous
)
VALUES (
  '00000000-0000-0000-0000-000000000099'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'fotini.placeholder@lex.local',
  '',
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  false,
  false
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Workspace — Fotini Kandri Law Office (single tenant)
-- -----------------------------------------------------------------------------

INSERT INTO public.workspaces (
  id,
  owner_user_id,
  name,
  vat_number,
  tax_id,
  iban,
  default_currency
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000099'::uuid,
  'Fotini Kandri Law Office',
  'CY10000001A',
  'CY-TAX-FK-001',
  'CY17 0020 0128 0000 0012 0052 7600',
  'EUR'
);

-- -----------------------------------------------------------------------------
-- 2. Clients (10) — at least 3 with Greek diacritics
-- -----------------------------------------------------------------------------
-- Deterministic UUIDs for clients so matters/invoices can reference them
-- without RETURNING-into-DECLARE plumbing.
-- -----------------------------------------------------------------------------

INSERT INTO public.clients (id, workspace_id, name_el, name_en, preferred_language)
VALUES
  ('00000000-0000-0000-0000-000000000c01'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Νικόλας Χριστοδουλίδης', 'Nikolas Christodoulides', 'el'),
  ('00000000-0000-0000-0000-000000000c02'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Ελένη Παπαδοπούλου', 'Eleni Papadopoulou', 'el'),
  ('00000000-0000-0000-0000-000000000c03'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Ανδρέας Ανδρέου', 'Andreas Andreou', 'el'),
  ('00000000-0000-0000-0000-000000000c04'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Μαρία Κωνσταντίνου', 'Maria Konstantinou', 'el'),
  ('00000000-0000-0000-0000-000000000c05'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Γεώργιος Δημητρίου', 'Georgios Demetriou', 'el'),
  ('00000000-0000-0000-0000-000000000c06'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Helena Smith', 'Helena Smith', 'en'),
  ('00000000-0000-0000-0000-000000000c07'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'John O''Connor', 'John O''Connor', 'en'),
  ('00000000-0000-0000-0000-000000000c08'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Σταυρούλα Λοΐζου', 'Stavroula Loizou', 'el'),
  ('00000000-0000-0000-0000-000000000c09'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Πέτρος Ιωάννου', 'Petros Ioannou', 'el'),
  ('00000000-0000-0000-0000-000000000c10'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Trust-Only Test Client', 'Trust-Only Test Client', 'en');

-- -----------------------------------------------------------------------------
-- 3. Matters (5) — 1 each for clients 1-5
-- -----------------------------------------------------------------------------
-- matter_number convention: YYYY-M-NNNN (M = matter; NNNN zero-padded).
-- -----------------------------------------------------------------------------

INSERT INTO public.matters (
  id, workspace_id, client_id, matter_number, title, matter_type,
  status, default_hourly_rate
)
VALUES
  ('00000000-0000-0000-0000-0000000a0001'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c01'::uuid,
   '2026-M-0001', 'Divorce petition — Christodoulides', 'divorce',
   'open', 180.00),
  ('00000000-0000-0000-0000-0000000a0002'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c02'::uuid,
   '2026-M-0002', 'Permanent residence — Papadopoulou', 'immigration',
   'open', 220.00),
  ('00000000-0000-0000-0000-0000000a0003'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c03'::uuid,
   '2026-M-0003', 'Title transfer — Andreou property', 'property',
   'open', 200.00),
  ('00000000-0000-0000-0000-0000000a0004'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c04'::uuid,
   '2026-M-0004', 'Divorce — Konstantinou', 'divorce',
   'open', 190.00),
  ('00000000-0000-0000-0000-0000000a0005'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c05'::uuid,
   '2026-M-0005', 'Commercial dispute — Demetriou Ltd', 'commercial',
   'open', 250.00);

-- -----------------------------------------------------------------------------
-- 4. Invoices (3) — finalized, with allocator-issued numbers
-- -----------------------------------------------------------------------------
-- The allocator (Migration 003) is gap-free per (workspace, year) via an
-- xact-level advisory lock. Here all three calls happen serially in one
-- transaction → guaranteed 2026/0001, 2026/0002, 2026/0003.
--
-- VAT 19% computed manually (matches what invoiceService.finalize will compute
-- in Phase 2 for live invoices):
--
--   Invoice 1 — Christodoulides divorce:
--     2h × €180 (consultation)  + 4h × €180 (drafting)  = €1,080.00
--     VAT 19%                                            = €  205.20
--     TOTAL                                              = €1,285.20
--
--   Invoice 2 — Papadopoulou immigration:
--     Flat €1,500 (PR application)                       = €1,500.00
--     VAT 19%                                            = €  285.00
--     TOTAL                                              = €1,785.00
--
--   Invoice 3 — Andreou property:
--     3h × €200 (title search) + 5h × €200 (contract)    = €1,600.00
--     VAT 19%                                            = €  304.00
--     TOTAL                                              = €1,904.00
-- -----------------------------------------------------------------------------

INSERT INTO public.invoices (
  id, workspace_id, client_id, matter_id,
  invoice_number, invoice_year, status,
  issued_at, due_at,
  subtotal, vat_rate, vat_amount, total,
  currency, language, finalized_at, finalized_by_user_id
)
VALUES
  ('00000000-0000-0000-0000-0000000b0001'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c01'::uuid,
   '00000000-0000-0000-0000-0000000a0001'::uuid,
   public.allocate_invoice_number(
     '00000000-0000-0000-0000-000000000001'::uuid, 2026),
   2026, 'finalized',
   DATE '2026-04-15', DATE '2026-05-15',
   1080.00, 0.1900, 205.20, 1285.20,
   'EUR', 'el', NOW(),
   '00000000-0000-0000-0000-000000000099'::uuid),

  ('00000000-0000-0000-0000-0000000b0002'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c02'::uuid,
   '00000000-0000-0000-0000-0000000a0002'::uuid,
   public.allocate_invoice_number(
     '00000000-0000-0000-0000-000000000001'::uuid, 2026),
   2026, 'finalized',
   DATE '2026-04-20', DATE '2026-05-20',
   1500.00, 0.1900, 285.00, 1785.00,
   'EUR', 'el', NOW(),
   '00000000-0000-0000-0000-000000000099'::uuid),

  ('00000000-0000-0000-0000-0000000b0003'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c03'::uuid,
   '00000000-0000-0000-0000-0000000a0003'::uuid,
   public.allocate_invoice_number(
     '00000000-0000-0000-0000-000000000001'::uuid, 2026),
   2026, 'finalized',
   DATE '2026-04-25', DATE '2026-05-25',
   1600.00, 0.1900, 304.00, 1904.00,
   'EUR', 'el', NOW(),
   '00000000-0000-0000-0000-000000000099'::uuid);

-- -----------------------------------------------------------------------------
-- 5. Invoice line items
-- -----------------------------------------------------------------------------

INSERT INTO public.invoice_line_items (
  invoice_id, workspace_id, description,
  quantity, unit_price, line_total, vat_rate, position, kind
)
VALUES
  -- Invoice 1 (Christodoulides / divorce) — 2 lines
  ('00000000-0000-0000-0000-0000000b0001'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Initial consultation — divorce petition strategy',
   2.00, 180.00, 360.00, 0.1900, 1, 'service'),
  ('00000000-0000-0000-0000-0000000b0001'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Drafting divorce petition + supporting documents',
   4.00, 180.00, 720.00, 0.1900, 2, 'service'),

  -- Invoice 2 (Papadopoulou / immigration) — 1 line, flat fee
  ('00000000-0000-0000-0000-0000000b0002'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Permanent residence application (full file preparation)',
   1.00, 1500.00, 1500.00, 0.1900, 1, 'service'),

  -- Invoice 3 (Andreou / property) — 2 lines
  ('00000000-0000-0000-0000-0000000b0003'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Title search at Department of Lands and Surveys',
   3.00, 200.00, 600.00, 0.1900, 1, 'service'),
  ('00000000-0000-0000-0000-0000000b0003'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   'Sale-and-purchase contract review + amendments',
   5.00, 200.00, 1000.00, 0.1900, 2, 'service');

-- -----------------------------------------------------------------------------
-- 6. Retainers (2) + trust_ledger deposits (2)
-- -----------------------------------------------------------------------------
-- Retainer #1: Christodoulides (divorce) — €2,000 deposit.
-- Retainer #2: Trust-Only Test Client — €5,000 deposit. NO invoice for this
--              client. This is the revenue-isolation test corpus: invoices
--              sum = €0; trust_ledger sum = €5,000.
-- -----------------------------------------------------------------------------

INSERT INTO public.retainers (
  id, workspace_id, client_id, matter_id, agreement_number,
  deposit_amount, currency, status, signed_at, terms
)
VALUES
  ('00000000-0000-0000-0000-0000000d0001'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c01'::uuid,
   '00000000-0000-0000-0000-0000000a0001'::uuid,
   '2026-R-0001', 2000.00, 'EUR', 'active',
   DATE '2026-04-01',
   'Retainer for divorce matter — drawn down as billed.'),
  ('00000000-0000-0000-0000-0000000d0002'::uuid,
   '00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c10'::uuid,
   NULL,
   '2026-R-0002', 5000.00, 'EUR', 'active',
   DATE '2026-04-05',
   'Initial deposit, no matter yet — trust-only.');

INSERT INTO public.trust_ledger (
  workspace_id, client_id, matter_id, entry_kind,
  debit_amount, credit_amount, currency, description,
  related_retainer_id, occurred_at, created_by_user_id
)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c01'::uuid,
   '00000000-0000-0000-0000-0000000a0001'::uuid,
   'deposit',
   2000.00, 0.00, 'EUR',
   'Retainer deposit — divorce matter (Christodoulides)',
   '00000000-0000-0000-0000-0000000d0001'::uuid,
   DATE '2026-04-01',
   '00000000-0000-0000-0000-000000000099'::uuid),

  ('00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000c10'::uuid,
   NULL,
   'deposit',
   5000.00, 0.00, 'EUR',
   'Initial deposit — Trust-Only Test Client',
   '00000000-0000-0000-0000-0000000d0002'::uuid,
   DATE '2026-04-05',
   '00000000-0000-0000-0000-000000000099'::uuid);

COMMIT;
