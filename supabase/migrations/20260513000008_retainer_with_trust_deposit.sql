-- =============================================================================
-- Lex — Migration 008: create_retainer_with_deposit (atomic SP)
-- =============================================================================
-- Phase 4 Task 2. Implements REQ-008 (retainer agreements with running balance)
-- and the disbarment-grade safety net at the heart of REQ-010 (trust ledger
-- separation): every Create-Retainer user action MUST produce both the
-- `retainers` row AND the matching `trust_ledger` deposit row atomically, or
-- neither.
--
-- Why a SECURITY DEFINER stored procedure (instead of two RLS-scoped INSERTs
-- in application code): Postgres only guarantees atomicity inside a single
-- statement or transaction. A two-statement application path through the
-- PostgREST connection pool would risk drift (network error after retainer
-- INSERT, before trust_ledger INSERT → retainer exists with no deposit row →
-- Fotini's trust accounting silently broken → Cyprus Bar disciplinary
-- exposure). Wrapping both writes in one SP guarantees they share one
-- transaction.
--
-- Defence-in-depth: the SP is SECURITY DEFINER, so we explicitly verify
-- workspace ownership inside the function body (`p_actor` must own
-- `p_workspace`) before performing either INSERT. The caller invokes the SP
-- via the regular RLS-scoped client; RLS gates the rest of the surface area
-- anyway, but the explicit check inside the SP closes the gap that elevated
-- privileges would otherwise open.
--
-- References:
--   * .planning/PROJECT.md REQ-008, REQ-010
--   * .planning/phase-4-plan.md Task 2 (Retainers + atomic deposit SP)
--   * supabase/migrations/20260513000001_schema.sql:204-280 (retainers + trust_ledger)
--   * supabase/migrations/20260513000002_rls.sql:351-397 (trust_ledger append-only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_retainer_with_deposit(
  p_workspace        UUID,
  p_client           UUID,
  p_matter           UUID,
  p_agreement_number TEXT,
  p_deposit          NUMERIC(12,2),
  p_signed_at        DATE,
  p_terms            TEXT,
  p_currency         TEXT,
  p_actor            UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_retainer_id     UUID;
  v_workspace_owner UUID;
BEGIN
  -- Defence-in-depth ownership check. RLS already restricts the caller, but
  -- this SP runs with elevated privileges so we verify explicitly that the
  -- claimed workspace belongs to the claimed actor.
  SELECT owner_user_id
    INTO v_workspace_owner
    FROM public.workspaces
   WHERE id = p_workspace;

  IF v_workspace_owner IS NULL OR v_workspace_owner <> p_actor THEN
    RAISE EXCEPTION 'workspace ownership mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (1) Retainer row.
  INSERT INTO public.retainers (
    workspace_id,
    client_id,
    matter_id,
    agreement_number,
    deposit_amount,
    currency,
    status,
    signed_at,
    terms
  ) VALUES (
    p_workspace,
    p_client,
    p_matter,
    p_agreement_number,
    p_deposit,
    p_currency,
    'active',
    p_signed_at,
    p_terms
  )
  RETURNING id INTO v_retainer_id;

  -- (2) Matching trust_ledger deposit row (debit_amount > 0, credit_amount = 0).
  --     The CHECK constraint trust_ledger_debit_xor_credit (Migration 001
  --     line 275) enforces the XOR; the immutability triggers (Migration 002
  --     lines 389–397) fire on UPDATE/DELETE but not INSERT.
  INSERT INTO public.trust_ledger (
    workspace_id,
    client_id,
    matter_id,
    entry_kind,
    debit_amount,
    credit_amount,
    currency,
    description,
    related_retainer_id,
    occurred_at,
    created_by_user_id
  ) VALUES (
    p_workspace,
    p_client,
    p_matter,
    'deposit',
    p_deposit,
    0,
    p_currency,
    'Retainer deposit',
    v_retainer_id,
    p_signed_at,
    p_actor
  );

  RETURN v_retainer_id;
END;
$$;

-- Lock down execution: anon must never invoke this SP. authenticated callers
-- reach it via PostgREST + RLS-scoped client. service_role keeps execute for
-- migrations / seeds / future admin tooling.
REVOKE ALL ON FUNCTION public.create_retainer_with_deposit(
  UUID, UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_retainer_with_deposit(
  UUID, UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID
) TO authenticated, service_role;
