import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { LexLocale } from "@/lib/format";

/**
 * /reports — Reports index. Two navigation cards: Monthly summary
 * (→ `/reports/summary`) and Aging report (→ `/reports/aging`).
 *
 * Server-rendered, no data fetching here — the children pages own their
 * queries. The index is intentionally minimal so the lawyer can pick a
 * report in one click without scanning a dense dashboard.
 *
 * Card descriptions are hardcoded bilingual literals — the dedicated
 * `reports.*` i18n namespace owns titles + table labels (added in Phase 6
 * Task 1) but does not include marketing-style index copy. Mirrors the
 * voice of `(workspace)/drafts/page.tsx` which uses the same approach
 * for its subtitle line.
 */

export const metadata: Metadata = {
  title: "Reports · Lex",
};

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const t = await getTranslations("reports");
  const tNav = await getTranslations("nav");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const summaryDescription = isGreek
    ? "Έσοδα, ανεξόφλητα και καθυστερημένα του μήνα — με ανάλυση ανά υπόθεση και πελάτη."
    : "This month's revenue, outstanding, and overdue figures — broken down by case and client.";
  const agingDescription = isGreek
    ? "Καθυστερημένα τιμολόγια κατηγοριοποιημένα σε 0–30, 31–60 και 60+ ημέρες — με σύνταξη υπενθυμίσεων από AI."
    : "Overdue invoices bucketed by 0–30, 31–60, and 60+ days — with AI-drafted reminder emails.";

  const cards = [
    {
      key: "summary",
      href: "/reports/summary",
      title: t("summary"),
      description: summaryDescription,
      accent: "var(--accent)",
    },
    {
      key: "aging",
      href: "/reports/aging",
      title: t("aging"),
      description: agingDescription,
      accent: "var(--kill)",
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="mb-10">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
        >
          {tNav("reports")}
        </p>
        <h1
          className="font-display text-4xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {t("title")}
        </h1>
      </header>

      <section
        aria-label={t("title")}
        className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-4)]"
      >
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group block rounded-md border p-6 transition-colors hover:bg-[var(--bg-2)]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--line)",
              borderTop: `3px solid ${card.accent}`,
              minHeight: "144px",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="font-display text-2xl tracking-tight"
                  style={{
                    color: "var(--text)",
                    letterSpacing: "-0.018em",
                  }}
                >
                  {card.title}
                </h2>
                <p
                  className="mt-3 text-sm max-w-md"
                  style={{ color: "var(--muted)" }}
                >
                  {card.description}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="text-2xl transition-transform group-hover:translate-x-1"
                style={{ color: "var(--accent)" }}
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
