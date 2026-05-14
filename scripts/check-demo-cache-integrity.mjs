#!/usr/bin/env node
/**
 * D-G3 cache-integrity gate.
 *
 * Asserts that every `kind: "draft"` entry in `src/lib/openrouter/demo-cache.json`
 * pairs a `client_id` with a `matter_id` such that the matter row in the live
 * local Supabase database has the same `client_id`. Replaces the cycle-1
 * regex-against-seed.sql approach (which was broken — see phase-5-verification.md
 * Contract 3 note for details). The database is the source of truth.
 *
 * Exit codes:
 *   0 — every draft entry's matter exists in the DB and its client_id matches.
 *   1 — at least one MISS, MISMATCH, INVALID UUID, or psql error.
 *
 * Side effects: spawns `podman exec ... psql` against the local supabase_db_flaw
 * container. Requires the local Supabase stack to be running.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1) Load cache + extract draft entries.
const cachePath = join(REPO_ROOT, "src/lib/openrouter/demo-cache.json");
const cache = JSON.parse(readFileSync(cachePath, "utf8"));
const drafts = Object.entries(cache)
  .filter(([, v]) => v && v.kind === "draft")
  .map(([prompt, v]) => ({
    prompt,
    clientId: v.draft.client_id,
    matterId: v.draft.matter_id,
  }));

if (drafts.length === 0) {
  console.log("D-G3 OK: 0 draft entries (vacuous)");
  process.exit(0);
}

// 2) Validate UUIDs (defense-in-depth — prevents SQL injection via cache content
//    and catches future cache corruption before it hits psql).
for (const d of drafts) {
  if (!UUID_RE.test(d.matterId)) {
    console.error(`INVALID UUID: ${d.matterId} for prompt: ${d.prompt}`);
    process.exit(1);
  }
  if (!UUID_RE.test(d.clientId)) {
    console.error(`INVALID UUID: ${d.clientId} for prompt: ${d.prompt}`);
    process.exit(1);
  }
}

// 3) Build IN clause + execute psql via podman.
const inClause = drafts.map((d) => `'${d.matterId}'`).join(", ");
const sql = `SELECT id::text, client_id::text FROM public.matters WHERE id IN (${inClause})`;

let out;
try {
  out = execFileSync(
    "podman",
    [
      "exec",
      "-i",
      "supabase_db_flaw",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tAc",
      sql,
    ],
    {
      env: {
        ...process.env,
        DOCKER_HOST: `unix:///run/user/${process.getuid()}/podman/podman.sock`,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
} catch (err) {
  const stderr = err && err.stderr ? err.stderr.toString() : "";
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`D-G3 FAIL: psql query error: ${msg}`);
  if (stderr) console.error(stderr);
  console.error(
    "Hint: ensure the local Supabase stack is running (`npx supabase status`).",
  );
  process.exit(1);
}

// 4) Parse stdout. psql `-tA` (tuples-only + unaligned) defaults to `|` as the
//    column separator, NOT `\t`. Verified manually:
//      $ podman exec ... psql -U postgres -d postgres -tAc "SELECT id::text, client_id::text FROM public.matters WHERE id IN (...)"
//      00000000-0000-0000-0000-0000000a0003|00000000-0000-0000-0000-000000000c03
const dbMap = new Map();
for (const rawLine of out.split("\n")) {
  const line = rawLine.trim();
  if (!line) continue;
  const [mid, cid] = line.split("|");
  if (mid && cid) {
    dbMap.set(mid.toLowerCase(), cid.toLowerCase());
  }
}

// 5) Cross-check every draft against the DB result.
let failed = 0;
for (const d of drafts) {
  const mid = d.matterId.toLowerCase();
  const expectedCid = d.clientId.toLowerCase();
  if (!dbMap.has(mid)) {
    console.error(`MISS matter ${d.matterId} for prompt: ${d.prompt}`);
    failed++;
    continue;
  }
  const actualCid = dbMap.get(mid);
  if (actualCid !== expectedCid) {
    console.error(
      `MISMATCH prompt="${d.prompt}" draft.client_id=${d.clientId} matter.client_id=${actualCid}`,
    );
    failed++;
  }
}

if (failed > 0) {
  console.error(`D-G3 FAIL: ${failed} entries`);
  process.exit(1);
}

console.log(
  `D-G3 OK: ${drafts.length} draft entries paired correctly with database matters`,
);
process.exit(0);
