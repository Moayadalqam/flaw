#!/usr/bin/env node
/**
 * tests/ai-concurrent-finalize.mjs — Phase 5 gap-free concurrent finalize
 * proof for AI-created drafts.
 *
 * Verifies acceptance criterion #2: 5 concurrent finalizes produce 5
 * distinct sequential `YYYY/NNNN` invoice numbers with no gaps. The hard
 * invariant is that the underlying `allocate_invoice_number()` SP
 * (Migration 003 — xact-level advisory lock) serializes parallel
 * allocations.
 *
 * Strategy — option (c) per phase-5-plan.md §Task 4 Action 3:
 *
 *   AI-drafted invoices flow through the SAME finalize pipeline as
 *   hand-created ones (Task 2's `draftFromAIAction` shares the
 *   `finalizeInvoiceAction → allocate_invoice_number()` codepath with
 *   `createInvoiceAction`). The concurrency hazard is structurally
 *   identical: it lives in the SP, not in the AI path. Phase 3 shipped
 *   `/api/test/finalize-concurrent?n=5` to exercise the SP under
 *   contention; we re-use that endpoint here because:
 *
 *     1. It is the EXACT contention pattern Cyprus VAT compliance hinges
 *        on (one workspace, one year, N parallel allocate calls).
 *     2. It returns deterministic JSON: `{ numbers, unique, gap_free }`.
 *     3. It does NOT require Task 2's `draftFromAIAction` to be
 *        committed yet — this lets Task 4 ship in parallel with Task 2.
 *
 *   Marked as `[deviation] direct SP test via existing
 *   /api/test/finalize-concurrent; AI-draft path structurally identical`.
 *
 *   Cleanup: this test auto-runs `npm run db:reset` after the assertion (success or failure)
 *   via a try/finally wrapper to restore seed baseline. Cyprus VAT immutability applies to
 *   COMMITTED invoice rows in production; auto-reset is the standard test isolation pattern
 *   for local development.
 *
 * Exit 0 on success (5 distinct sequential numbers + service responded
 * `unique: true` + `gap_free: true`), 1 otherwise.
 *
 * Env:
 *   LEX_LOCAL_URL          — base URL (default http://localhost:3000)
 *   DEMO_CACHE             — set by npm script for parity with other AI
 *                            tests; the concurrent path does not consult
 *                            the cache (no AI call happens), but having
 *                            it set keeps the harness behaviour uniform.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

try {
  process.loadEnvFile(join(REPO_ROOT, ".env.local"));
} catch {
  /* .env.local absent or unreadable; npm script provides DEMO_CACHE */
}
process.env.DEMO_CACHE = process.env.DEMO_CACHE ?? "true";

const BASE = process.env.LEX_LOCAL_URL ?? "http://localhost:3000";
const N = 5;

