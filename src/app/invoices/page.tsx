import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { INVOICES, getClient, getMatter, eur, date } from "@/lib/demo-data";

export const metadata = { title: "Invoices · Lex" };

export default function InvoicesPage() {
  const totals = {
    count: INVOICES.length,
    revenue: INVOICES.reduce((a, i) => a + i.total, 0),
    outstanding: INVOICES.filter((i) => i.status === "finalized").reduce(
      (a, i) => a + i.total,
      0,
    ),
  };

  return (
    <>
      <AppNav current="/invoices" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-2">
                Invoices
              </p>
              <h1 className="font-display text-4xl text-[var(--text)] tracking-tight">
                Τιμολόγια
              </h1>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-md text-white text-sm font-medium"
              style={{ background: "var(--accent)" }}
            >
              + New invoice
            </button>
          </div>

          {/* Stats */}
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            <Stat label="Invoices issued" value={String(totals.count)} />
            <Stat label="Total billed" value={eur.format(totals.revenue)} />
            <Stat label="Outstanding" value={eur.format(totals.outstanding)} />
          </div>

          {/* Table */}
          <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)]">
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  <th className="text-left px-5 py-3 font-normal">Number</th>
                  <th className="text-left px-5 py-3 font-normal">Client</th>
                  <th className="text-left px-5 py-3 font-normal">Matter</th>
                  <th className="text-left px-5 py-3 font-normal">Issued</th>
                  <th className="text-left px-5 py-3 font-normal">Due</th>
                  <th className="text-right px-5 py-3 font-normal">VAT 19%</th>
                  <th className="text-right px-5 py-3 font-normal">Total</th>
                  <th className="text-left px-5 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((inv) => {
                  const client = getClient(inv.clientId);
                  const matter = getMatter(inv.matterId);
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-[var(--line-soft)] hover:bg-[var(--bg-2)] transition-colors"
                    >
                      <td className="px-5 py-4 tabular font-display text-[var(--accent)]">
                        <Link href={`/invoices/${inv.id}`}>{inv.number}</Link>
                      </td>
                      <td className="px-5 py-4 text-[var(--text)]">
                        {client?.nameEl}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] text-xs tabular">
                        {matter?.number}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] tabular">
                        {date.format(new Date(inv.issuedAt))}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] tabular">
                        {date.format(new Date(inv.dueAt))}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--muted)] tabular">
                        {eur.format(inv.vatAmount)}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--text)] tabular font-medium">
                        {eur.format(inv.total)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill status={inv.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-[var(--dim)] tabular">
            Numbers issued via{" "}
            <code className="px-1.5 py-0.5 rounded bg-[var(--bg-2)]">
              allocate_invoice_number()
            </code>{" "}
            under <code className="px-1.5 py-0.5 rounded bg-[var(--bg-2)]">pg_advisory_xact_lock</code> — gap-free,
            Cyprus-VAT-compliant.
          </p>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] rounded-md px-5 py-4 bg-[var(--bg)]">
      <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
        {label}
      </div>
      <div className="font-display text-2xl tabular text-[var(--text)] mt-1">
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; fg: string; bg: string }> = {
    draft: { label: "Draft", fg: "var(--muted)", bg: "var(--bg-2)" },
    finalized: { label: "Finalized", fg: "var(--accent)", bg: "var(--accent-bg)" },
    paid: { label: "Paid", fg: "var(--ok)", bg: "oklch(0.55 0.130 150 / 0.10)" },
  };
  const s = map[status] ?? { label: status, fg: "var(--muted)", bg: "var(--bg-2)" };
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-widest font-medium px-2 py-1 rounded"
      style={{ color: s.fg, background: s.bg }}
    >
      {s.label}
    </span>
  );
}
