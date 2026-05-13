import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type {
  QuotationRow,
  QuotationStatus,
  QuotationWithRelations,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Quotations · Lex",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<QuotationStatus, Tone> = {
  draft: "muted",
  sent: "ok",
  accepted: "ok",
  declined: "kill",
  expired: "kill",
};

export default async function QuotationsPage() {
  const supabase = await createClient();
  const t = await getTranslations("quotations");
  const tCommon = await getTranslations("common");
  const tEmpty = await getTranslations("empty");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // RLS scopes the query. Inner-join clients (NOT NULL on quotations);
  // left-join matters because `matter_id` is nullable on quotations
  // (a lawyer may quote before opening a matter).
  const { data: quotationsData } = await supabase
    .from("quotations")
    .select(
      "*, clients!inner(name_el, name_en), matters(matter_number, title)",
    )
    .order("created_at", { ascending: false })
    .returns<QuotationWithRelations[]>();
  const quotations: QuotationWithRelations[] = quotationsData ?? [];

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

  const columns: Column<QuotationWithRelations>[] = [
    {
      key: "number",
      header: t("number"),
      render: (row: QuotationRow) => (
        <span
          className="tabular font-display"
          style={{ color: "var(--accent)" }}
        >
          {row.quotation_number ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "client",
      header: t("client"),
      render: (row: QuotationWithRelations) => {
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
      render: (row: QuotationWithRelations) => (
        <span
          className="tabular text-xs"
          style={{ color: "var(--muted)" }}
        >
          {row.matters?.matter_number ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "issued",
      header: t("issued"),
      numeric: true,
      render: (row: QuotationRow) =>
        row.issued_at ? (
          <span style={{ color: "var(--muted)" }}>
            {formatDate(row.issued_at, locale)}
          </span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "validUntil",
      header: t("validUntil"),
      numeric: true,
      render: (row: QuotationRow) =>
        row.valid_until ? (
          <span style={{ color: "var(--muted)" }}>
            {formatDate(row.valid_until, locale)}
          </span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "total",
      header: t("total"),
      numeric: true,
      render: (row: QuotationRow) => (
        <span style={{ color: "var(--text)", fontWeight: 500 }}>
          {formatMoney(Number(row.total), "EUR", locale)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      align: "center",
      render: (row: QuotationRow) => (
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
          href="/quotations/new"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          + {t("new")}
        </Link>
      </header>

      <Table<QuotationWithRelations>
        columns={columns}
        rows={quotations}
        emptyLabel={tEmpty("quotations")}
        rowHref={(row) => `/quotations/${row.id}`}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
