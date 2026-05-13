import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import { LineItemEditor } from "@/app/(workspace)/invoices/LineItemEditor";
import { InvoiceActions } from "@/app/(workspace)/invoices/InvoiceActions";
import type {
  ClientRow,
  InvoiceRow,
  InvoiceStatus,
  LineItemRow,
  MatterRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Invoice · Lex",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: "muted",
  finalized: "ok",
  sent: "ok",
  paid: "ok",
  void: "kill",
};

interface WorkspaceHeader {
  name: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("invoices");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const [invoiceRes, lineItemsRes, workspaceRes] = await Promise.all([
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
    supabase
      .from("workspaces")
      .select("name, vat_number, tax_id, iban")
      .maybeSingle<WorkspaceHeader>(),
  ]);

  const invoice = invoiceRes.data;
  if (!invoice) {
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
  const workspace = workspaceRes.data;

  const statusLabel = (s: InvoiceStatus): string => {
    switch (s) {
      case "draft":
        return t("statusDraft");
      case "finalized":
        return t("statusFinalized");
      case "sent":
        return t("statusSent");
      case "paid":
        return t("statusPaid");
      case "void":
        return t("statusVoid");
    }
  };

  const editable = invoice.status === "draft";

  const headerNumber = invoice.invoice_number ?? t("statusDraft").toUpperCase();
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
        href="/invoices"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← All invoices
      </Link>

      <div className="mt-6 flex items-start justify-between flex-wrap gap-6 mb-8">
        <div>
          <p
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
          >
            {t("title")}
          </p>
          <h1
            className="font-display tabular tracking-tight"
            style={{
              color: "var(--accent)",
              fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.025em",
            }}
          >
            {headerNumber}
          </h1>
          <div className="mt-3">
            <StatusPill tone={STATUS_TONE[invoice.status]}>
              {statusLabel(invoice.status)}
            </StatusPill>
          </div>
        </div>
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          hasLineItems={lineItems.length > 0}
        />
      </div>

      <article
        className="border rounded-lg p-10"
        style={{
          borderColor: "var(--line)",
          background: "var(--bg)",
          boxShadow: "var(--elev-2)",
        }}
      >
        {/* Letterhead */}
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
              {t("issued")}
            </div>
            <div className="text-sm" style={{ color: "var(--text)" }}>
              {invoice.issued_at
                ? formatDate(invoice.issued_at, locale)
                : "—"}
            </div>
            <div
              className="text-[10px] uppercase tracking-widest mt-3"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("due")}
            </div>
            <div className="text-sm" style={{ color: "var(--text)" }}>
              {invoice.due_at ? formatDate(invoice.due_at, locale) : "—"}
            </div>
          </div>
        </div>

        {/* Bill to + Matter */}
        <div className="grid sm:grid-cols-2 gap-8 mb-8">
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              Bill to · Προς
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
              Matter · Υπόθεση
            </div>
            {matter ? (
              <>
                <div
                  className="text-base font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {matter.title}
                </div>
                <div
                  className="text-xs mt-1 tabular"
                  style={{ color: "var(--dim)" }}
                >
                  {matter.matter_number}
                </div>
              </>
            ) : (
              <div style={{ color: "var(--dim)" }}>—</div>
            )}
          </div>
        </div>

        {/* Line items + totals (client-side editor or read-only view) */}
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
          editable={editable}
          locale={locale}
        />

        {invoice.notes ? (
          <div
            className="mt-8 pt-6 border-t text-sm"
            style={{
              borderColor: "var(--line-soft)",
              color: "var(--muted)",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              Notes
            </div>
            {invoice.notes}
          </div>
        ) : null}

        {/* Footer — server totals snapshot (auditor-readable) */}
        <div
          className="mt-12 pt-6 border-t text-[10px] tabular flex justify-between flex-wrap gap-2"
          style={{
            borderColor: "var(--line-soft)",
            color: "var(--dim)",
            letterSpacing: "0.04em",
          }}
        >
          <span>
            Server total · {formatMoney(Number(invoice.total), invoice.currency, locale)}
          </span>
          <span>
            VAT 19% · {formatMoney(Number(invoice.vat_amount), invoice.currency, locale)}
          </span>
          <span>Page 1 / 1</span>
        </div>
      </article>
    </div>
  );
}
