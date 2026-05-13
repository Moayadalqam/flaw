import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";

export const metadata: Metadata = {
  title: "Trust ledger · Lex",
};

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Row shape — minimal columns we need from `public.trust_ledger`, joined with
// the bare-minimum client fields for locale-aware naming and per-row drill-
// down. RLS scopes the query to the authenticated user's workspace; workspace
// gating is enforced upstream by `(workspace)/layout.tsx`.
// ---------------------------------------------------------------------------

type TrustEntryKind =
  | "deposit"
  | "fee_transfer"
  | "refund"
  | "disbursement"
  | "reversal";

interface TrustLedgerRow {
  id: string;
  client_id: string;
  entry_kind: TrustEntryKind;
  debit_amount: string;
  credit_amount: string;
  currency: string;
  description: string;
  occurred_at: string;
  created_at: string;
  clients: { name_el: string; name_en: string } | null;
}

// camelCase mapping for the snake_case enum values from `trust_entry_kind`.
function entryKindKey(kind: TrustEntryKind): string {
  switch (kind) {
    case "deposit":
      return "deposit";
    case "fee_transfer":
      return "feeTransfer";
    case "refund":
      return "refund";
    case "disbursement":
      return "disbursement";
    case "reversal":
      return "reversal";
  }
}

export default async function TrustLedgerPage() {
  const supabase = await createClient();
  const t = await getTranslations("trust");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // RLS-scoped read. Order is newest first; balance accumulation runs
  // chronologically (oldest → newest) inside the reduce below.
  const { data: rowsData } = await supabase
    .from("trust_ledger")
    .select(
      "id, client_id, entry_kind, debit_amount, credit_amount, currency, description, occurred_at, created_at, clients!inner(name_el, name_en)",
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<TrustLedgerRow[]>();
  const rows: TrustLedgerRow[] = rowsData ?? [];

  // -------------------------------------------------------------------------
  // Running balance — per-client. The table is rendered newest-first
  // (occurred_at desc, created_at desc), but a meaningful "balance after this
  // entry" must accumulate in chronological order (oldest → newest).
  //
  // Strategy: walk the rows in REVERSE (chronological), accumulating into a
  // Map<clientId, balance>. Each row's snapshot is the post-entry balance
  // for that client. The Map's value is then attached to the row keyed by
  // row.id. When we render, we look up by row.id and show the per-client
  // snapshot.
  //
  // Total balance (right rail) = sum across all rows of debit − credit,
  // cross-client. Per-row Balance column = per-client running snapshot.
  // -------------------------------------------------------------------------
  const balanceByRow = new Map<string, number>();
  {
    const perClient = new Map<string, number>();
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const debit = Number(row.debit_amount);
      const credit = Number(row.credit_amount);
      const prev = perClient.get(row.client_id) ?? 0;
      const next = prev + debit - credit;
      perClient.set(row.client_id, next);
      balanceByRow.set(row.id, next);
    }
  }

  const totalBalance = rows.reduce(
    (sum, r) => sum + Number(r.debit_amount) - Number(r.credit_amount),
    0,
  );

  // Display currency — the trust ledger schema defaults to EUR, but each row
  // carries its own currency. We use the first row's currency for the total
  // (or EUR on empty), since this is a single-currency demo.
  const displayCurrency = rows[0]?.currency ?? "EUR";

  return (
    <div
      style={{
        background: "var(--trust-bg)",
        margin: "calc(-1 * var(--pad-section)) calc(-1 * var(--pad-x))",
        padding: "var(--pad-section) var(--pad-x)",
        minHeight: "100%",
      }}
    >
      <div className="w-full max-w-6xl mx-auto">
        {/* Banner: paper card on sage wash, var(--trust) border + caption */}
        <div
          className="mb-8 px-5 py-4 rounded-md border"
          style={{
            background: "var(--bg)",
            borderColor: "var(--trust)",
          }}
        >
          <div
            className="text-[0.7rem] uppercase font-medium mb-1"
            style={{
              color: "var(--trust)",
              letterSpacing: "0.08em",
            }}
          >
            {t("title")}
          </div>
          <div
            className="text-sm"
            style={{ color: "var(--text)" }}
          >
            {t("title")} {"\u2014"} {t("banner")}
          </div>
        </div>

        {/* Header row: page title + Total balance stat */}
        <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <h1
            className="font-display tracking-tight"
            style={{
              color: "var(--trust)",
              fontSize: "clamp(2rem, 4vw, 2.6rem)",
              fontWeight: 600,
              letterSpacing: "-0.018em",
            }}
          >
            {t("title")}
          </h1>
          <div className="text-right">
            <div
              className="text-[0.7rem] uppercase mb-1"
              style={{
                color: "var(--dim)",
                letterSpacing: "0.08em",
              }}
            >
              {t("totalBalance")}
            </div>
            <div
              className="font-display tabular"
              style={{
                color: "var(--trust)",
                fontSize: "clamp(2rem, 4vw, 2.6rem)",
                fontWeight: 700,
              }}
            >
              {formatMoney(totalBalance, displayCurrency, locale)}
            </div>
          </div>
        </header>

        {/* Ledger — table or empty-state */}
        {rows.length === 0 ? (
          <div
            className="border border-dashed rounded-lg px-8 py-12 text-center"
            style={{
              borderColor: "var(--trust)",
              background: "var(--bg)",
              color: "var(--muted)",
            }}
          >
            {t("noEntries")}
          </div>
        ) : (
          <div
            className="border rounded-lg overflow-x-auto"
            style={{
              borderColor: "var(--trust)",
              background: "var(--bg)",
            }}
          >
            <table
              className="w-full text-sm"
              style={{ minWidth: "640px", borderCollapse: "collapse" }}
            >
              <thead
                style={{
                  background: "var(--bg-2)",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <tr>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-left"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.date")}
                  </th>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-left"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.client")}
                  </th>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-left"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.description")}
                  </th>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-left"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.kind")}
                  </th>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-right"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.debit")}
                  </th>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-right"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.credit")}
                  </th>
                  <th
                    scope="col"
                    className="text-[0.7rem] uppercase font-normal px-5 py-3 text-right"
                    style={{
                      letterSpacing: "0.08em",
                      color: "var(--dim)",
                    }}
                  >
                    {t("tableHeaders.balance")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const debit = Number(row.debit_amount);
                  const credit = Number(row.credit_amount);
                  const balance = balanceByRow.get(row.id) ?? 0;
                  const clientName = row.clients
                    ? isGreek
                      ? row.clients.name_el
                      : row.clients.name_en
                    : "\u2014";
                  const kindLabel = t(`entryKind.${entryKindKey(row.entry_kind)}`);
                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-[var(--surface)]"
                      style={{ borderTop: "1px solid var(--line-soft)" }}
                    >
                      <td
                        className="px-5 py-4 tabular"
                        style={{ color: "var(--muted)" }}
                      >
                        {formatDate(row.occurred_at, locale)}
                      </td>
                      <td
                        className="px-5 py-4"
                        style={{ color: "var(--text)" }}
                      >
                        <Link
                          href={`/clients/${row.client_id}`}
                          className="transition-colors hover:text-[var(--trust)]"
                          style={{ color: "inherit" }}
                        >
                          {clientName}
                        </Link>
                      </td>
                      <td
                        className="px-5 py-4"
                        style={{ color: "var(--muted)" }}
                      >
                        {row.description}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center text-[0.7rem] uppercase font-medium"
                          style={{
                            background: "var(--surface)",
                            color: "var(--muted)",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            letterSpacing: "0.08em",
                            lineHeight: 1.4,
                          }}
                        >
                          {kindLabel}
                        </span>
                      </td>
                      <td
                        className="px-5 py-4 text-right tabular"
                        style={{
                          color: "var(--text)",
                          fontWeight: 500,
                        }}
                      >
                        {debit > 0
                          ? formatMoney(debit, row.currency, locale)
                          : "\u2014"}
                      </td>
                      <td
                        className="px-5 py-4 text-right tabular"
                        style={{ color: "var(--muted)" }}
                      >
                        {credit > 0
                          ? formatMoney(credit, row.currency, locale)
                          : "\u2014"}
                      </td>
                      <td
                        className="px-5 py-4 text-right tabular"
                        style={{
                          color: "var(--trust)",
                          fontWeight: 600,
                        }}
                      >
                        {formatMoney(balance, row.currency, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Per-client balance semantics footnote */}
        <p
          className="mt-4 text-xs"
          style={{ color: "var(--dim)" }}
        >
          {t("balanceFootnote")}
        </p>

        {/* Append-only Postgres contract — the load-bearing claim */}
        <p
          className="mt-6 text-xs"
          style={{ color: "var(--dim)" }}
        >
          {t("appendOnlyNote")}
        </p>
      </div>
    </div>
  );
}
