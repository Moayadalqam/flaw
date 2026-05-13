import { AppNav } from "@/components/AppNav";
import {
  INVOICES,
  RECEIPTS,
  CLIENTS,
  getClient,
  eur,
  date,
} from "@/lib/demo-data";

export const metadata = { title: "Monthly summary · Lex" };

export default function MonthlySummary() {
  const totalBilled = INVOICES.reduce((a, i) => a + i.total, 0);
  const totalPaid = RECEIPTS.reduce((a, r) => a + r.amount, 0);
  const outstanding = totalBilled - totalPaid;

  const today = new Date("2026-05-13");
  const overdue = INVOICES.filter((inv) => {
    const due = new Date(inv.dueAt);
    return (
      due < today &&
      !RECEIPTS.some((r) => r.invoiceId === inv.id)
    );
  });
  const overdueTotal = overdue.reduce((a, i) => a + i.total, 0);

  // Aggregate by client (revenue only — trust ledger is NOT included)
  const byClient = CLIENTS.map((c) => {
    const invs = INVOICES.filter((i) => i.clientId === c.id);
    const billed = invs.reduce((a, i) => a + i.total, 0);
    const paid = invs.reduce(
      (a, i) =>
        a +
        RECEIPTS.filter((r) => r.invoiceId === i.id).reduce(
          (b, r) => b + r.amount,
          0,
        ),
      0,
    );
    return {
      client: c,
      count: invs.length,
      billed,
      paid,
      outstanding: billed - paid,
    };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.billed - a.billed);

  return (
    <>
      <AppNav current="/reports/summary" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-2">
              Reports
            </p>
            <h1 className="font-display text-4xl text-[var(--text)] tracking-tight">
              Μηνιαία σύνοψη
            </h1>
            <p className="text-[var(--muted)] mt-2">
              April 2026 · all amounts excl. trust ledger.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <SummaryCard
              label="Revenue billed"
              value={eur.format(totalBilled)}
              tone="text"
            />
            <SummaryCard
              label="Paid"
              value={eur.format(totalPaid)}
              tone="ok"
            />
            <SummaryCard
              label="Outstanding"
              value={eur.format(outstanding)}
              tone="warn"
            />
            <SummaryCard
              label="Overdue"
              value={eur.format(overdueTotal)}
              sub={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`}
              tone={overdueTotal > 0 ? "kill" : "muted"}
            />
          </div>

          {/* By client */}
          <section className="mb-12">
            <h2 className="font-display text-xl text-[var(--text)] mb-4 tracking-tight">
              By client
            </h2>
            <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-2)]">
                  <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                    <th className="text-left px-5 py-3 font-normal">Client</th>
                    <th className="text-right px-5 py-3 font-normal">Invoices</th>
                    <th className="text-right px-5 py-3 font-normal">Billed</th>
                    <th className="text-right px-5 py-3 font-normal">Paid</th>
                    <th className="text-right px-5 py-3 font-normal">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {byClient.map((row) => (
                    <tr
                      key={row.client.id}
                      className="border-t border-[var(--line-soft)]"
                    >
                      <td className="px-5 py-4 text-[var(--text)]">
                        {row.client.nameEl}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--muted)] tabular">
                        {row.count}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--text)] tabular">
                        {eur.format(row.billed)}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--muted)] tabular">
                        {row.paid > 0 ? eur.format(row.paid) : "—"}
                      </td>
                      <td
                        className="px-5 py-4 text-right tabular font-medium"
                        style={{
                          color:
                            row.outstanding > 0
                              ? "var(--warn)"
                              : "var(--dim)",
                        }}
                      >
                        {row.outstanding > 0
                          ? eur.format(row.outstanding)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Aging */}
          {overdue.length > 0 && (
            <section className="mb-12">
              <h2 className="font-display text-xl text-[var(--text)] mb-4 tracking-tight">
                Overdue invoices
              </h2>
              <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--bg-2)]">
                    <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                      <th className="text-left px-5 py-3 font-normal">Number</th>
                      <th className="text-left px-5 py-3 font-normal">Client</th>
                      <th className="text-left px-5 py-3 font-normal">Due</th>
                      <th className="text-right px-5 py-3 font-normal">Days late</th>
                      <th className="text-right px-5 py-3 font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdue.map((inv) => {
                      const client = getClient(inv.clientId);
                      const days = Math.floor(
                        (today.getTime() - new Date(inv.dueAt).getTime()) /
                          (1000 * 60 * 60 * 24),
                      );
                      return (
                        <tr
                          key={inv.id}
                          className="border-t border-[var(--line-soft)]"
                        >
                          <td className="px-5 py-4 tabular font-display text-[var(--accent)]">
                            {inv.number}
                          </td>
                          <td className="px-5 py-4 text-[var(--text)]">
                            {client?.nameEl}
                          </td>
                          <td className="px-5 py-4 text-[var(--muted)] tabular">
                            {date.format(new Date(inv.dueAt))}
                          </td>
                          <td
                            className="px-5 py-4 text-right tabular font-medium"
                            style={{
                              color: days > 30 ? "var(--kill)" : "var(--warn)",
                            }}
                          >
                            {days}
                          </td>
                          <td className="px-5 py-4 text-right text-[var(--text)] tabular">
                            {eur.format(inv.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-[var(--dim)]">
                Ask Lex to draft a reminder email in the client&apos;s preferred
                language — Greek for Greek clients, English for foreign clients.
              </p>
            </section>
          )}

          <div className="border-t border-[var(--line-soft)] pt-6 text-xs text-[var(--dim)]">
            <p>
              Trust-ledger balances are <strong>not</strong> included anywhere
              on this page. Client funds and lawyer revenue are kept
              structurally separate (a hard constraint of Cyprus Bar
              compliance). See <a href="/trust-ledger" className="text-[var(--accent)] hover:underline">Trust ledger</a> for that view.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "text" | "ok" | "warn" | "kill" | "muted";
}) {
  const color =
    tone === "ok"
      ? "var(--ok)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "kill"
          ? "var(--kill)"
          : tone === "muted"
            ? "var(--dim)"
            : "var(--text)";
  return (
    <div className="border border-[var(--line)] rounded-md px-5 py-4 bg-[var(--bg)]">
      <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
        {label}
      </div>
      <div
        className="font-display text-3xl tabular mt-1"
        style={{ color }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-[var(--muted)] mt-1 tabular">{sub}</div>
      )}
    </div>
  );
}
