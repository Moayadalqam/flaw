-- =============================================================================
-- Lex — Test: revenue ⟂ trust isolation
-- =============================================================================
-- Proves the trust_ledger ⟂ invoices invariant on the dedicated "Trust-Only
-- Test Client" seeded by supabase/seed.sql.
--
--   * SUM(invoices.total) for that client          MUST be 0.00
--     (the client has NO invoices — only a retainer + trust deposit).
--   * SUM(trust_ledger.debit_amount) for that client MUST be 5000.00
--     (the deposit recorded in seed step 6).
--
-- If either invariant is broken, RAISE EXCEPTION halts run.sh. This is the
-- runtime proof that revenue and trust are physically separated tables — no
-- shared parent, no flag column on a unified table — so a SELECT over revenue
-- can never accidentally pull in client funds and vice versa.
--
-- Expected output on the happy path: one "PASS:" NOTICE line.
--
-- References:
--   * .planning/research/ARCHITECTURE.md §Trust ledger isolation
--   * .planning/research/SUMMARY.md §Risk 2 trust isolation
--   * .planning/PROJECT.md decisions row 2026-05-13 "Trust ledger as a Tier-1
--     feature"
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_revenue       NUMERIC(12,2);
  v_trust_balance NUMERIC(12,2);
BEGIN
  -- Revenue side: must be 0 for the trust-only client.
  SELECT COALESCE(SUM(i.total), 0)
    INTO v_revenue
    FROM public.invoices i
    JOIN public.clients  c ON c.id = i.client_id
   WHERE c.name_en = 'Trust-Only Test Client';

  IF v_revenue <> 0 THEN
    RAISE EXCEPTION
      'FAIL: trust-only client has invoices totalling %', v_revenue;
  END IF;

  -- Trust side: must be 5000.00 (matches the seed deposit). Debit_amount in
  -- this schema represents money INTO the trust account.
  SELECT COALESCE(SUM(tl.debit_amount), 0)
    INTO v_trust_balance
    FROM public.trust_ledger tl
    JOIN public.clients      c ON c.id = tl.client_id
   WHERE c.name_en = 'Trust-Only Test Client';

  IF v_trust_balance <> 5000.00 THEN
    RAISE EXCEPTION
      'FAIL: trust deposit for trust-only client is % (expected 5000.00)',
      v_trust_balance;
  END IF;

  RAISE NOTICE 'PASS: trust-only client revenue = 0; trust balance = 5000.00';
END
$$;
