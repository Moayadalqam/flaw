import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type LexLocale } from "@/lib/format";
import { getOverdueInvoices } from "./queries";
import { AgingTable } from "./AgingTable";

export const metadata: Metadata = {
  title: "Aging report · Lex",
};

export const dynamic = "force-dynamic";

/**
 * /reports/aging — REQ-016 / REP-02 / Phase 6 Task 4.
 *
 * Server component. Auth + workspace fetch + RLS-scoped pull of overdue
 * invoices. The list is passed to the AgingTable client component which
 * owns the row-selection state and opens the Draft Reminder modal.
 *
 * Trust-isolation: this surface reads `invoices` ONLY via
 * `getOverdueInvoices`. No retainer / trust ledger reference here or
 * downstream — the builder verifier greps this directory and blocks the
 * commit on any such reference.
 */
export default async function AgingReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!ws) {
    redirect("/login");
  }

  const rows = await getOverdueInvoices(supabase, ws.id);

  const t = await getTranslations("aging");
  const locale = (await getLocale()) as LexLocale;

  // Sum totals across all overdue invoices for the page subtitle. Money
  // columns come back as NUMERIC strings — Number() at the formatting
  // seam only.
  const grandTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
  const currency = rows[0]?.currency ?? "EUR";

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
            {t("title")}
          </h1>
          {rows.length > 0 ? (
            <p
              className="mt-3 text-sm tabular"
              style={{ color: "var(--muted)" }}
            >
              {rows.length} ·{" "}
              <span style={{ color: "var(--text)", fontWeight: 500 }}>
                {formatMoney(grandTotal, currency, locale)}
              </span>
            </p>
          ) : null}
        </div>
        <Link
          href="/reports"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            border: "1px solid var(--line)",
            color: "var(--text)",
            background: "var(--bg-2)",
          }}
        >
          ← {t("title")}
        </Link>
      </header>

      {rows.length === 0 ? (
        <div
          className="border border-dashed rounded-lg px-8 py-16 text-center"
          style={{
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--muted)",
          }}
        >
          <p className="text-base mb-4">{t("noOverdueEmpty")}</p>
          <Link
            href="/reports"
            className="inline-block text-sm underline"
            style={{ color: "var(--accent)" }}
          >
            ← Reports
          </Link>
        </div>
      ) : (
        <AgingTable rows={rows} locale={locale} />
      )}
    </div>
  );
}
