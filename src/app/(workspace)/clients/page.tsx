import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, type LexLocale } from "@/lib/format";
import type { ClientRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Clients · Lex",
};

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const t = await getTranslations("clients");
  const tCommon = await getTranslations("common");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // RLS scopes the query to the workspace owned by the authenticated user;
  // workspace gating is enforced by `(workspace)/layout.tsx`.
  const { data: clientsData } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<ClientRow[]>();
  const clients: ClientRow[] = clientsData ?? [];

  const columns: Column<ClientRow>[] = [
    {
      key: "name",
      header: t("name"),
      render: (row) => {
        const primary = isGreek ? row.name_el : row.name_en;
        const secondary = isGreek ? row.name_en : row.name_el;
        const showSecondary = secondary && secondary !== primary;
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{primary}</div>
            {showSecondary ? (
              <div
                className="text-xs"
                style={{ color: "var(--dim)", marginTop: "2px" }}
              >
                {secondary}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "vat",
      header: t("vat"),
      render: (row) => (
        <span
          className="tabular text-xs"
          style={{ color: "var(--muted)" }}
        >
          {row.vat_number ?? "—"}
        </span>
      ),
    },
    {
      key: "language",
      header: t("language"),
      align: "center",
      render: (row) => (
        <StatusPill tone={row.preferred_language === "el" ? "ok" : "muted"}>
          {row.preferred_language === "el" ? "EL" : "EN"}
        </StatusPill>
      ),
    },
    {
      key: "created",
      header: t("created"),
      numeric: true,
      render: (row) => (
        <span style={{ color: "var(--muted)" }}>
          {formatDate(row.created_at, locale)}
        </span>
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
          href="/clients/new"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          + {t("new")}
        </Link>
      </header>

      <Table<ClientRow>
        columns={columns}
        rows={clients}
        emptyLabel={t("empty")}
        rowHref={(row) => `/clients/${row.id}`}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
