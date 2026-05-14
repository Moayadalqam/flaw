import "server-only";

// invoices-only query. NEVER join the fiduciary ledger or retainer-deposit
// relations here — trust-isolation invariant grep-verified.
//
// Aging report query layer (Phase 6 Task 4 / REQ-016 / REP-02).
//
// Hard rule (trust-isolation invariant): the aging surface reports on
// OPERATING-REVENUE invoices only. Client funds — even if overdue from the
// lawyer's perspective in some accounting sense — are NEVER mixed into this
// surface. Mixing the two is a Cyprus-Bar disbarment-grade offence. The
// builder verifier greps this directory for any fiduciary-ledger reference
// and hard-blocks the commit. Mirrors the isolation pattern declared in
// `supabase/migrations/20260513000001_schema.sql:241-280` and enforced at
// RLS layer in `20260513000002_rls.sql:351-397`.
//
// Single SELECT, RLS auto-scoped via the user-scoped Supabase client passed
// in by the caller. Server-side compute of `days_overdue` + bucket
// classification — postgres returns plain rows, JS does the bucket maths so
// the bucket-boundary policy is owned in one place and easy to audit.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClientRow,
  InvoiceRow,
  MatterRow,
  PreferredLanguage,
} from "@/lib/types";

/**
 * The bucket policy:
 *   '0-30'  : 1 ≤ days_overdue ≤ 30   (the `.lt('due_at', today)` filter
 *             excludes today-exactly, so `days_overdue >= 1` is implied.)
 *   '31-60' : 31 ≤ days_overdue ≤ 60
 *   '60+'   : days_overdue ≥ 61       (strict `> 60`; "60+" is the column
 *             label, the bucket itself is "61 and beyond".)
 */
export type AgingBucket = "0-30" | "31-60" | "60+";

/**
 * Row shape returned to the page + the AgingTable client component. All
 * money columns stay as the string form Postgres returns (NUMERIC(12,2));
 * formatting happens at the render seam via `formatMoney(Number(total))`.
 * `days_overdue` is the pure JS-computed integer.
 */
export interface OverdueInvoice {
  id: string;
  invoice_number: string;
  client_id: string;
  client_name_el: string;
  client_name_en: string;
  client_email: string | null;
  client_preferred_language: PreferredLanguage;
  matter_number: string;
  matter_title: string;
  total: string;
  currency: string;
  due_at: string;
  days_overdue: number;
  bucket: AgingBucket;
}

// Postgrest-joined row shape — narrow projection of the SELECT.
interface OverdueRowRaw
  extends Pick<
    InvoiceRow,
    | "id"
    | "invoice_number"
    | "total"
    | "currency"
    | "due_at"
    | "status"
    | "client_id"
    | "matter_id"
  > {
  clients: Pick<
    ClientRow,
    "name_el" | "name_en" | "email" | "preferred_language"
  > | null;
  matters: Pick<MatterRow, "matter_number" | "title"> | null;
}

function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

/**
 * Single RLS-scoped SELECT returning the workspace's overdue finalized /
 * sent invoices, joined with the minimum client + matter fields needed for
 * rendering. Computes `days_overdue` and `bucket` in JS — Postgres returns
 * the raw `due_at` date and we do the maths in one place.
 *
 * The query is filtered to `status IN ('finalized', 'sent')`. Drafts never
 * have a `due_at` set in practice (the form path) and have no
 * `invoice_number`, so they would fail the downstream send guard rails
 * anyway. Paid + void invoices are out of scope by definition.
 *
 * Rows missing the joined relations (`!inner`) cannot appear — both joins
 * are on NOT NULL foreign keys (see Migration 001 lines 114-115). The null
 * guard on `clients` / `matters` is defensive — Postgres should never
 * return a row with a null joined relation here.
 */
export async function getOverdueInvoices(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<OverdueInvoice[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, total, currency, due_at, status, client_id, matter_id, clients!inner(name_el, name_en, email, preferred_language), matters!inner(matter_number, title)",
    )
    .eq("workspace_id", workspaceId)
    .in("status", ["finalized", "sent"])
    .lt("due_at", today)
    .order("due_at", { ascending: true })
    .returns<OverdueRowRaw[]>();

  if (!data) return [];

  const now = Date.now();
  const rows: OverdueInvoice[] = [];
  for (const r of data) {
    // Defence-in-depth: skip rows that somehow slipped past the inner
    // joins or have a NULL invoice_number. Cyprus VAT invariant says
    // non-draft invoices always have a number, but a row without one
    // cannot be sent or reminded anyway.
    if (!r.clients || !r.matters || !r.invoice_number || !r.due_at) continue;

    const daysOverdue = Math.floor(
      (now - new Date(r.due_at).getTime()) / 86_400_000,
    );

    rows.push({
      id: r.id,
      invoice_number: r.invoice_number,
      client_id: r.client_id,
      client_name_el: r.clients.name_el,
      client_name_en: r.clients.name_en,
      client_email: r.clients.email,
      client_preferred_language: r.clients.preferred_language,
      matter_number: r.matters.matter_number,
      matter_title: r.matters.title,
      total: r.total,
      currency: r.currency,
      due_at: r.due_at,
      days_overdue: daysOverdue,
      bucket: bucketFor(daysOverdue),
    });
  }

  // Sort by days_overdue DESC (worst-first) — matches the plan and is the
  // ordering the user expects when scanning the page.
  rows.sort((a, b) => b.days_overdue - a.days_overdue);
  return rows;
}
