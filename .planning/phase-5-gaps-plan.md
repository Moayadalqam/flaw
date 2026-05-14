---
phase: 5
type: gap-closure
cycle: 2
goal: "Close 1 HIGH (D-G3 contract regex non-functional) + 1 MEDIUM (concurrent test pollutes 5 finalized invoices into demo data). Make the cycle-1 gates actually function — no new product features."
tasks: 2
waves: 1
---

# Phase 5 — Gap Closure (cycle 2 of 2)

**Verification verdict (cycle 1):** PASS-but-FAIL — union verdict FAIL because adversarial found 1 HIGH (D-G3 verification script regex broken — exits 1 every run, providing zero regression protection) and 1 MEDIUM (`tests/ai-concurrent-finalize.mjs` INSERTs 5 finalized rows `2026/0019`-`2026/0023` into seed corpus; Cyprus VAT immutability means they cannot be deleted; pitch day is TODAY).

**Why this cycle exists:** Cycle 1 closed the original gaps. The PRODUCT works. But cycle 1 introduced two CONTRACT defects:

1. The D-G3 regression-prevention gate (Node script embedded in `phase-5-gaps-plan.md` lines 126-153) builds a regex against `${mid}::uuid` (no quotes) but `supabase/seed.sql` uses `'<uuid>'::uuid` (single-quoted), AND the regex assumes column order `(matter_id, client_id)` with a single `\n` capture but seed.sql column order is `(id, workspace_id, client_id, ...)` — `workspace_id` sits between. The script exits 1 on every run. The DATA is correct (manually verified `a0004 → c04`) but the AUTOMATED GATE is non-functional.

2. `tests/ai-concurrent-finalize.mjs` commits 5 real finalized invoice rows to the database. Per Cyprus VAT law, finalized invoices cannot be deleted. The test relies on an operator running `npm run db:reset` before the pitch. If the verifier runs the behavioral contract (which is `npm run test:ai-concurrent`), or if no one resets the database, Fotini sees `2026/0001`-style real invoices PLUS 5 garbage rows. Pitch is TODAY.

**Cycle 2 is the FINAL cycle.** If this build returns FAIL, the orchestrator HALTS and requires human intervention. Both fixes must work. No deferrals. No "document it as known" — that is explicitly forbidden by the cycle-2 locked decisions.

**Scope guard:** Two tasks, both Wave 1, zero file overlap. Task 1 touches `scripts/`, `package.json`, and the cycle-2 plan's own Contract #3 (this file). Task 2 touches `tests/ai-concurrent-finalize.mjs` only. No new SP migrations. No new product features. No new test routes. No new dependencies.

---

## Task 1 — Replace embedded D-G3 regex with a real script that queries the database

