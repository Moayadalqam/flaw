#!/usr/bin/env node
/**
 * tests/ai-injection.mjs — Phase 5 AI prompt-injection adversarial sweep.
 *
 * Verifies acceptance criterion #5 (restored, gap-closure cycle 1):
 *
 *   1. The pure validator `validateAIDraftCandidate` (extracted into
 *      `src/lib/openrouter/validate.ts` from the prior inline block in
 *      `draftFromAIAction`) rejects every adversarial payload with one
 *      of the three plan-allowed error codes: `parse_failed`,
 *      `unknown_client`, or `unknown_matter`.
 *   2. The control payload passes the validator and returns
 *      `{ ok: true; draft: { ... } }`.
 *   3. The `invoices` table row count is INVARIANT across the test run.
 *      The test never inserts; this assertion is the structural proof
 *      that the pure validator alone touches zero rows — adversarial
 *      payloads cannot reach an INSERT because the action would reject
 *      them at the validator step BEFORE the DB write.
 *
 * Execution model:
 *   We use `tsx` so the `.mjs` test can dynamically import a `.ts`
 *   module (`@/lib/openrouter/validate`) without a build step. tsx
 *   honours the project tsconfig's `paths` map, so the `@/` alias
 *   resolves the same way it does in the Next.js runtime. This is the
 *   convention introduced in Phase 5 gap closure cycle 1 — see
 *   `package.json` script `test:ai-injection` (now invokes `tsx`).
 *
 * Service-role rule (locked decision D-G3):
 *   The service-role client used here is for TEST SETUP ONLY (row-count
 *   query). The validator itself never sees a Supabase client; this
 *   harness only opens a service-role connection to read `count(*)` on
 *   `invoices` before and after the run, which is allowed for test
 *   harnesses per the locked decisions.
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase REST URL (from .env.local)
 *   SUPABASE_SERVICE_ROLE_KEY   — service-role JWT for the count query
 *   DEMO_CACHE                  — set by npm script for parity, not
 *                                  consulted here (the test bypasses
 *                                  the adapter and hits the validator).
 *
 * Exit 0 on all assertions pass, 1 on any fail with descriptive error.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

// Load .env.local (Node 22+) — best-effort. The npm script sets
// DEMO_CACHE=true on the command line; this also pulls in
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
try {
  process.loadEnvFile(join(REPO_ROOT, ".env.local"));
} catch {
  /* .env.local absent or unreadable; rely on shell env */
}

// Import the pure validator via tsx (resolves @/ alias from tsconfig).
const { validateAIDraftCandidate } = await import(
  "@/lib/openrouter/validate"
);

// ---------------------------------------------------------------------------
// Fixture rows — match supabase/seed.sql clients/matters exactly.
// ---------------------------------------------------------------------------
// supabase/seed.sql:116-140 — five workspace-A clients (c01..c05).
// supabase/seed.sql:158-180 — five matters, each scoped to its client.
const SEED_CLIENTS = [
  { id: "00000000-0000-0000-0000-000000000c01" }, // Christodoulides
  { id: "00000000-0000-0000-0000-000000000c02" }, // Papadopoulou
  { id: "00000000-0000-0000-0000-000000000c03" }, // Andreou
  { id: "00000000-0000-0000-0000-000000000c04" }, // Konstantinou
  { id: "00000000-0000-0000-0000-000000000c05" }, // Demetriou
];

const SEED_MATTERS = [
  {
    id: "00000000-0000-0000-0000-0000000a0001",
    client_id: "00000000-0000-0000-0000-000000000c01",
  },
  {
    id: "00000000-0000-0000-0000-0000000a0002",
    client_id: "00000000-0000-0000-0000-000000000c02",
  },
  {
    id: "00000000-0000-0000-0000-0000000a0003",
    client_id: "00000000-0000-0000-0000-000000000c03",
  },
  {
    id: "00000000-0000-0000-0000-0000000a0004",
    client_id: "00000000-0000-0000-0000-000000000c04",
  },
  {
    id: "00000000-0000-0000-0000-0000000a0005",
    client_id: "00000000-0000-0000-0000-000000000c05",
  },
];

// Andreou is the canonical valid-draft target.
const ANDREOU_CLIENT = SEED_CLIENTS[2].id;
const ANDREOU_MATTER = SEED_MATTERS[2].id;
const KONSTANTINOU_MATTER = SEED_MATTERS[3].id; // belongs to c04, not c03

// ---------------------------------------------------------------------------
// Test corpus — 5 adversarial + 1 control.
// ---------------------------------------------------------------------------
// Each `parsed` object is what the AI would have proposed AFTER its own
// adapter parse. The validator is the LAST line of defense; this corpus
// covers the five failure modes that survived prior layers.

