import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type LexLocale } from "@/lib/format";
import type { TrustLedgerRow } from "@/lib/types";

/**
 * TrustBalanceCard — server component.
 *
 * Renders the running trust-account balance for a single client. The balance
 * is `SUM(debit_amount) - SUM(credit_amount)` over `trust_ledger` filtered to
 * `client_id`. RLS (Migration 002, trust_ledger_select policy at line 366)
 * scopes the query to the caller's workspace implicitly — no explicit
 * `workspace_id` filter is needed.
 *
 * Server-rendered, no client interactivity. The card is read-only — the
 * only legitimate way to change the balance is via the SECURITY DEFINER SP
 * `create_retainer_with_deposit` (Migration 008) or future fee_transfer /
 * refund flows (Phase 6).
 *
 * Visual contract per DESIGN.md and Phase 4 plan:
 *   - Background `var(--trust-bg)` (~8% sage-olive wash)
 *   - Border `1px solid var(--trust)`
 *   - Padding `var(--pad-card)`
 *   - Caption `0.7rem` uppercase, letter-spacing `+0.08em`, color `var(--trust)`
 *   - Balance in Crimson Pro display, `clamp(2rem, 4vw, 2.6rem)`, color
 *     `var(--trust)`, tabular numerals
 *   - If balance === 0, render "—" not "€0.00"
 *   - Verbatim per-locale caption: "Trust balance — client funds" /
 *     "Υπόλοιπο καταπιστεύματος — χρήματα πελάτη"
 */
export async function TrustBalanceCard({ clientId }: { clientId: string }) {
  const supabase = await createClient();
  const t = await getTranslations("retainers");
  const locale = (await getLocale()) as LexLocale;

  // RLS scopes to the caller's workspace. We pull debit + credit columns
  // and sum in JS — Supabase's REST endpoint does not expose Postgres
  // aggregates without an RPC, and rolling a one-off RPC for a single
  // card would be over-engineered for ≤ a few hundred ledger entries per
  // client during the demo.
  const { data: ledger } = await supabase
    .from("trust_ledger")
    .select("debit_amount, credit_amount")
    .eq("client_id", clientId)
    .returns<Pick<TrustLedgerRow, "debit_amount" | "credit_amount">[]>();

  let balance = 0;
  for (const row of ledger ?? []) {
    balance += parseFloat(row.debit_amount) - parseFloat(row.credit_amount);
  }
  // Round to two decimals to avoid IEEE-754 tail in display.
  balance = Math.round(balance * 100) / 100;

  const isZero = balance === 0;

  return (
    <section
      aria-label={t("trustBalanceLabel")}
      style={{
        background: "var(--trust-bg)",
        border: "1px solid var(--trust)",
        borderRadius: "0.5rem",
        padding: "var(--pad-card)",
      }}
    >
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
        {t("trustBalanceLabel")}
      </div>
      <div
        className="font-display tabular"
        style={{
          fontSize: "clamp(2rem, 4vw, 2.6rem)",
          lineHeight: 1.1,
          color: "var(--trust)",
          fontWeight: 600,
          marginTop: "var(--space-2)",
        }}
      >
        {isZero ? "—" : formatMoney(balance, "EUR", locale)}
      </div>
    </section>
  );
}
