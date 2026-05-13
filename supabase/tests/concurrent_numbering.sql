-- =============================================================================
-- Lex — Concurrent invoice numbering test
-- =============================================================================
-- Proves that public.allocate_invoice_number() is gap-free and duplicate-free
-- under concurrent calls. Cyprus VAT law forbids gaps in invoice numbering per
-- year, so this test is the load-bearing assertion that Migration 003 is
-- doing its job.
--
-- HOW IT WORKS:
--   Postgres `dblink_send_query` opens N background sessions on the same DB
--   and fires `allocate_invoice_number()` in each. Because all N sessions
--   compete for the same `pg_advisory_xact_lock(hashtext(workspace || year))`,
--   the SP under test is forced to actually do its one-at-a-time work; if
--   the lock were missing, we would see duplicates or gaps.
--
-- USAGE:
--   The caller passes the DSN that dblink should use to reach this same
--   database. The DSN is target-machine-specific (host vs. container, ports
--   discovered from `npx supabase status`), so the test takes it as a psql
--   variable rather than hardcoding it:
--
--     psql "$DB_URL" -v dsn="'$DBLINK_DSN'" -f concurrent_numbering.sql
--
-- AUTH NUANCE (important):
--   Postgres dblink, when invoked by a NON-superuser, refuses connections
--   that arrive via a `trust`-authed pg_hba route. The Supabase local stack
--   trusts 127.0.0.1 but requires scram-sha-256 for any other IP. The DSN
--   passed in (or the fallback below) MUST therefore land at the DB through
--   a route that requires real authentication, not just localhost. From
--   inside the Supabase Postgres container the canonical such route is
--   `host.containers.internal` (resolves to the podman bridge gateway,
--   then back through the published host port 54422). From a host shell
--   the equivalent would be `127.0.0.1:54422` (which arrives at the DB
--   over the same bridge, NOT as a loopback connection).
-- =============================================================================

\set ON_ERROR_STOP on

-- The DSN cannot be substituted by psql INSIDE a dollar-quoted DO block,
-- so we publish it as a Postgres runtime setting and read it back via
-- `current_setting('lex.test_dsn')` from inside the DO block.
\if :{?dsn}
\else
\set dsn 'dbname=postgres host=host.containers.internal port=54422 user=postgres password=postgres'
\endif

SELECT set_config('lex.test_dsn', :'dsn', false);

CREATE EXTENSION IF NOT EXISTS dblink;

DO $do$
DECLARE
  v_ws       UUID := gen_random_uuid();   -- isolated workspace per run
  v_year     INT  := 2026;
  v_dsn      TEXT := current_setting('lex.test_dsn');
  v_i        INT;
  v_conn     TEXT;
  v_results  TEXT[] := ARRAY[]::TEXT[];
  v_one      TEXT;
  v_expected TEXT[] := ARRAY[
    '2026/0001','2026/0002','2026/0003','2026/0004','2026/0005',
    '2026/0006','2026/0007','2026/0008','2026/0009','2026/0010'
  ];
BEGIN
  -- Defensive: even though v_ws is fresh, clear any counter row for it.
  DELETE FROM public.invoice_counters
    WHERE workspace_id = v_ws AND year = v_year;

  -- Fan out 10 background connections, each firing the SP.
  -- dblink_send_query returns immediately; the work happens in parallel.
  FOR v_i IN 1..10 LOOP
    v_conn := 'conn_' || v_i::text;
    PERFORM dblink_connect(v_conn, v_dsn);
    PERFORM dblink_send_query(
      v_conn,
      format(
        'SELECT public.allocate_invoice_number(%L::uuid, %s::int)',
        v_ws, v_year
      )
    );
  END LOOP;

  -- Collect: dblink_get_result blocks until that connection's query
  -- finishes, so this loop drains all 10 results in dispatch order.
  FOR v_i IN 1..10 LOOP
    v_conn := 'conn_' || v_i::text;
    SELECT result INTO v_one
      FROM dblink_get_result(v_conn) AS t(result TEXT);
    v_results := array_append(v_results, v_one);
    -- A SECOND get_result is required after the real row to clear the
    -- "command complete" envelope before disconnecting (dblink protocol).
    PERFORM result FROM dblink_get_result(v_conn) AS t(result TEXT);
    PERFORM dblink_disconnect(v_conn);
  END LOOP;

  RAISE NOTICE 'Allocated: %', v_results;

  -- Assertion 1: no duplicates.
  IF (SELECT count(DISTINCT x) FROM unnest(v_results) AS x) <> 10 THEN
    RAISE EXCEPTION
      'FAIL: duplicates detected (concurrency broke the lock) — %',
      v_results;
  END IF;

  -- Assertion 2: every value is from the expected sequential set,
  -- 2026/0001 .. 2026/0010 (zero gaps, correct format).
  IF (
    SELECT count(*)
      FROM unnest(v_results) AS x
     WHERE x <> ALL(v_expected)
  ) <> 0 THEN
    RAISE EXCEPTION
      'FAIL: gap or bad format in allocated numbers — %', v_results;
  END IF;

  -- Assertion 3 (belt-and-suspenders): final counter row matches the
  -- highest number we got back. This catches the case where the SP somehow
  -- returned dup-but-bumped or vice versa.
  IF (
    SELECT last_seq FROM public.invoice_counters
      WHERE workspace_id = v_ws AND year = v_year
  ) <> 10 THEN
    RAISE EXCEPTION
      'FAIL: invoice_counters.last_seq is not 10 after 10 allocations';
  END IF;

  RAISE NOTICE 'PASS: 10 unique sequential numbers 2026/0001..2026/0010';

  -- Cleanup the test workspace's counter row so reruns are deterministic.
  DELETE FROM public.invoice_counters
    WHERE workspace_id = v_ws AND year = v_year;
END
$do$;
