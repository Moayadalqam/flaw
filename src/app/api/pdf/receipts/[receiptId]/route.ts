/**
 * PDF Route Handler — `GET /api/pdf/receipts/[receiptId]`
 *
 * Streams a `@react-pdf/renderer`-rendered receipt PDF for the authenticated
 * user's workspace. Companion to `/api/pdf/[invoiceId]/route.ts` (Task 3) —
 * same Node runtime, same security model, same streaming discipline.
 *
 * Why Node runtime (NOT Edge): the adapter resolves bundled font files via
 * `path.join(process.cwd(), "public/fonts/...")` and `@react-pdf/renderer`
 * uses `fs.readFileSync` to load them — neither is available on Edge. See
 * `src/lib/pdf/adapter.ts` head comment + `.planning/research/SUMMARY.md
 * §Phase 3` Risk 4.
 *
 * Security model (defense in depth — identical to the invoice route):
 *   1. `createClient()` reads the session from cookies. Anonymous users get
 *      no rows back from any SELECT. `auth.getUser()` returning null short-
 *      circuits to 401 before touching application tables.
 *   2. RLS on `workspaces`, `receipts`, `invoices`, `clients` (Migration 002)
 *      scopes every read to `auth.uid() = workspaces.owner_user_id`
 *      transitively. A row from another workspace is invisible — query
 *      returns 0 rows → 404 (never 500).
 *   3. We additionally apply an explicit `.eq('workspace_id', ws.id)` filter
 *      on the receipt fetch — RLS is the wall, this filter is the second
 *      lock. If RLS were ever disabled by mistake (migration regression),
 *      the filter still scopes the read.
 *   4. NO privileged Supabase key is read or used here. Read-only,
 *      authenticated path.
 *
 * Streaming: `renderReceiptPDF` returns a Node `ReadableStream`. We pipe it
 * straight to the `Response` body — never `Buffer.concat`. Receipts are
 * single-page so the difference is small, but the discipline is the same as
 * the invoice route so that future longer receipt formats (refunds, partial
 * payments) inherit the right shape.
 *
 * Workspace branding (`template_settings`) — Migration 006 (Task 6) adds
 * `workspaces.template_settings JSONB`. This handler ships in Wave 4 alongside
 * that migration, so we read defensively: `workspace.template_settings ?? {}`
 * with `??` on each nested key. If the column is missing entirely (the join
 * runs before migration 006 lands in production), the `??` chain returns null
 * and the template renders with the design-token defaults from `LexPdfTokens`.
 */

import type { LexReceiptPdfInput } from "@/lib/pdf/adapter";
import { renderReceiptPDF } from "@/lib/pdf/adapter";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { LexLocale } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UUID shape (any version) — receipt ids are `gen_random_uuid()` from Postgres
// in production AND deterministic placeholder UUIDs from seed.sql (version
// nibble `0`) in dev/seed. RLS workspace scoping handles invalid lookups → 404.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Locale guard: the invoice.language column is `'el' | 'en'` (Postgres enum
// `preferred_language`), but the PDF template + format.ts surface speaks
// `LexLocale = "el-CY" | "en-CY"`. This bridges the two.
function toLexLocale(value: string | null | undefined): LexLocale {
  if (value === "en-CY" || value === "en") return "en-CY";
  return "el-CY";
}

// The Supabase response shape is hand-typed locally. We don't run `supabase
// gen types` yet — see `lib/types.ts` head comment — so we describe only the
// columns this handler reads. Keeps `any` out of the public surface.
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

interface ReceiptClientRow {
  name_el: string;
  name_en: string;
  vat_number: string | null;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  preferred_language: "el" | "en";
}

interface ReceiptInvoiceRow {
  invoice_number: string | null;
  invoice_year: number | null;
  total: string | number;
  currency: string;
  language: "el" | "en";
  clients: ReceiptClientRow | null;
}

interface ReceiptRowFetch {
  id: string;
  workspace_id: string;
  invoice_id: string;
  receipt_number: string;
  receipt_year: number;
  paid_at: string;
  amount: string | number;
  payment_method: string | null;
  invoices: ReceiptInvoiceRow | null;
}