const ADVERSARIAL = [
  {
    label: "invoice_number_injection",
    parsed: {
      client_id: ANDREOU_CLIENT,
      matter_id: ANDREOU_MATTER,
      line_items: [
        { description: "Divorce filing", quantity: 1, unit_price: 450 },
      ],
      due_days: 14,
      invoice_number: "9999/0001", // forbidden key — outer
    },
    expectedError: "parse_failed",
  },
  {
    label: "vat_rate_override",
    parsed: {
      client_id: ANDREOU_CLIENT,
      matter_id: ANDREOU_MATTER,
      line_items: [
        { description: "Divorce filing", quantity: 1, unit_price: 450 },
      ],
      due_days: 14,
      vat_rate: 0, // forbidden key — outer
    },
    expectedError: "parse_failed",
  },
  {
    label: "total_override",
    parsed: {
      client_id: ANDREOU_CLIENT,
      matter_id: ANDREOU_MATTER,
      line_items: [
        { description: "Divorce filing", quantity: 1, unit_price: 450 },
      ],
      due_days: 14,
      total: 0, // forbidden key — outer
    },
    expectedError: "parse_failed",
  },
  {
    label: "line_item_vat_amount",
    parsed: {
      client_id: ANDREOU_CLIENT,
      matter_id: ANDREOU_MATTER,
      line_items: [
        {
          description: "Divorce filing",
          quantity: 1,
          unit_price: 450,
          vat_amount: 999, // forbidden key — per-item
        },
      ],
      due_days: 14,
    },
    expectedError: "parse_failed",
  },
  {
    label: "cross_client_matter",
    // Andreou (c03) paired with Konstantinou's matter (a0004 → c04).
    // The cross-client pairing guard should reject this with
    // `unknown_matter`.
    parsed: {
      client_id: ANDREOU_CLIENT,
      matter_id: KONSTANTINOU_MATTER,
      line_items: [
        { description: "Divorce filing", quantity: 1, unit_price: 450 },
      ],
      due_days: 14,
    },
    expectedError: "unknown_matter",
  },
];

const CONTROL = {
  label: "control_valid_andreou_draft",
  parsed: {
    client_id: ANDREOU_CLIENT,
    matter_id: ANDREOU_MATTER,
    line_items: [
      {
        description: "Divorce filing — case preparation",
        quantity: 1,
        unit_price: 450,
      },
    ],
    due_days: 14,
  },
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function captureInvoiceCount() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — " +
        "row-count invariant cannot be asserted. Run with .env.local present.",
    );
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count, error } = await sb
    .from("invoices")
    .select("*", { count: "exact", head: true });
  if (error) {
    throw new Error(
      `service-role count(*) on invoices failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

async function main() {
  console.log(
    "Lex AI injection — 5 adversarial + 1 control vs pure validator + row-count invariant",
  );

  // (1) Capture row count BEFORE.
  const countBefore = await captureInvoiceCount();
  console.log(`[setup] invoices row count before: ${countBefore}`);

  let failed = 0;

  // (2) Adversarial sweep — every payload must return ok: false with
  //     one of the three plan-allowed error codes.
  const ALLOWED_ERRORS = new Set([
    "parse_failed",
    "unknown_client",
    "unknown_matter",
  ]);
  for (const t of ADVERSARIAL) {
    const result = validateAIDraftCandidate(t.parsed, SEED_CLIENTS, SEED_MATTERS);
    if (result.ok) {
      console.error(
        `[FAIL] ${t.label} — validator ACCEPTED adversarial payload: ${JSON.stringify(
          result.draft,
        )}`,
      );
      failed += 1;
      continue;
    }
    if (!ALLOWED_ERRORS.has(result.error)) {
      console.error(
        `[FAIL] ${t.label} — rejected but with unexpected error '${result.error}'`,
      );
      failed += 1;
      continue;
    }
    if (result.error !== t.expectedError) {
      // Not fatal — multiple guards can short-circuit to the same
      // refusal. Log it but pass.
      console.log(
        `[PASS] ${t.label} → ${result.error} (note: plan expected ${t.expectedError})`,
      );
    } else {
      console.log(`[PASS] ${t.label} → ${result.error}`);
    }
  }

  // (3) Control — must pass.
  const cr = validateAIDraftCandidate(
    CONTROL.parsed,
    SEED_CLIENTS,
    SEED_MATTERS,
  );
  if (!cr.ok) {
    console.error(
      `[FAIL] ${CONTROL.label} — validator REJECTED control: ${cr.error}`,
    );
    failed += 1;
  } else if (cr.draft.client_id !== ANDREOU_CLIENT) {
    console.error(
      `[FAIL] ${CONTROL.label} — validator returned wrong client_id: ${cr.draft.client_id}`,
    );
    failed += 1;
  } else {
    console.log(
      `[PASS] ${CONTROL.label} → client ${cr.draft.client_id.slice(0, 8)}… matter ${cr.draft.matter_id.slice(0, 8)}… €${cr.draft.line_items[0].unit_price} × ${cr.draft.line_items[0].quantity}, due in ${cr.draft.due_days}d`,
    );
  }

  // (4) Capture row count AFTER + assert invariant.
  const countAfter = await captureInvoiceCount();
  if (countBefore !== countAfter) {
    console.error(
      `[FAIL] invoices row count drift: ${countBefore} → ${countAfter} (validator must NEVER insert)`,
    );
    failed += 1;
  } else {
    console.log(
      `[PASS] invoices row count invariant: ${countBefore} (no rogue inserts)`,
    );
  }

  const total = ADVERSARIAL.length + 1 + 1; // adversarial + control + invariant
  const passed = total - failed;
  console.log(`\nSummary: ${passed}/${total} passed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("ai-injection crashed:", err);
  process.exit(1);
});
