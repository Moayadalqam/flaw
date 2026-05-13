-- =============================================================================
-- Lex — Migration 004: Append-only audit triggers
-- =============================================================================
-- Legal defensibility layer. Cyprus Bar inquiries need to answer four things
-- about any row mutation:
--
--   1. WHAT changed?  →  before_json / after_json (JSONB OLD / NEW)
--   2. WHO changed it? →  actor_kind ('user' | 'ai') + actor_id (auth.uid())
--   3. WHEN?           →  ts (TIMESTAMPTZ DEFAULT NOW())
--   4. WHICH row?      →  table_name + row_id
--
-- Postgres-level triggers (not application code) because application audit can
-- be silently skipped by a buggy code path or a migration script. Triggers
-- fire regardless of who initiated the write — including service_role.
--
-- Actor distinction:
--   The trigger reads `current_setting('app.actor_kind', true)` (the third
--   argument `true` returns NULL instead of raising when the GUC is unset).
--   Server actions invoked by the AI assistant run `SET LOCAL app.actor_kind =
--   'ai'` before mutating; everything else defaults to 'user'. Distinguishing
--   AI- from user-originated writes is how Phase 6 builds the "what did the
--   robot do?" audit view.
--
-- trust_ledger note:
--   We only attach the AFTER INSERT trigger on trust_ledger. The deny-mutation
--   triggers from Migration 002 (deny_trust_mutation) RAISE on UPDATE and
--   DELETE before they reach an audit trigger, so an UPDATE/DELETE audit
--   trigger would never fire — and even if it did, the row never actually
--   changed. INSERT is the only legal mutation path on trust_ledger.
--
-- audit_log RLS posture (set in Migration 002):
--   * SELECT policy: workspace-scoped — the lawyer can read their own audit.
--   * NO INSERT/UPDATE/DELETE policies — deny-by-omission.
--   * This trigger writes via SECURITY DEFINER, so it bypasses RLS for the
--     INSERT. Even the workspace owner cannot tamper with audit_log directly.
--
-- References:
--   * .planning/research/ARCHITECTURE.md §Audit Trail
--   * .planning/research/SUMMARY.md §Phase 1 §1.3 Audit triggers
--   * .planning/ROADMAP.md Phase 1 §Tasks 4-7
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_kind actor_kind;
  v_workspace  UUID;
BEGIN
  -- Default to 'user' when the GUC is unset. NULLIF handles the "set but
  -- empty string" edge case (some clients set GUCs that way).
  v_actor_kind := COALESCE(
    NULLIF(current_setting('app.actor_kind', true), '')::actor_kind,
    'user'
  );

  -- workspace_id is present on every audited table; use NEW first, fall back
  -- to OLD for DELETE.
  v_workspace := COALESCE(NEW.workspace_id, OLD.workspace_id);

  INSERT INTO public.audit_log (
    workspace_id,
    actor_kind,
    actor_id,
    table_name,
    row_id,
    action,
    before_json,
    after_json
  )
  VALUES (
    v_workspace,
    v_actor_kind,
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END
$$;

COMMENT ON FUNCTION public.audit_trigger() IS
'Append-only audit trigger. Captures actor_kind via current_setting(app.actor_kind),
writes JSONB OLD/NEW to audit_log per INSERT/UPDATE/DELETE. SECURITY DEFINER so
the INSERT bypasses audit_log RLS (which is deny-by-omission for writes).';

-- -----------------------------------------------------------------------------
-- Triggers — revenue + trust mutations
-- -----------------------------------------------------------------------------
-- Attached to every table that affects revenue (invoices + line items +
-- receipts + quotations + retainers) or trust funds (trust_ledger INSERT-only).
-- time_entries and matters are NOT audited at this layer — they're not
-- revenue/trust mutations and are out of scope for the Cyprus Bar inquiry
-- contract per ROADMAP Phase 1.
-- -----------------------------------------------------------------------------

CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_invoice_line_items
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_trust_ledger
  AFTER INSERT ON public.trust_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_retainers
  AFTER INSERT OR UPDATE OR DELETE ON public.retainers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_receipts
  AFTER INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_quotations
  AFTER INSERT OR UPDATE OR DELETE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