**Wave:** 1
**Persona:** backend
**Files:** `scripts/check-demo-cache-integrity.mjs` (NEW), `package.json` (add `check:cache-integrity` script), `.planning/phase-5-gaps-plan.md` (this file — update Contract #3 to invoke `npm run check:cache-integrity`)
**Depends on:** none

**Why:** Adversarial verification found the D-G3 plan-embedded Node script is non-functional. It builds a regex against `seed.sql` text that doesn't match the file's actual format (quoted UUIDs, intervening `workspace_id` column). The script exits 1 on every run — the regression-prevention gate cycle-1 promised does not function. The cycle-1 data is correct (both verifiers confirmed `a0004 → c04` manually) but no automated check protects against future drift. Per learned-pattern 1: don't regex SQL files — the database is the source of truth. Replace the regex with a `podman exec ... psql` query that asks the live local database "for each draft entry's `matter_id`, what is the matter row's `client_id`?" and asserts equality with the draft's `client_id`. Store the script as `scripts/check-demo-cache-integrity.mjs` so the verifier can invoke it via `npm run check:cache-integrity` without reading the plan — meeting the locked decision that the HIGH fix must be self-contained. The verifier's contract becomes a one-line `npm run check:cache-integrity` instead of a multi-line plan-embedded heredoc.

**Acceptance Criteria:**
- `scripts/check-demo-cache-integrity.mjs` exists, is executable as a Node ES module (`node scripts/check-demo-cache-integrity.mjs`), and performs the following: (1) reads `src/lib/openrouter/demo-cache.json`, (2) extracts every entry where `entry.kind === "draft"` with their `(draft.client_id, draft.matter_id)` pair, (3) opens a psql connection to the local Supabase database via `podman exec -i supabase_db_flaw psql -U postgres -d postgres -tAc "SELECT id, client_id FROM public.matters WHERE id IN ('<uuid1>', '<uuid2>', ...)"`, (4) parses the tab-separated rows, (5) asserts every draft's `matter_id` is present in the DB result AND the DB row's `client_id` equals the draft's `client_id`, (6) exits 0 with `D-G3 OK: N draft entries paired correctly with database matters` on full pass, exits 1 with a `MISMATCH ...` or `MISS matter ...` line for any failure.
- The script uses `DOCKER_HOST="unix:///run/user/$(id -u)/podman/podman.sock"` exported into the psql subprocess environment so it matches the existing project podman config. It uses `child_process.execFileSync` with explicit arg arrays, NOT shell-string interpolation, so UUID values cannot inject SQL.
- The matter IDs are quoted as SQL string literals in the IN clause (e.g. `'00000000-0000-0000-0000-0000000a0004'`) — NOT cast with `::uuid`, since the comparison column type is `uuid` and Postgres will cast the string literal automatically.
- `package.json` declares `"check:cache-integrity": "node scripts/check-demo-cache-integrity.mjs"` in `scripts`.
- This file's `## Verification Contract` section, Contract #3 ("D-G3 cache integrity ..."), is updated: `**Command:**` becomes `npm run check:cache-integrity`, the inline heredoc Node block is deleted, and `**Expected:**` becomes `Exit 0 with "D-G3 OK: N draft entries paired correctly with database matters"`.
- Running `npm run check:cache-integrity` against the current local DB (which has `a0001`-`a0005` seeded) exits 0 and prints `D-G3 OK: 3 draft entries paired correctly with database matters`.

**Action:**
1. Create `scripts/check-demo-cache-integrity.mjs` with the following structure:
   - Shebang `#!/usr/bin/env node`.
   - ES module imports: `import { readFileSync } from "node:fs"`, `import { execFileSync } from "node:child_process"`, `import { join, dirname } from "node:path"`, `import { fileURLToPath } from "node:url"`.
   - Resolve `REPO_ROOT` from `import.meta.url`.
   - Read and JSON.parse `src/lib/openrouter/demo-cache.json` from `REPO_ROOT`.
   - Build `drafts = Object.entries(cache).filter(([, v]) => v.kind === "draft").map(([prompt, v]) => ({ prompt, clientId: v.draft.client_id, matterId: v.draft.matter_id }))`.
   - If `drafts.length === 0`, print `D-G3 OK: 0 draft entries (vacuous)` and exit 0.
   - Build the matter-id list quoted: `const inClause = drafts.map(d => \`'\${d.matterId}'\`).join(", ")`. UUIDs are 36-char hex+dashes — validate each against `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` BEFORE building the SQL string. If any draft's `matterId` fails validation, exit 1 with `INVALID UUID: <matterId> for prompt: <prompt>`. This is defense-in-depth against future cache JSON corruption AND prevents any possibility of SQL injection via cache content.
   - Execute psql:
     ```js
     const sql = `SELECT id::text, client_id::text FROM public.matters WHERE id IN (${inClause})`;
     const out = execFileSync(
       "podman",
       ["exec", "-i", "supabase_db_flaw", "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql],
       {
         env: { ...process.env, DOCKER_HOST: `unix:///run/user/${process.getuid()}/podman/podman.sock` },
         encoding: "utf8",
         stdio: ["ignore", "pipe", "pipe"],
       },
     );
     ```
   - Wrap the `execFileSync` in `try/catch`. On error, print `D-G3 FAIL: psql query error: <err.message>` (include `err.stderr?.toString()` if present) and exit 1. Hint message: `Hint: ensure the local Supabase stack is running (\`npx supabase status\`).`
   - Parse stdout: split on `\n`, filter empty lines, split each line on `\t` (psql `-tA` tab-separated tuples-only mode), yielding `[matterId, clientId]` pairs. Build a `Map<string, string>` from matter ID (lowercased) to client ID (lowercased).
   - For each draft in `drafts`: if `!dbMap.has(d.matterId.toLowerCase())`, print `MISS matter <matterId> for prompt: <prompt>` and increment `failed`. Else, compare `dbMap.get(d.matterId.toLowerCase())` to `d.clientId.toLowerCase()`; if mismatch, print `MISMATCH prompt="<prompt>" draft.client_id=<clientId> matter.client_id=<dbClientId>` and increment `failed`.
   - If `failed > 0`, print `D-G3 FAIL: <failed> entries` and `process.exit(1)`. Else print `D-G3 OK: <drafts.length> draft entries paired correctly with database matters` and `process.exit(0)`.
2. Make the file executable: `chmod +x scripts/check-demo-cache-integrity.mjs` (cosmetic — `npm run check:cache-integrity` invokes via `node`, but the shebang + bit makes direct invocation work too).
3. Update `package.json` — add `"check:cache-integrity": "node scripts/check-demo-cache-integrity.mjs"` to the `scripts` block. Place it alphabetically near `db:reset` (the file lists scripts roughly alphabetically — `check:` sorts before `db:`).
4. Update `.planning/phase-5-gaps-plan.md` (this very file, the cycle-2 plan you are reading): locate the `### Contract for Task 1 — D-G3 cache integrity ...` block and rewrite its `**Command:**`, `**Expected:**`, and `**Fail if:**` fields per the Acceptance Criteria. The replacement block is provided in this plan's own Verification Contract section below — copy that text into place. Delete the multi-line inline-node-script heredoc entirely.
5. Verify end-to-end:
   - `node scripts/check-demo-cache-integrity.mjs` → exit 0, prints `D-G3 OK: 3 draft entries paired correctly with database matters`.
   - `npm run check:cache-integrity` → identical output, exit 0.
   - `node -e "console.log(require('./package.json').scripts['check:cache-integrity'])"` → prints `node scripts/check-demo-cache-integrity.mjs`.
6. Commit (one atomic commit for Task 1): `git add scripts/check-demo-cache-integrity.mjs package.json .planning/phase-5-gaps-plan.md && git commit -m "fix(phase-5): replace D-G3 regex with real db-query script (cycle 2)"`.

**Validation:** (builder self-check)
- `test -f scripts/check-demo-cache-integrity.mjs && echo EXISTS` → expected `EXISTS`.
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')).scripts['check:cache-integrity'] && console.log('OK')"` → expected `OK`.
- `node scripts/check-demo-cache-integrity.mjs` → expected exit 0 with stdout containing `D-G3 OK: 3 draft entries paired correctly with database matters`.
- `npm run check:cache-integrity` → expected exit 0, same final stdout line.
- `grep -c "scripts/check-demo-cache-integrity.mjs" .planning/phase-5-gaps-plan.md` → expected `≥ 3` (the new script path is referenced in Task block, Validation, and the Verification Contract).
- `grep -c "npm run check:cache-integrity" .planning/phase-5-gaps-plan.md` → expected `≥ 1` (the contract now invokes the npm script).

**Context:** Read @scripts/check-demo-cache-integrity.mjs @package.json @src/lib/openrouter/demo-cache.json @supabase/seed.sql @.planning/phase-5-verification.md

---

## Task 2 — Eliminate concurrent-test pollution: wrap test body in a SAVEPOINT or auto-reset bookend

**Wave:** 1
**Persona:** backend
**Files:** `tests/ai-concurrent-finalize.mjs`
**Depends on:** none

**Why:** Adversarial verification found that `tests/ai-concurrent-finalize.mjs` commits 5 real finalized invoices (`2026/0009`-`2026/0013` on the run-1 sequence, `2026/0019`-`2026/0023` after the cycle-1 re-run) to demo data. Per Cyprus VAT law, finalized invoices cannot be deleted — they are legally immutable once committed. The pitch is TODAY (2026-05-14). If the verifier runs the behavioral contract for AC #2 (`npm run test:ai-concurrent`), or if any team member touches the test in the next few hours without running `npm run db:reset` afterwards, Fotini sees stale test invoices in her seed. Per learned-pattern 2: Cyprus VAT immutability applies to COMMITTED rows; tests must run inside a transaction that ROLLBACKs, OR target a throwaway workspace, OR auto-reset before/after. Per cycle-2 locked decisions: "Document it as known" is NOT acceptable; the pollution risk must be eliminated. The cleanest fix is option (a) from project context — wrap the entire SP-invocation sequence in a Postgres SAVEPOINT (or BEGIN/ROLLBACK transaction) so the 5 `allocate_invoice_number` calls + 5 invoice INSERTs all happen inside a transaction that is rolled back before COMMIT. SAVEPOINT/ROLLBACK is the standard test pattern; Cyprus VAT immutability is for COMMITTED rows; nothing commits if the outermost BEGIN ends in ROLLBACK. The test continues to prove the load-bearing invariant (5 distinct sequential YYYY/NNNN numbers under contention) inside the transaction — the SP allocates numbers from `invoice_sequences` which is also rolled back, but the ALLOCATION CALL within the transaction observes serialization correctly. If SAVEPOINT doesn't work (the SP may use `pg_advisory_xact_lock` which IS released on rollback — actually fine — but the test's current architecture is HTTP-based against a Phase 3 route that opens its own connection per request, so a single outer transaction wrapping multiple HTTP requests is impossible), the test falls back to option (d): the test itself `execFileSync`s `npx supabase db reset --local` AFTER the assertion completes, so demo data is restored automatically before any human can next see it. This is operator-step-free.

Because the current concurrent test goes through `/api/test/finalize-concurrent` (a single HTTP request that opens its own DB connection on the server side), wrapping it in an outer client-side transaction is impossible without rewriting the endpoint — which we are forbidden from doing (no new test routes, no new SP migrations). Therefore the correct cycle-2 fix is **option (d)**: the test itself invokes `npm run db:reset` as a post-assertion cleanup step. The reset is deterministic, fast (the local Supabase stack reseeds from `seed.sql` in seconds), and eliminates the pollution completely. The test prints a clear `DESTRUCTIVE` banner at start AND end so anyone running it understands the side effect.

**Acceptance Criteria:**
- `tests/ai-concurrent-finalize.mjs` prints a `DESTRUCTIVE` banner at start: `[DESTRUCTIVE] This test commits 5 finalized invoices to the local DB. Will run \`npm run db:reset\` automatically after the assertion to restore seed baseline.` The banner appears BEFORE any fetch call so an operator running with `Ctrl+C` available sees it.
- After the existing assertion passes (`[PASS] N concurrent finalizes ...`), the test invokes `npm run db:reset` via `child_process.execFileSync("npm", ["run", "db:reset"], { stdio: "inherit", encoding: "utf8" })`. The reset runs to completion before the test exits.
- After the reset completes, the test prints `[CLEANUP] db:reset complete — seed baseline restored.` and then `process.exit(0)`. If `db:reset` fails (non-zero exit), the test prints `[CLEANUP FAIL] db:reset returned non-zero; pollution NOT cleaned. Run \`npm run db:reset\` manually before the demo.` and exits 1 (the underlying concurrency assertion passed, but the cleanup failure is itself a test failure for cycle-2 purposes).
- On ANY pre-existing failure path (fetch error, non-200, parse error, duplicate-number error, gap error, endpoint disagreement) — i.e. every existing `process.exit(1)` — the test STILL runs `db:reset` as a finally-cleanup, so a failed assertion does not leave the database polluted. Use a top-level `try/finally` (or `process.on("exit", ...)` hook) that runs `execFileSync("npm", ["run", "db:reset"])` BEFORE the process terminates, swallowing errors with a printed warning. The exit code from the original assertion is preserved.
- The existing deviation banner (`[deviation] AC #2 scope reduced ...`) and `.planning/phase-5-deviations.json` entry both remain unchanged — Task 2 only adds cleanup, not scope reframing.
- The existing comment block at lines 31-34 (`Cleanup note: this test ADDS 5 finalized invoices ... To restore the seed baseline run \`npm run db:reset\`.`) is REWRITTEN to document the new auto-reset behaviour: `Cleanup: this test auto-runs \`npm run db:reset\` after the assertion (success or failure) to restore seed baseline. Cyprus VAT immutability applies to COMMITTED invoice rows in production; auto-reset is the standard test isolation pattern for local development.`
- Running `npm run test:ai-concurrent` END-TO-END (with dev server running) produces: deviation banner → DESTRUCTIVE banner → fetch → PASS line → CLEANUP banner → db:reset output → CLEANUP complete → exit 0. The post-run `invoices` row count equals the pre-run row count (i.e. the seed baseline). Specifically: `psql -tAc "SELECT count(*) FROM public.invoices"` returns the same number before and after `npm run test:ai-concurrent`.

**Action:**
1. Open `tests/ai-concurrent-finalize.mjs`.
2. Add `import { execFileSync } from "node:child_process";` to the imports at the top of the file (group with other `node:` imports near lines 47-49).
3. Define a `cleanupSeed()` function near the top of the file (after the `BASE` and `N` constants, before `async function main()`):
   ```js
   function cleanupSeed() {
     console.log("[CLEANUP] Running `npm run db:reset` to restore seed baseline …");
     try {
       execFileSync("npm", ["run", "db:reset"], {
         cwd: REPO_ROOT,
         stdio: "inherit",
         encoding: "utf8",
       });
       console.log("[CLEANUP] db:reset complete — seed baseline restored.");
       return true;
     } catch (err) {
       console.error(
         `[CLEANUP FAIL] db:reset returned non-zero; pollution NOT cleaned. Run \`npm run db:reset\` manually before the demo. Cause: ${
           err instanceof Error ? err.message : String(err)
         }`,
       );
       return false;
     }
   }
   ```
4. Replace the existing comment block at lines 31-34 (the "Cleanup note: ..." paragraph inside the top-of-file JSDoc) with: `Cleanup: this test auto-runs \`npm run db:reset\` after the assertion (success or failure) via a try/finally wrapper to restore seed baseline. Cyprus VAT immutability applies to COMMITTED invoice rows in production; auto-reset is the standard test isolation pattern for local development.`
5. At the very top of `main()` (immediately after the function `{` and before the deviation banner `console.log` at line 86-88), add the DESTRUCTIVE banner:
   ```js
   console.log(
     "[DESTRUCTIVE] This test commits 5 finalized invoices to the local DB. Will run `npm run db:reset` automatically after the assertion to restore seed baseline.",
   );
   ```
   Keep the existing deviation banner immediately after.
