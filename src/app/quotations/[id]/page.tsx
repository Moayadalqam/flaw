import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import {
  QUOTATIONS,
  getClient,
  getMatter,
  eur,
  date,
} from "@/lib/demo-data";

export async function generateStaticParams() {
  return QUOTATIONS.map((q) => ({ id: q.id }));
}

export default async function QuotationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const q = QUOTATIONS.find((x) => x.id === id);
  if (!q) return notFound();
  const client = getClient(q.clientId);
  const matter = getMatter(q.matterId);

  return (
    <>
      <AppNav current="/quotations" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/quotations"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← All quotations
          </Link>

          <div className="mt-8 flex items-start justify-between mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                Quotation
              </p>
              <h1 className="font-display text-5xl tabular text-[var(--accent)] tracking-tight">
                {q.number}
              </h1>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]">
                Download PDF
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}
                disabled={q.status === "declined"}
              >
                {q.status === "accepted"
                  ? "Convert to invoice"
                  : "Mark as accepted"}
              </button>
            </div>
          </div>

          <article
            className="border border-[var(--line)] rounded-lg bg-[var(--bg)] p-10"
            style={{ boxShadow: "0 4px 20px oklch(0.18 0.020 50 / 0.06)" }}
          >
            <div className="flex items-start justify-between pb-6 border-b border-[var(--line-soft)] mb-8">
              <div>
                <div className="font-display text-2xl text-[var(--text)]">
                  Fotini Kandri Law Office
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  Δικηγορικό γραφείο · Quotation
                </div>
                <div className="text-xs text-[var(--dim)] mt-3 tabular">
                  VAT CY10000001A · TAX CY-TAX-FK-001
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  Issued
                </div>
                <div className="text-sm text-[var(--text)]">
                  {date.format(new Date(q.issuedAt))}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mt-3">
                  Valid until
                </div>
                <div className="text-sm text-[var(--text)]">
                  {date.format(new Date(q.validUntil))}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-8 mb-8">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mb-2">
                  Quoted to · Προς
                </div>
                <div className="text-base text-[var(--text)] font-medium">
                  {client?.nameEl}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {client?.nameEn}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mb-2">
                  Matter · Υπόθεση
                </div>
                <div className="text-base text-[var(--text)] font-medium">
                  {matter?.titleEl}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {matter?.title}
                </div>
              </div>
            </div>

            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)] border-b border-[var(--line)]">
                  <th className="text-left py-3 font-normal">Description</th>
                  <th className="text-right py-3 font-normal">Qty</th>
                  <th className="text-right py-3 font-normal">Rate</th>
                  <th className="text-right py-3 font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {q.lineItems.map((li, i) => (
                  <tr key={i} className="border-b border-[var(--line-soft)]">
                    <td className="py-3 text-[var(--text)]">{li.description}</td>
                    <td className="py-3 text-right text-[var(--muted)]">
                      {li.quantity}
                    </td>
                    <td className="py-3 text-right text-[var(--muted)]">
                      {eur.format(li.unitPrice)}
                    </td>
                    <td className="py-3 text-right text-[var(--text)]">
                      {eur.format(li.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto max-w-sm tabular text-sm space-y-2">
              <div className="flex justify-between text-[var(--muted)]">
                <span>Subtotal</span>
                <span>{eur.format(q.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--muted)]">
                <span>VAT 19%</span>
                <span>{eur.format(q.vatAmount)}</span>
              </div>
              <div className="flex justify-between font-display text-2xl text-[var(--text)] pt-3 mt-3 border-t border-[var(--line)]">
                <span>Total</span>
                <span>{eur.format(q.total)}</span>
              </div>
            </div>

            <div className="mt-12 pt-6 border-t border-[var(--line-soft)] text-[10px] text-[var(--dim)] tabular">
              Quotation only — not a tax invoice. Becomes a draft invoice on
              acceptance.
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
