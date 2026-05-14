/**
 * NL workspace-query handler — Lex's "ask the workspace" path.
 *
 * Phase 5 hard rule: NO AI-generated SQL. We pre-aggregate the workspace
 * summary server-side via RLS-scoped SELECTs, hand the aggregates to
 * OpenRouter, and the model writes prose only. This eliminates the entire
 * SQL-injection / RLS-bypass attack class — the model never touches the DB,
 * never sees raw rows, never generates a query string.
 *
 * What gets sent to the model:
 *   - counts of invoices by status (draft/finalized/sent/paid/void)
 *   - sums of invoice totals by status (string-encoded, two decimals)
 *   - top 10 most-recent invoices: number, client name, total, status,
 *     issued/due dates, computed days_overdue
 *
 * What NEVER gets sent:
 *   - raw client PII (emails, addresses, VAT numbers) — the model only
 *     receives the display name
 *   - fiduciary ledger rows / retainer balances / banking details —
 *     explicitly forbidden by the system prompt AND not selected here in
 *     the first place
 *   - service-role queries — the caller passes an RLS-scoped client; this
 *     module has no service-role import
 *
 * The caller (Server Action `aiQueryAction`) handles auth + workspace
 * scoping. This function is pure-ish: it takes a user-scoped client and
 * does only SELECTs. No writes, no mutations, no side effects.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callOpenRouter } from "./client";
import type { CallResult, WorkspaceSummary } from "./types";
import type { ClientRow, InvoiceRow, InvoiceStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants — known invoice statuses for typed bucketing.
// ---------------------------------------------------------------------------

const ALL_STATUSES: InvoiceStatus[] = [
  "draft",
  "finalized",
  "sent",
  "paid",
  "void",
];

// ---------------------------------------------------------------------------
// Local types — narrow shapes for the SELECT rows we read.
// ---------------------------------------------------------------------------

type StatusRow = Pick<InvoiceRow, "status">;
type StatusTotalRow = Pick<InvoiceRow, "status" | "total">;

interface RecentInvoiceRow {
  invoice_number: string | null;
  total: string;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  clients: Pick<ClientRow, "name_el" | "name_en"> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusBuckets<T> = {
  draft: T;
  finalized: T;
  sent: T;
  paid: T;
  void: T;
};

function emptyStatusBuckets<T>(zero: T): StatusBuckets<T> {
  return {
    draft: zero,
    finalized: zero,
    sent: zero,
    paid: zero,
    void: zero,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `days_overdue = max(0, today - due_at)`.
 *
 * Computed in JS — we get `due_at` as `YYYY-MM-DD` from Postgres and parse
 * via `Date.UTC` to dodge timezone drift. Paid/void invoices are not
 * actually overdue, but we still surface the integer so the model has
 * full context; the prompt instructs it to ignore overdue counts on
 * non-open statuses if the user asks.
 */
function computeDaysOverdue(dueAt: string | null): number {
  if (!dueAt) return 0;
  const m = dueAt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const due = Date.UTC(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
  );
  const t = todayIso().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!t) return 0;
  const today = Date.UTC(
    parseInt(t[1], 10),
    parseInt(t[2], 10) - 1,
    parseInt(t[3], 10),
  );
  const days = Math.floor((today - due) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

// ---------------------------------------------------------------------------
// Public entry — answerWorkspaceQuestion
// ---------------------------------------------------------------------------

/**
 * Build the workspace summary, call OpenRouter, return prose answer.
 *
 * The supabase client passed in MUST be user-scoped (`createClient()` from
 * `@/lib/supabase/server`). Workspace isolation is RLS — every SELECT here
 * runs `as authenticated`, the policies filter to the caller's workspace.
 */
export async function answerWorkspaceQuestion(
  nlText: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
): Promise<CallResult<"query">> {
  // ─── 1. Build summary in parallel ─────────────────────────────────────
  // Three independent SELECTs — issued in parallel via Promise.all so we
  // pay one round-trip's worth of latency, not three. RLS auto-scopes
  // every SELECT to the caller's workspace.
  const [statusRowsRes, statusTotalRowsRes, recentRowsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("status")
      .returns<StatusRow[]>(),
    supabase
      .from("invoices")
      .select("status, total")
      .returns<StatusTotalRow[]>(),
    supabase
      .from("invoices")
      .select(
        "invoice_number, total, status, issued_at, due_at, clients(name_el, name_en)",
      )
      .order("issued_at", { ascending: false, nullsFirst: false })
      .limit(10)
      .returns<RecentInvoiceRow[]>(),
  ]);

  const statusRows = statusRowsRes.data ?? [];
  const statusTotalRows = statusTotalRowsRes.data ?? [];
  const recentRows = recentRowsRes.data ?? [];

  // ─── 2. Bucket counts ─────────────────────────────────────────────────
  const counts = emptyStatusBuckets(0);
  for (const row of statusRows) {
    if (ALL_STATUSES.includes(row.status)) {
      counts[row.status] += 1;
    }
  }

  // ─── 3. Bucket totals (parseFloat + toFixed for clean strings) ────────
  const totalsNum = emptyStatusBuckets(0);
  for (const row of statusTotalRows) {
    if (!ALL_STATUSES.includes(row.status)) continue;
    const n = parseFloat(row.total);
    if (Number.isFinite(n)) totalsNum[row.status] += n;
  }
  const totals: WorkspaceSummary["totals_by_status"] = {
    draft: totalsNum.draft.toFixed(2),
    finalized: totalsNum.finalized.toFixed(2),
    sent: totalsNum.sent.toFixed(2),
    paid: totalsNum.paid.toFixed(2),
    void: totalsNum.void.toFixed(2),
  };

  // ─── 4. Top-10 recent invoices ────────────────────────────────────────
  const recent_invoices: WorkspaceSummary["recent_invoices"] = recentRows.map(
    (row) => ({
      invoice_number: row.invoice_number,
      // Prefer Greek name (firm's default locale is el-CY); fall back to
      // English. If both are blank the model gets an empty string — the
      // system prompt tells it to use only names that appear in the data,
      // so a blank name is self-suppressing.
      client_name:
        row.clients?.name_el ?? row.clients?.name_en ?? "",
      total: row.total,
      status: row.status,
      issued_at: row.issued_at,
      due_at: row.due_at,
      days_overdue: computeDaysOverdue(row.due_at),
    }),
  );

  const workspaceSummary: WorkspaceSummary = {
    counts_by_status: counts,
    totals_by_status: totals,
    recent_invoices,
  };

  // ─── 5. Call OpenRouter — prose only, no structured output ────────────
  return callOpenRouter({
    kind: "query",
    text: nlText,
    contextData: { workspaceSummary },
  });
}