6. Refactor `main()` so the existing body runs inside a `try` block. The `try` block keeps every existing `process.exit(0)` and `process.exit(1)` call EXCEPT we replace them with `throw new TestExit(code)` where `class TestExit extends Error { constructor(public code) { super("test exit"); } }` is defined inside `main()` scope (or use a plain object: `class TestExit extends Error { constructor(code) { super("test exit"); this.code = code; } }`). All 6 existing `process.exit(1)` and 1 existing `process.exit(0)` sites become `throw new TestExit(1)` or `throw new TestExit(0)` respectively. Add a `finally` block:
   ```js
   } finally {
     const cleaned = cleanupSeed();
     if (!cleaned) {
       // CleanupFAIL: exit 1 even if assertion passed, because we leaked rows
       process.exitCode = 1;
     }
   }
   ```
   Outside the try/finally, catch the `TestExit`: `} catch (err) { if (err instanceof TestExit) { process.exit(process.exitCode === 1 ? 1 : err.code); } throw err; }`. The net effect: assertion-failure (exit code 1) is preserved through finally; assertion-success (exit code 0) is preserved if cleanup succeeds; assertion-success-but-cleanup-fail results in exit code 1.
   - Alternative simpler pattern if the TestExit class feels heavy: keep the existing `process.exit(N)` calls and add `process.on("exit", () => { cleanupSeed(); })` near the top of `main()`. But: `execFileSync` inside an `exit` handler is fragile (event loop may already be torn down). The try/finally pattern is more robust — use it.
