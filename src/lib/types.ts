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
