-- =============================================================================
-- Lex — Migration 005: trust_ledger TRUNCATE guard (Phase 1 adversarial fix #2)
-- =============================================================================
-- Closes Phase 1 verification Finding 2 (MEDIUM):
-- `.planning/phase-1-verification.md` §"Finding 2 — TRUNCATE on trust_ledger
-- bypasses the trigger backstop for service_role".
--
-- Migration 002 installed BEFORE UPDATE and BEFORE DELETE triggers on
-- trust_ledger (FOR EACH ROW) to backstop the deny-by-omission RLS policies.
-- Those triggers fire on row-level operations only — TRUNCATE is a
-- statement-level op and does NOT fire row-level triggers. service_role
-- (which bypasses RLS) could therefore TRUNCATE public.trust_ledger and
-- silently wipe all trust deposits (live proof: count went 2 → 0 in the
-- adversarial run).
--
-- Fix: add a statement-level BEFORE TRUNCATE trigger that reuses the existing
-- `public.deny_trust_mutation()` function from Migration 002. The function
-- raises ERRCODE 'insufficient_privilege' regardless of TG_OP, so it works
-- for the TRUNCATE event too. No need to define a second function.
--
-- Attack surface this closes:
--   * Compromised service_role key used over a direct DB connection (psql,
--     Supabase MCP/CLI session, server-side mutation in app code).
--   * Migration scripts that accidentally include TRUNCATE on trust_ledger.
--   * Any future code that bypasses PostgREST and reaches the DB directly.
--
-- TRUNCATE is not exposed by PostgREST, so this is not a REST-API-exploitable
-- vector — but the defense-in-depth principle (Cyprus Bar disciplinary risk:
-- silently wiping client funds is disbarment-grade) demands we close every
-- known mutation path on trust_ledger.
--
-- References:
--   * .planning/phase-1-verification.md §"Finding 2"
--   * supabase/migrations/20260513000002_rls.sql:377-397 (existing trigger
--     pattern and deny_trust_mutation() definition)
-- =============================================================================

CREATE TRIGGER trust_ledger_deny_truncate
  BEFORE TRUNCATE ON public.trust_ledger
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.deny_trust_mutation();
