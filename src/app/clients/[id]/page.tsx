import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import {
  CLIENTS,
  INVOICES,
  MATTERS,
  RETAINERS,
  RECEIPTS,
  TRUST_LEDGER,
  eur,
  date,
} from "@/lib/demo-data";

export async function generateStaticParams() {
  return CLIENTS.map((c) => ({ id: c.id }));
}

export default async function ClientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = CLIENTS.find((c) => c.id === id);
  if (!client) return notFound();

  const matters = MATTERS.filter((m) => m.clientId === client.id);
  const invoices = INVOICES.filter((i) => i.clientId === client.id);
  const retainers = RETAINERS.filter((r) => r.clientId === client.id);
  const ledger = TRUST_LEDGER.filter((t) => t.clientId === client.id);
  const billed = invoices.reduce((a, i) => a + i.total, 0);
  const paid = invoices.reduce(
    (a, i) =>
      a +
      RECEIPTS.filter((r) => r.invoiceId === i.id).reduce(
        (b, r) => b + r.amount,
        0,
      ),
    0,
  );
  const trustBalance = ledger.reduce(
    (a, e) => a + e.debit - e.credit,
    0,
  );

  return (
    <>
      <AppNav current="/clients" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/clients"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← All clients
          </Link>

          <div className="mt-8 mb-10 flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--dim)] mb-1">
                Client · Πελάτης
              </p>
              <h1 className="font-display text-4xl text-[var(--text)] tracking-tight">
                {client.nameEl}
              </h1>
              {client.nameEl !== client.nameEn && (
                <p className="text-[var(--muted)] mt-1">{client.nameEn}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)] tabular">
                {client.vat && <span>VAT {client.vat}</span>}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="hover:text-[var(--accent)]">
                    {client.email}
                  </a>
                )}
                <span className="uppercase">Lang: {client.language}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]">
                + Matter
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}
              >
                + Invoice
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <Stat label="Matters" value={String(matters.length)} />
            <Stat label="Total billed" value={billed > 0 ? eur.format(billed) : "—"} />
            <Stat label="Paid" value={paid > 0 ? eur.format(paid) : "—"} />
            <Stat
              label="Trust balance"
              value={trustBalance > 0 ? eur.format(trustBalance) : "—"}
              tone="trust"
            />
          </div>

          {/* Matters */}
          {matters.length > 0 && (
            <section className="mb-12">
              <h2 className="font-display text-xl text-[var(--text)] mb-4 tracking-tight">
                Matters
              </h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {matters.map((m) => (
                  <div
                    key={m.id}
                    className="border border-[var(--line)] rounded-md p-4 bg-[var(--bg)]"
                  >
                    <div className="text-xs text-[var(--dim)] tabular mb-1">
                      {m.number}
                    </div>
                    <div className="text-[var(--text)] font-medium">
                      {m.titleEl}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1">
                      {m.title}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-widest text-[var(--dim)]">
                      <span>{m.type}</span>
                      <span className="tabular text-[var(--muted)]">
                        {eur.format(m.hourlyRate)}/hr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Invoices */}
          {invoices.length > 0 && (
            <section className="mb-12">
              <h2 className="font-display text-xl text-[var(--text)] mb-4 tracking-tight">
                Invoices
              </h2>
              <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-2)]">
                    <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                      <th className="text-left px-5 py-3 font-normal">Number</th>
                      <th className="text-left px-5 py-3 font-normal">Issued</th>
                      <th className="text-left px-5 py-3 font-normal">Due</th>
                      <th className="text-right px-5 py-3 font-normal">VAT</th>
                      <th className="text-right px-5 py-3 font-normal">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-[var(--line-soft)]">
                        <td className="px-5 py-4 tabular font-display text-[var(--accent)]">
                          <Link href={`/invoices/${inv.id}`}>{inv.number}</Link>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Retainers */}
          {retainers.length > 0 && (
            <section className="mb-12">
              <h2
                className="font-display text-xl mb-4 tracking-tight"
                style={{ color: "var(--trust)" }}
              >
                Retainers · trust balance
              </h2>
              <div className="space-y-3">
                {retainers.map((r) => (
                  <div
                    key={r.id}
                    className="border-l-4 rounded-md px-5 py-4 bg-[var(--bg)] border border-[var(--line)]"
                    style={{ borderLeftColor: "var(--trust)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-[var(--dim)] tabular">
                          {r.number}
                        </div>
                        <div className="text-[var(--text)] mt-1">
                          {r.termsEl}
                        </div>
                      </div>
                      <div
                        className="font-display text-2xl tabular"
                        style={{ color: "var(--trust)" }}
                      >
                        {eur.format(r.deposit)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {invoices.length === 0 && retainers.length === 0 && (
            <div className="border border-dashed border-[var(--line)] rounded-lg px-8 py-12 text-center bg-[var(--bg)]">
              <p className="text-[var(--muted)]">
                No invoices, quotations, or retainers yet for {client.nameEl}.
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "trust";
}) {
  const color = tone === "trust" ? "var(--trust)" : "var(--text)";
  return (
    <div className="border border-[var(--line)] rounded-md px-5 py-4 bg-[var(--bg)]">
      <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
        {label}
      </div>
      <div
        className="font-display text-2xl tabular mt-1"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}
