-- =============================================================================
-- Lex — Migration 003: Gap-free invoice numbering (advisory-lock SP)
-- =============================================================================
-- WHY NOT A POSTGRES AUTO-INCREMENT GENERATOR:
--   Postgres auto-increment generators (the built-in counter primitive of
--   the SQL standard, including the SQL-standard `IDENTITY` column and its
--   older shorthand) are explicitly designed NOT to be gap-free. The
--   counter advances unconditionally and is never rolled back, even when
--   the surrounding transaction aborts. Cyprus VAT law forbids gaps in
--   invoice numbering per year, so using one would silently violate
--   compliance the first time a finalize transaction failed for any
--   reason.
--
--   Source: https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/
--           ("PostgreSQL sequences are not transactional ... aborted
--            transactions leave gaps")
--
-- WHY ADVISORY LOCKS RATHER THAN ROW LOCKS:
--   `SELECT ... FOR UPDATE` on the counter row also delivers gap-free
--   numbering but rewrites the row on every increment (heap bloat on a hot
--   path). `pg_advisory_xact_lock` orders finalize calls one-at-a-time per
--   (workspace_id, year) at zero heap cost and releases automatically on
--   COMMIT or ROLLBACK — no leak risk, no leftover lock state.
--   Source: https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/
--   See also: .planning/research/ARCHITECTURE.md §"Invoice Numbering — The
--   Critical Decision" (lines 176–207) and SUMMARY.md §Risk 1.
--
-- CALLING CONTRACT — read carefully before consuming this SP:
--   * Numbers are consumed ONLY on `invoiceService.finalize`. Drafts use
--     UUIDs (see invoices.invoice_number NULL CHECK in Migration 001).
--   * This SP MUST be called inside the SAME transaction as the
--     `UPDATE invoices SET status='finalized', invoice_number=<sp_result>`
--     so that if the invoice update aborts, the counter increment rolls
--     back along with it — preserving gap-freeness.
--   * Server actions go through `service_role` (it is the only role with
--     EXECUTE on this function). Workspace ownership must be verified in
--     application code before invoking — service_role bypasses RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(
  p_workspace UUID,
  p_year      INT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INT;
BEGIN
  -- Order finalize calls one-at-a-time per (workspace, year).
  -- Transaction-level lock releases on COMMIT or ROLLBACK; no leak risk.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_workspace::text || ':' || p_year::text)
  );

  -- Ensure a counter row exists for this (workspace, year). DO NOTHING on
  -- conflict because a concurrent caller may have already inserted it
  -- before we took the lock at the same hash.
  INSERT INTO public.invoice_counters (workspace_id, year, last_seq)
    VALUES (p_workspace, p_year, 0)
    ON CONFLICT (workspace_id, year) DO NOTHING;

  -- Increment + return atomically. Because we hold the advisory lock for
  -- this (workspace, year), no other session is in this critical section.
  UPDATE public.invoice_counters
     SET last_seq = last_seq + 1
   WHERE workspace_id = p_workspace
     AND year         = p_year
  RETURNING last_seq INTO v_seq;

  RETURN p_year::text || '/' || LPAD(v_seq::text, 4, '0');
END
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Only `service_role` may EXECUTE. `anon` and `authenticated` cannot —
-- finalization is a server-side, ownership-verified action, never client-
-- callable. Note: SECURITY DEFINER alone doesn't keep `anon` out; the
-- explicit REVOKE/GRANT below does.
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(UUID, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.allocate_invoice_number(UUID, INT) TO service_role;

COMMENT ON FUNCTION public.allocate_invoice_number(UUID, INT) IS
'Cyprus-VAT gap-free invoice numbering. Returns YYYY/NNNN (zero-padded 4).
Uses pg_advisory_xact_lock per (workspace, year) — NOT a Postgres SEQUENCE,
because sequences advance on aborted transactions and would leave gaps.
MUST be called inside the same transaction as the invoice UPDATE that
finalizes the row, so that an abort rolls both back together.
Source: https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/';