7. Re-verify the cleanup line is reachable on EVERY error branch by reading the diff: the existing `process.exit(1)` sites at lines ~106, ~123, ~133, ~142, ~151, ~167, ~179, ~189, plus the success site at line ~195, must ALL be wrapped by the try/finally. The `main().catch(...)` outer handler at line 198 should also propagate cleanup — easiest is to have `main()` itself perform the cleanup via finally so the catch handler doesn't need to know about it.
8. Run the test end-to-end: `npm run test:ai-concurrent` (with `npm run dev` already running in another terminal). Expected stdout sequence:
   - `[DESTRUCTIVE] This test commits 5 finalized invoices ...`
   - `[deviation] AC #2 scope reduced to SP-level concurrency; ...`
   - `Lex AI concurrent finalize — 5 parallel allocations against ...`
   - `[PASS] 5 concurrent finalizes — numbers=2026/NNNN,... (sequence X..X+4) in NNNms`
   - `Summary: 1/1 passed`
   - `[CLEANUP] Running \`npm run db:reset\` to restore seed baseline ...`
   - `[CLEANUP] db:reset complete — seed baseline restored.`
   - Exit 0.
9. Verify pollution is gone: BEFORE running the test, capture the row count: `podman exec -i supabase_db_flaw psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.invoices"` → record the number (call it `N_BEFORE`). Run the test. After completion, capture again: should equal `N_BEFORE`. Document this in commit message.
10. Stage and commit (one atomic commit for Task 2): `git add tests/ai-concurrent-finalize.mjs && git commit -m "fix(phase-5): auto-reset seed after concurrent test to eliminate pollution (cycle 2)"`.

