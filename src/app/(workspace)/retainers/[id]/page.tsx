import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RetainerActions } from "@/app/(workspace)/retainers/RetainerActions";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type {
  ClientRow,
  MatterRow,
  RetainerRow,
  RetainerStatus,
  TrustEntryKind,
  TrustLedgerRow,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Retainer · Lex",
};

export const dynamic = "force-dynamic";

export default async function RetainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("retainers");
  const tTrust = await getTranslations("trust");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const { data: retainer } = await supabase
    .from("retainers")
    .select("*")
    .eq("id", id)
    .maybeSingle<RetainerRow>();

  if (!retainer) {
    notFound();
  }

  const [clientRes, matterRes, ledgerRes] = await Promise.all([
    supabase
      .from("clients")
      .select("*")
      .eq("id", retainer.client_id)
      .maybeSingle<ClientRow>(),
    retainer.matter_id
      ? supabase
          .from("matters")
          .select("*")
          .eq("id", retainer.matter_id)
          .maybeSingle<MatterRow>()
      : Promise.resolve({ data: null as MatterRow | null }),
    // Per-retainer ledger slice. Picks up rows where `related_retainer_id`
    // matches OR rows for the same client that have NO `related_retainer_id`
    // set (so future fee_transfer / refund entries that don't carry a
    // back-pointer still surface here). RLS scopes the rest.
    supabase
      .from("trust_ledger")
      .select("*")
      .eq("client_id", retainer.client_id)
      .or(`related_retainer_id.eq.${retainer.id},related_retainer_id.is.null`)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<TrustLedgerRow[]>(),
  ]);

  const client = clientRes.data;
  const matter = matterRes.data;
  const ledger = ledgerRes.data ?? [];

  // Per-client running balance (the headline number on the detail page).
  let balance = 0;
  for (const row of ledger) {
    balance += parseFloat(row.debit_amount) - parseFloat(row.credit_amount);
  }
  balance = Math.round(balance * 100) / 100;

  const primary = isGreek ? client?.name_el : client?.name_en;
  const secondary = isGreek ? client?.name_en : client?.name_el;
  const showSecondary = secondary && primary && secondary !== primary;

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

  // Entry-kind labels. The `trust` namespace owns the canonical labels
  // (Task 3's surface); we re-use the keys it added there.
  const kindLabel = (k: TrustEntryKind): string => {
    switch (k) {
      case "deposit":
        return tTrust("entryKind.deposit");
      case "fee_transfer":
        return tTrust("entryKind.feeTransfer");
      case "refund":
        return tTrust("entryKind.refund");
      case "disbursement":
        return tTrust("entryKind.disbursement");
      case "reversal":
        return tTrust("entryKind.reversal");
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <Link
        href="/retainers"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← {t("title")}
      </Link>

      <header className="mt-6 mb-8 flex items-start justify-between gap-6 flex-wrap">
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
            {retainer.agreement_number}
          </p>
          <h1
            className="font-display tracking-tight"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
              color: "var(--text)",
              letterSpacing: "-0.018em",
              fontWeight: 600,
            }}
          >
            {primary ?? "—"}
          </h1>
          {showSecondary ? (
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--muted)" }}
            >
              {secondary}
            </p>
          ) : null}
          {matter ? (
            <p
              className="tabular text-xs mt-2"
              style={{ color: "var(--muted)" }}
            >
              {t("matter")}: {matter.title} · {matter.matter_number}
            </p>
          ) : null}
          <p
            className="text-xs mt-1"
            style={{ color: "var(--muted)" }}
          >
            {t("status")}: {statusLabel(retainer.status)}
          </p>
        </div>
        <RetainerActions
          retainerId={retainer.id}
          status={retainer.status}
        />
      </header>

      {/* Headline trust card — balance + deposit + signed-at */}
      <section
        className="rounded-md mb-8"
        style={{
          padding: "var(--pad-card)",
          background: "var(--trust-bg)",
          border: "1px solid var(--trust)",
        }}
      >
        <div className="grid sm:grid-cols-3 gap-6">
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
              {t("balance")}
            </div>
            <div
              className="font-display tabular"
              style={{
                fontSize: "clamp(2rem, 4vw, 2.6rem)",
                color: "var(--trust)",
                marginTop: "var(--space-2)",
                lineHeight: 1.1,
                fontWeight: 600,
              }}
            >
              {balance === 0
                ? "—"
                : formatMoney(balance, retainer.currency, locale)}
            </div>
          </div>
          <div>
            <div
              className="tabular"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 500,
              }}
            >
              {t("deposit")}
            </div>
            <div
              className="font-display tabular"
              style={{
                fontSize: "clamp(1.4rem, 2.5vw, 1.8rem)",
                color: "var(--text)",
                marginTop: "var(--space-2)",
                lineHeight: 1.1,
              }}
            >
              {formatMoney(
                parseFloat(retainer.deposit_amount),
                retainer.currency,
                locale,
              )}
            </div>
          </div>
          <div>
            <div
              className="tabular"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
                fontWeight: 500,
              }}
            >
              {t("signed")}
            </div>
            <div
              className="tabular"
              style={{
                fontSize: "1rem",
                color: "var(--text)",
                marginTop: "var(--space-2)",
              }}
            >
              {formatDate(retainer.signed_at, locale)}
            </div>
          </div>
        </div>
      </section>

      {retainer.terms ? (
        <section
          className="rounded-md mb-8"
          style={{
            padding: "var(--space-6)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            className="tabular mb-3"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--dim)",
              fontWeight: 500,
            }}
          >
            {t("terms")}
          </div>
          <p
            className="text-sm leading-relaxed whitespace-pre-line"
            style={{ color: "var(--text)" }}
          >
            {retainer.terms}
          </p>
        </section>
      ) : null}

      {/* Per-retainer trust ledger slice */}
      <section
        className="rounded-md"
        style={{
          padding: "var(--space-6)",
          background: "var(--bg)",
          border: "1px solid var(--trust)",
        }}
      >
        <div
          className="tabular mb-4"
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--trust)",
            fontWeight: 500,
          }}
        >
          Trust ledger ({ledger.length})
        </div>
        {ledger.length === 0 ? (
          <p
            className="text-sm"
            style={{ color: "var(--dim)" }}
          >
            —
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm tabular"
              style={{ borderCollapse: "collapse" }}
            >
              <thead>
                <tr style={{ color: "var(--muted)" }}>
                  <th
                    className="text-left py-2 pr-3 font-medium text-xs"
                    style={{
                      borderBottom: "1px solid var(--line)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {tTrust("tableHeaders.date")}
                  </th>
                  <th
                    className="text-left py-2 pr-3 font-medium text-xs"
                    style={{
                      borderBottom: "1px solid var(--line)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {tTrust("tableHeaders.kind")}
                  </th>
                  <th
                    className="text-left py-2 pr-3 font-medium text-xs"
                    style={{
                      borderBottom: "1px solid var(--line)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {tTrust("tableHeaders.description")}
                  </th>
                  <th
                    className="text-right py-2 pr-3 font-medium text-xs"
                    style={{
                      borderBottom: "1px solid var(--line)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {tTrust("tableHeaders.debit")}
                  </th>
                  <th
                    className="text-right py-2 font-medium text-xs"
                    style={{
                      borderBottom: "1px solid var(--line)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {tTrust("tableHeaders.credit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => {
                  const debit = parseFloat(row.debit_amount);
                  const credit = parseFloat(row.credit_amount);
                  return (
                    <tr key={row.id}>
                      <td
                        className="py-2 pr-3"
                        style={{
                          borderBottom: "1px solid var(--line-soft)",
                          color: "var(--muted)",
                        }}
                      >
                        {formatDate(row.occurred_at, locale)}
                      </td>
                      <td
                        className="py-2 pr-3 text-xs"
                        style={{
                          borderBottom: "1px solid var(--line-soft)",
                          color: "var(--trust)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {kindLabel(row.entry_kind)}
                      </td>
                      <td
                        className="py-2 pr-3"
                        style={{
                          borderBottom: "1px solid var(--line-soft)",
                          color: "var(--text)",
                        }}
                      >
                        {row.description}
                      </td>
                      <td
                        className="py-2 pr-3 text-right"
                        style={{
                          borderBottom: "1px solid var(--line-soft)",
                          color: debit > 0 ? "var(--text)" : "var(--dim)",
                        }}
                      >
                        {debit > 0
                          ? formatMoney(debit, row.currency, locale)
                          : "—"}
                      </td>
                      <td
                        className="py-2 text-right"
                        style={{
                          borderBottom: "1px solid var(--line-soft)",
                          color: credit > 0 ? "var(--text)" : "var(--dim)",
                        }}
                      >
                        {credit > 0
                          ? formatMoney(credit, row.currency, locale)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
