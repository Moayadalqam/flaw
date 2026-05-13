import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type {
  RetainerStatus,
  RetainerWithRelations,
  TrustLedgerRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Retainers · Lex",
};

export const dynamic = "force-dynamic";

/**
 * Retainers list page (workspace surface).
 *
 * RLS-scoped reads from `retainers` (joined clients + matters) plus a single
 * grouped read from `trust_ledger` to compute running balance per client.
 * Visual structure mirrors the OLD top-level demo (sage-olive `--trust`
 * accent on borders, captions, and balance numbers) but the data is real
 * and the "Trust ledger →" link points to `/trust` (the (workspace) route,
 * NOT the deleted `/trust-ledger`).
 *
 * Design contract per Phase 4 plan:
 *   - `var(--trust)` ≥ 3 occurrences on this page (border, caption,
 *     headline numbers, "+ New retainer" button)
 *   - `var(--accent)` (terracotta = revenue) MUST NOT appear as a primary
 *     visual cue here. Trust surfaces are sage-only.
 *   - Tabular numerals on every money + date column.
 */
export default async function RetainersListPage() {
  const supabase = await createClient();
  const t = await getTranslations("retainers");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // Pull retainers joined with the minimum client + matter fields.
  // The relation names (`clients`, `matters`) are the default Supabase
  // PostgREST `embedded resource` names from the FKs on `retainers`.
  const { data: retainersData } = await supabase
    .from("retainers")
    .select(
      "*, clients(name_el, name_en), matters(matter_number, title)",
    )
    .order("signed_at", { ascending: false })
    .returns<Omit<RetainerWithRelations, "balance">[]>();
  const retainerRows = retainersData ?? [];

  // One grouped read of every visible trust_ledger row — RLS already scopes
  // to the workspace. Build a Map<clientId, balance> for O(1) per-card
  // lookup. Acceptable for the demo (≤ a few hundred entries); upgrade to
  // a server-side aggregate RPC if that ever changes.
  const { data: ledgerRows } = await supabase
    .from("trust_ledger")
    .select("client_id, debit_amount, credit_amount")
    .returns<
      Pick<TrustLedgerRow, "client_id" | "debit_amount" | "credit_amount">[]
    >();
  const balanceByClient = new Map<string, number>();
  for (const row of ledgerRows ?? []) {
    const prior = balanceByClient.get(row.client_id) ?? 0;
    const delta =
      parseFloat(row.debit_amount) - parseFloat(row.credit_amount);
    balanceByClient.set(row.client_id, prior + delta);
  }

  // "Total deposits held" — SUM(deposit_amount) over status='active'.
  // Mirrors the OLD demo's headline stat, but real.
  let totalDepositsHeld = 0;
  for (const r of retainerRows) {
    if (r.status === "active") {
      totalDepositsHeld += parseFloat(r.deposit_amount);
    }
  }

  const statusLabel = (s: RetainerStatus): string => {
    switch (s) {
      case "active":
        return t("statusActive");
      case "depleted":
        return t("statusDepleted");
      case "closed":
        return t("statusClosed");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p
            className="tabular"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--trust)",
              marginBottom: "var(--space-2)",
              fontWeight: 500,
            }}
          >
            {t("title")}
          </p>
          <h1
            className="font-display tracking-tight"
            style={{
              fontSize: "clamp(2rem, 4vw, 2.6rem)",
              color: "var(--trust)",
              letterSpacing: "-0.018em",
              fontWeight: 600,
            }}
          >
            {t("title")}
          </h1>
        </div>
        <Link
          href="/retainers/new"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--trust)",
            color: "var(--bg)",
          }}
        >
          + {t("new")}
        </Link>
      </header>

      <section
        className="mb-8 rounded-md"
        style={{
          padding: "var(--pad-card)",
          background: "var(--trust-bg)",
          border: "1px solid var(--trust)",
        }}
      >
        <div className="grid sm:grid-cols-2 gap-6 items-start">
          <div>
            <div
              className="tabular"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--trust)",
                fontWeight: 500,
              }}
            >
              {t("deposit")} · {t("statusActive")}
            </div>
            <div
              className="font-display tabular"
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
                color: "var(--trust)",
                marginTop: "var(--space-2)",
                lineHeight: 1.1,
                fontWeight: 600,
              }}
            >
              {formatMoney(totalDepositsHeld, "EUR", locale)}
            </div>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--muted)" }}
          >
            {t("disbarmentNote")}
          </p>
        </div>
      </section>

      {retainerRows.length === 0 ? (
        <div
          className="rounded-md text-sm text-center"
          style={{
            padding: "var(--space-8)",
            border: "1px dashed var(--line)",
            color: "var(--dim)",
            background: "var(--surface)",
          }}
        >
          {t("title")} —{" "}
          <Link
            href="/retainers/new"
            className="underline"
            style={{ color: "var(--trust)" }}
          >
            {t("new")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {retainerRows.map((r) => {
            const balance = balanceByClient.get(r.client_id) ?? 0;
            const primary = isGreek
              ? r.clients?.name_el
              : r.clients?.name_en;
            const secondary = isGreek
              ? r.clients?.name_en
              : r.clients?.name_el;
            const showSecondary =
              secondary && primary && secondary !== primary;
            return (
              <article
                key={r.id}
                className="rounded-lg"
                style={{
                  padding: "var(--space-6)",
                  background: "var(--bg)",
                  border: "1px solid var(--trust)",
                }}
              >
                <div className="flex items-start justify-between gap-6 flex-wrap mb-3">
                  <div>
                    <div
                      className="tabular"
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--dim)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      {r.agreement_number}
                    </div>
                    <div
                      className="font-display text-xl"
                      style={{ color: "var(--text)" }}
                    >
                      {primary ?? "—"}
                    </div>
                    {showSecondary ? (
                      <div
                        className="text-sm"
                        style={{ color: "var(--muted)" }}
                      >
                        {secondary}
                      </div>
                    ) : null}
                    {r.matters ? (
                      <div
                        className="tabular text-xs"
                        style={{
                          color: "var(--muted)",
                          marginTop: "var(--space-2)",
                        }}
                      >
                        {t("matter")}: {r.matters.title} ·{" "}
                        {r.matters.matter_number}
                      </div>
                    ) : null}
                    <div
                      className="text-xs"
                      style={{
                        color: "var(--muted)",
                        marginTop: "var(--space-1)",
                      }}
                    >
                      {t("status")}: {statusLabel(r.status)}
                    </div>
                  </div>
                  <div className="text-right tabular">
                    <div
                      style={{
                        fontSize: "0.7rem",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--trust)",
                        fontWeight: 500,
                      }}
                    >
                      {t("balance")}
                    </div>
                    <div
                      className="font-display"
                      style={{
                        fontSize: "clamp(1.4rem, 2.5vw, 1.8rem)",
                        color: "var(--trust)",
                        marginTop: "var(--space-1)",
                        lineHeight: 1.1,
                        fontWeight: 600,
                      }}
                    >
                      {formatMoney(balance, "EUR", locale)}
                    </div>
                    <div
                      className="text-xs"
                      style={{
                        color: "var(--muted)",
                        marginTop: "var(--space-1)",
                      }}
                    >
                      {t("deposit")}:{" "}
                      {formatMoney(
                        parseFloat(r.deposit_amount),
                        r.currency,
                        locale,
                      )}{" "}
                      · {t("signed")}{" "}
                      {formatDate(r.signed_at, locale)}
                    </div>
                  </div>
                </div>
                {r.terms ? (
                  <div
                    className="text-sm pt-3 mt-3"
                    style={{
                      color: "var(--text)",
                      borderTop: "1px solid var(--line-soft)",
                    }}
                  >
                    {r.terms}
                  </div>
                ) : null}
                <div className="mt-4 flex gap-2 flex-wrap">
                  <Link
                    href={`/retainers/${r.id}`}
                    className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium border transition-colors"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--text)",
                      background: "var(--bg)",
                    }}
                  >
                    {t("title")} →
                  </Link>
                  {r.clients ? (
                    <Link
                      href={`/clients/${r.client_id}`}
                      className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium border transition-colors"
                      style={{
                        borderColor: "var(--line)",
                        color: "var(--text)",
                        background: "var(--bg)",
                      }}
                    >
                      {t("client")} →
                    </Link>
                  ) : null}
                  <Link
                    href="/trust"
                    className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium border transition-colors"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--text)",
                      background: "var(--bg)",
                    }}
                  >
                    Trust ledger →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
