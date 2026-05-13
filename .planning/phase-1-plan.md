---
phase: 1
goal: "Establish DB schema, gap-free invoice numbering, trust-ledger isolation, append-only audit triggers, RLS policies, and seed data — a legally and technically sound foundation for every subsequent phase."
tasks: 4
waves: 3
---

# Phase 1: Schema + RLS Foundation

**Goal:** A locally-applied 4-migration stack on Supabase that gives `auth.uid()`-scoped RLS on every table, gap-free invoice numbering under concurrency, a physically separate (and update/delete-denied) trust ledger, append-only audit triggers on revenue + trust mutations, and a Greek-diacritic-rich seed dataset. Cyprus-VAT-compliant by construction.

**Why this phase:** Schema mistakes here cascade into every later phase. Phase 2's UI and Phase 5's AI assistant both assume RLS is silent (empty array, not 403), that `allocate_invoice_number()` is the only path to a real invoice number, and that trust money cannot be SELECT-joined into revenue queries. Getting this wrong on demo day is a disbarment-risk demo, not a feature gap — so we build it once, cite the Cybertec/Supabase research, and lock it.

**Operator step (NOT a builder task):** A real Supabase cloud project must be created before merging Phase 1 to main. The plan below uses the local Supabase stack (`npx supabase start`) for development + verification, and explicitly marks the cloud-link step as "operator runs `npx supabase link --project-ref <ref>` after creating the project in the EU region — Frankfurt or Ireland". Phase 1 acceptance does NOT require the cloud project to exist; it requires the local stack to apply all 4 migrations cleanly and every test to pass against it.

---

## Task 1 — Supabase local stack scaffold + Migration 001 (schema)

**Wave:** 1
**Persona:** architect
**Files:**
- `supabase/config.toml` (created by `npx supabase init`)
- `supabase/migrations/20260513000001_schema.sql` (new — full schema for all 12 tables)
- `supabase/.gitignore` (created by `npx supabase init`)
- `.gitignore` (append: `supabase/.branches`, `supabase/.temp`)
- `package.json` (add scripts: `"db:reset": "npx supabase db reset"`, `"db:push": "npx supabase db push"`, `"db:test": "npx supabase db reset && bash supabase/tests/run.sh"`)

**Depends on:** none

**Why:**
Every subsequent task writes a migration into `supabase/migrations/` and assumes the schema's tables, columns, and constraints exist. Without the scaffold + 001, Tasks 2-4 have nothing to layer on. The schema is also where the trust-ledger-vs-revenue physical separation, NUMERIC(12,2) monetary precision, `matter` (DB) / `Case` (UI) naming, and the `corrects_entry_id` FK for ledger reversals are encoded — get any of these wrong and the whole demo's compliance story collapses. — [research/ARCHITECTURE.md §Data Model; ROADMAP.md Phase 1 §Tasks 1]

**Acceptance Criteria:**
- `npx supabase start` brings up the local stack (Postgres + Storage + Auth) without errors; `npx supabase status` shows API URL + anon key + service role key.
- `npx supabase db reset` applies migration 001 with exit code 0 and zero NOTICE/WARNING output about pre-existing objects.
- `psql "$(npx supabase status --output env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\dt public.*"` lists exactly these 12 tables: `workspaces`, `clients`, `matters`, `invoices`, `invoice_line_items`, `receipts`, `quotations`, `retainers`, `time_entries`, `trust_ledger`, `invoice_counters`, `audit_log`.
- `trust_ledger` and `invoices` are physically separate tables (no shared parent, no `is_trust` flag column anywhere).
- All monetary columns are `NUMERIC(12,2)` (NEVER `FLOAT`, `REAL`, `DOUBLE PRECISION`, or `MONEY`).
- `invoices` has `invoice_number TEXT NULL` (NULL on draft, populated on finalize) + `status` enum (`'draft' | 'finalized' | 'sent' | 'paid' | 'void'`) + `created_by_ai BOOLEAN DEFAULT false` + `finalized_at TIMESTAMPTZ NULL` + `finalized_by_user_id UUID NULL`.
- `trust_ledger` includes `corrects_entry_id UUID NULL REFERENCES trust_ledger(id)` so corrections happen via reversing entries, never UPDATE/DELETE.

