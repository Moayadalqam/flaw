import Link from "next/link";
import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import {
  INVOICES,
  getClient,
  getMatter,
  eur,
  date,
} from "@/lib/demo-data";

export async function generateStaticParams() {
  return INVOICES.map((i) => ({ id: i.id }));
}

export default async function InvoiceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = INVOICES.find((i) => i.id === id);
  if (!invoice) return notFound();
  const client = getClient(invoice.clientId);
  const matter = getMatter(invoice.matterId);

  return (
    <>
      <AppNav current="/invoices" />
      <main className="w-full px-[var(--pad-x)] py-10">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/invoices"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← All invoices
          </Link>

          <div className="mt-8 flex items-start justify-between mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                Invoice
              </p>
              <h1 className="font-display text-5xl tabular text-[var(--accent)] tracking-tight">
                {invoice.number}
              </h1>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]">
                Download PDF
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}
              >
                Mark as paid
              </button>
            </div>
          </div>

          {/* Document */}
          <article className="border border-[var(--line)] rounded-lg bg-[var(--bg)] p-10" style={{ boxShadow: "0 4px 20px oklch(0.18 0.020 50 / 0.06)" }}>
            {/* Letterhead */}
            <div className="flex items-start justify-between pb-6 border-b border-[var(--line-soft)] mb-8">
              <div>
                <div className="font-display text-2xl text-[var(--text)]">
                  Fotini Kandri Law Office
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  Δικηγορικό γραφείο
                </div>
                <div className="text-xs text-[var(--dim)] mt-3 tabular space-y-0.5">
                  <div>VAT CY10000001A · TAX CY-TAX-FK-001</div>
                  <div>IBAN CY17 0020 0128 0000 0012 0052 7600</div>
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  Issued
                </div>
                <div className="text-sm text-[var(--text)]">
                  {date.format(new Date(invoice.issuedAt))}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mt-3">
                  Due
                </div>
                <div className="text-sm text-[var(--text)]">
                  {date.format(new Date(invoice.dueAt))}
                </div>
              </div>
            </div>

            {/* Bill to */}
            <div className="grid sm:grid-cols-2 gap-8 mb-8">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mb-2">
                  Bill to · Προς
                </div>
                <div className="text-base text-[var(--text)] font-medium">
                  {client?.nameEl}
                </div>
                <div className="text-sm text-[var(--muted)]">
                  {client?.nameEn}
                </div>
                {client?.vat && (
                  <div className="text-xs text-[var(--dim)] mt-1 tabular">
                    VAT {client.vat}
                  </div>
                )}
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
                <div className="text-xs text-[var(--dim)] mt-1 tabular">
                  {matter?.number}
                </div>
              </div>
            </div>

            {/* Line items */}
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)] border-b border-[var(--line)]">
                  <th className="text-left py-3 font-normal">Description · Περιγραφή</th>
                  <th className="text-right py-3 font-normal">Hours</th>
                  <th className="text-right py-3 font-normal">Rate</th>
                  <th className="text-right py-3 font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {invoice.lineItems.map((li, i) => (
                  <tr key={i} className="border-b border-[var(--line-soft)]">
                    <td className="py-3 text-[var(--text)]">
                      {li.description}
                    </td>
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

            {/* Totals */}
            <div className="ml-auto max-w-sm tabular text-sm space-y-2">
              <div className="flex justify-between text-[var(--muted)]">
                <span>Subtotal · Υποσύνολο</span>
                <span>{eur.format(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--muted)]">
                <span>VAT 19% · ΦΠΑ 19%</span>
                <span>{eur.format(invoice.vatAmount)}</span>
              </div>
              <div className="flex justify-between font-display text-2xl text-[var(--text)] pt-3 mt-3 border-t border-[var(--line)]">
                <span>Total</span>
                <span>{eur.format(invoice.total)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-[var(--line-soft)] text-[10px] text-[var(--dim)] tabular flex justify-between">
              <span>
                Sequential, gap-free numbering enforced at the database
                (Cyprus VAT compliant).
              </span>
              <span>Page 1 / 1</span>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
