import { AppNav } from "@/components/AppNav";
import { TRUST_LEDGER, getClient, eur, date } from "@/lib/demo-data";

export const metadata = { title: "Trust ledger · Lex" };

export default function TrustLedgerPage() {
  const totalBalance = TRUST_LEDGER.reduce(
    (a, t) => a + t.debit - t.credit,
    0,
  );

  return (
    <>
      <AppNav current="/trust-ledger" />
      <main className="w-full px-[var(--pad-x)] py-10" style={{ background: "var(--trust-bg)" }}>
        <div className="max-w-6xl mx-auto">
          <div
            className="mb-6 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"
            style={{ borderColor: "var(--trust)" }}
          >
            <div
              className="text-[10px] uppercase tracking-widest font-medium mb-1"
              style={{ color: "var(--trust)" }}
            >
              Trust ledger
            </div>
            <div className="text-sm text-[var(--text)]">
              Client funds. <span className="font-medium">Not lawyer revenue.</span>{" "}
              Stored in a separate, append-only Postgres table. Corrections via
              reversing entries only.
            </div>
          </div>

          <div className="flex items-end justify-between mb-8">
            <div>
              <h1
                className="font-display text-4xl tracking-tight"
                style={{ color: "var(--trust)" }}
              >
                Καταπιστευτικός λογαριασμός
              </h1>
            </div>
            <div className="text-right tabular">
              <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                Total balance
              </div>
              <div
                className="font-display text-3xl"
                style={{ color: "var(--trust)" }}
              >
                {eur.format(totalBalance)}
              </div>
            </div>
          </div>

          <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)]">
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  <th className="text-left px-5 py-3 font-normal">Date</th>
                  <th className="text-left px-5 py-3 font-normal">Client</th>
                  <th className="text-left px-5 py-3 font-normal">Description</th>
                  <th className="text-left px-5 py-3 font-normal">Kind</th>
                  <th className="text-right px-5 py-3 font-normal">Debit</th>
                  <th className="text-right px-5 py-3 font-normal">Credit</th>
                </tr>
              </thead>
              <tbody>
                {TRUST_LEDGER.map((t) => {
                  const client = getClient(t.clientId);
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-[var(--line-soft)]"
                    >
                      <td className="px-5 py-4 text-[var(--muted)] tabular">
                        {date.format(new Date(t.occurredAt))}
                      </td>
                      <td className="px-5 py-4 text-[var(--text)]">
                        {client?.nameEl}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)]">
                        {t.description}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] text-xs uppercase tracking-widest">
                        {t.kind}
                      </td>
                      <td className="px-5 py-4 text-right tabular text-[var(--text)] font-medium">
                        {t.debit > 0 ? eur.format(t.debit) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right tabular text-[var(--muted)]">
                        {t.credit > 0 ? eur.format(t.credit) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-[var(--dim)]">
            Postgres enforces immutability via{" "}
            <code className="px-1.5 py-0.5 rounded bg-[var(--bg-2)]">
              deny_trust_mutation()
            </code>{" "}
            row-level trigger and a TRUNCATE guard. Even the database
            service role cannot UPDATE or DELETE a row here.
          </p>
        </div>
      </main>
    </>
  );
}
