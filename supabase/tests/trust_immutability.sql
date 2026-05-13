-- =============================================================================
-- Lex — Test: trust_ledger UPDATE and DELETE are denied for ALL roles
-- =============================================================================
-- Proves Migration 002's two-layer defense holds:
--
--   1. RLS deny-by-omission (no UPDATE/DELETE policies on trust_ledger).
--   2. Row-level BEFORE UPDATE/DELETE triggers (deny_trust_mutation) that
--      RAISE insufficient_privilege even when service_role bypasses RLS.
--
-- Strategy:
--   * Set up a self-contained fixture (auth.users + workspace + client +
--     trust_ledger row) as the migration owner (postgres) so the test works
--     on a fresh db reset that hasn't yet run the seed (Task 4).
--   * Then SET LOCAL ROLE service_role and attempt UPDATE + DELETE.
--     service_role bypasses RLS — the ONLY thing that can stop these mutations
--     is the deny_trust_mutation trigger backstop. That's what we're proving.
--   * ROLLBACK at the end so the fixture leaves no trace.
--
-- Expected output: two "PASS:" NOTICE lines, zero FAIL lines.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_ws         UUID;
  v_owner      UUID := gen_random_uuid();
  v_client     UUID;
  v_id         UUID;
  v_updated    BOOLEAN := false;
  v_deleted    BOOLEAN := false;
BEGIN
  -- ---------------------------------------------------------------------------
  -- Fixture setup (as the migration-owner role, which is postgres). We need
  -- a real auth.users row because workspaces.owner_user_id has a NOT NULL FK
  -- to auth.users(id) with ON DELETE CASCADE.
  -- ---------------------------------------------------------------------------
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    VALUES (v_owner,
            '00000000-0000-0000-0000-000000000000'::uuid,
            'authenticated', 'authenticated',
            'trust-immutability-test@example.invalid',
            '', NOW(), NOW(), NOW());

  INSERT INTO public.workspaces (owner_user_id, name)
    VALUES (v_owner, 'trust-immutability-test')
    RETURNING id INTO v_ws;

  INSERT INTO public.clients (workspace_id, name_el, name_en, preferred_language)
    VALUES (v_ws, 'Trust Test Client', 'Trust Test Client', 'en')
    RETURNING id INTO v_client;

  INSERT INTO public.trust_ledger (workspace_id, client_id, entry_kind,
                                   debit_amount, credit_amount, description)
    VALUES (v_ws, v_client, 'deposit', 100, 0, 'trust-immutability-test fixture')
    RETURNING id INTO v_id;

  -- ---------------------------------------------------------------------------
  -- Switch to service_role for the mutation attempts. service_role bypasses
  -- RLS, so if UPDATE/DELETE succeed, only the trigger backstop is stopping
  -- them. The trigger MUST fire and RAISE insufficient_privilege.
  -- ---------------------------------------------------------------------------
  SET LOCAL ROLE service_role;

  -- Test 1: UPDATE must be blocked by the trigger backstop.
  BEGIN
    UPDATE public.trust_ledger
       SET debit_amount = 0
       WHERE id = v_id;
    v_updated := true;
    RAISE EXCEPTION 'FAIL: UPDATE succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: UPDATE denied';
  END;

  IF v_updated THEN
    RAISE EXCEPTION 'FAIL: UPDATE was not blocked';
  END IF;

  -- Test 2: DELETE must be blocked by the trigger backstop.
  BEGIN
    DELETE FROM public.trust_ledger WHERE id = v_id;
    v_deleted := true;
    RAISE EXCEPTION 'FAIL: DELETE succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: DELETE denied';
  END;

  IF v_deleted THEN
    RAISE EXCEPTION 'FAIL: DELETE was not blocked';
  END IF;

  -- Reset to default role for the rest of the transaction (cosmetic — we ROLLBACK).
  RESET ROLE;
END
$$;

ROLLBACK;
