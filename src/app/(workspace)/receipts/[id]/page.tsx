import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type {
  ClientRow,
  InvoiceRow,
  ReceiptRow,
} from "@/lib/types";

/**
 * Receipt detail — server component.
 *
 * Loads the receipt + the invoice it references + the client + the workspace
 * letterhead in a single round trip via the nested-relation select. The PDF
 * route handler (`/api/pdf/receipts/[receiptId]`) renders the formal document;
 * this view is the in-app readout that links to it.
 *
 * Receipts have no editable surface in Phase 3 (no draft state, no
 * line-items, no header edits). The page is the audit-trail view: who paid
 * what for which invoice, when, and how. Future void / refund flows land as
 * an explicit action button block, never as a destructive "delete" on this
 * view (per the seed gap-free invariant: a receipt that posted cannot
 * silently vanish).
 */

export const metadata: Metadata = {
  title: "Receipt · Lex",
};

export const dynamic = "force-dynamic";

interface WorkspaceHeader {
  name: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
}

interface ReceiptDetailRow extends ReceiptRow {
  invoices:
    | (Pick<
        InvoiceRow,
        "id" | "invoice_number" | "invoice_year" | "total" | "currency"
      > & {
        clients: ClientRow | null;
      })
    | null;
}

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("receipts");
  const tInvoices = await getTranslations("invoices");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const [receiptRes, workspaceRes] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "*, invoices!inner(id, invoice_number, invoice_year, total, currency, clients(*))",
      )
      .eq("id", id)
      .maybeSingle<ReceiptDetailRow>(),
    supabase
      .from("workspaces")
      .select("name, vat_number, tax_id, iban")
      .maybeSingle<WorkspaceHeader>(),
  ]);

  const receipt = receiptRes.data;
  if (!receipt || !receipt.invoices) {
    notFound();
  }

  const invoice = receipt.invoices;
  const client = invoice.clients;
  const workspace = workspaceRes.data;
  const currency = invoice.currency ?? "EUR";

  const clientPrimary = client
    ? isGreek
      ? client.name_el
      : client.name_en
    : null;
  const clientSecondary = client
    ? isGreek
      ? client.name_en
      : client.name_el
    : null;

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Link
        href="/receipts"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← {t("back")}
      </Link>

      <div className="mt-6 flex items-start justify-between flex-wrap gap-6 mb-8">
        <div>
          <p
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
          >
            {t("number")}
          </p>
          <h1
            className="font-display tabular tracking-tight"
            style={{
              color: "var(--ok)",
              fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.025em",
            }}
          >
            {receipt.receipt_number}
          </h1>
          <div className="mt-3">
            <StatusPill tone="ok">{t("paymentReceived")}</StatusPill>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <a
            href={`/api/pdf/receipts/${receipt.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border transition-colors"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--text)",
            }}
          >
            {t("openPdf")}
          </a>
          <Link
            href={`/invoices/${invoice.id}`}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            {t("openInvoice")}
          </Link>
        </div>
      </div>

      <article
        className="border rounded-lg p-10"
        style={{
          borderColor: "var(--line)",
          background: "var(--bg)",
          boxShadow: "var(--elev-2)",
        }}
      >
        {/* Letterhead — same shape as the invoice detail so the two pages
            read as one document family. */}
        <div
          className="flex items-start justify-between pb-6 mb-8 border-b flex-wrap gap-4"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <div>
            <div
              className="font-display text-2xl"
              style={{ color: "var(--text)" }}
            >
              {workspace?.name ?? "Lex"}
            </div>
            <div
              className="text-xs mt-1"
              style={{ color: "var(--muted)" }}
            >
              Δικηγορικό γραφείο
            </div>
            {workspace ? (
              <div
                className="text-xs mt-3 tabular space-y-0.5"
                style={{ color: "var(--dim)" }}
              >
                {workspace.vat_number || workspace.tax_id ? (
                  <div>
                    {workspace.vat_number ? `VAT ${workspace.vat_number}` : null}
                    {workspace.vat_number && workspace.tax_id ? " · " : null}
                    {workspace.tax_id ? `TAX ${workspace.tax_id}` : null}
                  </div>
                ) : null}
                {workspace.iban ? <div>IBAN {workspace.iban}</div> : null}
              </div>
            ) : null}
          </div>
          <div className="text-right tabular">
            <div
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("paidAt")}
            </div>
            <div className="text-sm" style={{ color: "var(--text)" }}>
              {formatDate(receipt.paid_at, locale)}
            </div>
          </div>
        </div>

        {/* Payment received banner — semantically the load-bearing fact. */}
        <div
          className="rounded-md px-5 py-4 mb-8 flex items-center"
          style={{
            background: "var(--surface)",
            borderLeft: "3px solid var(--ok)",
          }}
        >
          <span
            className="text-sm font-medium uppercase"
            style={{ color: "var(--ok)", letterSpacing: "0.08em" }}
          >
            {t("paymentReceived")}
          </span>
        </div>

        {/* Bill to + Invoice reference */}
        <div className="grid sm:grid-cols-2 gap-8 mb-8">
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("client")}
            </div>
            {client ? (
              <>
                <div
                  className="text-base font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {clientPrimary}
                </div>
                {clientSecondary && clientSecondary !== clientPrimary ? (
                  <div
                    className="text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    {clientSecondary}
                  </div>
                ) : null}
                {client.vat_number ? (
                  <div
                    className="text-xs mt-1 tabular"
                    style={{ color: "var(--dim)" }}
                  >
                    VAT {client.vat_number}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ color: "var(--dim)" }}>—</div>
            )}
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("invoice")}
            </div>
            <Link
              href={`/invoices/${invoice.id}`}
              className="font-display tabular text-2xl transition-colors hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              {invoice.invoice_number ?? tInvoices("statusDraft")}
            </Link>
          </div>
        </div>

        {/* Amount + method */}
        <div className="grid sm:grid-cols-2 gap-8 mb-2">
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("method")}
            </div>
            <div
              className="text-base"
              style={{ color: "var(--text)" }}
            >
              {receipt.payment_method ?? "—"}
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("amount")}
            </div>
            <div
              className="font-display tabular"
              style={{
                color: "var(--text)",
                fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
                lineHeight: 1.1,
              }}
            >
              {formatMoney(Number(receipt.amount), currency, locale)}
            </div>
          </div>
        </div>

        {/* Footer — server snapshot for the audit trail. */}
        <div
          className="mt-12 pt-6 border-t text-[10px] tabular flex justify-between flex-wrap gap-2"
          style={{
            borderColor: "var(--line-soft)",
            color: "var(--dim)",
            letterSpacing: "0.04em",
          }}
        >
          <span>
            Invoice total ·{" "}
            {formatMoney(Number(invoice.total), currency, locale)}
          </span>
          <span>
            Receipt amount ·{" "}
            {formatMoney(Number(receipt.amount), currency, locale)}
          </span>
          <span>Page 1 / 1</span>
        </div>
      </article>
    </div>
  );
}
