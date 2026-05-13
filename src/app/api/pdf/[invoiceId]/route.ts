/**
 * PDF Route Handler — `GET /api/pdf/[invoiceId]`
 *
 * Streams a `@react-pdf/renderer`-rendered invoice PDF for the authenticated
 * user's workspace. Node runtime (NOT Edge) because the adapter resolves bundled
 * font files via `path.join(process.cwd(), "public/fonts/...")` and the
 * `@react-pdf/renderer` engine uses `fs.readFileSync` to load them — neither
 * is available in the Edge runtime. (See `src/lib/pdf/adapter.ts` head comment
 * and `.planning/research/SUMMARY.md §Phase 3` Risk 4.)
 *
 * Security model (defense in depth):
 *   1. `createClient()` from `@/lib/supabase/server` reads the user's session
 *      from cookies — anonymous users get no rows back from any subsequent
 *      SELECT. If `auth.getUser()` returns null, we return 401 without ever
 *      hitting application tables.
 *   2. RLS on `workspaces`, `invoices`, `invoice_line_items` and `clients`
 *      (Migration 002) scopes every read to `auth.uid() = workspaces.owner_user_id`
 *      transitively. A row from another workspace is invisible — the query
 *      returns 0 rows, which we translate to 404 (never 500).
 *   3. We additionally apply an explicit `.eq('workspace_id', ws.id)` filter
 *      on the invoice fetch. Per Phase 1 adversarial review: RLS is the wall,
 *      this filter is the second lock. If RLS were ever disabled by mistake
 *      (migration regression), the filter still scopes the read.
 *   4. NO privileged Supabase key is read or used here. The route is a normal
 *      authenticated read path — not a backend bridge with elevated rights.
 *
 * Streaming: `renderInvoicePDF` returns a Node `ReadableStream`. We pipe it
 * straight to the `Response` body — never `Buffer.concat`, never `await
 * stream.toArray()`. Cold-start budget on Vercel Pro is 60s; buffering a
 * multi-page PDF would burn most of it. The browser starts displaying the
 * PDF as bytes arrive.
 *
 * Workspace branding (`template_settings`) — Migration 006 (Task 6) adds
 * `workspaces.template_settings JSONB` with `logo_data_url`, `footer_text`,
 * `accent_hex`. This handler ships BEFORE that migration lands, so we read
 * the column defensively: `workspace.template_settings ?? {}` with `??` on
 * each nested key. If the column is missing entirely (TypeScript can't see
 * a schema we haven't generated yet), the `??` chain returns null and the
 * template renders with the design-token defaults from `LexPdfTokens`.
 */

import type { LexPdfInput } from "@/lib/pdf/adapter";
import { renderInvoicePDF } from "@/lib/pdf/adapter";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { LexLocale } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UUID shape (any version) — invoice ids are `gen_random_uuid()` from Postgres
// in production AND deterministic placeholder UUIDs from seed.sql (version
// nibble `0`) in dev/seed. We accept any UUID-shaped string to avoid rejecting
// the seed-data ids in dev/smoke tests. The Supabase fetch is workspace-scoped
// via RLS — invalid ids return null and we 404.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Locale guard: the workspace.invoice.language column ships as `'el' | 'en'`
// (Postgres enum `preferred_language`), but the PDF template + format.ts
// surface speaks `LexLocale = "el-CY" | "en-CY"`. This bridges the two.
function toLexLocale(value: string | null | undefined): LexLocale {
  if (value === "en-CY" || value === "en") return "en-CY";
  return "el-CY";
}

// The Supabase response shape isn't typed (we don't run `supabase gen types`
// yet — see lib/types.ts head comment). We type the rows we touch locally so
// the handler stays type-safe at the seam without leaking `any` outward.
interface WorkspaceRow {
  id: string;
  name: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
  // Migration 006 (Task 6) will add this column. Until then it's undefined at
  // runtime; the optional + `??` chain handles both cases without crashing.
  template_settings?: {
    logo_data_url?: string | null;
    footer_text?: string | null;
    accent_hex?: string | null;
  } | null;
}

interface InvoiceClientRow {
  name_el: string;
  name_en: string;
  vat_number: string | null;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  preferred_language: "el" | "en";
}

interface InvoiceRow {
  id: string;
  workspace_id: string;
  invoice_number: string | null;
  invoice_year: number | null;
  status: "draft" | "finalized" | "sent" | "paid" | "void";
  issued_at: string | null;
  due_at: string | null;
  subtotal: string | number;
  vat_rate: string | number;
  vat_amount: string | number;
  total: string | number;
  currency: string;
  notes: string | null;
  language: "el" | "en";
  clients: InvoiceClientRow | null;
}

interface LineItemRow {
  description: string;
  quantity: string | number;
  unit_price: string | number;
  line_total: string | number;
  vat_rate: string | number;
  position: number;
  kind: string;
}

