import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type {
  InvoiceRow,
  InvoiceStatus,
  InvoiceWithRelations,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Invoices · Lex",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: "muted",
  finalized: "ok",
  sent: "ok",
  paid: "ok",
  void: "kill",
};

export default async function InvoicesPage() {
  const supabase = await createClient();
  const t = await getTranslations("invoices");
  const tCommon = await getTranslations("common");
  const tEmpty = await getTranslations("empty");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // RLS scopes the query. Inner-join clients + matters; both are NOT NULL
  // FKs on `invoices`, so an inner join doesn't change the cardinality.
  const { data: invoicesData } = await supabase
    .from("invoices")
    .select(
      "*, clients!inner(name_el, name_en), matters!inner(matter_number, title)",
    )
    .order("created_at", { ascending: false })
    .returns<InvoiceWithRelations[]>();
  const invoices: InvoiceWithRelations[] = invoicesData ?? [];

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

  const columns: Column<InvoiceWithRelations>[] = [
    {
      key: "number",
      header: t("number"),
      render: (row: InvoiceRow) => (
        <span
          className="tabular font-display"
          style={{ color: "var(--accent)" }}
        >
          {row.invoice_number ?? t("statusDraft")}
        </span>
      ),
    },
    {
      key: "client",
      header: t("client"),
      render: (row: InvoiceWithRelations) => {
        if (!row.clients) {
          return <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>;
        }
        const primary = isGreek ? row.clients.name_el : row.clients.name_en;
        return <span style={{ color: "var(--text)" }}>{primary}</span>;
      },
    },
    {
      key: "matter",
      header: t("matter"),
      render: (row: InvoiceWithRelations) => (
        <span
          className="tabular text-xs"
          style={{ color: "var(--muted)" }}
        >
          {row.matters?.matter_number ?? "—"}
        </span>
      ),
    },
    {
      key: "issued",
      header: t("issued"),
      numeric: true,
      render: (row: InvoiceRow) =>
        row.issued_at ? (
          <span style={{ color: "var(--muted)" }}>
            {formatDate(row.issued_at, locale)}
          </span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "due",
      header: t("due"),
      numeric: true,
      render: (row: InvoiceRow) =>
        row.due_at ? (
          <span style={{ color: "var(--muted)" }}>
            {formatDate(row.due_at, locale)}
          </span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "total",
      header: t("total"),
      numeric: true,
      render: (row: InvoiceRow) => (
        <span style={{ color: "var(--text)", fontWeight: 500 }}>
          {formatMoney(Number(row.total), row.currency, locale)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      align: "center",
      render: (row: InvoiceRow) => (
        <StatusPill tone={STATUS_TONE[row.status]}>
          {statusLabel(row.status)}
        </StatusPill>
      ),
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
            {tCommon("language")}
          </p>
          <h1
            className="font-display text-4xl tracking-tight"
            style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
          >
            {t("title")}
          </h1>
        </div>
        <Link
          href="/invoices/new"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          + {t("new")}
        </Link>
      </header>

      <Table<InvoiceWithRelations>
        columns={columns}
        rows={invoices}
        emptyLabel={tEmpty("invoices")}
        rowHref={(row) => `/invoices/${row.id}`}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