function cleanupSeed() {
  console.log("[CLEANUP] Running `npm run db:reset` to restore seed baseline …");
  try {
    execFileSync("npm", ["run", "db:reset"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      encoding: "utf8",
      env: {
        ...process.env,
        DOCKER_HOST: `unix:///run/user/${process.getuid()}/podman/podman.sock`,
      },
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

async function main() {
  console.log(
    "[DESTRUCTIVE] This test commits 5 finalized invoices to the local DB. Will run `npm run db:reset` automatically after the assertion to restore seed baseline.",
  );

  // ─── Deviation banner (Phase 5 gap closure cycle 1) ───────────────────
  // The plan-preferred path drives 5 concurrent `draftFromAIAction` calls
  // (via an HTTP+auth wrapper endpoint) followed by 5 concurrent
  // `finalizeInvoiceAction` calls, asserting 5 distinct sequential
  // YYYY/NNNN numbers on the AI-draft path specifically. Implementing
  // that requires wiring an authenticated Supabase session (cookie-based
  // sb-...-auth-token) into a Node fetch harness AND adding two new test
  // route handlers (`/api/test/ai-draft`, `/api/test/ai-finalize`) that
  // must gate on NODE_ENV. Both pieces fit into Phase 5 scope but the
  // gap-closure budget is tight — and the SP-level fallback is
  // explicitly permitted by the plan with an entry in
  // `.planning/phase-5-deviations.json`.
  //
  // The AI write path goes through the SAME `allocate_invoice_number`
  // SP this endpoint exercises. The concurrency hazard is structurally
  // in the SP, not in the AI path; the wrapper layer (auth + draft
  // assembly) has no contention point. So this fallback re-proves the
  // load-bearing invariant (gap-free numbering under parallel
  // allocation) without exercising the AI-draft → finalize chain end
  // to end.
  console.log(
    "[deviation] AC #2 scope reduced to SP-level concurrency; see .planning/phase-5-deviations.json",
  );
  console.log(
    `Lex AI concurrent finalize — ${N} parallel allocations against ${BASE}/api/test/finalize-concurrent`,
  );

  class TestExit extends Error {
    constructor(code) {
      super("test exit");
      this.code = code;
    }
  }

  let exitCode = 0;
  try {
    const url = `${BASE}/api/test/finalize-concurrent?n=${N}`;
    const t0 = performance.now();

    let res;
    try {
      res = await fetch(url, { redirect: "follow" });
    } catch (err) {
      console.error(
        `FAIL — fetch error: ${err instanceof Error ? err.message : String(err)}`,
      );
      console.error(
        `Hint: this test needs a running dev server (\`npm run dev\`).`,
      );
      throw new TestExit(1);
    }

    const elapsedMs = performance.now() - t0;

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* fall through */
      }
      console.error(
        `FAIL — HTTP ${res.status} after ${elapsedMs.toFixed(0)}ms${
          detail ? `: ${detail.slice(0, 200)}` : ""
        }`,
      );
      throw new TestExit(1);
    }

    let body;
    try {
      body = await res.json();
    } catch (err) {
      console.error(
        `FAIL — non-JSON response: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new TestExit(1);
    }

    const numbers = Array.isArray(body?.numbers) ? body.numbers : [];

    if (numbers.length !== N) {
      console.error(
        `FAIL — expected ${N} numbers, got ${numbers.length}: ${JSON.stringify(numbers)}`,
      );
      throw new TestExit(1);
    }

    // Re-verify uniqueness + gap-free locally — do not trust the endpoint's
    // own assertion blindly. The SP is the source of truth.
    const unique = new Set(numbers).size === numbers.length;
    if (!unique) {
      console.error(
        `FAIL — duplicate numbers in allocation: ${JSON.stringify(numbers)}`,
      );
      throw new TestExit(1);
    }

    // Numbers are formatted YYYY/NNNN. Sort numerically by the sequence
    // suffix and assert each adjacent pair differs by exactly 1.
    const sequences = numbers
      .map((s) => {
        const parts = String(s).split("/");
        const n = parseInt(parts[1] ?? "0", 10);
        return Number.isFinite(n) ? n : Number.NaN;
      })
      .sort((a, b) => a - b);

    if (sequences.some((n) => !Number.isFinite(n))) {
      console.error(
        `FAIL — non-numeric sequence in numbers: ${JSON.stringify(numbers)}`,
      );
      throw new TestExit(1);
    }

    for (let i = 1; i < sequences.length; i++) {
      if (sequences[i] !== sequences[i - 1] + 1) {
        console.error(
          `FAIL — gap between ${sequences[i - 1]} and ${sequences[i]} in ${JSON.stringify(
            numbers,
          )}`,
        );
        throw new TestExit(1);
      }
    }

    // Cross-check the endpoint's own verdicts — they should agree.
    if (body.unique !== true || body.gap_free !== true) {
      console.error(
        `FAIL — endpoint disagrees: unique=${body.unique} gap_free=${body.gap_free}`,
      );
      throw new TestExit(1);
    }

    console.log(
      `[PASS] ${N} concurrent finalizes — numbers=${numbers.join(",")} (sequence ${sequences[0]}..${sequences[sequences.length - 1]}) in ${elapsedMs.toFixed(0)}ms`,
    );
    console.log(`Summary: 1/1 passed`);
  } catch (err) {
    if (err instanceof TestExit) {
      exitCode = err.code;
    } else {
      console.error("Unexpected error:", err);
      exitCode = 1;
    }
  } finally {
    const cleaned = cleanupSeed();
    if (!cleaned && exitCode === 0) {
      exitCode = 1; // assertion passed but cleanup failed
    }
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("ai-concurrent-finalize crashed:", err);
  process.exit(1);
});
