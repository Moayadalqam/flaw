-- =============================================================================
-- Lex — Migration 007: Quotation line items + Accept-and-Convert SP
-- =============================================================================
-- Phase 4 Task 1 (REQ-007 / INV-03).
--
-- Adds:
--   1. public.quotation_line_items — line items per quotation. Mirrors the
--      shape of `invoice_line_items` so the convert-to-invoice path is a
--      column-for-column copy. Schema audit confirmed the base migration
--      ships ONLY the `quotations` row (header + totals) without a line-item
--      table; storing line items in a separate table (rather than JSONB)
--      keeps the data model uniform with invoices and lets the SP do a
--      pure INSERT … SELECT copy on accept.
--
--   2. RLS policies (4 per table: SELECT/INSERT/UPDATE/DELETE) workspace-
--      scoped via `current_workspace_id()` — identical pattern to
--      `invoice_line_items` (Migration 002 lines 220–239).
--
--   3. public.convert_quotation_to_invoice(p_quotation_id UUID)
--      RETURNS UUID, SECURITY DEFINER. The single legitimate exception to
--      locked decision #6's "no new migrations expected" — atomicity across
--      THREE tables (insert invoice, insert all invoice_line_items, update
--      source quotation) cannot be guaranteed from application code via
--      PostgREST. A stored procedure runs every step in one transaction;
--      a partial failure rolls back cleanly.
--
-- The SP:
--   * Verifies caller workspace ownership of the source quotation by
--     reading `workspaces.owner_user_id = auth.uid()` (the SECURITY DEFINER
--     bypasses RLS, so we re-check ownership in the function body).
--   * Verifies source `status = 'sent'`. Drafts cannot be accepted (must
--     be marked-sent first); already-accepted/declined/expired cannot be
--     re-accepted.
--   * Recomputes totals from the source line items to defend against a
--     stale `quotations.total` row vs. its `quotation_line_items`. The
--     resulting invoice's totals are derived from the line-item state at
--     accept-time, not from the snapshotted quotation row.
--   * INSERT new invoice (draft, NULL number — Cyprus VAT gap-free rule
--     means the number is allocated later on finalize, never on creation).
--   * INSERT every source line item into invoice_line_items keyed by the
--     new invoice id. Position is preserved.
--   * UPDATE source quotation: status='accepted', converted_invoice_id=<new>.
--   * RETURN new invoice id.
--
-- REVOKE from PUBLIC + anon; GRANT EXECUTE to authenticated + service_role
-- (the user-scoped client invokes it via supabase.rpc(), the service client
-- can be a future admin tool path).
--
-- References:
--   * supabase/migrations/20260513000001_schema.sql §quotations (lines 181–198)
--   * supabase/migrations/20260513000001_schema.sql §invoice_line_items (lines 142–158)
--   * supabase/migrations/20260513000002_rls.sql §invoice_line_items policies (lines 220–239)
--   * .planning/phase-4-plan.md §Task 1 — Action step 5 (conversion contract)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. public.quotation_line_items
-- -----------------------------------------------------------------------------
-- Column types and defaults intentionally mirror invoice_line_items so the
-- accept-convert SP can do `INSERT INTO invoice_line_items SELECT … FROM
-- quotation_line_items` without per-column coercions. The FK CASCADE on
-- quotation deletion keeps drafts disposable without orphan rows; finalized
-- quotations (status != 'draft') are blocked from delete at the application
-- layer in actions.ts.
-- -----------------------------------------------------------------------------

CREATE TABLE public.quotation_line_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id   UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL,
  description    TEXT NOT NULL,
  quantity       NUMERIC(10,2) NOT NULL,
  unit_price     NUMERIC(12,2) NOT NULL,
  line_total     NUMERIC(12,2) NOT NULL,
  vat_rate       NUMERIC(5,4) NOT NULL DEFAULT 0.1900,
  position       INT NOT NULL DEFAULT 0,
  kind           TEXT NOT NULL DEFAULT 'service',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotation_line_items_workspace
  ON public.quotation_line_items (workspace_id);
CREATE INDEX idx_quotation_line_items_quotation
  ON public.quotation_line_items (quotation_id);

