// =============================================================================
// Monthly summary queries — INVOICES TABLE ONLY (trust-isolation invariant)
// =============================================================================
// This module references the `invoices` table only. The trust-isolation
// invariant is the load-bearing compliance claim of Phase 6 and is grep-
// verified in the phase verification step (the dedicated client-funds ledger
// table and the retainer-deposits column must never be referenced from this
// directory). Client funds must NEVER appear in revenue figures. Mixing
// client funds with operating revenue is a disbarment-grade offense in
// Cyprus.
//
// Schema audit (supabase/migrations/20260513000001_schema.sql lines 111–140):
//   * `invoices.status`        — enum: draft, finalized, sent, paid, void
//   * `invoices.total`         — NUMERIC(12,2), returned as string by PostgREST
//   * `invoices.issued_at`     — DATE, nullable
//   * `invoices.due_at`        — DATE, nullable
//   * `invoices.finalized_at`  — TIMESTAMPTZ, nullable
//
// NOTE: there is NO `paid_at` column on `invoices`. The schema records the
// payment date on `receipts.paid_at`, but we cannot join `receipts` here
// without expanding the table surface of this module. As documented in the
// phase-6 plan (line 191), we use `finalized_at` as the revenue-recognition
// proxy: a paid invoice was finalized in the month of recognition. For the
// pitch demo this is precise enough — the seed payload paid invoices in the
// same month they were finalized.
// =============================================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toMoney } from "@/lib/totals";

export interface ByCaseRow {
  matter_id: string;
  matter_number: string;
  title: string;
  total: string;
}

export interface ByClientRow {
  client_id: string;
  name_el: string;
  name_en: string;
  total: string;
}

export interface MonthlySummary {
  totalRevenue: string;
  outstanding: string;
  overdue: string;
  byCase: ByCaseRow[];
  byClient: ByClientRow[];
}

/**
 * ISO date (YYYY-MM-DD) for the first day of the given month boundary.
 * `month` is 1-indexed (1 = January). Used to filter DATE columns
 * (`issued_at`, `due_at`, `finalized_at::date`) — passing full ISO timestamps
 * would force PostgREST into an implicit cast.
 */
function isoDate(year: number, monthZeroIndexed: number, day: number): string {
  return new Date(Date.UTC(year, monthZeroIndexed, day))
    .toISOString()
    .slice(0, 10);
}

interface RevenueRow {
  total: string | null;
}

interface BreakdownRow {
  matter_id: string | null;
  client_id: string | null;
  total: string | null;
  matters: { matter_number: string; title: string } | null;
  clients: { name_el: string; name_en: string } | null;
}

/**
 * Sum a list of NUMERIC-as-string `total` values. Returns a JS number that
 * the caller passes through `toMoney` to round to 2dp. We never accumulate
 * fractional cents — `roundCents` is applied at the boundary in `toMoney`.
 */
