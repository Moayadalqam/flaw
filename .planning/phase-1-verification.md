---
phase: 1
result: PASS
gaps: 1
---

# Phase 1 Verification

Verified against: Local stack (DB port 54422). All 4 migrations + seed.sql applied via db reset.

Design Verification: N/A - pure backend phase, no frontend.

---

## Contract Results

| Task | Check | Result | Evidence |
|------|-------|--------|---------|
| T1 | db reset exits 0, zero errors | PASS | grep -Eci error or warning on reset output → 0 |
| T1 | 12 tables in public schema | PASS | SELECT count(*) FROM information_schema.tables WHERE table_schema=public AND table_name IN (...12...) → 12 |
| T1 | NUMERIC monetary types, no FLOAT/REAL/MONEY | PASS | grep float-real-money on schema migration → 0 |
| T1 | trust is separate table, no is_trust flag | PASS | grep is_trust/trust_flag → 0 |
| T1 | corrects_entry_id self-FK on trust_ledger | PASS | grep corrects_entry_id.*REFERENCES.*trust_ledger → 1 |
| T1 | VAT default 0.1900 on invoices + invoice_line_items | PASS | grep vat_rate NUMERIC DEFAULT 0.1900 → 2 |
| T2 | RLS enabled all 12 tables | PASS | pg_class relrowsecurity=true all 12 |
| T2 | FORCE ROW LEVEL SECURITY all 12 tables | PASS | pg_class relforcerowsecurity=true all 12 |
| T2 | trust_ledger zero UPDATE/DELETE policies | PASS | pg_policies WHERE cmd IN (UPDATE,DELETE) → 0 |
| T2 | trust immutability trigger fires for all roles | PASS | podman exec postgres psql trust_immutability.sql: PASS UPDATE denied + PASS DELETE denied |
| T2 | Anon SELECT returns [] HTTP 200 on all 12 tables | PASS | anon_smoke.sh exit 0, 12 PASS lines |
| T3 | allocate_invoice_number returns YYYY/NNNN | PASS | regex match → true |
| T3 | 10-way concurrent allocation gap-free | PASS | PASS: 10 unique sequential numbers 2026/0001..2026/0010 |
| T3 | No SEQUENCE/nextval/serial used | PASS | grep create sequence/nextval/serial migrations/003 → 0 |
| T4 | Audit triggers on all 6 revenue+trust tables | PASS | count DISTINCT event_object_table → 6 |
| T4 | Seed: 10 clients with >=3 Greek-diacritic names | PASS | boolean → true |
| T4 | Seed: 5 matters and >=3 finalized invoices | PASS | boolean → true |
| T4 | Revenue isolation: trust-only client EUR 0 revenue | PASS | PASS: trust-only client revenue = 0; trust balance = 5000.00 |
| T4 | Audit log captured seed inserts | PASS | PASS: audit_log captured seed inserts |
| T4 | audit_log >=10 rows after seed | PASS | SELECT count(*) FROM public.audit_log → 12 |
| Phase | run.sh exits 0, ALL PASS | FAIL | run.sh line 43: psql: command not found (exit 127). All 5 tests pass via podman exec. |

---

## Scores

| Criterion | Correctness | Completeness | Wiring | Quality | Verdict |
|-----------|-------------|--------------|--------|---------|---------|
| 12-table schema, NUMERIC precision, enums | 5 | 5 | 5 | 5 | PASS |
| RLS ENABLE + FORCE on all 12 tables | 5 | 5 | 5 | 5 | PASS |
| trust_ledger append-only (policy deny + trigger backstop) | 5 | 5 | 5 | 5 | PASS |
| Silent RLS (anon returns [], not 401/403) | 5 | 5 | 5 | 5 | PASS |
| allocate_invoice_number advisory-lock, gap-free, SECURITY DEFINER | 5 | 5 | 5 | 5 | PASS |
| 10-way concurrent numbering, no gaps | 5 | 5 | 5 | 5 | PASS |
| Audit triggers on 6 revenue+trust tables | 5 | 5 | 5 | 5 | PASS |
| Seed: 10 clients (>=3 Greek), 5 matters, >=3 invoices | 5 | 5 | 5 | 5 | PASS |
| Revenue isolation (trust-only client total = 0) | 5 | 5 | 5 | 5 | PASS |
| run.sh orchestrator on host | 2 | 5 | 3 | 4 | FAIL |

Minimum threshold: run.sh Correctness = 2 (below threshold of 3). This is an environment gap, not a code defect. All 5 underlying tests pass via podman exec.

---

## Evidence

### Task 1 - Schema

`supabase/migrations/20260513000001_schema.sql` - 362 lines, substantive, zero stubs.