**Validation:** (builder self-check)
- `grep -c "DESTRUCTIVE" tests/ai-concurrent-finalize.mjs` → expected `≥ 1` (banner present).
- `grep -c "execFileSync.*npm.*db:reset\|execFileSync.*db:reset" tests/ai-concurrent-finalize.mjs` → expected `≥ 1` (cleanup invocation present).
- `grep -c "finally" tests/ai-concurrent-finalize.mjs` → expected `≥ 1` (finally block present — proves cleanup runs on all paths).
- `grep -c "CLEANUP" tests/ai-concurrent-finalize.mjs` → expected `≥ 2` (start banner + complete banner — proves both cleanup printlines exist).
- Run row-count invariant: `podman exec -i supabase_db_flaw psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.invoices"` BEFORE and AFTER `npm run test:ai-concurrent`. The two numbers MUST be equal. Document the actual numbers in the commit message body or builder log.
- `npm run test:ai-concurrent` → expected exit 0, with full DESTRUCTIVE→deviation→PASS→CLEANUP sequence in stdout.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → expected `0` (the test is `.mjs` not `.ts`, but ensuring no drift).

**Context:** Read @tests/ai-concurrent-finalize.mjs @package.json @.planning/phase-5-verification.md @supabase/seed.sql

---

## Success Criteria

