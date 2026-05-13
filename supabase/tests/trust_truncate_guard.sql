-- =============================================================================
-- Lex — Test: trust_ledger TRUNCATE is denied (Phase 1 adversarial fix #2)
-- =============================================================================
-- Proves Migration 005's statement-level BEFORE TRUNCATE trigger fires and
-- raises insufficient_privilege.
--
-- Strategy:
--   * Wrap everything in a single transaction we ROLLBACK at the end so we
--     leave no fixture trace (and so we don't need to clean up).
--   * Attempt TRUNCATE public.trust_ledger inside a nested PL/pgSQL block.
--     The new BEFORE TRUNCATE trigger MUST raise insufficient_privilege.
--   * Catch the exception → PASS. If TRUNCATE returns without raising → FAIL.
--
-- This test runs as the migration-owner role (postgres) by default — which
-- is the strongest case: postgres has every privilege and bypasses RLS, so
-- if the trigger denies TRUNCATE for postgres it will deny it for everyone.
-- (deny_trust_mutation() raises unconditionally on TG_OP, regardless of role.)
--
-- Expected output: one "PASS: TRUNCATE denied" NOTICE, zero FAIL lines.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  BEGIN
    TRUNCATE public.trust_ledger;
    RAISE EXCEPTION 'FAIL: TRUNCATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: TRUNCATE denied';
  END;
END $$;

ROLLBACK;
