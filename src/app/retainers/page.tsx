import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import {
  RETAINERS,
  TRUST_LEDGER,
  getClient,
  getMatter,
  eur,
  date,
} from "@/lib/demo-data";

export const metadata = { title: "Retainers · Lex" };

export default function RetainersPage() {
  const totalDeposits = RETAINERS.reduce((a, r) => a + r.deposit, 0);

  return (
    <>
      <AppNav current="/retainers" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p
                className="text-[10px] uppercase tracking-widest mb-2"
                style={{ color: "var(--trust)" }}
              >
                Retainers
              </p>
              <h1
                className="font-display text-4xl tracking-tight"
                style={{ color: "var(--trust)" }}
              >
                Καταπιστευτικές συμφωνίες
              </h1>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-md text-white text-sm font-medium"
              style={{ background: "var(--trust)" }}
            >
              + New retainer
            </button>
          </div>

          <div
            className="mb-8 px-5 py-4 rounded-md border bg-[var(--bg)]"
            style={{ borderColor: "var(--trust)" }}
          >
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <div
                  className="text-[10px] uppercase tracking-widest font-medium"
                  style={{ color: "var(--trust)" }}
                >
                  Total deposits held
                </div>
                <div
                  className="font-display text-3xl tabular mt-1"
                  style={{ color: "var(--trust)" }}
                >
                  {eur.format(totalDeposits)}
                </div>
              </div>
              <div className="text-sm text-[var(--muted)] leading-relaxed">
                Every retainer creates one append-only{" "}
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-2)] text-xs">
                  trust_ledger
                </code>{" "}
                entry. Balances never appear on the revenue summary —{" "}
                disbarment-grade separation built into the schema.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {RETAINERS.map((r) => {
              const client = getClient(r.clientId);
              const matter = r.matterId ? getMatter(r.matterId) : null;
              const ledger = TRUST_LEDGER.filter(
                (t) => t.clientId === r.clientId,
              );
              const balance = ledger.reduce(
                (a, t) => a + t.debit - t.credit,
                0,
              );
              return (
                <article
                  key={r.id}
                  className="border border-[var(--line)] rounded-lg p-6 bg-[var(--bg)]"
                  style={{ borderColor: "var(--trust)" }}
                >
                  <div className="flex items-start justify-between gap-6 flex-wrap mb-3">
                    <div>
                      <div className="text-xs text-[var(--dim)] tabular mb-1">
                        {r.number}
                      </div>
                      <div className="font-display text-xl text-[var(--text)]">
                        {client?.nameEl}
                      </div>
                      <div className="text-sm text-[var(--muted)]">
                        {client?.nameEn !== client?.nameEl && client?.nameEn}
                      </div>
                      {matter && (
                        <div className="text-xs text-[var(--muted)] mt-2 tabular">
                          Matter: {matter.titleEl} · {matter.number}
                        </div>
                      )}
                    </div>
                    <div className="text-right tabular">
                      <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                        Deposit · Balance
                      </div>
                      <div
                        className="font-display text-2xl mt-1"
                        style={{ color: "var(--trust)" }}
                      >
                        {eur.format(balance)}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        of {eur.format(r.deposit)} signed{" "}
                        {date.format(new Date(r.signedAt))}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-[var(--text)] pt-3 mt-3 border-t border-[var(--line-soft)]">
                    {r.termsEl}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {r.terms}
                  </div>
                  <div className="mt-4 flex gap-2">
                    {client && (
                      <Link
                        href={`/clients/${client.id}`}
                        className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]"
                      >
                        Client →
                      </Link>
                    )}
                    <Link
                      href="/trust-ledger"
                      className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]"
                    >
                      Trust ledger →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
