-- =============================================================================
-- Lex — Migration 002: Row-Level Security policies + trust_ledger immutability
-- =============================================================================
-- RLS is the only thing standing between Fotini's data and any other Supabase
-- user / leaked anon key / future multi-tenant fork. Implements REQ-002 (single-
-- tenant workspace isolation scoped by auth.uid()) — AUTH-02 in the roadmap.
--
-- Design notes (do not silently deviate):
--
--   * Every policy USING / WITH CHECK clause wraps current_workspace_id() in
--     (SELECT ...) so Postgres treats it as an initPlan — evaluated once per
--     statement, not once per row. See Supabase RLS performance guidance:
--     https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
--
--   * Separate policies per command (SELECT/INSERT/UPDATE/DELETE). NEVER FOR ALL.
--     FOR ALL collapses the four privilege paths into one and makes it harder
--     to reason about (and to remove DELETE without removing SELECT).
--
--   * `current_workspace_id()` returns NULL for anon. Combined with the
--     `workspace_id = (SELECT current_workspace_id())` predicate, this yields
--     `workspace_id = NULL` which is UNKNOWN in three-valued logic — so anon
--     SELECT returns an empty array (HTTP 200, []), never 401/403. This is the
--     silent-RLS pattern (research/SUMMARY.md §Risk 7). 401/403 trains clients
--     to assume tables don't exist and fall back to insecure paths.
--
--   * trust_ledger is APPEND-ONLY for everyone:
--       1. RLS has SELECT + INSERT only — no UPDATE/DELETE policies. By
--          deny-by-default this blocks authenticated/anon users.
--       2. service_role bypasses RLS unconditionally — Supabase guidance:
--          https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z
--          So we add a row-level trigger backstop. The trigger fires regardless
--          of role (RLS does not gate trigger execution). Corrections happen
--          ONLY via inserting a reversing entry with corrects_entry_id pointing
--          at the original row (see Migration 001 trust_ledger schema).
--
--   * audit_log: SELECT only. INSERT happens exclusively via the audit trigger
--     in Migration 004, which runs SECURITY DEFINER. Even the workspace owner
--     cannot tamper with their own audit trail.
--
--   * workspaces: chicken-and-egg — a user can't yet have a workspace_id when
--     creating their workspace. Policies use (owner_user_id = auth.uid())
--     directly instead of the helper.
--
--   * FORCE ROW LEVEL SECURITY: without FORCE, the table OWNER (the role that
--     ran the migration, typically `postgres`) silently bypasses RLS. FORCE
--     makes RLS apply to the owner too. Migrations that need to insert (e.g.
--     seed.sql in Task 4) explicitly run as the owner role and bypass RLS via
--     the FORCE exception for command-issuing role, but no application-path
--     query gets a free pass.
--
-- References:
--   * .planning/research/ARCHITECTURE.md §RLS Pattern
--   * .planning/research/PITFALLS.md §Risk 7
--   * .planning/research/SUMMARY.md §Risk 7
--   * ~/.claude/rules/security.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: current_workspace_id()
-- -----------------------------------------------------------------------------
-- Returns the workspace owned by the currently authenticated user, or NULL
-- if there is no authenticated user / no workspace row yet.
--
--   * LANGUAGE sql + STABLE: single SELECT, no side effects → safe to inline.
--   * SECURITY DEFINER: runs with the migration owner's privileges, allowing
--     it to read public.workspaces even though the caller may not have a
--     SELECT policy that matches yet (e.g. during INSERT into another table
--     where the policy USING clause calls this function).
--   * SET search_path = public, auth: defends against schema-shadowing attacks
--     where a malicious search_path entry could redirect `workspaces` to a
--     fake table. Without this, SECURITY DEFINER functions are vulnerable
--     CVE-class (CVE-2007-2138 style).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM public.workspaces WHERE owner_user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_workspace_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- Enable + FORCE RLS on every one of the 12 tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces         FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients            FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.matters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matters            FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices           FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.receipts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts           FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.quotations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations         FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.retainers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retainers          FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.time_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries       FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.trust_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_ledger       FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.invoice_counters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_counters   FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          FORCE  ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- workspaces — chicken-and-egg case: uses owner_user_id, not current_workspace_id
-- -----------------------------------------------------------------------------
-- Allows SELECT/INSERT/UPDATE of the user's own workspace row. No DELETE
-- policy: workspaces are cascade-deleted when the underlying auth.users row
-- is removed (ON DELETE CASCADE in Migration 001), never directly.
-- -----------------------------------------------------------------------------

CREATE POLICY workspaces_select ON public.workspaces
  FOR SELECT
  USING (owner_user_id = (SELECT auth.uid()));

