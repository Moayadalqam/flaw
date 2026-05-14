import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import { LineItemEditor } from "@/app/(workspace)/invoices/LineItemEditor";
import { DraftActions } from "@/app/(workspace)/drafts/DraftActions";
import type {
  ClientRow,
  InvoiceRow,
  LineItemRow,
  MatterRow,
} from "@/lib/types";

/**
 * AI Draft detail page (Phase 5 Task 2).
 *
 * Two-pane layout:
 *   - left: PDF preview (iframe → existing /api/pdf/[invoiceId], which
 *     auto-watermarks `status='draft'` per Phase 3)
 *   - right: editable line items (reusing LineItemEditor from /invoices)
 *     plus DraftActions (Finalize + Discard buttons)
 *
 * 404s if the invoice doesn't exist OR isn't a `created_by_ai=true` draft —
 * keeping the route hermetically scoped to the AI review queue. RLS auto-
 * scopes the fetch.
 *
 * Finalize → calls existing finalizeInvoiceAction → number allocated via
 * the SECURITY DEFINER SP. The AI never touches the number allocator;
 * the human in this UI is the gate.
 *
 * i18n: drafts.* pending Task 4 — bilingual strings hardcoded for now.
 */

export const metadata: Metadata = {
  title: "AI Draft · Lex",
};

export const dynamic = "force-dynamic";

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const [invoiceRes, lineItemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle<InvoiceRow>(),
    supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", id)
      .order("position", { ascending: true })
      .returns<LineItemRow[]>(),
  ]);

  const invoice = invoiceRes.data;
  if (!invoice) {
    notFound();
  }
  // Guard: 404 anything that isn't a `created_by_ai=true` draft. The
  // /drafts surface is hermetically scoped to the AI review queue.
  if (invoice.status !== "draft" || !invoice.created_by_ai) {
    notFound();
  }

  const [clientRes, matterRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .maybeSingle<ClientRow>(),
    supabase
      .from("matters")
      .select("*")
      .eq("id", invoice.matter_id)
      .maybeSingle<MatterRow>(),
  ]);

  const client = clientRes.data;
  const matter = matterRes.data;
  const lineItems = lineItemsRes.data ?? [];

  const clientPrimary = client
    ? isGreek
      ? client.name_el
      : client.name_en
    : null;

  const backLabel = isGreek ? "← Όλα τα πρόχειρα" : "← All drafts";
  const titleLabel = isGreek ? "Πρόχειρο AI" : "AI Draft";
  const captionLabel = isGreek ? "Προς έλεγχο" : "Awaiting review";
  const previewHeading = isGreek ? "Προεπισκόπηση PDF" : "PDF preview";
  const watermarkLabel = isGreek
    ? "Το υδατογράφημα DRAFT ισχύει μέχρι την οριστικοποίηση."
    : "DRAFT watermark applies until finalized.";
  const lineItemsHeading = isGreek ? "Γραμμές χρέωσης" : "Line items";
  const actionsHeading = isGreek ? "Ενέργειες" : "Actions";

  return (
    <div className="w-full max-w-6xl mx-auto">
      <Link
        href="/drafts"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        {backLabel}
      </Link>

      <div className="mt-6 mb-8">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {captionLabel}
        </p>
        <h1
          className="font-display tracking-tight"
          style={{
            color: "var(--accent)",
            fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
            lineHeight: 1.04,
            letterSpacing: "-0.025em",
          }}
        >
          {titleLabel}
        </h1>
        {client ? (
          <p
            className="text-sm mt-3"
            style={{ color: "var(--muted)" }}
          >
            {clientPrimary}
            {matter ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="tabular">{matter.matter_number}</span>
                <span aria-hidden="true"> · </span>
                {matter.title}
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* LEFT — PDF preview */}
        <section aria-labelledby="draft-pdf-heading">
          <h2
            id="draft-pdf-heading"
            className="text-[10px] uppercase tracking-widest mb-3"
            style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
          >
            {previewHeading}
          </h2>
          <div
            className="border rounded-lg overflow-hidden"
            style={{
              borderColor: "var(--line)",
              background: "var(--bg)",
              boxShadow: "var(--elev-2)",
              aspectRatio: "210/297",
            }}
          >
            <iframe
              src={`/api/pdf/${invoice.id}`}
              title={previewHeading}
              className="w-full h-full"
              style={{
                border: "0",
                background: "var(--bg)",
              }}
            />
          </div>
          <p
            className="text-xs mt-3"
            style={{ color: "var(--dim)" }}
          >
            {watermarkLabel}
          </p>
        </section>

        {/* RIGHT — line item editor + actions */}
        <section
          aria-labelledby="draft-editor-heading"
          className="space-y-8"
        >
          <div>
            <h2
              id="draft-editor-heading"
              className="text-[10px] uppercase tracking-widest mb-3"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {lineItemsHeading}
            </h2>
            <div
              className="border rounded-lg p-6"
              style={{
                borderColor: "var(--line)",
                background: "var(--bg)",
                boxShadow: "var(--elev-2)",
              }}
            >
              {/* Issued/due metadata strip — auditor-readable */}
              <div
                className="flex justify-between flex-wrap gap-3 pb-4 mb-4 border-b text-xs tabular"
                style={{
                  borderColor: "var(--line-soft)",
                  color: "var(--muted)",
                }}
              >
                <span>
                  {isGreek ? "Έκδοση" : "Issued"}:{" "}
                  {invoice.issued_at
                    ? formatDate(invoice.issued_at, locale)
                    : "\u2014"}
                </span>
                <span>
                  {isGreek ? "Λήξη" : "Due"}:{" "}
                  {invoice.due_at
                    ? formatDate(invoice.due_at, locale)
                    : "\u2014"}
                </span>
                <span>
                  {isGreek ? "Σύνολο" : "Total"}:{" "}
                  {formatMoney(
                    Number(invoice.total),
                    invoice.currency,
                    locale,
                  )}
                </span>
              </div>

              <LineItemEditor
                invoiceId={invoice.id}
                lines={lineItems.map((li) => ({
                  id: li.id,
                  description: li.description,
                  quantity: li.quantity,
                  unit_price: li.unit_price,
                  line_total: li.line_total,
                  kind: li.kind,
                }))}
                editable={true}
                locale={locale}
              />
            </div>
          </div>

          <div>
            <h2
              className="text-[10px] uppercase tracking-widest mb-3"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {actionsHeading}
            </h2>
            <DraftActions
              invoiceId={invoice.id}
              hasLineItems={lineItems.length > 0}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
