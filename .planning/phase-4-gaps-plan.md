---
phase: 4
goal: "Close two adversarial-pass gaps so Accept-and-Convert redirects the user to the new draft invoice and so concurrent time-entry billing cannot produce two invoices for the same hours."
tasks: 2
waves: 1
type: gap-closure
---

# Phase 4 Gaps — Accept-Convert + Time-Entry Double-Bill

**Context:** Cooperative verifier returned PASS on all 25 contracts. Adversarial pass found two bugs the grep-based protocol could not see — DB state was always correct, but application-layer wiring and concurrency assumptions were wrong. Today is the Cyprus pitch (2026-05-14). Both fixes are surgical, server-only, and atomic per commit.

**Gaps being closed:**
1. HIGH — `acceptQuotationAction` always returns `{ error: 'sp_failed' }` after a successful SP call. Root cause: a defensive `.update({})` empty-body PATCH at `src/app/(workspace)/quotations/actions.ts:435-445` that PostgREST v14.8 always answers with `[]`. The headline pitch demo (Accept Quotation → Draft Invoice) is broken end-to-end despite the DB being correct.
2. MEDIUM — `from_time_entry` status flip in `createInvoiceAction` is non-atomic. Two concurrent calls with the same time-entry UUID can both pass the `.is("invoice_id", null)` guard before either commits, producing two draft invoices for the same billable hours — the exact disbarment-grade failure mode Task 4 was supposed to prevent.

**LOW finding** (test coverage for `fee_transfer → invoice` positive regression) is deferred per the verification verdict — not in scope for this plan.

**Honoring locked decisions:**
- SECURITY DEFINER SPs are the legitimate atomicity primitive for multi-table writes. Task 1 trusts the SP's `RETURNS UUID` directly (no post-SP round-trip). Task 2 introduces a new SP `create_invoice_from_time_entry` that mirrors `create_retainer_with_deposit` (Migration 008) exactly.
- Service-role bridge stays only in `finalizeInvoiceAction`. Both fixes use the user-scoped client; both new code paths use `.select('id')` deny-by-omission for any user-client mutation.

---

## Task 1 — Trust the SP return value: remove the empty-body PATCH from `acceptQuotationAction`

**Wave:** 1
**Persona:** backend
**Files:** `src/app/(workspace)/quotations/actions.ts` (modify the `acceptQuotationAction` body — lines 394-451, specifically deleting the block at 431-445)
**Depends on:** none

**Why:** The SP `convert_quotation_to_invoice` is SECURITY DEFINER, atomic, and `RETURNS UUID` (migration 007:124-127, 264). Its contract is binary: it either `RAISE EXCEPTION` (caught by the `supabase.rpc` error path at actions.ts:420-428) or it returns the new invoice UUID — no third state exists. The post-SP block at lines 431-445 issues `supabase.from("quotations").update({}).eq(...).select("id")` — an empty-body PATCH that PostgREST v14.8 answers with HTTP 200 `[]` regardless of whether the row matches (confirmed live against `supabase_rest_flaw`). The `if (!confirm || confirm.length === 0) return { error: 'sp_failed' }` check therefore fires on every successful accept, the `redirect()` at line 450 is never reached, and the user sees `sp_failed` while the DB transitioned correctly. Re-clicking surfaces `not_sent` because the quotation is now `accepted`. The feature is completely broken end-to-end. Remove the block; the SP's atomic guarantee is the contract.

**Acceptance Criteria:**
- Clicking "Accept & Convert to Invoice" on a `status='sent'` quotation redirects the browser to `/invoices/{newInvoiceId}` showing the new draft invoice.
- The `quotations` row transitions to `status='accepted'` with `converted_invoice_id` populated; the `invoices` row exists with `status='draft'`; `invoice_line_items` rows are copied verbatim from `quotation_line_items` — all three writes still atomic at the DB layer.
- `acceptQuotationAction` returns `sp_failed` only when `supabase.rpc(...)` itself returns a non-mapped error or `data` is null — never on a successful SP return.

