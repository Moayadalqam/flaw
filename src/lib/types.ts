/**
 * Hand-rolled DB row types for Lex.
 *
 * These mirror the public schema (see `supabase/migrations/20260513000001_schema.sql`)
 * for the tables surfaced in Phase 2 — `clients` and `matters`. Hand-rolling
 * instead of running `npx supabase gen types` keeps the demo dependency
 * surface small; we promote to generated types when the schema starts moving
 * faster than the UI.
 *
 * Note on `matters.status`: the column is `TEXT NOT NULL DEFAULT 'open'` in
 * the migration (no Postgres enum). The seed only uses `'open'`. We model the
 * three states the product surfaces today — `open`, `on_hold`, `closed` — and
 * rely on a CHECK-style guard at the Server Action (Zod enum) since the DB
 * accepts any string.
 */

export type PreferredLanguage = "el" | "en";

export type MatterStatus = "open" | "on_hold" | "closed";

export interface ClientRow {
  id: string;
  workspace_id: string;
  name_el: string;
  name_en: string;
  vat_number: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  preferred_language: PreferredLanguage;
  created_at: string;
}

export interface MatterRow {
  id: string;
  workspace_id: string;
  client_id: string;
  matter_number: string;
  title: string;
  matter_type: string;
  status: MatterStatus;
  default_hourly_rate: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
}

/**
 * A `MatterRow` joined with the minimum Client fields needed for the Cases
 * list display (the joined client name). Supabase's `select('*, clients(...)')`
 * returns the joined relation as a nested object keyed by the FK target
 * relation name.
 */
export interface MatterWithClient extends MatterRow {
  clients: Pick<ClientRow, "name_el" | "name_en"> | null;
}

// ---------------------------------------------------------------------------
// Invoices / Line Items / Receipts
// ---------------------------------------------------------------------------
// `invoice_number` is NULL on `status='draft'` and NON-NULL on all other
// statuses (Cyprus VAT gap-free invariant — enforced by a CHECK constraint
// in Migration 001). Allocation happens via `allocate_invoice_number()`
// (Migration 003) inside `finalizeInvoiceAction`.
//
// Money columns are NUMERIC(12,2) in Postgres. The JS driver returns
// NUMERIC values as `string` to preserve precision — never `number`. Call
// `Number(...)` (or `parseFloat(...)`) only at the formatting seam.
// ---------------------------------------------------------------------------

export type InvoiceStatus =
  | "draft"
  | "finalized"
  | "sent"
  | "paid"
  | "void";

export type LineItemKind = "service" | "disbursement" | "expense";

export interface InvoiceRow {
  id: string;
  workspace_id: string;
  client_id: string;
  matter_id: string;
  invoice_number: string | null;
  invoice_year: number | null;
  status: InvoiceStatus;
  issued_at: string | null;
  due_at: string | null;
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total: string;
  currency: string;
  notes: string | null;
  language: PreferredLanguage;
  created_by_ai: boolean;
  created_at: string;
  finalized_at: string | null;
  finalized_by_user_id: string | null;
}

/**
 * Invoice list row — invoice joined with the bare-minimum client + matter
 * fields needed to render the list view (client name in both locales, matter
 * number + title). Mirrors Supabase nested-relation shape.
 */
export interface InvoiceWithRelations extends InvoiceRow {
  clients: Pick<ClientRow, "name_el" | "name_en"> | null;
  matters: Pick<MatterRow, "matter_number" | "title"> | null;
}

export interface LineItemRow {
  id: string;
  invoice_id: string;
  workspace_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  vat_rate: string;
  position: number;
  kind: string;
  created_at: string;
}