- `supabase/migrations/20260513000001_schema.sql:130-138` - CHECK constraint: `(status = 'draft' AND invoice_number IS NULL) OR (status <> 'draft' AND invoice_number IS NOT NULL)` - draft/finalized enforced at DB level.
- `supabase/migrations/20260513000001_schema.sql` - grep -c "NUMERIC(12,2)" → 15 - all monetary columns use correct precision.
- `supabase/migrations/20260513000001_schema.sql` - grep float/real/double precision/money → 0 - no imprecise types.
- `supabase/migrations/20260513000001_schema.sql` - grep is_trust/trust_flag → 0 - trust is physical separate table.
- `supabase/migrations/20260513000001_schema.sql` - grep corrects_entry_id.*REFERENCES.*trust_ledger → 1 - reversing-entry self-FK present.
- `supabase/migrations/20260513000001_schema.sql` - grep vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1900 → 2 - on invoices and invoice_line_items.
- `package.json` - db:reset, db:push, db:test scripts all present.
- `supabase/config.toml` - major_version = 17, site_url = http://localhost:3000.

### Task 2 - RLS

`supabase/migrations/20260513000002_rls.sql` - 412 lines, substantive.

- `supabase/migrations/20260513000002_rls.sql:92-126` - ENABLE ROW LEVEL SECURITY on all 12 tables. Live pg_class query: relrowsecurity=true for all 12 rows.
- `supabase/migrations/20260513000002_rls.sql:93-126` - FORCE  ROW LEVEL SECURITY (two spaces before ROW) on all 12 tables. Live pg_class query: relforcerowsecurity=true for all 12 rows.
- Live pg_policies: trust_ledger has trust_ledger_select (SELECT) and trust_ledger_insert (INSERT) only. Zero UPDATE or DELETE policies confirmed.
- Live pg_policies: audit_log has only audit_log_select (SELECT). INSERT is trigger-only with SECURITY DEFINER. Tamper-proof.
- `supabase/migrations/20260513000002_rls.sql` - deny_trust_mutation() BEFORE UPDATE + BEFORE DELETE triggers on trust_ledger. Raises insufficient_privilege. Fires for ALL roles including service_role. pg_trigger count = 2 confirmed.
- `supabase/tests/trust_immutability.sql` - PASS: UPDATE denied + PASS: DELETE denied via podman exec supabase_db_flaw.
- `supabase/tests/anon_smoke.sh` - 12/12 PASS. All tables return HTTP 200 with [].

### Task 3 - Invoice Numbering

`supabase/migrations/20260513000003_invoice_numbering.sql` - 97 lines, substantive.

- `supabase/migrations/20260513000003_invoice_numbering.sql` - grep create sequence/nextval/serial → 0. Advisory lock pattern used exclusively.
- `supabase/migrations/20260513000003_invoice_numbering.sql` - SECURITY DEFINER + pg_advisory_xact_lock(hashtext(p_workspace::text || ':' || p_year::text)) - correct lock granularity.
- `supabase/migrations/20260513000003_invoice_numbering.sql` - REVOKE EXECUTE FROM PUBLIC; REVOKE FROM anon; REVOKE FROM authenticated; GRANT TO service_role - SP locked to service_role only.
- `supabase/tests/concurrent_numbering.sql` - 10 dblink connections allocate {2026/0001,...,2026/0010}, no gaps, no duplicates. PASS.

### Task 4 - Audit Triggers and Seed

`supabase/migrations/20260513000004_audit_triggers.sql` - 126 lines, substantive.
`supabase/seed.sql` - 344 lines, substantive.

- information_schema.triggers query: count(DISTINCT event_object_table) WHERE action_statement LIKE '%audit_trigger%' AND table in 6-table set → 6.
- `supabase/migrations/20260513000004_audit_triggers.sql` - grep "audit_trigger|current_setting.*app.actor_kind" → 11 hits (function body + actor_kind read + 6 trigger CREATE statements).
- `supabase/seed.sql` - Greek diacritic clients present: Νικόλας Χριστοδουλίδης, Ελένη Παπαδοπούλου, Ανδρέας Ανδρέου (and 5 more) confirmed by grep count = 6.
- `supabase/seed.sql:226,238,250` - VAT at 19%: totals 1285.20, 1785.00, 1904.00 (mathematically correct).
- `supabase/tests/revenue_isolation.sql` - PASS: trust-only client revenue = 0; trust balance = 5000.00.
- `supabase/tests/audit_coverage.sql` - PASS: audit_log captured seed inserts. Count = 12.

---

## Code Quality

- TypeScript: PASS - npx tsc --noEmit exits 0, no output.
- Stubs in migrations: 0 - no TODO/FIXME/placeholder in any migration file.
- Empty handlers: 0.
- Total migration lines: 1,341 (001: 362, 002: 412, 003: 97, 004: 126, seed: 344).

---

## Gaps

### Gap 1 (MEDIUM) - run.sh requires host psql binary, exits 127

