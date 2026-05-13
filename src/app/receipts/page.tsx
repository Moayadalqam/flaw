import { AppNav } from "@/components/AppNav";
import {
  RECEIPTS,
  INVOICES,
  getClient,
  eur,
  date,
} from "@/lib/demo-data";

export const metadata = { title: "Receipts · Lex" };

export default function ReceiptsPage() {
  return (
    <>
      <AppNav current="/receipts" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-2">
                Receipts
              </p>
              <h1 className="font-display text-4xl text-[var(--text)] tracking-tight">
                Αποδείξεις
              </h1>
            </div>
          </div>

          {RECEIPTS.length === 0 ? (
            <Empty />
          ) : (
            <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-2)]">
                  <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                    <th className="text-left px-5 py-3 font-normal">Receipt</th>
                    <th className="text-left px-5 py-3 font-normal">For invoice</th>
                    <th className="text-left px-5 py-3 font-normal">Client</th>
                    <th className="text-left px-5 py-3 font-normal">Paid</th>
                    <th className="text-left px-5 py-3 font-normal">Method</th>
                    <th className="text-right px-5 py-3 font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {RECEIPTS.map((r) => {
                    const inv = INVOICES.find((i) => i.id === r.invoiceId);
                    const client = inv ? getClient(inv.clientId) : undefined;
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-[var(--line-soft)] hover:bg-[var(--bg-2)] transition-colors"
                      >
                        <td className="px-5 py-4 tabular font-display text-[var(--accent)]">
                          {r.number}
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)] tabular text-xs">
                          {inv?.number}
                        </td>
                        <td className="px-5 py-4 text-[var(--text)]">
                          {client?.nameEl}
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)] tabular">
                          {date.format(new Date(r.paidAt))}
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)]">
                          {r.method}
                        </td>
                        <td className="px-5 py-4 text-right tabular text-[var(--text)] font-medium">
                          {eur.format(r.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-6 text-xs text-[var(--dim)]">
            Receipts are issued automatically when an invoice is marked paid.
            Numbering is independent of invoice numbering and also gap-free.
          </p>
        </div>
      </main>
    </>
  );
}

function Empty() {
  return (
    <div className="border border-dashed border-[var(--line)] rounded-lg px-8 py-16 text-center bg-[var(--bg)]">
      <p className="text-[var(--muted)] mb-2">No receipts yet.</p>
      <p className="text-sm text-[var(--dim)]">
        Receipts are generated when you mark an invoice as paid. Open an
        invoice and click <span className="text-[var(--accent)]">Mark as paid</span> to issue one.
      </p>
    </div>
  );
}
