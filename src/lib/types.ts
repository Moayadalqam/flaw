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