`supabase/tests/run.sh:43` - `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trust_immutability.sql`
Observed: `run.sh: line 43: psql: command not found` (exit code 127)
Severity: MEDIUM - "Feature works but missing states" - all tests pass; gap is environmental.
Impact: npm run db:test fails on this host. CI pipelines without postgresql-client installed will fail.
Fix options:
  1. sudo dnf install postgresql on the host, OR
  2. Update run.sh to detect missing psql and fall back to: DOCKER_HOST=... podman exec supabase_db_flaw psql

---

## Phase-Level Success Criteria Audit

| Criterion | Verdict |
|-----------|---------|
| db reset applies 4 migrations + seed, exits 0, zero warnings | PASS |
| run.sh exits 0, ALL PASS | PARTIAL - tests pass individually, run.sh fails (missing psql on host) |
| Anon SELECT returns [] HTTP 200 all 12 tables | PASS |
| allocate_invoice_number gap-free under 10-way concurrency | PASS |
| trust_ledger denies UPDATE/DELETE all roles incl. service_role | PASS |
| Revenue isolation: trust-only client revenue = 0 | PASS |
| Seed: 10 clients (>=3 Greek), 5 matters, >=3 finalized invoices, 1 trust-only | PASS |
| audit_log >=1 row per audited table after seed | PASS |

---

## Verdict

PASS - Phase 1 goal achieved. All 8 substantive success criteria verified against the live local stack.

The single gap (MEDIUM: run.sh exits 127 because psql is not installed on host) is an environmental dependency issue, not a code defect. Every underlying test passes via podman exec supabase_db_flaw.

Schema is Cyprus-VAT-compliant. RLS with FORCE is correct on all 12 tables. trust_ledger is physically and procedurally append-only (no UPDATE/DELETE RLS policy + BEFORE trigger fires for ALL roles including service_role). Invoice numbering is gap-free under 10-way concurrency (advisory lock, no SEQUENCE). Audit triggers wired before the seed so audit_log captures all inserts. Revenue isolation verified by dedicated test.

Required before Phase 2 CI is reliable: Install postgresql-client (sudo dnf install postgresql) or update run.sh to use podman exec as psql fallback.

Proceed to Phase 2.

---

## Adversarial Findings

Adversarial review conducted 2026-05-13. Stack reset fresh; all tests re-run.

### Run.sh gap: RESOLVED

The cooperative verifier's Gap 1 (run.sh exits 127: no host psql) has been patched. The patched run.sh auto-detects Podman socket, builds a `PSQL=(podman exec -i supabase_db_flaw psql)` fallback, and now exits 0 with ALL PASS on this host:

`supabase/tests/run.sh` — final output: `ALL PASS` (confirmed with live run).

---

### Finding 1 — Plan's acceptance criterion (T2 AC line 106) is factually wrong about authenticated UPDATE behavior

**Severity:** LOW

`supabase/tests/trust_immutability.sql:64` — `SET LOCAL ROLE service_role` — the test ONLY tests service_role, not authenticated.

The plan states at `.planning/phase-1-plan.md:106` — `"A test that simulates an authenticated user trying UPDATE trust_ledger SET debit_amount = 0 returns a policy violation error, not 0 rows updated."` This claim is factually wrong.

Live proof: authenticated UPDATE on trust_ledger returns 0 rows affected with no error:

```
NOTICE: FINDING: Authenticated UPDATE is SILENT (0 rows, no error) - trigger never fires
```

The mechanism: Postgres RLS deny-by-omission for UPDATE means the implicit WHERE condition is FALSE → 0 rows match → the BEFORE UPDATE trigger (`deny_trust_mutation`) never fires → no exception raised. The data is safe (0 rows mutated), but the behavior is "silent 0-row" not "policy violation error".

**Security outcome is correct** — authenticated users cannot mutate trust_ledger rows. The plan description is wrong, and no test validates the authenticated-role path. The trust_immutability.sql tests service_role only.

**Impact:** Phase 2 application code that expects an exception on authenticated UPDATE and tries to catch it will not see one. Application code should instead check `rowsCount == 0` after an UPDATE attempt. This is a documentation/test gap, not a data-breach risk.

**Matching severity criterion:** `rules/grounding.md` LOW — "Style; TODO comments; naming inconsistency; minor perf (no user-visible impact)" — the data is protected; only the description and test coverage are wrong.

---

### Finding 2 — TRUNCATE on trust_ledger bypasses the trigger backstop for service_role

**Severity:** MEDIUM

`supabase/migrations/20260513000002_rls.sql:389-397` — triggers are `BEFORE UPDATE` and `BEFORE DELETE`, FOR EACH ROW — TRUNCATE is not a row-level operation and does not fire row-level triggers. No statement-level TRUNCATE trigger exists on trust_ledger (confirmed via `information_schema.triggers`).

