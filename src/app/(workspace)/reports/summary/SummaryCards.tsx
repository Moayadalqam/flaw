/**
 * SummaryCards — server-rendered stat cards + breakdown tables for
 * /reports/summary. Mirrors the dashboard card pattern (rounded `--surface`
 * articles, display-scale tabular figures) but adds a top accent strip per
 * card: terracotta `--accent` for revenue + outstanding, alert `--kill` for
 * the overdue card.
 *
 * The two breakdown tables (By case, By client) reuse the shared `Table`
 * primitive so they pick up the same sticky-header + hover-row treatment as
 * the rest of the workspace surfaces.
 *
 * Trust-isolation footnote is rendered below the tables — the load-bearing
 * compliance claim of Phase 6, stated in plain language for the lawyer.
 */

import { getTranslations } from "next-intl/server";
import { Table, type Column } from "@/components/Table";
import { formatMoney, type LexLocale } from "@/lib/format";
import type {
  ByCaseRow,
  ByClientRow,
  MonthlySummary,
} from "./queries";

interface Props {
  summary: MonthlySummary;
  locale: LexLocale;
}

export async function SummaryCards({ summary, locale }: Props) {
  const t = await getTranslations("reports");
  const isGreek = locale === "el-CY";

  const revenueNum = parseFloat(summary.totalRevenue);
  const outstandingNum = parseFloat(summary.outstanding);
  const overdueNum = parseFloat(summary.overdue);

  const isEmpty =
    revenueNum === 0 &&
    outstandingNum === 0 &&
    overdueNum === 0 &&
    summary.byCase.length === 0 &&
    summary.byClient.length === 0;

  const cards = [
    {
      key: "revenue",
      label: t("revenueCard"),
      amount: summary.totalRevenue,
      accent: "var(--accent)",
    },
    {
      key: "outstanding",
      label: t("outstandingCard"),
      amount: summary.outstanding,
      accent: "var(--accent)",
    },
    {
      key: "overdue",
      label: t("overdueCard"),
      amount: summary.overdue,
      accent: "var(--kill)",
    },
  ];

  const byCaseColumns: Column<ByCaseRow>[] = [
    {
      key: "matter",
      header: t("byCase"),
      render: (row) => (
        <div>
          <div
            className="tabular text-xs"
            style={{ color: "var(--accent)" }}
          >
            {row.matter_number}
          </div>
          <div style={{ color: "var(--text)", marginTop: "2px" }}>
            {row.title}
          </div>
        </div>
      ),
    },
    {
      key: "total",
      header: t("revenueCard"),
      numeric: true,
      render: (row) => (
        <span
          style={{
            color: "var(--text)",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(parseFloat(row.total), "EUR", locale)}
        </span>
      ),
    },
  ];

  const byClientColumns: Column<ByClientRow>[] = [
    {
      key: "client",
      header: t("byClient"),
      render: (row) => {
        const primary = isGreek ? row.name_el : row.name_en;
        return <span style={{ color: "var(--text)" }}>{primary}</span>;
      },
    },
    {
      key: "total",
      header: t("revenueCard"),
      numeric: true,
      render: (row) => (
        <span
          style={{
            color: "var(--text)",
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoney(parseFloat(row.total), "EUR", locale)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-[var(--space-8)]">
      <section
        aria-label={t("title")}
        className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-4)]"
      >
        {cards.map((card) => {
          const formatted = formatMoney(
            parseFloat(card.amount),
            "EUR",
            locale,
          );
          return (
            <article
              key={card.key}
              aria-label={`${card.label}: ${formatted}`}
              className="rounded-md border p-5"
              style={{
                background: "var(--surface)",
                borderColor: "var(--line)",
                borderTop: `3px solid ${card.accent}`,
              }}
            >
              <div
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
              >
                {card.label}
              </div>
              <div
                className="font-display mt-3"
                style={{
                  color: "var(--text)",
                  fontSize: "clamp(2rem, 4vw, 3rem)",
                  lineHeight: 1.04,
                  letterSpacing: "-0.025em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatted}
              </div>
            </article>
          );
        })}
      </section>

      {isEmpty ? (
        <p
          className="text-sm"
          style={{ color: "var(--muted)" }}
        >
          {t("noActivity")}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--space-6)]">
          <div>
            <h2
              className="text-sm font-medium mb-3"
              style={{ color: "var(--text)" }}
            >
              {t("byCase")}
            </h2>
            <Table<ByCaseRow>
              columns={byCaseColumns}
              rows={summary.byCase}
              emptyLabel={t("noActivity")}
              rowKey={(row) => row.matter_id}
            />
          </div>
          <div>
            <h2
              className="text-sm font-medium mb-3"
              style={{ color: "var(--text)" }}
            >
              {t("byClient")}
            </h2>
            <Table<ByClientRow>
              columns={byClientColumns}
              rows={summary.byClient}
              emptyLabel={t("noActivity")}
              rowKey={(row) => row.client_id}
            />
          </div>
        </div>
      )}

      <p
        className="text-xs"
        style={{ color: "var(--dim)" }}
      >
        {t("trustIsolationNote")}
      </p>
    </div>
  );
}