-- -----------------------------------------------------------------------------
-- 2. RLS — four policies, workspace-scoped (mirrors invoice_line_items)
-- -----------------------------------------------------------------------------

ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_line_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY quotation_line_items_select ON public.quotation_line_items
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY quotation_line_items_insert ON public.quotation_line_items
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY quotation_line_items_update ON public.quotation_line_items
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY quotation_line_items_delete ON public.quotation_line_items
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- 3. public.convert_quotation_to_invoice(p_quotation_id UUID) RETURNS UUID
-- -----------------------------------------------------------------------------
-- Atomic accept-and-convert. Runs as one transaction (PL/pgSQL functions are
-- always atomic — RAISE EXCEPTION rolls back every INSERT/UPDATE issued so
-- far inside the function).
--
-- SECURITY DEFINER bypasses RLS so the function can read/write across the
-- three tables (quotations, invoice, invoice_line_items) without depending
-- on the caller's per-table policies. We re-check workspace ownership in the
-- function body — defense in depth against a malicious caller passing
-- another workspace's quotation id.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(
  p_quotation_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_quotation       public.quotations%ROWTYPE;
  v_workspace_id    UUID;
  v_owner_id        UUID;
  v_caller_uid      UUID;
  v_subtotal        NUMERIC(12,2);
  v_vat_amount      NUMERIC(12,2);
  v_total           NUMERIC(12,2);
  v_new_invoice_id  UUID;
BEGIN
  -- (a) Resolve caller identity. NULL = anon; RAISE so PostgREST returns 401-ish.
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (b) Load the source quotation. Note: SECURITY DEFINER bypasses RLS.
  SELECT * INTO v_quotation
  FROM public.quotations
  WHERE id = p_quotation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (c) Verify caller owns the workspace that owns the quotation.
  v_workspace_id := v_quotation.workspace_id;
  SELECT owner_user_id INTO v_owner_id
  FROM public.workspaces
  WHERE id = v_workspace_id;

  IF v_owner_id IS NULL OR v_owner_id <> v_caller_uid THEN
    -- Mask as not_found — never tell a hostile caller the quotation exists
    -- but belongs to another workspace.
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (d) Require status='sent'. Drafts/accepted/declined/expired all reject.
  IF v_quotation.status <> 'sent' THEN
    RAISE EXCEPTION 'not_sent'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (e) Recompute totals from the source line items at accept-time. Defends
  -- against a stale `quotations.subtotal/vat_amount/total` snapshot vs. its
  -- `quotation_line_items` rows. Cyprus standard VAT rate = 19% (0.1900).
  SELECT
    COALESCE(ROUND(SUM(line_total), 2), 0)
  INTO v_subtotal
  FROM public.quotation_line_items
  WHERE quotation_id = p_quotation_id;

  v_vat_amount := ROUND(v_subtotal * 0.1900, 2);
  v_total      := ROUND(v_subtotal + v_vat_amount, 2);

  -- (f) INSERT the new invoice (draft, NULL number — VAT gap-free rule).
  -- matter_id is NOT NULL on invoices but NULLABLE on quotations. The
  -- application-layer Zod schema for createQuotationAction requires
  -- matter_id, so this should be non-NULL by the time markSentAction has
  -- run; if it's NULL we raise rather than silently coercing.
  IF v_quotation.matter_id IS NULL THEN
    RAISE EXCEPTION 'quotation_missing_matter'
      USING ERRCODE = 'not_null_violation';
  END IF;

  INSERT INTO public.invoices (
    workspace_id,
    client_id,
    matter_id,
    status,
    issued_at,
    subtotal,
    vat_rate,
    vat_amount,
    total,
    currency,
    notes,
    language
  ) VALUES (
    v_workspace_id,
    v_quotation.client_id,
    v_quotation.matter_id,
    'draft',
    CURRENT_DATE,
    v_subtotal,
    0.1900,
    v_vat_amount,
    v_total,
    'EUR',
    v_quotation.notes,
    v_quotation.language
  )
  RETURNING id INTO v_new_invoice_id;

  -- (g) Copy every source line item into invoice_line_items. Position +
  -- kind + description + quantity + unit_price + line_total preserved
  -- verbatim. vat_rate snapped to the standard 0.1900 (matches the invoice
  -- header's vat_rate).
  INSERT INTO public.invoice_line_items (
    invoice_id,
    workspace_id,
    description,
    quantity,
    unit_price,
    line_total,
    vat_rate,
    position,
    kind
  )
  SELECT
    v_new_invoice_id,
    v_workspace_id,
    description,
    quantity,
    unit_price,
    line_total,
    0.1900,
    position,
    kind
  FROM public.quotation_line_items
  WHERE quotation_id = p_quotation_id
  ORDER BY position;

  -- (h) Mark the source quotation accepted + point to the new invoice.
  UPDATE public.quotations
  SET status               = 'accepted',
      converted_invoice_id = v_new_invoice_id
  WHERE id = p_quotation_id;

  RETURN v_new_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(UUID)
  TO authenticated, service_role;
