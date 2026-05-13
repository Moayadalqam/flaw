import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatMoney, type LexLocale } from "@/lib/format";
import type {
  MatterStatus,
  MatterWithClient,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Cases · Lex",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<MatterStatus, Tone> = {
  open: "ok",
  on_hold: "warn",
  closed: "muted",
};

export default async function CasesPage() {
  const supabase = await createClient();
  const t = await getTranslations("cases");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // Inner join to clients for the joined name column. RLS still applies.
  const { data: mattersData } = await supabase
    .from("matters")
    .select("*, clients!inner(name_el, name_en)")
    .order("created_at", { ascending: false })
    .returns<MatterWithClient[]>();
  const matters: MatterWithClient[] = mattersData ?? [];

  const statusLabel = (s: MatterStatus): string => {
    switch (s) {
      case "open":
        return t("statusOpen");
      case "on_hold":
        return t("statusOnHold");
      case "closed":
        return t("statusClosed");
    }
  };

  const columns: Column<MatterWithClient>[] = [
    {
      key: "matter_number",
      header: t("matterNumber"),
      render: (row) => (
        <span
          className="tabular font-display"
          style={{ color: "var(--accent)" }}
        >
          {row.matter_number}
        </span>
      ),
    },
    {
      key: "client",
      header: t("client"),
      render: (row) => {
        if (!row.clients) {
          return <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>;
        }
        const primary = isGreek ? row.clients.name_el : row.clients.name_en;
        return <span style={{ color: "var(--text)" }}>{primary}</span>;
      },
    },
    {
      key: "title",
      header: t("form.title"),
      render: (row) => (
        <span style={{ color: "var(--text)" }}>{row.title}</span>
      ),
    },
    {
      key: "type",
      header: t("matterType"),
      render: (row) => (
        <span
          className="uppercase text-xs"
          style={{ color: "var(--muted)", letterSpacing: "0.04em" }}
        >
          {row.matter_type}
        </span>
      ),
    },
    {
      key: "status",
      header: t("status"),
      align: "center",
      render: (row) => (
        <StatusPill tone={STATUS_TONE[row.status]}>
          {statusLabel(row.status)}
        </StatusPill>
      ),
    },
    {
      key: "rate",
      header: t("hourlyRate"),
      numeric: true,
      render: (row) =>
        row.default_hourly_rate ? (
          <span style={{ color: "var(--text)" }}>
            {formatMoney(Number(row.default_hourly_rate), "EUR", locale)}
          </span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
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
            {t("matterNumber")}
          </p>
          <h1
            className="font-display text-4xl tracking-tight"
            style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
          >
            {t("title")}
          </h1>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          + {t("new")}
        </Link>
      </header>

      <Table<MatterWithClient>
        columns={columns}
        rows={matters}
        emptyLabel={t("empty")}
        rowHref={(row) => `/cases/${row.id}`}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