CREATE POLICY workspaces_insert ON public.workspaces
  FOR INSERT
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY workspaces_update ON public.workspaces
  FOR UPDATE
  USING      (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- (no workspaces_delete policy by design — see comment above)

-- -----------------------------------------------------------------------------
-- clients — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY clients_select ON public.clients
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY clients_insert ON public.clients
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY clients_update ON public.clients
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY clients_delete ON public.clients
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- matters — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY matters_select ON public.matters
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY matters_insert ON public.matters
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY matters_update ON public.matters
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY matters_delete ON public.matters
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- invoices — four policies, workspace-scoped
-- -----------------------------------------------------------------------------
-- Note: DELETE policy exists at the RLS layer (workspace-scoped), but Cyprus
-- VAT compliance forbids deleting finalized invoices. That business rule is
-- enforced at the application layer (server actions reject DELETE on
-- status='finalized'); drafts are deletable since they never consumed a
-- sequence number.
-- -----------------------------------------------------------------------------

CREATE POLICY invoices_select ON public.invoices
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- invoice_line_items — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY invoice_line_items_select ON public.invoice_line_items
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoice_line_items_insert ON public.invoice_line_items
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoice_line_items_update ON public.invoice_line_items
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoice_line_items_delete ON public.invoice_line_items
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- receipts — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY receipts_select ON public.receipts
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY receipts_insert ON public.receipts
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY receipts_update ON public.receipts
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY receipts_delete ON public.receipts
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- quotations — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY quotations_select ON public.quotations
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY quotations_insert ON public.quotations
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY quotations_update ON public.quotations
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY quotations_delete ON public.quotations
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- retainers — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY retainers_select ON public.retainers
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY retainers_insert ON public.retainers
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY retainers_update ON public.retainers
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY retainers_delete ON public.retainers
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- time_entries — four policies, workspace-scoped
-- -----------------------------------------------------------------------------

CREATE POLICY time_entries_select ON public.time_entries
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY time_entries_insert ON public.time_entries
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY time_entries_update ON public.time_entries
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY time_entries_delete ON public.time_entries
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- invoice_counters — four policies, workspace-scoped
-- -----------------------------------------------------------------------------
-- Counter rows are upserted by allocate_invoice_number() (Migration 003,
-- SECURITY DEFINER). The RLS policies here protect against direct API access
-- — application code only reaches this table via the SP.
-- -----------------------------------------------------------------------------

CREATE POLICY invoice_counters_select ON public.invoice_counters
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoice_counters_insert ON public.invoice_counters
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoice_counters_update ON public.invoice_counters
  FOR UPDATE
  USING      (workspace_id = (SELECT public.current_workspace_id()))
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY invoice_counters_delete ON public.invoice_counters
  FOR DELETE
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- -----------------------------------------------------------------------------
-- trust_ledger — APPEND-ONLY (SELECT + INSERT only) + trigger backstop
-- -----------------------------------------------------------------------------
-- Cyprus Bar disciplinary risk: commingling or silently editing client funds
-- is disbarment-grade. Defense in depth:
--
--   Layer 1 (this migration, RLS):    No UPDATE / DELETE policy. Default-deny
--                                     blocks authenticated + anon users.
--   Layer 2 (this migration, trigger): deny_trust_mutation() RAISEs on UPDATE
--                                     or DELETE regardless of role. Catches
--                                     service_role, which bypasses RLS.
--
-- Corrections happen ONLY by inserting a new row with entry_kind='reversal'
-- and corrects_entry_id = <original row id>. The original row is preserved.
-- -----------------------------------------------------------------------------

CREATE POLICY trust_ledger_select ON public.trust_ledger
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

CREATE POLICY trust_ledger_insert ON public.trust_ledger
  FOR INSERT
  WITH CHECK (workspace_id = (SELECT public.current_workspace_id()));

-- NO trust_ledger_update policy. NO trust_ledger_delete policy. Deny-by-omission.

-- Trigger backstop — fires even when service_role bypasses RLS.
CREATE OR REPLACE FUNCTION public.deny_trust_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'trust_ledger is append-only: use a reversing entry with corrects_entry_id (TG_OP=%)',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trust_ledger_deny_update
  BEFORE UPDATE ON public.trust_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_trust_mutation();

CREATE TRIGGER trust_ledger_deny_delete
  BEFORE DELETE ON public.trust_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_trust_mutation();

-- -----------------------------------------------------------------------------
-- audit_log — SELECT only (writes are trigger-driven, Migration 004)
-- -----------------------------------------------------------------------------
-- Even the workspace owner cannot directly INSERT / UPDATE / DELETE audit_log
-- rows. The audit trigger (Migration 004) runs SECURITY DEFINER and is the
-- ONLY path that writes here. service_role bypasses RLS but should never be
-- used to write audit_log directly — that's the trigger's job.
-- -----------------------------------------------------------------------------

CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT
  USING (workspace_id = (SELECT public.current_workspace_id()));

-- NO audit_log_insert / _update / _delete policies. Deny-by-omission.
