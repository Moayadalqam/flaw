import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type { ClientRow, InvoiceRow, ReceiptRow } from "@/lib/types";

/**
 * Receipts list — server component.
 *
 * RLS scopes the query at the database boundary; `Sidebar` + `TopBar` come
 * from the `(workspace)/layout.tsx` shell which has already redirected
 * unauthenticated users to `/login`. We resolve the joined invoice number +
 * client name in a single `select(...)` so each row in the table renders
 * without an N+1 follow-up.
 *
 * In Phase 3 receipts are append-only — created exclusively by
 * `markPaidAction` in `invoices/actions.ts`. There is no New / Edit / Delete
 * surface here (mirrors the Phase 3 plan §Receipts). If a future phase needs
 * void / refund, it lands as a new action on the detail page, not as a
 * destructive button on the list.
 */

export const metadata: Metadata = {
  title: "Receipts · Lex",
};

export const dynamic = "force-dynamic";

interface ReceiptWithRelations extends ReceiptRow {
  invoices:
    | (Pick<InvoiceRow, "id" | "invoice_number"> & {
        clients: Pick<ClientRow, "name_el" | "name_en"> | null;
      })
    | null;
}

export default async function ReceiptsPage() {
  const supabase = await createClient();
  const t = await getTranslations("receipts");
  const tEmpty = await getTranslations("empty");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // Inner-join the invoice (every receipt has a NOT NULL invoice_id FK per
  // Migration 001). Pull the client off the invoice — Supabase nests the
  // related row by the FK relation name. RLS scopes the read transitively.
  const { data: receiptsData } = await supabase
    .from("receipts")
    .select(
      "*, invoices!inner(id, invoice_number, clients(name_el, name_en))",
    )
    .order("paid_at", { ascending: false })
    .returns<ReceiptWithRelations[]>();
  const receipts: ReceiptWithRelations[] = receiptsData ?? [];

  const columns: Column<ReceiptWithRelations>[] = [
    {
      key: "number",
      header: t("number"),
      render: (row: ReceiptWithRelations) => (
        <span
          className="tabular font-display"
          style={{ color: "var(--accent)" }}
        >
          {row.receipt_number}
        </span>
      ),
    },
    {
      key: "invoice",
      header: t("invoice"),
      render: (row: ReceiptWithRelations) => (
        <span
          className="tabular text-xs"
          style={{ color: "var(--muted)" }}
        >
          {row.invoices?.invoice_number ?? "—"}
        </span>
      ),
    },
    {
      key: "client",
      header: t("client"),
      render: (row: ReceiptWithRelations) => {
        const c = row.invoices?.clients;
        if (!c) {
          return <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>;
        }
        const primary = isGreek ? c.name_el : c.name_en;
        return <span style={{ color: "var(--text)" }}>{primary}</span>;
      },
    },
    {
      key: "paidAt",
      header: t("paidAt"),
      numeric: true,
      render: (row: ReceiptWithRelations) => (
        <span style={{ color: "var(--muted)" }}>
          {formatDate(row.paid_at, locale)}
        </span>
      ),
    },
    {
      key: "method",
      header: t("method"),
      render: (row: ReceiptWithRelations) =>
        row.payment_method ? (
          <span style={{ color: "var(--muted)" }}>{row.payment_method}</span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "amount",
      header: t("amount"),
      numeric: true,
      render: (row: ReceiptWithRelations) => (
        <span style={{ color: "var(--text)", fontWeight: 500 }}>
          {formatMoney(Number(row.amount), "EUR", locale)}
        </span>
      ),
    },
    {
      key: "status",
      header: " ",
      align: "center",
      render: () => <StatusPill tone="ok">{t("paymentReceived")}</StatusPill>,
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <p
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
          >
            {isGreek ? t("subtitle") : t("title")}
          </p>
          <h1
            className="font-display text-4xl tracking-tight"
            style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
          >
            {isGreek ? t("title") : t("subtitle")}
          </h1>
        </div>
      </header>

      <Table<ReceiptWithRelations>
        columns={columns}
        rows={receipts}
        emptyLabel={tEmpty("receipts")}
        rowHref={(row) => `/receipts/${row.id}`}
        rowKey={(row) => row.id}
      />

      <p
        className="mt-6 text-xs"
        style={{ color: "var(--dim)" }}
      >
        {t("footnote")}
      </p>
    </div>
  );
}