// Postgres `NUMERIC` columns arrive as strings over PostgREST to preserve
// precision. The PDF surface wants plain numbers (Intl.NumberFormat handles
// them natively). This coercion is the only place strings → numbers in this
// route — keeping it local makes the data-flow auditable.
function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
): Promise<Response> {
  const { invoiceId } = await params;

  if (!UUID_RE.test(invoiceId)) {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = await createClient();

  // Step 1 — verify session. RLS would deny reads anyway, but an unauthenticated
  // request deserves a clear 401, not "your invoice was not found".
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Step 2 — resolve the caller's workspace. There is exactly one row per user
  // (workspaces.owner_user_id UNIQUE — see Migration 001). If RLS hides it OR
  // the user genuinely has no workspace, treat as 404.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, vat_number, tax_id, iban, template_settings")
    .eq("owner_user_id", user.id)
    .maybeSingle<WorkspaceRow>();
  if (!workspace) {
    return new Response("Not Found", { status: 404 });
  }

  // Step 3 — fetch the invoice with its client joined. `.eq('workspace_id',
  // workspace.id)` is the defense-in-depth filter — RLS scopes this too, but
  // we don't trust a single layer for tenant isolation. `maybeSingle` returns
  // null instead of throwing on 0 rows, which is the desired 404 path.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, workspace_id, invoice_number, invoice_year, status, issued_at, due_at, subtotal, vat_rate, vat_amount, total, currency, notes, language, clients(name_el, name_en, vat_number, tax_id, address, email, preferred_language)",
    )
    .eq("id", invoiceId)
    .eq("workspace_id", workspace.id)
    .maybeSingle<InvoiceRow>();
  if (invoiceError || !invoice || !invoice.clients) {
    if (invoiceError) {
      console.error("pdf.invoice_query", invoiceError.code, invoiceError.message);
    }
    return new Response("Not Found", { status: 404 });
  }

  // Step 4 — fetch line items ordered by `position`. A finalized invoice can
  // legally have zero line items (e.g. a manual fee adjustment), so 0 rows is
  // not an error — render an empty table.
  const { data: lineItemRows, error: lineItemError } = await supabase
    .from("invoice_line_items")
    .select("description, quantity, unit_price, line_total, vat_rate, position, kind")
    .eq("invoice_id", invoice.id)
    .order("position", { ascending: true });
  if (lineItemError) {
    console.error(
      "pdf.line_items_query",
      lineItemError.code,
      lineItemError.message,
    );
    return new Response("Internal Server Error", { status: 500 });
  }
  const lineItems = (lineItemRows ?? []) as LineItemRow[];

  // Step 5 — resolve locale. Priority: invoice.language (the lawyer chose this
  // explicitly per invoice in the new-invoice form) → cookie locale via
  // next-intl → default `el-CY`. The PDF MUST match the language the lawyer
  // selected for the document, not the language of the browser viewing it.
  const cookieLocale = await getLocale().catch(() => "el-CY");
  const locale: LexLocale = invoice.language
    ? toLexLocale(invoice.language)
    : toLexLocale(cookieLocale);

  // Step 6 — assemble the typed input contract the adapter expects. Reading
  // template_settings defensively — the column may not exist until Migration
  // 006 (Task 6) ships. Each nested key falls back to null, which the template
  // already handles (no logo, default footer, default accent).
  const branding = workspace.template_settings ?? null;
  const payload: LexPdfInput = {
    workspace: {
      name: workspace.name,
      vat_number: workspace.vat_number,
      tax_id: workspace.tax_id,
      iban: workspace.iban,
      accent_hex: branding?.accent_hex ?? null,
      logo_data_url: branding?.logo_data_url ?? null,
      footer_text: branding?.footer_text ?? null,
    },
    client: {
      name_el: invoice.clients.name_el,
      name_en: invoice.clients.name_en,
      vat_number: invoice.clients.vat_number,
      tax_id: invoice.clients.tax_id,
      address: invoice.clients.address,
      email: invoice.clients.email,
      preferred_language: invoice.clients.preferred_language,
    },
    invoice: {
      invoice_number: invoice.invoice_number,
      invoice_year: invoice.invoice_year,
      issued_at: invoice.issued_at,
      due_at: invoice.due_at,
      subtotal: toNumber(invoice.subtotal),
      vat_rate: toNumber(invoice.vat_rate),
      vat_amount: toNumber(invoice.vat_amount),
      total: toNumber(invoice.total),
      currency: invoice.currency,
      notes: invoice.notes,
      language: invoice.language,
    },
    lineItems: lineItems.map((row) => ({
      description: row.description,
      quantity: toNumber(row.quantity),
      unit_price: toNumber(row.unit_price),
      line_total: toNumber(row.line_total),
      vat_rate: toNumber(row.vat_rate),
      position: row.position,
      kind: row.kind,
    })),
    locale,
    draft: invoice.status === "draft",
  };

  // Step 7 — render. The adapter returns a Node `ReadableStream`; we hand the
  // raw stream to the `Response` constructor. Modern Node + Next.js accept
  // Node streams as a body init; the runtime adapts them to a Web stream
  // internally. This is the only place a cast is needed — the public surface
  // of `renderInvoicePDF` is intentionally `NodeJS.ReadableStream` (see
  // adapter.ts), not `ReadableStream<Uint8Array>`.
  let pdfStream: NodeJS.ReadableStream;
  try {
    pdfStream = await renderInvoicePDF(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("pdf.render_failed", message);
    return new Response("Internal Server Error", { status: 500 });
  }

  const filenameSuffix = invoice.invoice_number ?? invoice.id;
  return new Response(pdfStream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${filenameSuffix}.pdf"`,
      // `no-store` because draft contents change between requests and a stale
      // CDN copy showing pre-finalize totals after a revert would be a
      // compliance hazard. `private` keeps shared caches off the path entirely.
      "Cache-Control": "private, no-store",
    },
  });
}