**Action:**
1. Open `src/app/(workspace)/quotations/actions.ts`.
2. Delete the block at lines 431-445 entirely — the comment header ("Defense-in-depth check after the SP — verify the source quotation is now accepted...") through the closing `if (!confirm || confirm.length === 0) return { error: 'sp_failed' }` brace. The `revalidatePath` + `redirect` calls at lines 447-450 stay; they execute directly after `const newInvoiceId = data as string;` at line 429.
3. Re-tighten the SP-error mapping at lines 420-428: the existing branches (`not_sent`, `not_found`, fallthrough `sp_failed`) cover every `RAISE EXCEPTION` the SP issues (`not_found`, `not_sent`, `not_authenticated`, `quotation_missing_matter`). Add an explicit map for `not_authenticated` to surface as `no_workspace` and for `quotation_missing_matter` to surface as `sp_failed` so the UI gets a coherent error. Keep `if (error || !data)` as the gate — `data` is the returned UUID, falsy means the SP returned NULL (it never does, but the type system can't prove that).
4. Re-balance the "4th `data.length === 0` occurrence" the original plan validation required. After deleting the block, count drops from 5 to 4 — still ≥ 4, still passes the plan-validation contract from Phase 4 Task 1. No replacement check needed; the SP is the atomicity primitive, no application-level "did the DB really change" probe is appropriate.
5. Commit: `git add src/app/(workspace)/quotations/actions.ts && git commit -m "fix(phase-4): acceptQuotationAction — trust SP return, drop empty-body PATCH"`. Single file, single commit.

**Validation:** (builder self-check, before commit)
- `grep -c "update({})" src/app/(workspace)/quotations/actions.ts` → expect `0`. The empty-body PATCH is gone.
- `grep -c "data.length === 0" src/app/(workspace)/quotations/actions.ts` → expect `4` (was 5). Still satisfies the original Phase 4 Task 1 plan-validation lower bound of 4.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → expect `0`. No type errors introduced by the deletion.
- Behavioral (run against local Podman supabase before commit): pick any `status='sent'` quotation seeded into the workspace, call `acceptQuotationAction(id)` via a curl POST against the running Next.js dev server, follow the redirect — confirm the response is a 303/307 redirect to `/invoices/{uuid}` and not an error JSON.

**Context:**
- Read @src/app/(workspace)/quotations/actions.ts (lines 394-451 — the function being edited)
- Read @supabase/migrations/20260513000007_convert_quotation_to_invoice.sql (lines 124-271 — the SP signature `RETURNS UUID`, its `RAISE EXCEPTION` taxonomy, the atomic write set)
- Read @.planning/phase-4-verification.md (Adversarial Findings §1 — the exact bug, PostgREST v14.8 reproduction, recommended fix)

---

## Task 2 — Atomic time-entry → invoice via new SECURITY DEFINER SP `create_invoice_from_time_entry`

**Wave:** 1
**Persona:** backend
**Files:**
- `supabase/migrations/20260514000001_create_invoice_from_time_entry.sql` (NEW migration — defines the SP)
- `src/app/(workspace)/invoices/actions.ts` (modify `createInvoiceAction` — branch on `from_time_entry` presence; when set, call the new SP instead of the inline UPDATE at lines 330-356; the no-`from_time_entry` path is untouched)

**Depends on:** none — Task 1 touches `quotations/actions.ts`, Task 2 touches `invoices/actions.ts` and a new SQL file; zero file overlap, both parallel-safe in Wave 1.

**Why:** The current implementation at `src/app/(workspace)/invoices/actions.ts:330-356` runs three database statements non-atomically: INSERT invoice, INSERT line items, UPDATE time entry. Under Postgres READ COMMITTED — the default isolation for every PostgREST connection — two concurrent `createInvoiceAction` calls with the same `from_time_entry` UUID both see `status='completed' AND invoice_id IS NULL` during their respective WHERE evaluations, before either commits. Both UPDATEs succeed (each thinks it raced first), producing two draft invoices for the same billable hours. The plan called this "the disbarment-grade failure mode Task 4 was supposed to prevent" — the mitigation works for single-user sequential clicks but fails the moment a lawyer (or a malicious double-submit) issues concurrent requests. Migration 008's `create_retainer_with_deposit` is the proven pattern: one SECURITY DEFINER SP holds all writes in one PL/pgSQL transaction; partial failure raises and rolls back every prior write in the function body. Apply the same pattern here: lock the time entry with `SELECT … FOR UPDATE`, verify the status/invoice_id invariants, INSERT the invoice + line item, UPDATE the time entry — atomically. The `FOR UPDATE` row lock serialises concurrent callers at the row level; the second caller blocks until the first commits, then sees `status='billed'` and raises `time_entry_already_billed`, which the action surfaces as `time_entry_already_billed` to the UI.

**Acceptance Criteria:**
- Single-user happy path: lawyer clicks "Bill these hours" on a completed timer, lands on `/invoices/new?from_time_entry={uuid}` with prefilled line item, submits → invoice created in draft, line item present, source `time_entries` row flipped to `status='billed', invoice_id=<new>`, redirected to `/invoices/{newId}`. End-to-end UX unchanged.
- Concurrent double-bill prevention: two simultaneous POST submissions of the same `createInvoiceAction` with the same `from_time_entry` UUID produce **exactly one** draft invoice and **exactly one** `time_entries.status='billed'` row. The losing call receives `{ error: 'time_entry_already_billed' }`. No orphan invoices, no double-flipped time entries.
- The `from_time_entry`-less path (regular new-invoice flow) is byte-identical in behavior — only the time-entry branch is rerouted through the SP.

**Action:**
1. Create the new migration file `supabase/migrations/20260514000001_create_invoice_from_time_entry.sql`. Mirror Migration 008 (`create_retainer_with_deposit`) in structure: SECURITY DEFINER, `SET search_path = public, auth`, defence-in-depth workspace-ownership check at the top of the body, atomic INSERT/INSERT/UPDATE in PL/pgSQL transaction scope, `RAISE EXCEPTION` taxonomy that the action layer can map to typed errors. Function signature:
   ```sql
   CREATE OR REPLACE FUNCTION public.create_invoice_from_time_entry(
     p_workspace         UUID,
     p_client            UUID,
     p_matter            UUID,
     p_time_entry        UUID,
     p_language          TEXT,
     p_notes             TEXT,
     p_due_at            DATE,
     p_description       TEXT,
     p_quantity          NUMERIC(10,2),
     p_unit_price        NUMERIC(12,2),
     p_line_total        NUMERIC(12,2),
     p_subtotal          NUMERIC(12,2),
     p_vat_amount        NUMERIC(12,2),
     p_total             NUMERIC(12,2),
     p_actor             UUID
   ) RETURNS UUID
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, auth
   ```
   Function body:
   - Verify `workspaces.owner_user_id = p_actor` — RAISE `'workspace ownership mismatch'` on mismatch (mirror Migration 008:61-64).
   - `SELECT id, user_id, workspace_id, status, invoice_id FROM public.time_entries WHERE id = p_time_entry FOR UPDATE` into local variables. The `FOR UPDATE` row lock is the serialisation primitive — concurrent callers block here until the holder commits.
   - If not found OR `workspace_id <> p_workspace` OR `user_id <> p_actor` → RAISE `'time_entry_not_found'` (mask cross-workspace as not-found).
   - If `status <> 'completed'` OR `invoice_id IS NOT NULL` → RAISE `'time_entry_already_billed'` (after the FOR UPDATE serialisation, the second caller hits this branch deterministically).
   - INSERT into `invoices` (draft, NULL number, subtotal/vat/total from params, `vat_rate=0.1900`, currency `'EUR'`, `issued_at=CURRENT_DATE`) RETURNING id → `v_invoice_id`.
   - INSERT into `invoice_line_items` (workspace_id, invoice_id=v_invoice_id, description, quantity, unit_price, line_total, vat_rate=0.1900, position=1, kind='service' — billable hours are always service kind).
   - UPDATE `time_entries` SET `status='billed', invoice_id=v_invoice_id` WHERE `id=p_time_entry`.
   - RETURN `v_invoice_id`.
   - REVOKE from PUBLIC, anon; GRANT EXECUTE to authenticated, service_role. Mirror the GRANT/REVOKE block at Migration 008:127-133.

2. Open `src/app/(workspace)/invoices/actions.ts`. Inside `createInvoiceAction`, add a top-of-function branch: parse `formData.get("from_time_entry")` with the same UUID regex used at lines 333-335. If present AND valid, the entire flow (workspace fetch, invoice INSERT, line-item INSERT, time-entry UPDATE) routes through one `supabase.rpc('create_invoice_from_time_entry', { ... })` call instead of the inline 4-statement sequence. The user-scoped client invokes the SP; the SP's SECURITY DEFINER re-checks ownership.

3. The SP returns the new invoice UUID directly (mirror Task 1's contract — trust the return, no post-SP confirmation). Map SP error messages to typed `InvoiceActionResult`:
   - `time_entry_not_found` → extend the union to `"time_entry_not_found"` and return it.
   - `time_entry_already_billed` → extend the union to `"time_entry_already_billed"` and return it.
   - `workspace ownership mismatch` → return `no_workspace`.
   - Any other error → return `insert_failed`.
   Update the `InvoiceActionResult` type at lines 152-170 to include the two new error tags.

4. For the `from_time_entry`-less path: leave lines 251-319 (workspace fetch, invoice INSERT, line-item INSERT) and the `revalidatePath`/`redirect` epilogue untouched. Delete only the legacy in-action time-entry flip block (lines 321-356) — it is replaced by the SP for the prefill path, and the `else` branch (no `from_time_entry`) doesn't need it.

5. Update `src/app/(workspace)/invoices/NewInvoiceForm.tsx` if its error rendering enumerates `InvoiceActionResult.error` values — add UI strings for `time_entry_already_billed` and `time_entry_not_found` in both `messages/en-CY.json` and `messages/el-CY.json` under the `invoices` namespace. (If the form renders errors generically via `t(`error.${result.error}`)` the keys are the only addition; if it switches per-tag, add the branches.)

6. Commit as **one** atomic commit covering: migration + actions.ts + i18n + form changes. Stage explicit paths:
   ```
   git add supabase/migrations/20260514000001_create_invoice_from_time_entry.sql \
           src/app/(workspace)/invoices/actions.ts \
           src/app/(workspace)/invoices/NewInvoiceForm.tsx \
           messages/en-CY.json messages/el-CY.json
   git commit -m "fix(phase-4): atomic time-entry → invoice SP — close double-bill race"
   ```

**Validation:** (builder self-check, before commit)
- `grep -c "create_invoice_from_time_entry" supabase/migrations/20260514000001_create_invoice_from_time_entry.sql` → expect ≥ `3` (CREATE FUNCTION, REVOKE, GRANT).
- `grep -c "FOR UPDATE" supabase/migrations/20260514000001_create_invoice_from_time_entry.sql` → expect ≥ `1`. The serialisation primitive is present.
- `grep -c "SECURITY DEFINER" supabase/migrations/20260514000001_create_invoice_from_time_entry.sql` → expect `1`.
- `grep -c "create_invoice_from_time_entry" src/app/(workspace)/invoices/actions.ts` → expect ≥ `1`. The SP is called from the action.
- `grep -c "time_entry_already_billed" src/app/(workspace)/invoices/actions.ts` → expect ≥ `1`. The new error tag is mapped.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → expect `0`.
- Apply the migration locally: `npx supabase db reset` (or `npx supabase migration up`) — expect zero errors.
- Verify SP is SECURITY DEFINER in the live local DB: `psql "$LOCAL_SUPABASE_DB_URL" -c "SELECT proname, prosecdef FROM pg_proc WHERE proname='create_invoice_from_time_entry';"` → expect `create_invoice_from_time_entry | t`.
- Behavioral race test (run before commit, against local Podman supabase): use `node -e` to spawn two concurrent `fetch` POSTs to the running dev server's `createInvoiceAction` with the same `from_time_entry` UUID. Expect: 1 invoice row, 1 time_entries row with `status='billed'`, one of the two HTTP responses returns the `time_entry_already_billed` error. SQL probe: `SELECT count(*) FROM invoices WHERE matter_id = $matter AND issued_at = CURRENT_DATE` → expect `1`.

**Context:**
- Read @src/app/(workspace)/invoices/actions.ts (lines 222-361 — the function being edited; the time-entry flip block at 321-356 is being rerouted through the SP)
- Read @supabase/migrations/20260513000008_retainer_with_trust_deposit.sql (lines 1-133 — the gold-standard pattern: SECURITY DEFINER, ownership defence-in-depth, atomic INSERT/INSERT in PL/pgSQL, REVOKE/GRANT discipline)
- Read @supabase/migrations/20260513000001_schema.sql (the `invoices`, `invoice_line_items`, `time_entries` table definitions for column names/defaults referenced by the SP)
- Read @.planning/phase-4-verification.md (Adversarial Findings §2 — the exact race condition reproduction)

---

## Success Criteria

- [ ] **D-Q1 (corrected):** Accepting a `status='sent'` quotation results in a `status='draft'` invoice with all line items copied verbatim, the source quotation marked `status='accepted'` with `converted_invoice_id` set, AND the user's browser redirected to `/invoices/{newInvoiceId}` — the redirect is part of the criterion, not just the DB state.
- [ ] **D-T1 (corrected):** Single-user "Bill these hours" produces exactly one draft invoice with the timer's hours/rate as one line item AND the source time entry flipped to `status='billed', invoice_id=<new>`, with the redirect to `/invoices/{newId}`.
- [ ] **D-T1-CONCURRENT (new):** Two concurrent `createInvoiceAction` POSTs with the same `from_time_entry` UUID produce exactly one invoice and exactly one billed time-entry row; the losing call returns `{ error: 'time_entry_already_billed' }`. Verified by SQL row-count probe after the race test in Task 2's behavioral validation.

---

## Verification Contract

### Contract for Task 1 — Empty-body PATCH removed
**Check type:** grep-match
**Command:** `grep -c "update({})" src/app/(workspace)/quotations/actions.ts`
**Expected:** `0`
**Fail if:** Any `.update({})` remains in the file — the bug is unfixed.

### Contract for Task 1 — Deny-by-omission count still satisfies original plan threshold
**Check type:** grep-match
**Command:** `grep -c "data.length === 0" src/app/(workspace)/quotations/actions.ts`
**Expected:** `4`
**Fail if:** Count drops below 4 (original Phase 4 Task 1 contract required ≥ 4) or exceeds 4 (means the empty-body block was not removed cleanly).

### Contract for Task 1 — End-to-end accept-and-redirect (behavioral)
**Check type:** behavioral
**Command:** (verifier runs against local dev server) Seed/identify a `status='sent'` quotation `Q` with ≥1 line item in the test workspace. Submit `acceptQuotationAction(Q.id)` via a server-action POST (Next.js test harness or browser-driven click). Observe response is HTTP 303/307 to `/invoices/{newUuid}`. SQL probe: `SELECT q.status, q.converted_invoice_id, i.status FROM quotations q JOIN invoices i ON i.id=q.converted_invoice_id WHERE q.id='{Q.id}'` → expect `('accepted', '{newUuid}', 'draft')`. SQL probe: `SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id='{newUuid}'` → expect equal to `Q`'s original line-item count.
**Expected:** Browser/test client lands on `/invoices/{newUuid}` showing the draft invoice; SQL probes return the three-tuple above.
**Fail if:** Response body contains `"error":"sp_failed"` or any other error tag; OR redirect never happens; OR DB state shows the quotation is still `'sent'` or `'accepted'` without `converted_invoice_id`.

### Contract for Task 2 — Migration file exists and applies cleanly
**Check type:** command-exit
**Command:** `test -f supabase/migrations/20260514000001_create_invoice_from_time_entry.sql && npx supabase db reset 2>&1 | grep -c "ERROR\|FAIL"`
**Expected:** File exists AND `db reset` produces `0` error/fail lines.
**Fail if:** File missing OR migration produces errors during apply.

### Contract for Task 2 — SP is SECURITY DEFINER with row-lock primitive
**Check type:** grep-match
**Command:** `grep -c "SECURITY DEFINER" supabase/migrations/20260514000001_create_invoice_from_time_entry.sql && grep -c "FOR UPDATE" supabase/migrations/20260514000001_create_invoice_from_time_entry.sql`
**Expected:** Both ≥ 1. (The `FOR UPDATE` is the row-level serialisation primitive; without it the SP is not safer than the old inline code.)
**Fail if:** Either count is 0 — fix is structurally incomplete.

### Contract for Task 2 — Action layer routes prefill path through the SP
**Check type:** grep-match
**Command:** `grep -c "create_invoice_from_time_entry" src/app/(workspace)/invoices/actions.ts && grep -c "time_entry_already_billed" src/app/(workspace)/invoices/actions.ts`
**Expected:** Both ≥ 1. (The SP is invoked AND the new error tag is mapped.)
**Fail if:** Either count is 0 — the action layer still uses the old non-atomic 4-statement path.

### Contract for Task 2 — Concurrent double-bill prevented (behavioral)
**Check type:** behavioral
**Command:** (verifier runs against local dev server) Seed/identify a single `time_entries` row `T` with `status='completed', invoice_id IS NULL` for the test user. Spawn two concurrent POSTs to `createInvoiceAction` with `from_time_entry=T.id` (e.g. `Promise.all([fetch(...), fetch(...)])` in a Node script against the running dev server). After both promises resolve, run SQL: `SELECT COUNT(*) FROM invoices WHERE matter_id=T.matter_id AND issued_at=CURRENT_DATE` → expect `1`. `SELECT status, invoice_id FROM time_entries WHERE id=T.id` → expect `('billed', {the one invoice id})`. One of the two HTTP responses must contain `"error":"time_entry_already_billed"` (or follow a redirect to the same invoice as the winning call — both are acceptable, the assertion is single-invoice).
**Expected:** Exactly one invoice row exists for the billed hours; the time entry shows `status='billed'` with `invoice_id` set to that one invoice; one of the two HTTP calls reports a typed error or redirects to the winning invoice.
**Fail if:** Two invoices exist for the same `from_time_entry`; OR the time entry's `invoice_id` is NULL after the race; OR both HTTP calls return `{ ok: true }` redirects to different invoice ids.
