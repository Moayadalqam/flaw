import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import { QuotationActions } from "@/app/(workspace)/quotations/QuotationActions";
import type {
  ClientRow,
  MatterRow,
  QuotationLineItemRow,
  QuotationRow,
  QuotationStatus,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Quotation · Lex",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<QuotationStatus, Tone> = {
  draft: "muted",
  sent: "ok",
  accepted: "ok",
  declined: "kill",
  expired: "kill",
};

interface WorkspaceHeader {
  name: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
}

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("quotations");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const [quotationRes, lineItemsRes, workspaceRes] = await Promise.all([
    supabase
      .from("quotations")
      .select("*")
      .eq("id", id)
      .maybeSingle<QuotationRow>(),
    supabase
      .from("quotation_line_items")
      .select("*")
      .eq("quotation_id", id)
      .order("position", { ascending: true })
      .returns<QuotationLineItemRow[]>(),
    supabase
      .from("workspaces")
      .select("name, vat_number, tax_id, iban")
      .maybeSingle<WorkspaceHeader>(),
  ]);

  const quotation = quotationRes.data;
  if (!quotation) {
    notFound();
  }

  const [clientRes, matterRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("id", quotation.client_id)
      .maybeSingle<ClientRow>(),
    quotation.matter_id
      ? supabase
          .from("matters")
          .select("*")
          .eq("id", quotation.matter_id)
          .maybeSingle<MatterRow>()
      : Promise.resolve({ data: null as MatterRow | null }),
  ]);

  const client = clientRes.data;
  const matter = matterRes.data;
  const lineItems = lineItemsRes.data ?? [];
  const workspace = workspaceRes.data;

  const statusLabel = (s: QuotationStatus): string => {
    switch (s) {
      case "draft":
        return t("statusDraft");
      case "sent":
        return t("statusSent");
      case "accepted":
        return t("statusAccepted");
      case "declined":
        return t("statusDeclined");
      case "expired":
        return t("statusExpired");
    }
  };

  const headerNumber =
    quotation.quotation_number ?? t("statusDraft").toUpperCase();
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
        href="/quotations"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← All quotations
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
            <StatusPill tone={STATUS_TONE[quotation.status]}>
              {statusLabel(quotation.status)}
            </StatusPill>
          </div>
          {quotation.status === "accepted" && quotation.converted_invoice_id ? (
            <Link
              href={`/invoices/${quotation.converted_invoice_id}`}
              className="block mt-3 text-sm transition-colors"
              style={{ color: "var(--accent)" }}
            >
              {t("convertedTo")} →
            </Link>
          ) : null}
        </div>
        <QuotationActions
          quotationId={quotation.id}
          status={quotation.status}
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
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Δικηγορικό γραφείο · {t("title")}
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
              {quotation.issued_at
                ? formatDate(quotation.issued_at, locale)
                : "\u2014"}
            </div>
            <div
              className="text-[10px] uppercase tracking-widest mt-3"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("validUntil")}
            </div>
            <div className="text-sm" style={{ color: "var(--text)" }}>
              {quotation.valid_until
                ? formatDate(quotation.valid_until, locale)
                : "\u2014"}
            </div>
          </div>
        </div>

        {/* Quoted to + Matter */}
        <div className="grid sm:grid-cols-2 gap-8 mb-8">
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              Quoted to · Προς
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
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
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
              <div style={{ color: "var(--dim)" }}>{"\u2014"}</div>
            )}
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {t("matter")} · Υπόθεση
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
              <div style={{ color: "var(--dim)" }}>{"\u2014"}</div>
            )}
          </div>
        </div>

        {/* Line items table — read-only on every quotation status */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr
              className="text-[10px] uppercase border-b"
              style={{
                color: "var(--dim)",
                letterSpacing: "0.08em",
                borderColor: "var(--line)",
              }}
            >
              <th className="text-left py-3 font-normal">
                Description · Περιγραφή
              </th>
              <th
                className="text-right py-3 font-normal"
                style={{ width: "6.5rem" }}
              >
                Qty
              </th>
              <th
                className="text-right py-3 font-normal"
                style={{ width: "9rem" }}
              >
                Unit price
              </th>
              <th
                className="text-right py-3 font-normal"
                style={{ width: "9rem" }}
              >
                Line total
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {lineItems.map((li) => (
              <tr
                key={li.id}
                className="border-b"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <td className="py-3 pr-3" style={{ color: "var(--text)" }}>
                  {li.description}
                </td>
                <td
                  className="py-3 pr-3 text-right"
                  style={{ color: "var(--muted)" }}
                >
                  {li.quantity}
                </td>
                <td
                  className="py-3 pr-3 text-right"
                  style={{ color: "var(--muted)" }}
                >
                  {formatMoney(Number(li.unit_price), "EUR", locale)}
                </td>
                <td className="py-3 text-right" style={{ color: "var(--text)" }}>
                  {formatMoney(Number(li.line_total), "EUR", locale)}
                </td>
              </tr>
            ))}
            {lineItems.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-6 text-center"
                  style={{ color: "var(--dim)" }}
                >
                  No line items.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto max-w-sm tabular text-sm space-y-2">
          <div
            className="flex justify-between"
            style={{ color: "var(--muted)" }}
          >
            <span>{t("subtotal")} · Υποσύνολο</span>
            <span>{formatMoney(Number(quotation.subtotal), "EUR", locale)}</span>
          </div>
          <div
            className="flex justify-between"
            style={{ color: "var(--muted)" }}
          >
            <span>{t("vat")} 19% · ΦΠΑ 19%</span>
            <span>
              {formatMoney(Number(quotation.vat_amount), "EUR", locale)}
            </span>
          </div>
          <div
            className="flex justify-between font-display text-2xl pt-3 mt-3 border-t"
            style={{ color: "var(--text)", borderColor: "var(--line)" }}
          >
            <span>{t("total")}</span>
            <span>{formatMoney(Number(quotation.total), "EUR", locale)}</span>
          </div>
        </div>

        {quotation.notes ? (
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
            {quotation.notes}
          </div>
        ) : null}

        {/* Footer — verbatim "not a tax invoice" string per locale */}
        <div
          className="mt-12 pt-6 border-t text-[10px] tabular"
          style={{
            borderColor: "var(--line-soft)",
            color: "var(--dim)",
            letterSpacing: "0.04em",
          }}
        >
          {t("notTaxInvoice")}
        </div>
      </article>
    </div>
  );
}