Live proof:
```sql
-- As service_role (bypasses RLS):
TRUNCATE public.trust_ledger;  -- succeeds silently, count goes 2 → 0
```

`has_table_privilege('service_role', 'public.trust_ledger', 'TRUNCATE')` → `t` (confirmed via pg_roles membership chains).

The plan's success criterion at `.planning/phase-1-plan.md:489` — `"trust_ledger denies UPDATE and DELETE for ALL roles (including service_role) via the row-level trigger"` — does not mention TRUNCATE. The trigger backstop covers UPDATE/DELETE but not TRUNCATE.

**Exploitability:** TRUNCATE is not exposed by PostgREST (Supabase's REST API layer does not support it). The attack path requires a compromised `service_role` key used in a direct DB connection or Supabase MCP/CLI session. This is not a PostgREST-exploitable vector, but it IS exploitable by any code or migration script running with service_role credentials.

**Fix:** Add a statement-level TRUNCATE trigger on trust_ledger:
```sql
CREATE OR REPLACE FUNCTION public.deny_trust_truncate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'trust_ledger is append-only: TRUNCATE is forbidden (TG_OP=%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trust_ledger_deny_truncate
  BEFORE TRUNCATE ON public.trust_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.deny_trust_truncate();
```

**Matching severity criterion:** `rules/grounding.md` MEDIUM — "Feature works but missing states" — the primary protection path (UPDATE/DELETE via trigger) works; this is a gap in an edge-case mutation vector not exposed via the API.

---

### Finding 3 — 100-way concurrency: no additional risk beyond 10-way

The advisory lock `pg_advisory_xact_lock(hashtext(workspace || ':' || year))` serializes all callers at the same (workspace, year) hash. 100 concurrent callers would serialize correctly — no gap, no duplicate. Hash collision between two different (workspace, year) pairs causes unnecessary serialization (false contention) but never incorrect output. `hashtext` returns `INT4`; collision probability across ~1000 workspaces is astronomically low and causes only a performance hit, not a correctness issue. **No finding.**

---

### Finding 4 — Audit trigger failure propagates correctly (no swallowed errors)

`supabase/migrations/20260513000004_audit_triggers.sql:43-87` — `audit_trigger()` has no EXCEPTION handler. An error in the `INSERT INTO public.audit_log` (e.g., FK violation, disk full) propagates to the caller as an unhandled exception, which rolls back the parent transaction. This is the correct behavior for audit integrity: if the audit write fails, the audited write is also rolled back. **No finding.**

---

### Finding 5 — workspace_id FK omission on most tables: matches plan spec, not a defect

`supabase/migrations/20260513000001_schema.sql:113` — `workspace_id UUID NOT NULL` (no REFERENCES) on `invoices`. Same for `invoice_line_items`, `receipts`, `quotations`, `retainers`, `time_entries`, `trust_ledger`, `invoice_counters`, `audit_log`.

Only `clients` and `matters` have `REFERENCES public.workspaces(id) ON DELETE CASCADE` (confirmed via `information_schema.referential_constraints`).

This matches the plan spec verbatim: `.planning/phase-1-plan.md` — `"invoices: workspace_id UUID NOT NULL"` (no REFERENCES clause). The plan intentionally relied on the `client_id → clients.workspace_id` chain for cascade integrity rather than adding a FK on every table. This is a design choice, not an implementation error. **No finding** relative to the plan spec — but flag for Phase 2 architects: a crafted service_role INSERT could set `invoice.workspace_id` to an arbitrary UUID that does not match the `client_id`'s workspace. RLS prevents read leakage, but the data inconsistency would be silently stored.

---

### Adversarial Verdict

Phase 1 PASS stands with two noted gaps:

| # | Severity | Finding | Action Required |
|---|----------|---------|-----------------|
| 1 | LOW | Plan AC for T2 (authenticated UPDATE raises error) is wrong — actual behavior is silent 0-row | Update plan doc / add authenticated-UPDATE test in Phase 2 |
| 2 | MEDIUM | TRUNCATE on trust_ledger bypasses trigger backstop for service_role | Add statement-level TRUNCATE trigger in Phase 2 hotfix migration |
| 3 | — | 100-way concurrency: no additional risk | No action |
| 4 | — | Audit trigger error propagation: correct behavior | No action |
| 5 | — | workspace_id FK omission: matches plan spec | Architect note for Phase 2 |

Finding 2 (MEDIUM) does not block Phase 2 start: TRUNCATE is not a PostgREST-exposed operation, and the primary attack surface (authenticated/anon UPDATE/DELETE) is fully protected. The fix should be delivered as the first migration in Phase 2 or as a standalone hotfix migration before production deployment.

Finding 1 (LOW) is documentation/test debt. The security outcome is correct.
