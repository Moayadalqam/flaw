/**
 * PDF Route Handler — `GET /api/quotations/[id]/pdf`
 *
 * Streams a `@react-pdf/renderer`-rendered quotation PDF for the authenticated
 * user's workspace. Companion to `/api/pdf/[invoiceId]/route.ts` and
 * `/api/pdf/receipts/[receiptId]/route.ts` — same Node runtime, same security
 * model, same streaming discipline.
 *
 * Why Node runtime (NOT Edge): the adapter resolves bundled font files via
 * `path.join(process.cwd(), "public/fonts/...")` and `@react-pdf/renderer`
 * uses `fs.readFileSync` to load them — neither is available on Edge. See
 * `src/lib/pdf/adapter.ts` head comment.
 *
 * Security model (defense in depth — identical to the invoice route):
 *   1. `createClient()` reads session from cookies. Anonymous users get no
 *      rows back from any SELECT. `auth.getUser()` null → 401 before any
 *      application-table query.
 *   2. RLS on `workspaces`, `quotations`, `quotation_line_items`, `clients`
 *      (Migrations 002 and 007) scopes every read to
 *      `auth.uid() = workspaces.owner_user_id` transitively. Cross-workspace
 *      access returns 0 rows → 404.
 *   3. Explicit `.eq('workspace_id', ws.id)` filter on the quotation fetch —
 *      RLS is the wall, this filter is the second lock.
 *   4. NO privileged Supabase key. Read-only, authenticated path.
 *
 * Streaming: `renderQuotationPDF` returns a Node `ReadableStream`. Pipe
 * straight to the `Response` body — never `Buffer.concat`.
 */

import type { LexQuotationPdfInput } from "@/lib/pdf/adapter";
import { renderQuotationPDF } from "@/lib/pdf/adapter";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { LexLocale } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UUID shape (any version) — quotation ids are `gen_random_uuid()` from
// Postgres in production AND deterministic placeholder UUIDs from seed.sql
// in dev/seed. RLS workspace scoping handles invalid lookups → 404.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toLexLocale(value: string | null | undefined): LexLocale {
  if (value === "en-CY" || value === "en") return "en-CY";
  return "el-CY";
}

interface WorkspaceRow {
  id: string;
  name: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
  template_settings?: {
    logo_data_url?: string | null;
    footer_text?: string | null;
    accent_hex?: string | null;
  } | null;
}

interface QuotationClientRow {
  name_el: string;
  name_en: string;
  vat_number: string | null;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  preferred_language: "el" | "en";
}

interface QuotationRow {
  id: string;
  workspace_id: string;
  quotation_number: string | null;
  quotation_year: number | null;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  issued_at: string | null;
  valid_until: string | null;
  subtotal: string | number;
  vat_amount: string | number;
  total: string | number;
  notes: string | null;
  language: "el" | "en";
  clients: QuotationClientRow | null;
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
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = await createClient();

  // Step 1 — verify session.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Step 2 — resolve caller's workspace.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, vat_number, tax_id, iban, template_settings")
    .eq("owner_user_id", user.id)
    .maybeSingle<WorkspaceRow>();
  if (!workspace) {
    return new Response("Not Found", { status: 404 });
  }

  // Step 3 — fetch the quotation with its client joined.
  const { data: quotation, error: qErr } = await supabase
    .from("quotations")
    .select(
      "id, workspace_id, quotation_number, quotation_year, status, issued_at, valid_until, subtotal, vat_amount, total, notes, language, clients(name_el, name_en, vat_number, tax_id, address, email, preferred_language)",
    )
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .maybeSingle<QuotationRow>();
  if (qErr || !quotation || !quotation.clients) {
    if (qErr) {
      console.error("pdf.quotation_query", qErr.code, qErr.message);
    }
    return new Response("Not Found", { status: 404 });
  }

  // Step 4 — fetch line items ordered by `position`.
  const { data: lineItemRows, error: liErr } = await supabase
    .from("quotation_line_items")
    .select(
      "description, quantity, unit_price, line_total, vat_rate, position, kind",
    )
    .eq("quotation_id", quotation.id)
    .order("position", { ascending: true });
  if (liErr) {
    console.error("pdf.line_items_query", liErr.code, liErr.message);
    return new Response("Internal Server Error", { status: 500 });
  }
  const lineItems = (lineItemRows ?? []) as LineItemRow[];

  // Step 5 — resolve locale. The PDF MUST match the language the lawyer
  // selected for the document, not the language of the browser viewing it.
  const cookieLocale = await getLocale().catch(() => "el-CY");
  const locale: LexLocale = quotation.language
    ? toLexLocale(quotation.language)
    : toLexLocale(cookieLocale);

  // Step 6 — assemble the typed input contract.
  const branding = workspace.template_settings ?? null;
  const payload: LexQuotationPdfInput = {
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
      name_el: quotation.clients.name_el,
      name_en: quotation.clients.name_en,
      vat_number: quotation.clients.vat_number,
      tax_id: quotation.clients.tax_id,
      address: quotation.clients.address,
      email: quotation.clients.email,
      preferred_language: quotation.clients.preferred_language,
    },
    quotation: {
      quotation_number: quotation.quotation_number,
      quotation_year: quotation.quotation_year,
      issued_at: quotation.issued_at,
      valid_until: quotation.valid_until,
      subtotal: toNumber(quotation.subtotal),
      vat_amount: toNumber(quotation.vat_amount),
      total: toNumber(quotation.total),
      currency: "EUR",
      notes: quotation.notes,
      language: quotation.language,
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
  };

  // Step 7 — render. Stream straight to the Response.
  let pdfStream: NodeJS.ReadableStream;
  try {
    pdfStream = await renderQuotationPDF(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("pdf.render_failed", message);
    return new Response("Internal Server Error", { status: 500 });
  }

  const filenameSuffix = quotation.quotation_number ?? quotation.id;
  return new Response(pdfStream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quotation-${filenameSuffix}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
