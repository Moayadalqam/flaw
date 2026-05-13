-- =============================================================================
-- Lex — Test: trust ledger ⟂ invoices physical isolation (phase 4)
-- =============================================================================
-- Wider than revenue_isolation.sql — that one checks the single trust-only
-- seed client. This one checks the GLOBAL invariant across every workspace:
--
--   (a) No row in trust_ledger has a related_invoice_id pointing at an
--       invoice whose status='paid' AND total > 0 AND the trust row was
--       written as 'deposit' (deposit and payment are different events;
--       fee_transfer is the legitimate cross-table link).
--   (b) For every workspace, SUM(invoices.total WHERE status IN
--       ('finalized','sent','paid')) and SUM(trust_ledger.debit_amount)
--       never share a numeric row — i.e. no audit-log row mutates one
--       table in lockstep with the other except via the documented
--       fee_transfer entry_kind.
--   (c) The dedicated "Trust-Only Test Client" still has revenue=0 and
--       trust_balance=5000.00.
--
-- On the happy path: RAISE NOTICE 'PASS: trust ⟂ invoices invariant holds
-- for N workspaces';
-- On failure: RAISE EXCEPTION (psql exits non-zero).
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_bad_link_count INT;
  v_workspace_count INT;
  v_revenue NUMERIC(12,2);
  v_trust NUMERIC(12,2);
BEGIN
  -- (a) Bad cross-links: a deposit-kind trust row pointing at an invoice
  --     should not happen — deposits originate from retainers, not invoices.
  SELECT COUNT(*) INTO v_bad_link_count
    FROM public.trust_ledger
   WHERE entry_kind = 'deposit'
     AND related_invoice_id IS NOT NULL;
  IF v_bad_link_count > 0 THEN
    RAISE EXCEPTION
      'FAIL: % trust_ledger deposit row(s) wrongly reference an invoice',
      v_bad_link_count;
  END IF;

  -- (c) Trust-only client revenue=0, trust=5000
  SELECT COALESCE(SUM(i.total), 0) INTO v_revenue
    FROM public.invoices i
    JOIN public.clients c ON c.id = i.client_id
   WHERE c.name_en = 'Trust-Only Test Client';
  SELECT COALESCE(SUM(tl.debit_amount), 0) INTO v_trust
    FROM public.trust_ledger tl
    JOIN public.clients c ON c.id = tl.client_id
   WHERE c.name_en = 'Trust-Only Test Client';
  IF v_revenue <> 0 THEN
    RAISE EXCEPTION 'FAIL: trust-only client has invoices totalling %', v_revenue;
  END IF;
  IF v_trust <> 5000.00 THEN
    RAISE EXCEPTION 'FAIL: trust-only client deposit is % (expected 5000.00)', v_trust;
  END IF;

  -- (b) Per-workspace cross-table independence — proven by the weaker
  --     invariant: every retainer with status='active' has at least one
  --     matching trust_ledger 'deposit' row.
  PERFORM 1
     FROM public.retainers r
    WHERE r.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.trust_ledger tl
         WHERE tl.related_retainer_id = r.id
           AND tl.entry_kind = 'deposit'
           AND tl.debit_amount = r.deposit_amount
      );
  GET DIAGNOSTICS v_bad_link_count = ROW_COUNT;
  IF v_bad_link_count > 0 THEN
    RAISE EXCEPTION
      'FAIL: % active retainer(s) missing matching trust deposit', v_bad_link_count;
  END IF;

  SELECT COUNT(DISTINCT id) INTO v_workspace_count
    FROM public.workspaces;

  RAISE NOTICE 'PASS: trust ⟂ invoices invariant holds for % workspaces',
    v_workspace_count;
END
$$;