function sumTotals(rows: { total: string | null }[] | null): number {
  if (!rows) return 0;
  return rows.reduce((sum, row) => {
    const n = parseFloat(row.total ?? "0");
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/**
 * Compute the monthly summary for one workspace. Every query is rooted in
 * `invoices`. The optional explicit `.eq('workspace_id', workspaceId)` filter
 * is defense-in-depth on top of RLS — RLS already scopes every invoice query
 * to the calling user's workspace via the policy in Migration 002.
 *
 * @param client       authenticated user-scoped Supabase client
 * @param workspaceId  workspace UUID (defense-in-depth filter)
 * @param year         four-digit year, e.g. 2026
 * @param month        1-indexed month, 1 = January
 */
export async function getMonthlySummary(
  client: SupabaseClient,
  workspaceId: string,
  year: number,
  month: number,
): Promise<MonthlySummary> {
  // Month boundaries as ISO DATE strings. `monthStart` is inclusive, `monthEnd`
  // is exclusive (lt). `today` is the cutoff for the "overdue" filter.
  const monthStart = isoDate(year, month - 1, 1);
  const monthEnd = isoDate(year, month, 1);
  const today = new Date().toISOString().slice(0, 10);

  // ---------------------------------------------------------------------------
  // 1. Total revenue — invoices paid this month.
  //    `paid_at` does not exist on the schema (see header note); we use
  //    `finalized_at` as the recognition proxy. `finalized_at` is TIMESTAMPTZ,
  //    so we filter with full ISO timestamps for the month boundary.
  // ---------------------------------------------------------------------------
  const monthStartTs = `${monthStart}T00:00:00Z`;
  const monthEndTs = `${monthEnd}T00:00:00Z`;

  const revenueRes = await client
    .from("invoices")
    .select("total")
    .eq("workspace_id", workspaceId)
    .eq("status", "paid")
    .gte("finalized_at", monthStartTs)
    .lt("finalized_at", monthEndTs)
    .returns<RevenueRow[]>();

  const totalRevenueNum = sumTotals(revenueRes.data);

  // ---------------------------------------------------------------------------
  // 2. Outstanding — finalized OR sent invoices issued this month.
  //    `issued_at` is a DATE — ISO date strings only.
  // ---------------------------------------------------------------------------
  const outstandingRes = await client
    .from("invoices")
    .select("total")
    .eq("workspace_id", workspaceId)
    .in("status", ["finalized", "sent"])
    .gte("issued_at", monthStart)
    .lt("issued_at", monthEnd)
    .returns<RevenueRow[]>();

  const outstandingNum = sumTotals(outstandingRes.data);

  // ---------------------------------------------------------------------------
  // 3. Overdue — finalized OR sent invoices with due_at strictly before today.
  //    Not month-scoped — overdue is a live snapshot at the moment of viewing.
  // ---------------------------------------------------------------------------
  const overdueRes = await client
    .from("invoices")
    .select("total")
    .eq("workspace_id", workspaceId)
    .in("status", ["finalized", "sent"])
    .lt("due_at", today)
    .returns<RevenueRow[]>();

  const overdueNum = sumTotals(overdueRes.data);

  // ---------------------------------------------------------------------------
  // 4. Breakdown — every non-draft invoice issued this month, grouped in JS by
  //    matter_id (by case) and client_id (by client). PostgREST has no GROUP BY
  //    operator; aggregation in JS via a Map is the idiomatic supabase-js v2
  //    pattern at this scale.
  // ---------------------------------------------------------------------------
  const breakdownRes = await client
    .from("invoices")
    .select(
      "matter_id, client_id, total, matters!inner(matter_number, title), clients!inner(name_el, name_en)",
    )
    .eq("workspace_id", workspaceId)
    .in("status", ["paid", "finalized", "sent"])
    .gte("issued_at", monthStart)
    .lt("issued_at", monthEnd)
    .returns<BreakdownRow[]>();

  const byCaseMap = new Map<
    string,
    { matter_number: string; title: string; sum: number }
  >();
  const byClientMap = new Map<
    string,
    { name_el: string; name_en: string; sum: number }
  >();

  for (const row of breakdownRes.data ?? []) {
    const lineTotal = parseFloat(row.total ?? "0");
    if (!Number.isFinite(lineTotal)) continue;

    if (row.matter_id && row.matters) {
      const existing = byCaseMap.get(row.matter_id);
      if (existing) {
        existing.sum += lineTotal;
      } else {
        byCaseMap.set(row.matter_id, {
          matter_number: row.matters.matter_number,
          title: row.matters.title,
          sum: lineTotal,
        });
      }
    }

    if (row.client_id && row.clients) {
      const existing = byClientMap.get(row.client_id);
      if (existing) {
        existing.sum += lineTotal;
      } else {
        byClientMap.set(row.client_id, {
          name_el: row.clients.name_el,
          name_en: row.clients.name_en,
          sum: lineTotal,
        });
      }
    }
  }

  const byCase: ByCaseRow[] = Array.from(byCaseMap.entries())
    .map(([matter_id, v]) => ({
      matter_id,
      matter_number: v.matter_number,
      title: v.title,
      total: toMoney(v.sum),
    }))
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

  const byClient: ByClientRow[] = Array.from(byClientMap.entries())
    .map(([client_id, v]) => ({
      client_id,
      name_el: v.name_el,
      name_en: v.name_en,
      total: toMoney(v.sum),
    }))
    .sort((a, b) => parseFloat(b.total) - parseFloat(a.total));

  return {
    totalRevenue: toMoney(totalRevenueNum),
    outstanding: toMoney(outstandingNum),
    overdue: toMoney(overdueNum),
    byCase,
    byClient,
  };
}
