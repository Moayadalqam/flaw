/**
 * TEST-ONLY route — `GET/POST /api/test/finalize-concurrent`
 *
 * Fires N (default 5) concurrent draft → finalize transitions and returns the
 * allocated numbers. Used by `tests/pdf-smoke.mjs` to verify the gap-free
 * advisory-lock SP under contention (Acceptance Criterion #3 — Phase 3).
 *
 * Security model:
 *   * HARD gate: returns 404 when `process.env.NODE_ENV === 'production'`.
 *     This route MUST NOT be reachable on the live demo.
 *   * Uses the service-role client because `allocate_invoice_number()` is
 *     REVOKE'd from anon + authenticated (Migration 003) AND because the
 *     test corpus is created without going through the user-scoped session.
 *
 * What it does (only when NODE_ENV !== 'production'):
 *   1. Resolves the seed workspace (the first workspaces row — single-tenant
 *      demo).
 *   2. Picks an existing client + matter from that workspace (the seed
 *      Migration 004 inserts 10 clients + 5 matters — guaranteed present).
 *   3. Inserts N draft invoices in parallel.
 *   4. Fires Promise.all of N `allocate_invoice_number` RPC calls.
 *   5. Updates each invoice with its allocated number (status → 'finalized').
 *   6. Returns JSON `{ numbers: string[], unique: boolean, gap_free: boolean }`.
 *
 * Why a single GET handler that mutates: this is a test fixture, not a
 * production write path. GET keeps the smoke test client simple (no need
 * to set Content-Type, no preflight). The NODE_ENV guard is the only
 * defense — and it's sufficient because Vercel sets NODE_ENV=production
 * automatically on the deployed app.
 *
 * References:
 *   * .planning/phase-3-plan.md §Task 6 (smoke test contract)
 *   * supabase/migrations/20260513000003_invoice_numbering.sql (the SP)
 *   * src/app/(workspace)/invoices/actions.ts:533 (the normal finalize path)
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InvoiceIdRow {
  id: string;
}

interface ClientIdRow {
  id: string;
}

interface MatterIdRow {
  id: string;
  client_id: string;
}

interface WorkspaceIdRow {
  id: string;
}

async function runConcurrentFinalize(n: number): Promise<Response> {
  const svc = createServiceClient();

  // Resolve a workspace + client + matter. The seed (Migration 004) inserts
  // exactly one workspace + 10 clients + 5 matters, so picking the first of
  // each is deterministic for the local stack.
  const { data: ws } = await svc
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<WorkspaceIdRow>();
  if (!ws) {
    return NextResponse.json(
      { error: "no_workspace" },
      { status: 500 },
    );
  }

  const { data: matters } = await svc
    .from("matters")
    .select("id, client_id")
    .eq("workspace_id", ws.id)
    .limit(1)
    .returns<MatterIdRow[]>();
  if (!matters || matters.length === 0) {
    return NextResponse.json(
      { error: "no_matter" },
      { status: 500 },
    );
  }
  const matter = matters[0];
  const clientId = matter.client_id;

  // Sanity — the matter joins back to a client row.
  const { data: client } = await svc
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle<ClientIdRow>();
  if (!client) {
    return NextResponse.json(
      { error: "no_client" },
      { status: 500 },
    );
  }

  // (1) Insert N draft invoices in a single batch — keeps the test setup
  // cheap and avoids polluting the per-call latency we care about (the
  // finalize race below).
  const drafts = Array.from({ length: n }, () => ({
    workspace_id: ws.id,
    client_id: client.id,
    matter_id: matter.id,
    status: "draft" as const,
    issued_at: new Date().toISOString().slice(0, 10),
    subtotal: "0.00",
    vat_rate: "0.1900",
    vat_amount: "0.00",
    total: "0.00",
    currency: "EUR",
    language: "el" as const,
  }));

  const { data: inserted, error: insertError } = await svc
    .from("invoices")
    .insert(drafts)
    .select("id")
    .returns<InvoiceIdRow[]>();
  if (insertError || !inserted || inserted.length !== n) {
    return NextResponse.json(
      {
        error: "insert_failed",
        message: insertError?.message,
      },
      { status: 500 },
    );
  }

  // (2) Fire N parallel allocate_invoice_number() calls. The advisory lock
  // inside the SP serializes them per (workspace, year); if it works, all N
  // come back with distinct sequential numbers.
  const year = new Date().getFullYear();
  const allocations = await Promise.all(
    inserted.map((row) =>
      svc
        .rpc("allocate_invoice_number", {
          p_workspace: ws.id,
          p_year: year,
        })
        .then((res) => ({ id: row.id, result: res })),
    ),
  );

  const numbers: string[] = [];
  for (const a of allocations) {
    if (a.result.error || typeof a.result.data !== "string") {
      return NextResponse.json(
        {
          error: "allocate_failed",
          message: a.result.error?.message,
        },
        { status: 500 },
      );
    }
    numbers.push(a.result.data);
  }

  // (3) Update each invoice with its allocated number. Promise.all again so
  // we don't serialize what should be a fast batch. Note: in production the
  // SP call + UPDATE happen inside the same transaction (server action) so
  // that an aborted UPDATE rolls back the counter increment. This test path
  // does NOT need the transactional guarantee — it just needs to confirm
  // the SP returns distinct sequential numbers under contention.
  await Promise.all(
    allocations.map((a, i) =>
      svc
        .from("invoices")
        .update({
          status: "finalized",
          invoice_number: numbers[i],
          invoice_year: year,
          finalized_at: new Date().toISOString(),
        })
        .eq("id", a.id),
    ),
  );

  // (4) Compute the test verdicts.
  const unique = new Set(numbers).size === numbers.length;
  const seqs = numbers
    .map((s) => parseInt(s.split("/")[1] ?? "0", 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const gapFree =
    seqs.length === numbers.length &&
    seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);

  return NextResponse.json({
    numbers,
    unique,
    gap_free: gapFree,
    workspace_id: ws.id,
    year,
  });
}

export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const nRaw = url.searchParams.get("n") ?? "5";
  const nParsed = parseInt(nRaw, 10);
  const n = Number.isFinite(nParsed) && nParsed > 0 && nParsed <= 20
    ? nParsed
    : 5;

  try {
    return await runConcurrentFinalize(n);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "unhandled", message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  // POST is an alias for GET — convenience for clients that prefer it.
  return GET(request);
}
