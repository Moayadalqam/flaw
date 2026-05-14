import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, type LexLocale } from "@/lib/format";
import { MonthPicker } from "./MonthPicker";
import { SummaryCards } from "./SummaryCards";
import { getMonthlySummary } from "./queries";

/**
 * /reports/summary — Monthly financial summary (REQ-015 / REP-01).
 *
 * Server component. Reads `?month=YYYY-MM` (default: current month). The
 * month picker pushes URL changes via `router.replace`, so this page
 * re-fetches on every month change without any client-side state.
 *
 * Trust-isolation invariant: every figure on this page is derived solely
 * from the `invoices` table — the dedicated client-funds ledger table and
 * the retainer-deposits column are never referenced from this surface.
 * Client funds are not revenue. See `./queries.ts` for the verified query
 * graph.
 */

export const metadata: Metadata = {
  title: "Monthly Summary · Lex",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

function defaultYearMonth(): { year: number; month: number; ym: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  return { year, month, ym };
}

function parseMonthParam(
  raw: string | undefined,
): { year: number; month: number; ym: string } {
  if (!raw) return defaultYearMonth();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return defaultYearMonth();
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return defaultYearMonth();
  }
  if (month < 1 || month > 12) return defaultYearMonth();
  return {
    year,
    month,
    ym: `${match[1]}-${match[2]}`,
  };
}

export default async function MonthlySummaryPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const t = await getTranslations("reports");
  const locale = (await getLocale()) as LexLocale;

  // Workspace gate is enforced in (workspace)/layout.tsx, but `getMonthlySummary`
  // accepts the workspaceId explicitly so the defense-in-depth filter on every
  // invoices query is present even in the unlikely event RLS regresses.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!workspace) redirect("/login");

  const params = await searchParams;
  const { year, month, ym } = parseMonthParam(params.month);

  const summary = await getMonthlySummary(supabase, workspace.id, year, month);

  // Subtitle: localised month name (Greek "Μάιος 2026" / English "May 2026").
  const monthLabel = formatDate(
    new Date(Date.UTC(year, month - 1, 1)),
    locale,
  );

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <p
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
          >
            {t("title")}
          </p>
          <h1
            className="font-display text-4xl tracking-tight"
            style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
          >
            {t("summary")}
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--muted)" }}
          >
            {monthLabel}
          </p>
        </div>
        <MonthPicker initial={ym} label={t("monthSelector")} />
      </header>

      <SummaryCards summary={summary} locale={locale} />
    </div>
  );
}
