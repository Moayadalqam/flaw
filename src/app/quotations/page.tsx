import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import {
  QUOTATIONS,
  getClient,
  getMatter,
  eur,
  date,
} from "@/lib/demo-data";

export const metadata = { title: "Quotations · Lex" };

export default function QuotationsPage() {
  const total = QUOTATIONS.reduce((a, q) => a + q.total, 0);
  const pending = QUOTATIONS.filter(
    (q) => q.status !== "accepted" && q.status !== "declined",
  ).reduce((a, q) => a + q.total, 0);

  return (
    <>
      <AppNav current="/quotations" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-2">
                Quotations
              </p>
              <h1 className="font-display text-4xl text-[var(--text)] tracking-tight">
                Προσφορές
              </h1>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-md text-white text-sm font-medium"
              style={{ background: "var(--accent)" }}
            >
              + New quotation
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            <Stat label="Quotations issued" value={String(QUOTATIONS.length)} />
            <Stat label="Total quoted" value={eur.format(total)} />
            <Stat label="Pending acceptance" value={eur.format(pending)} />
          </div>

          <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[var(--bg)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-2)]">
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  <th className="text-left px-5 py-3 font-normal">Number</th>
                  <th className="text-left px-5 py-3 font-normal">Client</th>
                  <th className="text-left px-5 py-3 font-normal">Matter</th>
                  <th className="text-left px-5 py-3 font-normal">Issued</th>
                  <th className="text-left px-5 py-3 font-normal">Valid until</th>
                  <th className="text-right px-5 py-3 font-normal">Total</th>
                  <th className="text-left px-5 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {QUOTATIONS.map((q) => {
                  const client = getClient(q.clientId);
                  const matter = getMatter(q.matterId);
                  return (
                    <tr
                      key={q.id}
                      className="border-t border-[var(--line-soft)] hover:bg-[var(--bg-2)] transition-colors"
                    >
                      <td className="px-5 py-4 tabular font-display text-[var(--accent)]">
                        <Link href={`/quotations/${q.id}`}>{q.number}</Link>
                      </td>
                      <td className="px-5 py-4 text-[var(--text)]">
                        {client?.nameEl}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] text-xs tabular">
                        {matter?.number}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] tabular">
                        {date.format(new Date(q.issuedAt))}
                      </td>
                      <td className="px-5 py-4 text-[var(--muted)] tabular">
                        {date.format(new Date(q.validUntil))}
                      </td>
                      <td className="px-5 py-4 text-right text-[var(--text)] tabular font-medium">
                        {eur.format(q.total)}
                      </td>
                      <td className="px-5 py-4">
                        <QStatus status={q.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-[var(--dim)]">
            Accepted quotations convert into draft invoices with one click —
            line items, matter link, and client details copied over. No
            retyping.
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

function QStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; fg: string; bg: string }> = {
    draft: { label: "Draft", fg: "var(--muted)", bg: "var(--bg-2)" },
    sent: { label: "Sent", fg: "var(--accent)", bg: "var(--accent-bg)" },
    accepted: { label: "Accepted", fg: "var(--ok)", bg: "oklch(0.55 0.130 150 / 0.10)" },
    declined: { label: "Declined", fg: "var(--kill)", bg: "oklch(0.52 0.180 25 / 0.08)" },
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
