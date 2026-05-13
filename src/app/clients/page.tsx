import { AppNav } from "@/components/AppNav";
import { CLIENTS, INVOICES, TRUST_LEDGER, eur } from "@/lib/demo-data";

export const metadata = { title: "Clients · Lex" };

export default function ClientsPage() {
  return (
    <>
      <AppNav current="/clients" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-2">
                Clients
              </p>
              <h1 className="font-display text-4xl text-[var(--text)] tracking-tight">
                Πελάτες
              </h1>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-md text-white text-sm font-medium"
              style={{ background: "var(--accent)" }}
            >
              + New client
            </button>
          </div>

          <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)]">
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  <th className="text-left px-5 py-3 font-normal">Name</th>
                  <th className="text-left px-5 py-3 font-normal">VAT</th>
                  <th className="text-left px-5 py-3 font-normal">Lang</th>
                  <th className="text-right px-5 py-3 font-normal">Invoices</th>
                  <th className="text-right px-5 py-3 font-normal">Billed</th>
                  <th className="text-right px-5 py-3 font-normal">Trust balance</th>
                </tr>
              </thead>
              <tbody>
                {CLIENTS.map((c) => {
                  const invoices = INVOICES.filter((i) => i.clientId === c.id);
                  const billed = invoices.reduce((a, i) => a + i.total, 0);
                  const trust = TRUST_LEDGER.filter(
                    (t) => t.clientId === c.id,
                  ).reduce((a, t) => a + t.debit - t.credit, 0);
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--line-soft)] hover:bg-[var(--bg-2)] transition-colors"
                    >
                      <td className="px-5 py-4 text-[var(--text)]">
                        <div className="font-medium">{c.nameEl}</div>
                        {c.nameEl !== c.nameEn && (
                          <div className="text-xs text-[var(--dim)]">
                            {c.nameEn}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] tabular text-xs">
                        {c.vat ?? "—"}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] uppercase text-xs">
                        {c.language}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--muted)] tabular">
                        {invoices.length}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--text)] tabular">
                        {billed > 0 ? eur.format(billed) : "—"}
                      </td>
                      <td
                        className="px-5 py-4 text-right tabular font-medium"
                        style={{
                          color: trust > 0 ? "var(--trust)" : "var(--dim)",
                        }}
                      >
                        {trust > 0 ? eur.format(trust) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-[var(--dim)]">
            Trust balances are computed from a separate, append-only
            <code className="mx-1.5 px-1.5 py-0.5 rounded bg-[var(--bg-2)]">
              trust_ledger
            </code>
            table. Client funds are never mixed with billed revenue.
          </p>
        </div>
      </main>
    </>
  );
}
