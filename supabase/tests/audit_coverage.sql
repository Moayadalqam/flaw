-- =============================================================================
-- Lex — Test: audit_log trigger coverage
-- =============================================================================
-- Proves Migration 004's audit triggers actually fired during the seed run.
-- We assert that audit_log holds ≥ 1 row for each of the four tables that the
-- seed inserts into AND that the ROADMAP Phase 1 audit contract requires:
--
--   * invoices            (3 finalized invoices inserted)
--   * invoice_line_items  (5 line items across the 3 invoices)
--   * trust_ledger        (2 deposits — Christodoulides + Trust-Only Test)
--   * retainers           (2 retainer agreements)
--
-- We do NOT assert receipts/quotations here because the seed does not insert
-- them (they exist as tables but have no seed rows). The audit triggers ARE
-- attached to those tables — Phase 2 will exercise them with real CRUD.
--
-- If any of the four required tables is missing from audit_log, the trigger
-- pipeline is broken (or never attached) — RAISE EXCEPTION listing the gaps.
--
-- Expected output on the happy path: one "PASS:" NOTICE line.
--
-- References:
--   * .planning/research/ARCHITECTURE.md §Audit Trail
--   * .planning/research/SUMMARY.md §Phase 1 §1.3 Audit triggers
--   * .planning/ROADMAP.md Phase 1 §Acceptance criteria 3 — audit pipeline
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'invoices') THEN
    v_missing := array_append(v_missing, 'invoices');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'invoice_line_items') THEN
    v_missing := array_append(v_missing, 'invoice_line_items');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'trust_ledger') THEN
    v_missing := array_append(v_missing, 'trust_ledger');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'retainers') THEN
    v_missing := array_append(v_missing, 'retainers');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'FAIL: audit_log missing rows for tables: %', v_missing;
  END IF;

  RAISE NOTICE 'PASS: audit_log captured seed inserts';
END
$$;