// Postgres `NUMERIC` columns arrive as strings over PostgREST to preserve
// precision. The PDF surface wants plain numbers (`Intl.NumberFormat` handles
// them natively). Local coercion — keep string → number conversions auditable.
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
  { params }: { params: Promise<{ receiptId: string }> },
): Promise<Response> {
  const { receiptId } = await params;

  if (!UUID_RE.test(receiptId)) {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = await createClient();

  // Step 1 — verify session. RLS would deny reads anyway, but an
  // unauthenticated request deserves a clear 401, not "your receipt was not
  // found".
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Step 2 — resolve the caller's workspace. There is exactly one row per
  // user (workspaces.owner_user_id UNIQUE — see Migration 001). If RLS hides
  // it OR the user genuinely has no workspace, treat as 404.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, vat_number, tax_id, iban, template_settings")
    .eq("owner_user_id", user.id)
    .maybeSingle<WorkspaceRow>();
  if (!workspace) {
    return new Response("Not Found", { status: 404 });
  }

  // Step 3 — fetch the receipt with its invoice + client joined. We need
  // the invoice number + total + currency on the receipt PDF; we need the
  // client block (name + address + tax IDs) on the "BILL TO" panel.
  // `.eq('workspace_id', workspace.id)` is the defense-in-depth filter.
  // `maybeSingle` returns null instead of throwing on 0 rows — desired 404
  // path. A receipt that exists but references a draft invoice (no
  // invoice_number) is a data integrity violation — `markPaidAction` only
  // creates receipts for `finalized` or `sent` invoices which always have
  // a number — but we still guard the null with a 404 rather than crashing.
  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .select(
      "id, workspace_id, invoice_id, receipt_number, receipt_year, paid_at, amount, payment_method, invoices!inner(invoice_number, invoice_year, total, currency, language, clients(name_el, name_en, vat_number, tax_id, address, email, preferred_language))",
    )
    .eq("id", receiptId)
    .eq("workspace_id", workspace.id)
    .maybeSingle<ReceiptRowFetch>();
  if (receiptError || !receipt || !receipt.invoices || !receipt.invoices.clients) {
    if (receiptError) {
      console.error(
        "pdf.receipt_query",
        receiptError.code,
        receiptError.message,
      );
    }
    return new Response("Not Found", { status: 404 });
  }
  if (!receipt.invoices.invoice_number) {
    // Receipt references an invoice without an allocated number — invariant
    // violation, treat as 404 rather than render a half-formed document.
    console.error("pdf.receipt_invoice_number_missing", receipt.id);
    return new Response("Not Found", { status: 404 });
  }

  // Step 4 — resolve locale. Priority: invoice.language (the lawyer chose
  // this explicitly per invoice in the new-invoice form) → cookie locale via
  // next-intl → default `el-CY`. The PDF MUST match the language the lawyer
  // selected for the SOURCE invoice, not the language of the browser viewing
  // the receipt — a receipt issued for a Greek invoice stays in Greek.
  const cookieLocale = await getLocale().catch(() => "el-CY");
  const invoiceLanguage = receipt.invoices.language;
  const locale: LexLocale = invoiceLanguage
    ? toLexLocale(invoiceLanguage)
    : toLexLocale(cookieLocale);

  // Step 5 — assemble the typed input contract the adapter expects. Reading
  // template_settings defensively — until Migration 006 (Task 6) lands the
  // column may be missing; each nested key falls back to null, which the
  // template already handles (no logo, default footer, default accent).
  const branding = workspace.template_settings ?? null;
  const payload: LexReceiptPdfInput = {
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
      name_el: receipt.invoices.clients.name_el,
      name_en: receipt.invoices.clients.name_en,
      vat_number: receipt.invoices.clients.vat_number,
      tax_id: receipt.invoices.clients.tax_id,
      address: receipt.invoices.clients.address,
      email: receipt.invoices.clients.email,
      preferred_language: receipt.invoices.clients.preferred_language,
    },
    invoice: {
      invoice_number: receipt.invoices.invoice_number,
      invoice_year: receipt.invoices.invoice_year,
      total: toNumber(receipt.invoices.total),
      currency: receipt.invoices.currency,
    },
    receipt: {
      receipt_number: receipt.receipt_number,
      receipt_year: receipt.receipt_year,
      paid_at: receipt.paid_at,
      amount: toNumber(receipt.amount),
      payment_method: receipt.payment_method,
    },
    locale,
  };

  // Step 6 — render. The adapter returns a Node `ReadableStream`; we hand the
  // raw stream to the `Response` constructor. Modern Node + Next.js accept
  // Node streams as a body init; the runtime adapts them to a Web stream
  // internally. This is the only place a cast is needed — the public surface
  // of `renderReceiptPDF` is intentionally `NodeJS.ReadableStream`.
  let pdfStream: NodeJS.ReadableStream;
  try {
    pdfStream = await renderReceiptPDF(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("pdf.receipt_render_failed", message);
    return new Response("Internal Server Error", { status: 500 });
  }

  const filenameSuffix = receipt.receipt_number;
  return new Response(pdfStream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${filenameSuffix}.pdf"`,
      // `no-store` because a CDN copy showing pre-amendment receipt data
      // after a future void/refund flow would be a compliance hazard.
      // `private` keeps shared caches off the path entirely.
      "Cache-Control": "private, no-store",
    },
  });
}