Cycle-2-scoped — restate the 2 cycle-2 gaps as observable PASS conditions, plus the new D-G4 row-count invariant:

- [ ] **D-G3 (now executable):** `npm run check:cache-integrity` exits 0 and prints `D-G3 OK: 3 draft entries paired correctly with database matters`. The check queries the live local database (NOT regex against seed.sql) so it is robust to seed.sql formatting drift. The script lives in `scripts/check-demo-cache-integrity.mjs` and is invoked by the npm script `check:cache-integrity`. The Verification Contract in this file (Contract #3 below) references the npm script — no embedded heredoc.
- [ ] **AC #2 (preserved):** `npm run test:ai-concurrent` still exits 0. 5 distinct sequential `YYYY/NNNN` numbers, gap-free. The SP-level fallback continues to satisfy this AC per cycle-1 deviation.
- [ ] **D-G4 (NEW — no demo-data pollution):** Running `npm run test:ai-concurrent` leaves the `invoices` table row count unchanged. Concretely: `podman exec -i supabase_db_flaw psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.invoices"` returns the same value before and after the test run. The test prints a DESTRUCTIVE banner at start, runs the assertion, runs `npm run db:reset` in a `finally` block (so cleanup happens on success AND failure), and prints CLEANUP banners on entry and exit.
- [ ] **Regression — cycle-1 ACs all still hold:** Konstantinou cache entry still present, Ioannou gone, validator extraction intact, 6 guards in order, AI injection test still passes 7/7. None of cycle-2's changes touch cycle-1 surfaces.

---

## Verification Contract

### Contract for Task 1 — `scripts/check-demo-cache-integrity.mjs` exists
**Check type:** file-exists
**Command:** `test -f scripts/check-demo-cache-integrity.mjs && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist — Task 1 was not executed or the path drifted.

### Contract for Task 1 — `package.json` declares the npm script
**Check type:** grep-match
**Command:** `node -e "const s=require('./package.json').scripts['check:cache-integrity']; if(!s){process.exit(1)}; process.stdout.write(s)"`
**Expected:** Exit 0, stdout `node scripts/check-demo-cache-integrity.mjs`
**Fail if:** Exit 1 — the npm script entry is missing. Or stdout differs — the script points at the wrong file.

### Contract for Task 1 — D-G3 cache integrity (self-executable, db-backed)
**Check type:** command-exit
**Command:** `npm run check:cache-integrity`
**Expected:** Exit 0 with stdout containing `D-G3 OK: 3 draft entries paired correctly with database matters`
**Fail if:** Non-zero exit, or any `MISMATCH` / `MISS matter` / `INVALID UUID` / `D-G3 FAIL` line in output — a cache entry pairs with a matter whose `client_id` does not match, or the matter does not exist in the live database. Verifier note: this contract assumes the local Supabase stack is running (`npx supabase status` shows containers up). If the stack is not running, the script exits 1 with `psql query error` plus a `Hint:` line — verifier starts the stack and re-runs.

### Contract for Task 1 — D-G3 contract delegates to the npm script
**Check type:** grep-match
**Command:** `grep -c "scripts/check-demo-cache-integrity.mjs" .planning/phase-5-gaps-plan.md`
**Expected:** `≥ 3`
**Fail if:** Returns `< 3` — the new script path is not referenced in the Task block, Validation list, and Verification Contract section. (Self-referential note: the cycle-1 contract greped for a regex pattern that also appeared in the contract command itself, producing a false-positive failure. This cycle-2 contract checks for the PRESENCE of the new script's path instead — the path is short, distinctive, and would not appear if the cycle-1 broken-regex heredoc had been left in place.)

### Contract for Task 2 — DESTRUCTIVE banner present
**Check type:** grep-match
**Command:** `grep -c "DESTRUCTIVE" tests/ai-concurrent-finalize.mjs`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — operator visibility banner is missing; an operator running the test has no warning.

### Contract for Task 2 — auto-cleanup invocation present
**Check type:** grep-match
**Command:** `grep -cE "execFileSync.*npm.*db:reset|execFileSync.*[\"']db:reset[\"']" tests/ai-concurrent-finalize.mjs`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — `npm run db:reset` is not invoked from the test. Pollution remains. Per cycle-2 locked decisions, "document it as known" is not acceptable.

### Contract for Task 2 — cleanup runs on ALL paths (finally block)
**Check type:** grep-match
**Command:** `grep -c "finally" tests/ai-concurrent-finalize.mjs`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — cleanup is not in a `finally` block, so assertion-failure paths leak rows. The contract requires cleanup on success AND failure.

### Contract for Task 2 — invoices row count invariant (behavioral, end-to-end)
**Check type:** behavioral
**Command:** Run the following 3-step sequence:
```bash
BEFORE=$(DOCKER_HOST="unix:///run/user/$(id -u)/podman/podman.sock" podman exec -i supabase_db_flaw psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.invoices")
npm run test:ai-concurrent
AFTER=$(DOCKER_HOST="unix:///run/user/$(id -u)/podman/podman.sock" podman exec -i supabase_db_flaw psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.invoices")
[ "$BEFORE" = "$AFTER" ] && echo "D-G4 OK: invoices count unchanged ($BEFORE)" || { echo "D-G4 FAIL: before=$BEFORE after=$AFTER"; exit 1; }
```
**Expected:** Exit 0 with `D-G4 OK: invoices count unchanged (N)` for some integer N
**Fail if:** Non-zero exit, or `D-G4 FAIL: before=X after=Y` where Y > X — the test polluted the database; auto-reset did not restore the baseline. Verifier note: this contract requires a running dev server for the underlying test, AND a running local Supabase stack for the row-count probes. Verifier ensures both are up before running.

### Contract for Task 2 — concurrent test still passes end-to-end
**Check type:** command-exit
**Command:** `npm run test:ai-concurrent`
**Expected:** Exit 0
**Fail if:** Non-zero exit — the cleanup wrapper broke the assertion, or the original assertion regressed. Stdout sequence should be: `[DESTRUCTIVE]` → `[deviation]` → `[PASS]` → `Summary: 1/1 passed` → `[CLEANUP] Running` → `[CLEANUP] db:reset complete`.

### Contract for Task 2 — typescript still clean
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Any TypeScript compilation errors — the `.mjs` edits shouldn't affect TS but ensure no drift.