export interface ReceiptRow {
  id: string;
  workspace_id: string;
  invoice_id: string;
  receipt_number: string;
  receipt_year: number;
  paid_at: string;
  amount: string;
  payment_method: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Retainers / Trust Ledger
// ---------------------------------------------------------------------------
// `retainers` and `trust_ledger` are the two tables that back REQ-008
// (retainer agreements with running balance) and REQ-010 (trust ledger
// separation from revenue). They are tied together by the SECURITY DEFINER
// stored procedure `create_retainer_with_deposit` — see Migration 008 — which
// is the only legitimate way to insert a `retainer` row in production code
// (it also writes the matching `trust_ledger` deposit row atomically).
//
// `trust_ledger` is append-only (RLS has SELECT + INSERT only; UPDATE/DELETE
// blocked at trigger layer — Migration 002). Corrections happen via inserting
// a new row with `entry_kind='reversal'` and `corrects_entry_id` pointing at
// the original. The five `trust_entry_kind` values mirror Migration 001
// line 42.
//
// Money columns are NUMERIC(12,2) in Postgres — the JS driver returns them
// as `string` to preserve precision. Convert at the formatting seam only.
// ---------------------------------------------------------------------------

export type RetainerStatus = "active" | "depleted" | "closed";

export type TrustEntryKind =
  | "deposit"
  | "fee_transfer"
  | "refund"
  | "disbursement"
  | "reversal";

export interface RetainerRow {
  id: string;
  workspace_id: string;
  client_id: string;
  matter_id: string | null;
  agreement_number: string;
  deposit_amount: string;
  currency: string;
  status: RetainerStatus;
  signed_at: string;
  terms: string | null;
  created_at: string;
}

export interface TrustLedgerRow {
  id: string;
  workspace_id: string;
  client_id: string;
  matter_id: string | null;
  entry_kind: TrustEntryKind;
  debit_amount: string;
  credit_amount: string;
  currency: string;
  description: string;
  related_invoice_id: string | null;
  related_retainer_id: string | null;
  corrects_entry_id: string | null;
  occurred_at: string;
  created_at: string;
  created_by_user_id: string | null;
}

/**
 * A `RetainerRow` joined with the minimum client + matter fields needed for
 * list/detail rendering, plus a computed `balance` (string-encoded NUMERIC
 * from a `SUM(debit_amount) - SUM(credit_amount)` over `trust_ledger`
 * filtered to the same client). The balance is computed server-side per
 * card, not stored on the retainer row — keeping the trust ledger as the
 * single source of truth.
 */
export interface RetainerWithRelations extends RetainerRow {
  clients: Pick<ClientRow, "name_el" | "name_en"> | null;
  matters: Pick<MatterRow, "matter_number" | "title"> | null;
  balance: string;
}

// ---------------------------------------------------------------------------
// Quotations / Quotation Line Items
// ---------------------------------------------------------------------------
// Quotations are pre-engagement estimates. Numbering allows GAPS (unlike
// invoices, which Cyprus VAT law mandates be gap-free). `quotation_number` is
// NULL on draft and allocated via COUNT(*)+1 per (workspace, year) on
// `markSentAction`, formatted `Q-YYYY/NNNN`.
//
// Schema audit (supabase/migrations/20260513000001_schema.sql lines 181–198):
// the base migration provides ONLY the `quotations` row (header + totals).
// Migration `20260513000007_convert_quotation_to_invoice.sql` (Phase 4 Task 1)
// adds:
//   - public.quotation_line_items table mirroring `invoice_line_items` shape
//   - SECURITY DEFINER SP convert_quotation_to_invoice(p_quotation_id UUID)
//     that copies the quotation + its line items to a new draft invoice in one
//     transaction, then marks the source quotation `accepted` with
//     converted_invoice_id pointing at the new invoice.
// ---------------------------------------------------------------------------

export type QuotationStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export interface QuotationRow {
  id: string;
  workspace_id: string;
  client_id: string;
  matter_id: string | null;
  quotation_number: string | null;
  quotation_year: number | null;
  status: QuotationStatus;
  subtotal: string;
  vat_amount: string;
  total: string;
  issued_at: string | null;
  valid_until: string | null;
  converted_invoice_id: string | null;
  language: PreferredLanguage;
  notes: string | null;
  created_at: string;
}

export interface QuotationLineItemRow {
  id: string;
  quotation_id: string;
  workspace_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  vat_rate: string;
  position: number;
  kind: string;
  created_at: string;
}

/**
 * Quotation list row — quotation joined with the bare-minimum client + matter
 * fields needed to render the list view (client name in both locales, matter
 * number + title). Mirrors the `InvoiceWithRelations` pattern.
 *
 * Unlike invoices, `matter_id` is nullable on quotations (a lawyer may quote
 * before a matter is opened), so the `matters` joined relation is also
 * nullable on the joined shape.
 */
export interface QuotationWithRelations extends QuotationRow {
  clients: Pick<ClientRow, "name_el" | "name_en"> | null;
  matters: Pick<MatterRow, "matter_number" | "title"> | null;
}