**Action:**
1. From project root, run `npx supabase init` (accept default; this creates `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/`). Do NOT initialize VSCode/IntelliJ settings if prompted.
2. Edit `supabase/config.toml`: set `[db].major_version = 17`, `[api].schemas = ["public"]`, `[auth].site_url = "http://localhost:3000"`, leave Storage defaults on.
3. Run `npx supabase start` to confirm the local stack comes up. Capture the printed DB URL — you'll use it for psql verification.
4. Create `supabase/migrations/20260513000001_schema.sql` with the full schema. Required structural details below — implement EXACTLY (no scope reduction, no "v1 / v2" splits):

   - **Extensions:** `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (for `gen_random_uuid()`)
   - **Enums:**
     - `CREATE TYPE invoice_status AS ENUM ('draft', 'finalized', 'sent', 'paid', 'void');`
     - `CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');`
     - `CREATE TYPE retainer_status AS ENUM ('active', 'depleted', 'closed');`
     - `CREATE TYPE time_entry_status AS ENUM ('active', 'completed', 'billed');`
     - `CREATE TYPE actor_kind AS ENUM ('user', 'ai');`
     - `CREATE TYPE preferred_language AS ENUM ('el', 'en');`
     - `CREATE TYPE trust_entry_kind AS ENUM ('deposit', 'fee_transfer', 'refund', 'disbursement', 'reversal');`
   - **`workspaces`** (`id UUID PK DEFAULT gen_random_uuid()`, `owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE`, `name TEXT NOT NULL`, `vat_number TEXT NULL`, `tax_id TEXT NULL`, `iban TEXT NULL`, `default_currency TEXT NOT NULL DEFAULT 'EUR'`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)
   - **`clients`** (`id UUID PK`, `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`, `name_el TEXT NOT NULL`, `name_en TEXT NOT NULL`, `vat_number TEXT NULL`, `tax_id TEXT NULL`, `email TEXT NULL`, `phone TEXT NULL`, `address TEXT NULL`, `preferred_language preferred_language NOT NULL DEFAULT 'el'`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`). Index on `(workspace_id, name_el)`.
   - **`matters`** (`id UUID PK`, `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`, `client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT`, `matter_number TEXT NOT NULL`, `title TEXT NOT NULL`, `matter_type TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'open'`, `default_hourly_rate NUMERIC(12,2) NULL`, `opened_at DATE NOT NULL DEFAULT CURRENT_DATE`, `closed_at DATE NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `UNIQUE (workspace_id, matter_number)`).
   - **`invoices`** (`id UUID PK`, `workspace_id UUID NOT NULL`, `client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT`, `matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE RESTRICT`, `invoice_number TEXT NULL`, `invoice_year INT NULL`, `status invoice_status NOT NULL DEFAULT 'draft'`, `issued_at DATE NULL`, `due_at DATE NULL`, `subtotal NUMERIC(12,2) NOT NULL DEFAULT 0`, `vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1900`, `vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0`, `total NUMERIC(12,2) NOT NULL DEFAULT 0`, `currency TEXT NOT NULL DEFAULT 'EUR'`, `notes TEXT NULL`, `language preferred_language NOT NULL DEFAULT 'el'`, `created_by_ai BOOLEAN NOT NULL DEFAULT false`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `finalized_at TIMESTAMPTZ NULL`, `finalized_by_user_id UUID NULL REFERENCES auth.users(id)`). Add `UNIQUE (workspace_id, invoice_year, invoice_number) DEFERRABLE INITIALLY IMMEDIATE`. Add `CHECK ((status = 'draft' AND invoice_number IS NULL) OR (status <> 'draft' AND invoice_number IS NOT NULL))`.
   - **`invoice_line_items`** (`id UUID PK`, `invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE`, `workspace_id UUID NOT NULL`, `description TEXT NOT NULL`, `quantity NUMERIC(10,2) NOT NULL`, `unit_price NUMERIC(12,2) NOT NULL`, `line_total NUMERIC(12,2) NOT NULL`, `vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1900`, `position INT NOT NULL DEFAULT 0`, `kind TEXT NOT NULL DEFAULT 'service'`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
   - **`receipts`** (`id UUID PK`, `workspace_id UUID NOT NULL`, `invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT`, `receipt_number TEXT NOT NULL`, `receipt_year INT NOT NULL`, `paid_at DATE NOT NULL`, `amount NUMERIC(12,2) NOT NULL`, `payment_method TEXT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `UNIQUE (workspace_id, receipt_year, receipt_number)`).
   - **`quotations`** (`id UUID PK`, `workspace_id UUID NOT NULL`, `client_id UUID NOT NULL REFERENCES clients(id)`, `matter_id UUID NULL REFERENCES matters(id)`, `quotation_number TEXT NULL`, `quotation_year INT NULL`, `status quotation_status NOT NULL DEFAULT 'draft'`, `subtotal NUMERIC(12,2) NOT NULL DEFAULT 0`, `vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0`, `total NUMERIC(12,2) NOT NULL DEFAULT 0`, `issued_at DATE NULL`, `valid_until DATE NULL`, `converted_invoice_id UUID NULL REFERENCES invoices(id)`, `language preferred_language NOT NULL DEFAULT 'el'`, `notes TEXT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
   - **`retainers`** (`id UUID PK`, `workspace_id UUID NOT NULL`, `client_id UUID NOT NULL REFERENCES clients(id)`, `matter_id UUID NULL REFERENCES matters(id)`, `agreement_number TEXT NOT NULL`, `deposit_amount NUMERIC(12,2) NOT NULL`, `currency TEXT NOT NULL DEFAULT 'EUR'`, `status retainer_status NOT NULL DEFAULT 'active'`, `signed_at DATE NOT NULL DEFAULT CURRENT_DATE`, `terms TEXT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
   - **`time_entries`** (`id UUID PK`, `workspace_id UUID NOT NULL`, `matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE RESTRICT`, `user_id UUID NOT NULL REFERENCES auth.users(id)`, `description TEXT NULL`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ NULL`, `duration_seconds INT NULL`, `hourly_rate NUMERIC(12,2) NOT NULL`, `status time_entry_status NOT NULL DEFAULT 'active'`, `invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`). Partial UNIQUE index on `(workspace_id, user_id) WHERE status = 'active'` so only one active timer per user.
   - **`trust_ledger`** (`id UUID PK`, `workspace_id UUID NOT NULL`, `client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT`, `matter_id UUID NULL REFERENCES matters(id) ON DELETE RESTRICT`, `entry_kind trust_entry_kind NOT NULL`, `debit_amount NUMERIC(12,2) NOT NULL DEFAULT 0`, `credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0`, `currency TEXT NOT NULL DEFAULT 'EUR'`, `description TEXT NOT NULL`, `related_invoice_id UUID NULL REFERENCES invoices(id)`, `related_retainer_id UUID NULL REFERENCES retainers(id)`, `corrects_entry_id UUID NULL REFERENCES trust_ledger(id)`, `occurred_at DATE NOT NULL DEFAULT CURRENT_DATE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_by_user_id UUID NULL REFERENCES auth.users(id)`). Add `CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))`. NO `updated_at`. NO soft-delete column. Append-only is enforced by RLS in Task 2.
   - **`invoice_counters`** (`workspace_id UUID NOT NULL`, `year INT NOT NULL`, `last_seq INT NOT NULL DEFAULT 0`, `PRIMARY KEY (workspace_id, year)`).
   - **`audit_log`** (`id UUID PK DEFAULT gen_random_uuid()`, `workspace_id UUID NOT NULL`, `actor_kind actor_kind NOT NULL DEFAULT 'user'`, `actor_id UUID NULL`, `table_name TEXT NOT NULL`, `row_id UUID NOT NULL`, `action TEXT NOT NULL`, `before_json JSONB NULL`, `after_json JSONB NULL`, `ts TIMESTAMPTZ NOT NULL DEFAULT NOW()`).
   - **Indexes** (after table creation): `(workspace_id)` on every table that has the column; `(client_id)` and `(matter_id)` on invoices, quotations, retainers, time_entries, trust_ledger; `(status)` on invoices; `(occurred_at)` on trust_ledger.

5. Append the package.json scripts. Do not break the existing `dev`, `build`, `start`, `lint` scripts.
6. Run `npx supabase db reset` and confirm exit 0 with no warnings.

**Validation:** (builder self-check before commit)
- `npx supabase db reset 2>&1 | grep -Ei "error|warning|notice" | grep -v "already exists" | wc -l` → `0`
- `npx supabase status` exits 0 and prints the DB URL.
- `psql "$(npx supabase status -o env 2>/dev/null | grep DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('workspaces','clients','matters','invoices','invoice_line_items','receipts','quotations','retainers','time_entries','trust_ledger','invoice_counters','audit_log');"` → `12`
- `grep -c "NUMERIC(12,2)" supabase/migrations/20260513000001_schema.sql` → `≥ 15`
- `grep -ci "float\|real\|double precision\|money" supabase/migrations/20260513000001_schema.sql` → `0`
- `grep -c "is_trust\|trust_flag" supabase/migrations/20260513000001_schema.sql` → `0` (trust is a separate table, never a flag)
- `grep -c "corrects_entry_id" supabase/migrations/20260513000001_schema.sql` → `≥ 1`

**Context:** Read @.planning/PROJECT.md, @.planning/CONTEXT.md (matter/Case + trust terminology), @.planning/research/ARCHITECTURE.md (§Data Model — Postgres, §Trust ledger isolation, §Audit Trail), @.planning/ROADMAP.md (Phase 1 §Tasks, §Risks/notes). Reference @~/.claude/rules/infrastructure.md for Supabase CLI-first rule.

---

## Task 2 — Migration 002: RLS policies + service-role isolation + anon smoke test

**Wave:** 2
**Persona:** security
**Files:**
- `supabase/migrations/20260513000002_rls.sql` (new)
- `supabase/tests/anon_smoke.sh` (new — curl-based anon-key SELECT test)
- `supabase/tests/trust_immutability.sql` (new — proves UPDATE/DELETE denied on trust_ledger)

**Depends on:** Task 1

**Why:**
RLS is the only thing standing between Fotini's data and any other Supabase user / leaked anon key / future multi-tenant fork. The "silent RLS killer" (research/SUMMARY.md §Risk 7) is policies that 403 instead of returning empty arrays — clients then assume tables don't exist and either fall back to insecure paths or surface scary errors. We need every table USING `(workspace_id = current_workspace_id())` with separate SELECT/INSERT/UPDATE/DELETE policies (not `FOR ALL`, per Supabase guidance). The trust_ledger needs an extra layer: NO UPDATE policy and NO DELETE policy at all — corrections happen ONLY via reversing entries with `corrects_entry_id`. Even `service_role` cannot UPDATE/DELETE trust_ledger, because the surface that touches trust is the only one where Cyprus Bar disciplinary risk is disbarment-grade. — [research/ARCHITECTURE.md §RLS Pattern; research/PITFALLS.md §Risk 7] — implements AUTH-02 (REQ-002: auth.uid()-scoped single-tenant workspace isolation)

**Acceptance Criteria:**
- `npx supabase db reset` (which now applies 001 + 002) exits 0 with zero warnings.
- `psql ... -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'"` shows `rowsecurity = t` for ALL 12 tables.
- `psql ... -c "SELECT tablename, cmd FROM pg_policies WHERE schemaname='public' AND tablename='trust_ledger' ORDER BY cmd"` shows policies for `SELECT` and `INSERT` only — NO `UPDATE` and NO `DELETE` policies exist (deny-by-omission).
- A test that simulates an authenticated user trying `UPDATE trust_ledger SET debit_amount = 0` returns a policy violation error, not 0 rows updated.
- A test that uses the service_role key directly trying `UPDATE trust_ledger SET debit_amount = 0` ALSO fails (service_role bypasses RLS but the trust_ledger table itself has a row-level trigger backstop preventing UPDATE/DELETE — see Action below).
- `bash supabase/tests/anon_smoke.sh` exits 0 and confirms anon-key SELECT on every table returns `[]` (empty array, HTTP 200) — never a 401/403.
- `current_workspace_id()` is `SECURITY DEFINER`, `STABLE`, and resolves `auth.uid()` → the `workspaces.id` row owned by that user. Calling it as anon returns NULL (not an error).

**Action:**
1. Create `supabase/migrations/20260513000002_rls.sql`.
2. Write the helper function FIRST:
   ```sql
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
   GRANT EXECUTE ON FUNCTION public.current_workspace_id() TO authenticated, anon, service_role;
   ```
3. Enable RLS on every one of the 12 tables: `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY; ALTER TABLE public.<name> FORCE ROW LEVEL SECURITY;` (FORCE is critical — without it the table OWNER bypasses RLS, and you don't want migration scripts shadow-bypassing).
4. For **`workspaces`**: special-case — policies USING `(owner_user_id = auth.uid())`, not `current_workspace_id()` (chicken-and-egg). Allow SELECT + INSERT for own row; UPDATE for own row; no DELETE policy.
5. For **`clients`, `matters`, `invoices`, `invoice_line_items`, `receipts`, `quotations`, `retainers`, `time_entries`, `invoice_counters`**: create FOUR separate policies per table — `<table>_select` (USING workspace_id = (SELECT current_workspace_id())), `<table>_insert` (WITH CHECK same), `<table>_update` (USING + WITH CHECK same), `<table>_delete` (USING same). Wrap the function call in `(SELECT ...)` to trigger Postgres initPlan caching.
6. For **`trust_ledger`**: create ONLY `trust_ledger_select` and `trust_ledger_insert`. Do NOT create UPDATE or DELETE policies. RLS-default-deny means without an UPDATE policy, no authenticated/anon user can UPDATE.
7. Add a **table-level UPDATE/DELETE backstop** for trust_ledger that catches service_role too. Because service_role bypasses RLS, we need a trigger:
   ```sql
   CREATE OR REPLACE FUNCTION public.deny_trust_mutation()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   AS $$
   BEGIN
     RAISE EXCEPTION 'trust_ledger is append-only: use a reversing entry with corrects_entry_id (TG_OP=%)', TG_OP USING ERRCODE = 'insufficient_privilege';
   END $$;
   CREATE TRIGGER trust_ledger_deny_update BEFORE UPDATE ON public.trust_ledger
     FOR EACH ROW EXECUTE FUNCTION public.deny_trust_mutation();
   CREATE TRIGGER trust_ledger_deny_delete BEFORE DELETE ON public.trust_ledger
     FOR EACH ROW EXECUTE FUNCTION public.deny_trust_mutation();
   ```
   The trigger fires regardless of role (service_role included). Corrections happen via `INSERT` of a new row with `entry_kind='reversal'` and `corrects_entry_id = <original>`.
8. For **`audit_log`**: SELECT policy `USING (workspace_id = (SELECT current_workspace_id()))`. NO INSERT/UPDATE/DELETE policies — only the audit trigger (Task 4) writes, and it runs as SECURITY DEFINER. Even the workspace owner cannot tamper.
9. Create `supabase/tests/trust_immutability.sql`:
   ```sql
   -- Run inside a transaction; expect both attempts to RAISE
   BEGIN;
   SET LOCAL ROLE service_role;
   -- Insert a fixture row (replace with a known seed id at runtime, or use a CTE)
   DO $$
   DECLARE v_id UUID;
   BEGIN
     INSERT INTO public.trust_ledger (workspace_id, client_id, entry_kind, debit_amount, credit_amount, description)
     SELECT id, (SELECT id FROM public.clients WHERE workspace_id = w.id LIMIT 1), 'deposit', 100, 0, 'test fixture'
     FROM public.workspaces w LIMIT 1 RETURNING id INTO v_id;
     BEGIN
       UPDATE public.trust_ledger SET debit_amount = 0 WHERE id = v_id;
       RAISE EXCEPTION 'FAIL: UPDATE succeeded';
     EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: UPDATE denied'; END;
     BEGIN
       DELETE FROM public.trust_ledger WHERE id = v_id;
       RAISE EXCEPTION 'FAIL: DELETE succeeded';
     EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: DELETE denied'; END;
   END $$;
   ROLLBACK;
   ```
10. Create `supabase/tests/anon_smoke.sh`:
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    URL="$(npx supabase status -o env 2>/dev/null | grep '^API_URL=' | cut -d= -f2- | tr -d '\"')"
    KEY="$(npx supabase status -o env 2>/dev/null | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '\"')"
    TABLES=(workspaces clients matters invoices invoice_line_items receipts quotations retainers time_entries trust_ledger invoice_counters audit_log)
    fails=0
    for t in "${TABLES[@]}"; do
      body=$(curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$URL/rest/v1/$t?select=*&limit=1")
      status=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$URL/rest/v1/$t?select=*&limit=1")
      if [ "$status" != "200" ] || [ "$body" != "[]" ]; then
        echo "FAIL $t status=$status body=$body"; fails=$((fails+1))
      else
        echo "PASS $t (status 200, empty array)"
      fi
    done
    [ "$fails" -eq 0 ]
    ```
    `chmod +x supabase/tests/anon_smoke.sh`.

**Validation:**
- `npx supabase db reset 2>&1 | grep -Ei "error|warning|notice" | grep -v "already exists" | wc -l` → `0`
- `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity = true;"` → `12`
- `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='trust_ledger' AND cmd IN ('UPDATE','DELETE');"` → `0`
- `psql ... -f supabase/tests/trust_immutability.sql 2>&1 | grep -c "PASS"` → `2`
- `bash supabase/tests/anon_smoke.sh` → exit `0`, prints 12 PASS lines

**Context:** Read @.planning/research/ARCHITECTURE.md (§RLS Pattern + §Audit Trail), @.planning/research/PITFALLS.md (§Risk 7 silent RLS killer if present), @.planning/research/SUMMARY.md (§Risk 7), @~/.claude/rules/security.md. Reference Task 1's schema file for table names.

---

## Task 3 — Migration 003: gap-free invoice numbering (advisory lock SP) + concurrent test

**Wave:** 2
**Persona:** backend
**Files:**
- `supabase/migrations/20260513000003_invoice_numbering.sql` (new)
- `supabase/tests/concurrent_numbering.sql` (new — proves no gaps under 10-way concurrency)

**Depends on:** Task 1

**Why:**
Cyprus VAT law forbids gaps in invoice numbering per year. Postgres `SEQUENCE` / `nextval()` is explicitly designed NOT to be gap-free (the sequence advances on every call, never rolls back on abort) — using one would silently violate VAT compliance the first time an invoice transaction fails. The advisory-lock pattern (`pg_advisory_xact_lock(hashtext(workspace_id::text || year::text))`) serializes finalize calls per (workspace, year), increments the counter inside the same transaction as the INSERT, and rolls back together on any failure. Critically, drafts must NEVER consume a number — they use UUIDs until the human clicks Finalize. This is non-negotiable per locked decisions. — [research/ARCHITECTURE.md §Invoice numbering; research/SUMMARY.md §Risk 1; PROJECT.md decision row 2026-05-13]

**Acceptance Criteria:**
- `allocate_invoice_number(p_workspace UUID, p_year INT)` exists, is `SECURITY DEFINER`, takes the advisory lock, upserts into `invoice_counters`, increments `last_seq`, and returns the formatted string `'2026/0001'` (4-digit zero-padded sequence within the year).
- Calling the SP outside an active transaction works (it opens its own); calling it inside one acquires the xact-level lock and releases on COMMIT/ROLLBACK.
- The function returns `TEXT` formatted as `YYYY/NNNN` with `LPAD(seq, 4, '0')`.
- The function is `REVOKE`d from `anon` and `authenticated` and `GRANT`ed only to `service_role` (callers go through server actions that explicitly invoke it after verifying workspace ownership).
- `psql -f supabase/tests/concurrent_numbering.sql` exits 0, prints exactly 10 rows with `invoice_number` values `2026/0001` through `2026/0010`, zero gaps, zero duplicates.
- `grep -ci "sequence\|nextval\|serial" supabase/migrations/20260513000003_invoice_numbering.sql` returns 0 (proves we use advisory locks, not sequences).

**Action:**
1. Create `supabase/migrations/20260513000003_invoice_numbering.sql`.
2. Write the SP exactly as below — do NOT swap in SEQUENCE/SERIAL even "as a stub":
   ```sql
   CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_workspace UUID, p_year INT)
   RETURNS TEXT
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE v_seq INT;
   BEGIN
     PERFORM pg_advisory_xact_lock(hashtext(p_workspace::text || ':' || p_year::text));
     INSERT INTO public.invoice_counters (workspace_id, year, last_seq)
       VALUES (p_workspace, p_year, 0)
       ON CONFLICT (workspace_id, year) DO NOTHING;
     UPDATE public.invoice_counters
       SET last_seq = last_seq + 1
       WHERE workspace_id = p_workspace AND year = p_year
       RETURNING last_seq INTO v_seq;
     RETURN p_year::text || '/' || LPAD(v_seq::text, 4, '0');
   END $$;

   REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(UUID, INT) FROM PUBLIC, anon, authenticated;
   GRANT  EXECUTE ON FUNCTION public.allocate_invoice_number(UUID, INT) TO service_role;
   ```
3. Add a comment block in the SQL file explaining: "Numbers consumed ONLY on `invoiceService.finalize`. Drafts use UUID. This SP must be called inside the same transaction as `UPDATE invoices SET status='finalized', invoice_number=<sp_result>` so that abort rolls both back." Cite the Cybertec source.
4. Create `supabase/tests/concurrent_numbering.sql`. Strategy: simulate 10 concurrent finalize transactions using a CTE that opens 10 implicit sub-units; since we can't actually fork sessions from a single psql file, use `dblink` to spawn 10 parallel connections, OR run a parameterized `xargs -P 10` shell wrapper. Use the dblink approach for reproducibility inside a single SQL file:
   ```sql
   -- Requires dblink extension (Supabase local includes it).
   CREATE EXTENSION IF NOT EXISTS dblink;

   DO $$
   DECLARE
     v_ws UUID;
     v_dsn TEXT := 'dbname=postgres host=localhost user=postgres password=postgres port=54322';
     v_i INT;
     v_results TEXT[];
   BEGIN
     -- Ensure a workspace exists
     INSERT INTO public.workspaces (owner_user_id, name)
       SELECT gen_random_uuid(), 'numbering-test'
       WHERE NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name = 'numbering-test')
       RETURNING id INTO v_ws;
     IF v_ws IS NULL THEN
       SELECT id INTO v_ws FROM public.workspaces WHERE name = 'numbering-test';
     END IF;

     -- Reset counter for this year for a clean test
     DELETE FROM public.invoice_counters WHERE workspace_id = v_ws AND year = 2026;

     -- Fan out 10 async dblink calls
     FOR v_i IN 1..10 LOOP
       PERFORM dblink_send_query(
         'conn_' || v_i,
         format('SELECT public.allocate_invoice_number(%L, %s)', v_ws, 2026)
       ) FROM (SELECT dblink_connect('conn_' || v_i, v_dsn)) s;
     END LOOP;

     -- Collect results
     FOR v_i IN 1..10 LOOP
       v_results := array_append(
         v_results,
         (SELECT result FROM dblink_get_result('conn_' || v_i) AS t(result TEXT))
       );
       PERFORM dblink_disconnect('conn_' || v_i);
     END LOOP;

     RAISE NOTICE 'Allocated: %', v_results;

     -- Assertions
     IF (SELECT count(DISTINCT x) FROM unnest(v_results) AS x) <> 10 THEN
       RAISE EXCEPTION 'FAIL: duplicates detected — %', v_results;
     END IF;
     IF (SELECT count(*) FROM unnest(v_results) AS x WHERE x NOT IN
          ('2026/0001','2026/0002','2026/0003','2026/0004','2026/0005',
           '2026/0006','2026/0007','2026/0008','2026/0009','2026/0010')) <> 0 THEN
       RAISE EXCEPTION 'FAIL: gaps or wrong format — %', v_results;
     END IF;
     RAISE NOTICE 'PASS: 10 unique sequential numbers 2026/0001..2026/0010';
   END $$;
   ```
   Note: the DSN/port match `npx supabase start` defaults (54322). If your local stack uses a different port (`npx supabase status -o env | grep DB_URL`), update the v_dsn before running.

**Validation:**
- `npx supabase db reset 2>&1 | grep -Ei "error|warning" | wc -l` → `0`
- `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT public.allocate_invoice_number(gen_random_uuid(), 2026);"` → matches regex `^2026/[0-9]{4}$`
- `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/concurrent_numbering.sql 2>&1 | grep -c "PASS: 10 unique sequential numbers"` → `1`
- `grep -ci "sequence\|nextval\|serial" supabase/migrations/20260513000003_invoice_numbering.sql` → `0`

**Context:** Read @.planning/research/ARCHITECTURE.md (§Invoice Numbering — The Critical Decision), @.planning/research/SUMMARY.md (§Risk 1 gap-free numbering), @.planning/ROADMAP.md (Phase 1 §Tasks 3 + §Risks).

---

## Task 4 — Migration 004: append-only audit triggers + seed data + full verification

**Wave:** 3
**Persona:** backend
**Files:**
- `supabase/migrations/20260513000004_audit_triggers.sql` (new)
- `supabase/seed.sql` (new — 10 Cyprus-legal clients with Greek diacritics, 5 matters, 3+ invoices with line items, 1 trust-only client to prove revenue isolation)
- `supabase/tests/revenue_isolation.sql` (new — proves SUM(invoices.total)=0 on trust-only client)
- `supabase/tests/audit_coverage.sql` (new — proves audit_log captured the seed inserts)
- `supabase/tests/run.sh` (new — runs every test in `supabase/tests/` and exits non-zero on any failure)

**Depends on:** Task 1, Task 2, Task 3

**Why:**
Audit triggers are the legal defensibility layer — for any future Cyprus Bar inquiry, the lawyer needs to prove not just WHAT changed but WHO changed it (user vs AI), WHEN, and what the BEFORE/AFTER state was. They must be Postgres-level triggers (not application code) because application-level audit can be silently skipped by a buggy code path or a migration script; triggers fire regardless of who initiated the write. Seed data simultaneously gives Fotini something to demo and provides the verification corpus: 10 clients (≥3 with full Greek diacritics like Χριστοδουλίδης so the PDF font hardening in Phase 3 has real test inputs), 5 matters, 3+ invoices with VAT-19%-computed totals, AND one trust-only seed client whose revenue query returns €0 (proving the trust_ledger ⟂ invoices isolation). This task is in Wave 3 (after Waves 1 and 2 complete) because audit triggers must exist before the seed inserts so the audit_log captures them — that's the proof the trigger pipeline is wired. — [research/ARCHITECTURE.md §Audit Trail; ROADMAP.md Phase 1 §Tasks 4-7 + §Acceptance criteria 3-5] — implements SEED-01 (REQ-018: 10 Cyprus-legal clients + 5 matters + sample invoices seeded)

**Acceptance Criteria:**
- `audit_trigger()` function exists, is `LANGUAGE plpgsql`, reads `current_setting('app.actor_kind', true)` to tag AI-originated writes as `'ai'` (default `'user'`), captures `OLD` and `NEW` as JSONB, and writes one `audit_log` row per affected row per operation.
- AFTER INSERT OR UPDATE OR DELETE triggers exist on: `invoices`, `invoice_line_items`, `trust_ledger`, `retainers`, `receipts`, `quotations`. (Triggers on `time_entries` and `matters` are optional — they're not revenue/trust mutations and aren't required by the ROADMAP.)
- `npx supabase db reset` applies all 4 migrations + runs `seed.sql` automatically and exits 0 with zero warnings.
- After db reset: `SELECT count(*) FROM clients` returns 10; at least 3 of those names match the regex `[ΆΈΉΊΌΎΏάέήίόύώϊϋΐΰ]` (Greek diacritic characters).
- `SELECT count(*) FROM matters` returns 5; `SELECT count(*) FROM invoices` returns ≥ 3; every invoice has ≥ 1 line item.
- `psql -f supabase/tests/revenue_isolation.sql` prints `PASS: trust-only client revenue = 0` — the SUM of `invoices.total` for the dedicated trust-only client is `0.00`.
- `psql -f supabase/tests/audit_coverage.sql` prints `PASS: audit_log captured seed inserts` — there exists at least one `audit_log` row per audited table after the seed.
- `bash supabase/tests/run.sh` executes anon_smoke.sh, trust_immutability.sql, concurrent_numbering.sql, revenue_isolation.sql, audit_coverage.sql in order and exits 0 with all PASS lines.

**Action:**
1. Create `supabase/migrations/20260513000004_audit_triggers.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION public.audit_trigger()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, auth
   AS $$
   DECLARE
     v_actor_kind actor_kind;
     v_workspace UUID;
   BEGIN
     v_actor_kind := COALESCE(
       NULLIF(current_setting('app.actor_kind', true), '')::actor_kind,
       'user'
     );
     v_workspace := COALESCE(NEW.workspace_id, OLD.workspace_id);
     INSERT INTO public.audit_log (workspace_id, actor_kind, actor_id, table_name, row_id, action, before_json, after_json)
     VALUES (
       v_workspace,
       v_actor_kind,
       auth.uid(),
       TG_TABLE_NAME,
       COALESCE(NEW.id, OLD.id),
       TG_OP,
       CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
       CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
     );
     RETURN COALESCE(NEW, OLD);
   END $$;

   -- Apply to every revenue + trust mutation
   CREATE TRIGGER audit_invoices            AFTER INSERT OR UPDATE OR DELETE ON public.invoices            FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
   CREATE TRIGGER audit_invoice_line_items  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
   CREATE TRIGGER audit_trust_ledger        AFTER INSERT                       ON public.trust_ledger      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
   CREATE TRIGGER audit_retainers           AFTER INSERT OR UPDATE OR DELETE ON public.retainers           FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
   CREATE TRIGGER audit_receipts            AFTER INSERT OR UPDATE OR DELETE ON public.receipts            FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
   CREATE TRIGGER audit_quotations          AFTER INSERT OR UPDATE OR DELETE ON public.quotations          FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
   ```
   (Note: trust_ledger only fires on INSERT because the deny-mutation triggers from Task 2 block UPDATE/DELETE before they reach the audit trigger.)

2. Create `supabase/seed.sql`. Use a single demo workspace bound to a deterministic UUID so subsequent migrations stay reproducible. Seed in this order: workspace → clients → matters → invoices → invoice_line_items → trust_ledger (one trust-only client). Required content:

   - **1 workspace:** `id = '00000000-0000-0000-0000-000000000001'::uuid`, `owner_user_id = '00000000-0000-0000-0000-000000000099'::uuid` (placeholder — operator replaces with Fotini's real `auth.users.id` post-link), `name = 'Fotini Kandri Law Office'`, `vat_number = 'CY10000001A'`, `tax_id = 'CY-TAX-FK-001'`, `iban = 'CY17 0020 0128 0000 0012 0052 7600'`, `default_currency = 'EUR'`.
   - **Insert into `auth.users`** a placeholder row with that UUID first (use `INSERT INTO auth.users (id, email, ...) ON CONFLICT DO NOTHING`) — the local stack allows seeding auth users directly; production link replaces this with Fotini's magic-link signup.
   - **10 clients** — exactly these names (at least 3 must contain Greek diacritics):
     1. `name_el='Νικόλας Χριστοδουλίδης'`, `name_en='Nikolas Christodoulides'`, `preferred_language='el'`
     2. `name_el='Ελένη Παπαδοπούλου'`, `name_en='Eleni Papadopoulou'`, `preferred_language='el'`
     3. `name_el='Ανδρέας Ανδρέου'`, `name_en='Andreas Andreou'`, `preferred_language='el'`
     4. `name_el='Μαρία Κωνσταντίνου'`, `name_en='Maria Konstantinou'`, `preferred_language='el'`
     5. `name_el='Γεώργιος Δημητρίου'`, `name_en='Georgios Demetriou'`, `preferred_language='el'`
     6. `name_el='Helena Smith'`, `name_en='Helena Smith'`, `preferred_language='en'` (foreign client common in Cyprus immigration practice)
     7. `name_el='John O''Connor'`, `name_en='John O''Connor'`, `preferred_language='en'`
     8. `name_el='Σταυρούλα Λοΐζου'`, `name_en='Stavroula Loizou'`, `preferred_language='el'`
     9. `name_el='Πέτρος Ιωάννου'`, `name_en='Petros Ioannou'`, `preferred_language='el'`
     10. `name_el='Trust-Only Test Client'`, `name_en='Trust-Only Test Client'`, `preferred_language='en'` (dedicated to the revenue isolation test — no invoices, only a trust deposit)
   - **5 matters** — 1 each for clients 1, 2, 3, 4, 5 (matter_type values: 'divorce', 'immigration', 'property', 'divorce', 'commercial'; matter_number values: '2026-M-0001'..'2026-M-0005'; default_hourly_rate values: 180.00, 220.00, 200.00, 190.00, 250.00).
   - **3 invoices, all `status='finalized'`** with allocated numbers via `SELECT public.allocate_invoice_number('00000000-0000-0000-0000-000000000001', 2026)`. Each has 2-3 line items. Compute subtotal as `SUM(line_total)`, vat_amount as `ROUND(subtotal * 0.19, 2)`, total as `subtotal + vat_amount`. Examples:
     - Invoice 1 (Christodoulides / divorce): line items "Initial consultation" 2h × €180, "Drafting petition" 4h × €180 → subtotal €1,080.00, VAT €205.20, total €1,285.20
     - Invoice 2 (Papadopoulou / immigration): "Permanent residence application" flat €1,500.00 → subtotal €1,500.00, VAT €285.00, total €1,785.00
     - Invoice 3 (Andreou / property): "Title search" 3h × €200, "Contract review" 5h × €200 → subtotal €1,600.00, VAT €304.00, total €1,904.00
   - **Trust ledger entries:**
     - Insert 1 retainer for Christodoulides: deposit_amount €2,000.00. Then insert the corresponding `trust_ledger` row: `entry_kind='deposit'`, `debit_amount=2000.00`, `credit_amount=0.00`, `description='Retainer deposit — divorce matter'`, `related_retainer_id=<retainer id>`.
     - Insert 1 retainer for the Trust-Only Test Client (client #10): deposit_amount €5,000.00, with `trust_ledger` row `entry_kind='deposit'`, `debit_amount=5000.00`. NO invoices for this client. This is the corpus that proves `SUM(invoices.total) WHERE client_id = <client 10> = 0`.

3. Create `supabase/tests/revenue_isolation.sql`:
   ```sql
   DO $$
   DECLARE v_total NUMERIC(12,2);
   BEGIN
     SELECT COALESCE(SUM(i.total), 0)
       INTO v_total
       FROM public.invoices i
       JOIN public.clients c ON c.id = i.client_id
       WHERE c.name_en = 'Trust-Only Test Client';
     IF v_total <> 0 THEN
       RAISE EXCEPTION 'FAIL: trust-only client has invoices totalling %', v_total;
     END IF;
     -- Also verify the trust deposit IS recorded
     IF (SELECT COALESCE(SUM(debit_amount), 0)
           FROM public.trust_ledger tl
           JOIN public.clients c ON c.id = tl.client_id
           WHERE c.name_en = 'Trust-Only Test Client') <> 5000.00 THEN
       RAISE EXCEPTION 'FAIL: trust deposit for trust-only client missing or wrong';
     END IF;
     RAISE NOTICE 'PASS: trust-only client revenue = 0; trust balance = 5000.00';
   END $$;
   ```

4. Create `supabase/tests/audit_coverage.sql`:
   ```sql
   DO $$
   DECLARE v_missing TEXT[] := ARRAY[]::TEXT[];
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name='invoices')          THEN v_missing := array_append(v_missing, 'invoices');          END IF;
     IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name='invoice_line_items') THEN v_missing := array_append(v_missing, 'invoice_line_items'); END IF;
     IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name='trust_ledger')      THEN v_missing := array_append(v_missing, 'trust_ledger');      END IF;
     IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name='retainers')         THEN v_missing := array_append(v_missing, 'retainers');         END IF;
     IF array_length(v_missing, 1) IS NOT NULL THEN
       RAISE EXCEPTION 'FAIL: missing audit_log rows for: %', v_missing;
     END IF;
     RAISE NOTICE 'PASS: audit_log captured seed inserts';
   END $$;
   ```

5. Create `supabase/tests/run.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   DB_URL="$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')"
   echo "==> anon_smoke.sh";              bash supabase/tests/anon_smoke.sh
   echo "==> trust_immutability.sql";     psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trust_immutability.sql
   echo "==> concurrent_numbering.sql";   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/concurrent_numbering.sql
   echo "==> revenue_isolation.sql";      psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/revenue_isolation.sql
   echo "==> audit_coverage.sql";         psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit_coverage.sql
   echo "ALL PASS"
   ```
   `chmod +x supabase/tests/run.sh`.

6. Run `npx supabase db reset` — this applies 001, 002, 003, 004 in order and then auto-runs `supabase/seed.sql`. Confirm zero warnings.
7. Run `bash supabase/tests/run.sh` and confirm all five tests print PASS and the script exits 0.

**Validation:**
- `npx supabase db reset 2>&1 | grep -Ei "error|warning" | wc -l` → `0`
- `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM public.clients;"` → `10`
- `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM public.clients WHERE name_el ~ '[ΆΈΉΊΌΎΏάέήίόύώϊϋΐΰ]';"` → `≥ 3`
- `psql ... -tAc "SELECT count(*) FROM public.matters;"` → `5`
- `psql ... -tAc "SELECT count(*) FROM public.invoices WHERE status='finalized' AND invoice_number IS NOT NULL;"` → `≥ 3`
- `psql ... -tAc "SELECT count(*) FROM public.audit_log;"` → `≥ 10`
- `bash supabase/tests/run.sh 2>&1 | tail -1` → `ALL PASS`

**Context:** Read @.planning/research/ARCHITECTURE.md (§Audit Trail), @.planning/research/SUMMARY.md (§Phase 1 §1.3 Audit triggers, §Risk 2 trust isolation), @.planning/ROADMAP.md (Phase 1 §Tasks 4-7, §Acceptance criteria 2-5), @.planning/CONTEXT.md (matter/Case naming, trust ledger terms). Reference Tasks 1-3 migration files for table/SP signatures.

---

## Success Criteria

Phase-level truths — what must be observable when Phase 1 is done.

- [ ] `npx supabase db push` exits 0 for all 4 migrations against the linked Supabase cloud project (ROADMAP success criterion 1 — verbatim).
- [ ] Local-dev verification: `npx supabase db reset` applies all 4 migrations + auto-runs `seed.sql`, exits 0, with zero warnings about RLS-disabled tables.
- [ ] `bash supabase/tests/run.sh` exits 0 — all five tests (anon smoke, trust immutability, concurrent numbering, revenue isolation, audit coverage) print PASS.
- [ ] Anon-key SELECT on every one of the 12 tables returns `[]` (HTTP 200, empty array) — RLS denies silently, never 401/403.
- [ ] `allocate_invoice_number()` produces 10 unique sequential numbers `2026/0001..2026/0010` under 10-way concurrent calls, no duplicates, no gaps.
- [ ] `trust_ledger` denies UPDATE and DELETE for ALL roles (including service_role) via the row-level trigger; corrections via reversing entries with `corrects_entry_id` are the ONLY mutation path.
- [ ] Revenue isolation: `SUM(invoices.total)` for the trust-only seed client is `0.00`; the same client's `SUM(trust_ledger.debit_amount)` is `5000.00`. Revenue and trust never share a row.
- [ ] Seed: 10 clients (≥ 3 with Greek diacritics), 5 matters, ≥ 3 finalized invoices with line items, 1 trust-only client with deposit.
- [ ] `audit_log` has ≥ 1 row per audited table after the seed runs — proof the trigger pipeline is wired before Phase 2 builds on it.

---

## Verification Contract

Machine-executable checks the verifier runs verbatim against the local Supabase stack (started with `npx supabase start`).

### Contract for Task 1 — Schema scaffold

**Check type:** command-exit
**Command:** `npx supabase db reset 2>&1 | grep -Eci "error|warning" | grep -v "already exists" || true; echo "exit=$?"`
**Expected:** No "error" or "warning" lines in stderr/stdout; reset completes; `exit=0`
**Fail if:** Any error/warning lines or non-zero exit from `supabase db reset`

### Contract for Task 1 — 12 tables exist

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('workspaces','clients','matters','invoices','invoice_line_items','receipts','quotations','retainers','time_entries','trust_ledger','invoice_counters','audit_log');"`
**Expected:** `12`
**Fail if:** Output is anything other than `12`

### Contract for Task 1 — Monetary types are NUMERIC, never FLOAT

**Check type:** grep-match
**Command:** `grep -ciE "float|real|double precision|\\bmoney\\b" supabase/migrations/20260513000001_schema.sql`
**Expected:** `0`
**Fail if:** Output is non-zero — schema uses imprecise monetary types

### Contract for Task 1 — Trust is a separate table, not a flag

**Check type:** grep-match
**Command:** `grep -cE "is_trust|trust_flag|trust\\s+boolean" supabase/migrations/20260513000001_schema.sql`
**Expected:** `0`
**Fail if:** Output is non-zero — trust modelled as a flag instead of a separate table

### Contract for Task 1 — `corrects_entry_id` self-FK present on trust_ledger

**Check type:** grep-match
**Command:** `grep -cE "corrects_entry_id.*REFERENCES.*trust_ledger" supabase/migrations/20260513000001_schema.sql`
**Expected:** `≥ 1`
**Fail if:** Output is `0` — no reversing-entry path for corrections

### Contract for Task 2 — RLS enabled on every table

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity = true;"`
**Expected:** `12`
**Fail if:** Output less than `12` — at least one table has RLS off

### Contract for Task 2 — `trust_ledger` has NO UPDATE/DELETE policy

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='trust_ledger' AND cmd IN ('UPDATE','DELETE');"`
**Expected:** `0`
**Fail if:** Output is non-zero — an UPDATE or DELETE policy was added (should be deny-by-omission + trigger backstop)

### Contract for Task 2 — Trust immutability trigger fires even for service_role

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/trust_immutability.sql 2>&1 | grep -c "PASS"`
**Expected:** `2`
**Fail if:** Output is `0` or `1` — UPDATE or DELETE succeeded on trust_ledger

### Contract for Task 2 — Anon-key SELECT returns empty arrays (silent RLS), not 403

**Check type:** command-exit
**Command:** `bash supabase/tests/anon_smoke.sh`
**Expected:** Exit `0`; stdout contains 12 PASS lines (one per table)
**Fail if:** Non-zero exit, any FAIL line, or any HTTP status other than 200

### Contract for Task 3 — `allocate_invoice_number` returns `YYYY/NNNN` format

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT public.allocate_invoice_number(gen_random_uuid(), 2026) ~ '^2026/[0-9]{4}$';"`
**Expected:** `t`
**Fail if:** Output is `f` — function returns wrong format

### Contract for Task 3 — 10-way concurrent allocation produces gap-free `2026/0001..2026/0010`

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/concurrent_numbering.sql 2>&1 | grep -c "PASS: 10 unique sequential numbers"`
**Expected:** `1`
**Fail if:** Output is `0` — duplicates, gaps, or wrong format detected under concurrency

### Contract for Task 3 — No Postgres SEQUENCE used for invoice numbers

**Check type:** grep-match
**Command:** `grep -ciE "create\\s+sequence|nextval|serial" supabase/migrations/20260513000003_invoice_numbering.sql`
**Expected:** `0`
**Fail if:** Output is non-zero — SEQUENCE-based numbering would violate Cyprus VAT gap-free requirement

### Contract for Task 4 — Audit triggers exist on all revenue + trust tables

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT count(DISTINCT event_object_table) FROM information_schema.triggers WHERE trigger_schema='public' AND action_statement LIKE '%audit_trigger%' AND event_object_table IN ('invoices','invoice_line_items','trust_ledger','retainers','receipts','quotations');"`
**Expected:** `6`
**Fail if:** Output is less than `6` — at least one audited table is missing its trigger

### Contract for Task 4 — Seed has 10 clients with ≥3 Greek-diacritic names

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT (SELECT count(*) FROM public.clients) = 10 AND (SELECT count(*) FROM public.clients WHERE name_el ~ '[ΆΈΉΊΌΎΏάέήίόύώϊϋΐΰ]') >= 3;"`
**Expected:** `t`
**Fail if:** Output is `f` — wrong client count or too few Greek-diacritic names

### Contract for Task 4 — Seed has 5 matters and ≥3 finalized invoices with line items

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -tAc "SELECT (SELECT count(*) FROM public.matters) = 5 AND (SELECT count(*) FROM public.invoices WHERE status='finalized' AND invoice_number IS NOT NULL) >= 3 AND (SELECT count(*) FROM public.invoice_line_items) >= 3;"`
**Expected:** `t`
**Fail if:** Output is `f`

### Contract for Task 4 — Revenue isolation: trust-only client has €0 revenue

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/revenue_isolation.sql 2>&1 | grep -c "PASS: trust-only client revenue = 0"`
**Expected:** `1`
**Fail if:** Output is `0` — trust money leaking into revenue queries

### Contract for Task 4 — Audit log captured seed inserts

**Check type:** command-exit
**Command:** `psql "$(npx supabase status -o env 2>/dev/null | grep ^DB_URL | cut -d= -f2- | tr -d '\"')" -f supabase/tests/audit_coverage.sql 2>&1 | grep -c "PASS: audit_log captured seed inserts"`
**Expected:** `1`
**Fail if:** Output is `0` — at least one audited table missing from audit_log after seed

### Contract for Phase 1 — Full test suite green

**Check type:** command-exit
**Command:** `bash supabase/tests/run.sh 2>&1 | tail -1`
**Expected:** `ALL PASS`
**Fail if:** Any line other than `ALL PASS` — at least one verification test failed

### Contract for Phase 1 — VAT rate is 19% server-side (no client-supplied rate path)

**Check type:** grep-match
**Command:** `grep -cE "vat_rate\\s+NUMERIC\\(5,4\\)\\s+NOT\\s+NULL\\s+DEFAULT\\s+0\\.1900" supabase/migrations/20260513000001_schema.sql`
**Expected:** `≥ 2`
**Fail if:** Output less than `2` — VAT default not set on both `invoices` and `invoice_line_items`
