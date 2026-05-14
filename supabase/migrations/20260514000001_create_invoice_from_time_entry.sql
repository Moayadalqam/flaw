-- =============================================================================
-- Lex — Migration 009: create_invoice_from_time_entry (atomic SP)
-- =============================================================================
-- Phase 4 gap closure cycle 1, Task 2. Closes the MEDIUM finding from
-- .planning/phase-4-verification.md §Adversarial Findings §2: the inline
-- "INSERT invoice → INSERT line items → UPDATE time_entry" sequence in
-- createInvoiceAction (src/app/(workspace)/invoices/actions.ts:321-356)
-- is non-atomic. Under Postgres READ COMMITTED — the PostgREST default —
-- two concurrent calls with the same from_time_entry UUID both observe
-- `status='completed' AND invoice_id IS NULL` before either commits.
-- Both UPDATEs succeed → two draft invoices for the same billable hours,
-- exactly the disbarment-grade failure mode Phase 4 Task 4 was meant to
-- prevent.
--
-- Why a definer-scoped stored procedure: the same atomicity argument as
-- Migration 008 (create_retainer_with_deposit). The full three-write set
-- (INSERT invoices, INSERT invoice_line_items, UPDATE time_entries) must
-- either all-commit or all-rollback. Wrapping them in one PL/pgSQL block
-- gives a single transaction; the `SELECT ... FOR UPDATE` row lock on the
-- time entry serialises concurrent callers, so the loser blocks until the
-- holder commits, then sees `status='billed'` and raises
-- `time_entry_already_billed`.
--
-- Defence-in-depth: the SP runs with elevated privileges (bypasses RLS by
-- design), so it explicitly verifies that `p_actor` owns `p_workspace`
-- before any write, mirroring Migration 008:53-64. The caller invokes via
-- the regular RLS-scoped client; the explicit ownership check is the
-- extra belt that closes the elevated-privilege gap.
--
-- The `from_time_entry`-less path of createInvoiceAction is untouched —
-- it keeps its plain RLS-gated INSERT/INSERT sequence. Only the prefill
-- path (timer → bill these hours) routes through this SP.
--
-- References:
--   * .planning/phase-4-verification.md §Adversarial Findings §2
--   * .planning/phase-4-gaps-plan.md Task 2 (this task)
--   * supabase/migrations/20260513000001_schema.sql:111-158 (invoices
--     + invoice_line_items schemas)
--   * supabase/migrations/20260513000001_schema.sql:225-238 (time_entries
--     schema; status enum is `time_entry_status` defined line 39)
--   * supabase/migrations/20260513000008_retainer_with_trust_deposit.sql
--     (gold-standard atomic-SP + ownership-check pattern)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_from_time_entry(
  p_workspace    UUID,
  p_client       UUID,
  p_matter       UUID,
  p_time_entry   UUID,
  p_language     TEXT,
  p_notes        TEXT,
  p_due_at       DATE,
  p_description  TEXT,
  p_quantity     NUMERIC(10,2),
  p_unit_price   NUMERIC(12,2),
  p_line_total   NUMERIC(12,2),
  p_subtotal     NUMERIC(12,2),
  p_vat_amount   NUMERIC(12,2),
  p_total        NUMERIC(12,2),
  p_actor        UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_workspace_owner UUID;
  v_te_user         UUID;
  v_te_workspace    UUID;
  v_te_status       time_entry_status;
  v_te_invoice      UUID;
  v_invoice_id      UUID;
BEGIN
  -- (1) Defence-in-depth ownership check. RLS gates the caller, but this
  --     SP runs with elevated privileges, so verify explicitly that the
  --     claimed workspace belongs to the claimed actor before any write.
  --     Mirror Migration 008:53-64.
  SELECT owner_user_id
    INTO v_workspace_owner
    FROM public.workspaces
   WHERE id = p_workspace;

  IF v_workspace_owner IS NULL OR v_workspace_owner <> p_actor THEN
    RAISE EXCEPTION 'workspace ownership mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (2) Row-level lock on the time entry, THEN evaluate invariants.
  --     The FOR UPDATE clause is the serialisation primitive: a second
  --     concurrent caller with the same p_time_entry blocks here until
  --     the holder commits, then proceeds and observes the post-commit
  --     state (status='billed', invoice_id IS NOT NULL) → raises
  --     time_entry_already_billed deterministically. Without FOR UPDATE
  --     this SP would be no safer than the inline 4-statement code path.
  SELECT user_id, workspace_id, status, invoice_id
    INTO v_te_user, v_te_workspace, v_te_status, v_te_invoice
    FROM public.time_entries
   WHERE id = p_time_entry
   FOR UPDATE;

  -- Mask cross-workspace / cross-user lookups as not_found (don't leak
  -- the existence of other tenants' time entries).
  IF NOT FOUND
     OR v_te_workspace <> p_workspace
     OR v_te_user      <> p_actor THEN
    RAISE EXCEPTION 'time_entry_not_found';
  END IF;

  IF v_te_status <> 'completed' OR v_te_invoice IS NOT NULL THEN
    RAISE EXCEPTION 'time_entry_already_billed';
  END IF;

  -- (3) INSERT the draft invoice. invoice_number stays NULL (allocated
  --     only on finalize by allocate_invoice_number — Migration 003).
  --     Defaults: vat_rate=0.1900, currency='EUR', issued_at=CURRENT_DATE.
  INSERT INTO public.invoices (
    workspace_id,
    client_id,
    matter_id,
    status,
    language,
    currency,
    vat_rate,
    subtotal,
    vat_amount,
    total,
    issued_at,
    due_at,
    notes
  ) VALUES (
    p_workspace,
    p_client,
    p_matter,
    'draft',
    p_language::preferred_language,
    'EUR',
    0.1900,
    p_subtotal,
    p_vat_amount,
    p_total,
    CURRENT_DATE,
    p_due_at,
    p_notes
  )
  RETURNING id INTO v_invoice_id;

  -- (4) INSERT the matching billable-hours line item. Hours always book
  --     under kind='service' (Cyprus VAT is the same 19% as any other
  --     service line). position=1 — single line, the SP doesn't accept
  --     multiple lines by design.
  INSERT INTO public.invoice_line_items (
    workspace_id,
    invoice_id,
    description,
    quantity,
    unit_price,
    line_total,
    vat_rate,
    position,
    kind
  ) VALUES (
    p_workspace,
    v_invoice_id,
    p_description,
    p_quantity,
    p_unit_price,
    p_line_total,
    0.1900,
    1,
    'service'
  );

  -- (5) Flip the source time entry. The FOR UPDATE above holds the lock
  --     through this UPDATE; no other transaction can race past the
  --     invariant checks at step (2) until we COMMIT here.
  UPDATE public.time_entries
     SET status     = 'billed',
         invoice_id = v_invoice_id
   WHERE id = p_time_entry;

  RETURN v_invoice_id;
END;
$$;

-- Lock down execution: anon must never invoke this SP. authenticated
-- callers reach it via PostgREST + the user-scoped client. service_role
-- keeps execute for migrations / seeds / future admin tooling.
REVOKE ALL ON FUNCTION public.create_invoice_from_time_entry(
  UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_invoice_from_time_entry(
  UUID, UUID, UUID, UUID, TEXT, TEXT, DATE, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID
) TO authenticated, service_role;
