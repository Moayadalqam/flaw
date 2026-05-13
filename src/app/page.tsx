export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="w-full px-[var(--pad-x)] py-6 border-b border-[var(--line-soft)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="font-display text-2xl tracking-tight"
              style={{ color: "var(--accent)" }}
            >
              Lex
            </div>
            <span className="text-[var(--dim)] text-sm tabular">
              · by Qualia Solutions
            </span>
          </div>
          <a
            href="mailto:fawzi.ygoussous@gmail.com?subject=Lex%20—%20Cost%20proposal%20request"
            className="text-sm font-medium text-[var(--text)] hover:text-[var(--accent)] transition-colors"
          >
            Contact →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 w-full px-[var(--pad-x)] py-[var(--pad-section)]">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.2fr_1fr] gap-16 lg:gap-24 items-start">
          <div>
            <p className="font-display italic text-[var(--accent)] text-lg mb-6">
              Για δικηγόρους στην Κύπρο.
            </p>

            <h1
              className="font-display font-semibold tracking-tight leading-[1.05] text-[var(--text)]"
              style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
            >
              The invoicing platform built for lawyers.
            </h1>

            <p
              className="mt-8 text-[var(--muted)] leading-relaxed max-w-xl"
              style={{ fontSize: "clamp(1.05rem, 1.5vw, 1.25rem)" }}
            >
              Cyprus-VAT-compliant invoices, receipts, quotations and retainers
              — bilingual Greek and English, generated in seconds by AI or a
              clean form. Built around how lawyers actually bill: by case, by
              hour, by retainer.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="mailto:fawzi.ygoussous@gmail.com?subject=Lex%20—%20Cost%20proposal%20request"
                className="inline-flex items-center px-6 py-3 rounded-md font-medium text-white transition-colors"
                style={{ background: "var(--accent)" }}
              >
                Request a cost proposal
              </a>
              <a
                href="#features"
                className="inline-flex items-center px-6 py-3 rounded-md font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)] transition-colors"
              >
                See what&apos;s inside
              </a>
            </div>
          </div>

          {/* Right column — sample invoice card */}
          <div
            className="border border-[var(--line)] rounded-lg p-8 bg-[var(--bg)]"
            style={{ boxShadow: "0 4px 20px oklch(0.18 0.020 50 / 0.06)" }}
          >
            <div className="flex items-start justify-between mb-6 pb-4 border-b border-[var(--line-soft)]">
              <div>
                <div className="font-display text-xl text-[var(--text)]">
                  Fotini Kandri Law Office
                </div>
                <div className="text-xs text-[var(--dim)] mt-1 tabular">
                  VAT CY10000001A · TAX CY-TAX-FK-001
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                  Invoice
                </div>
                <div className="font-display text-2xl text-[var(--accent)] tabular mt-1">
                  2026/0001
                </div>
              </div>
            </div>

            <div className="space-y-1 mb-6">
              <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
                Bill to
              </div>
              <div className="text-sm text-[var(--text)]">
                Νικόλας Χριστοδουλίδης
              </div>
              <div className="text-xs text-[var(--muted)]">
                Divorce matter · 2026-M-0001
              </div>
            </div>

            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[var(--dim)] border-b border-[var(--line-soft)]">
                  <th className="text-left pb-2 font-normal">Description</th>
                  <th className="text-right pb-2 font-normal">Hrs</th>
                  <th className="text-right pb-2 font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="tabular">
                <tr className="border-b border-[var(--line-soft)]">
                  <td className="py-2 text-[var(--text)]">
                    Initial consultation
                  </td>
                  <td className="py-2 text-right text-[var(--muted)]">2</td>
                  <td className="py-2 text-right text-[var(--text)]">
                    360,00&nbsp;€
                  </td>
                </tr>
                <tr className="border-b border-[var(--line-soft)]">
                  <td className="py-2 text-[var(--text)]">Drafting petition</td>
                  <td className="py-2 text-right text-[var(--muted)]">4</td>
                  <td className="py-2 text-right text-[var(--text)]">
                    720,00&nbsp;€
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="space-y-1 text-sm tabular pt-3 border-t border-[var(--line-soft)]">
              <div className="flex justify-between text-[var(--muted)]">
                <span>Subtotal</span>
                <span>1.080,00 €</span>
              </div>
              <div className="flex justify-between text-[var(--muted)]">
                <span>VAT 19%</span>
                <span>205,20 €</span>
              </div>
              <div className="flex justify-between font-semibold text-[var(--text)] pt-2 mt-2 border-t border-[var(--line)]">
                <span>Total</span>
                <span className="font-display">1.285,20 €</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--line-soft)] text-[10px] text-[var(--dim)] tabular">
              Gap-free numbering enforced at the database (Cyprus VAT-compliant).
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        className="w-full px-[var(--pad-x)] py-[var(--pad-section)] border-t border-[var(--line-soft)] bg-[var(--bg-2)]"
      >
        <div className="max-w-6xl mx-auto">
          <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-3">
            What ships in Lex
          </p>
          <h2 className="font-display text-3xl md:text-4xl text-[var(--text)] mb-12 max-w-3xl tracking-tight">
            Ten features the Cyprus invoicing tools you tried don&apos;t have.
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
            {FEATURES.map((f) => (
              <article key={f.title} className="border-l-2 border-[var(--accent-bg)] pl-5">
                <h3 className="font-display text-lg text-[var(--text)] mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="w-full px-[var(--pad-x)] py-[var(--pad-section)] border-t border-[var(--line-soft)]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-3">
            Foundation
          </p>
          <h2 className="font-display text-2xl md:text-3xl text-[var(--text)] mb-6 tracking-tight">
            Schema and compliance are already done.
          </h2>
          <div className="grid sm:grid-cols-3 gap-6 text-sm tabular max-w-2xl mx-auto">
            <div className="border border-[var(--line)] rounded-md px-4 py-5">
              <div className="font-display text-2xl text-[var(--text)] mb-1">12</div>
              <div className="text-[var(--muted)]">tables, RLS on all</div>
            </div>
            <div className="border border-[var(--line)] rounded-md px-4 py-5">
              <div className="font-display text-2xl text-[var(--text)] mb-1">17 / 18</div>
              <div className="text-[var(--muted)]">verification contracts PASS</div>
            </div>
            <div className="border border-[var(--line)] rounded-md px-4 py-5">
              <div className="font-display text-2xl text-[var(--text)] mb-1">2026/0001</div>
              <div className="text-[var(--muted)]">gap-free under concurrency</div>
            </div>
          </div>
          <p className="mt-8 text-[var(--muted)] text-sm max-w-2xl mx-auto leading-relaxed">
            The database knows about Cyprus VAT. The trust ledger is a separate,
            append-only table — disbarment-grade compliance built in, not bolted
            on. The Greek-named seed clients are live in the system today.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full px-[var(--pad-x)] py-[var(--pad-section)] border-t border-[var(--line-soft)] bg-[var(--bg-2)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl text-[var(--text)] mb-4 tracking-tight">
            Want a cost proposal?
          </h2>
          <p className="text-[var(--muted)] mb-8 max-w-xl mx-auto">
            Email Fawzi with your feature list. We&apos;ll come back within two
            business days with scope, timeline, and a price.
          </p>
          <a
            href="mailto:fawzi.ygoussous@gmail.com?subject=Lex%20—%20Cost%20proposal%20request&body=Hi%20Fawzi%2C%0A%0AI%27d%20like%20a%20cost%20proposal%20for%20Lex.%20My%20feature%20list%20is%3A%0A%0A1.%0A2.%0A3.%0A%0AThanks%2C%0A"
            className="inline-flex items-center px-8 py-4 rounded-md font-medium text-white text-base transition-colors"
            style={{ background: "var(--accent)" }}
          >
            Request cost proposal
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full px-[var(--pad-x)] py-8 border-t border-[var(--line-soft)] text-[var(--dim)] text-xs">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            © 2026 Qualia Solutions · Nicosia, Cyprus
          </div>
          <div className="tabular">
            GDPR · EU data residency · Cyprus VAT compliant
          </div>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  {
    title: "Cyprus VAT, done right",
    body: "19% applied server-side. Sequential, gap-free invoice numbering enforced at the database — never a Postgres SEQUENCE that can drop a number on a failed transaction.",
  },
  {
    title: "Trust ledger, isolated",
    body: "Client funds live in a separate, append-only table. Corrections go in as reversing entries, never UPDATE or DELETE. Disbarment-grade compliance by construction.",
  },
  {
    title: "Billable hours per matter",
    body: "Timer per case, hourly rate per matter. Stop the clock and the hours convert straight into an invoice line item — quantity, rate, description, all populated.",
  },
  {
    title: "AI that drafts an invoice",
    body: "Type \"Invoice Andreou for the divorce filing, €450, due in 14 days\" — receive a Zod-validated draft. The AI never allocates an invoice number; the human clicks Finalize.",
  },
  {
    title: "Bilingual from line one",
    body: "Greek is the default. Currency renders as 1.234,56 €. Dates as DD/MM/YYYY. Client documents go out in their preferred language, with a side-by-side option.",
  },
  {
    title: "Quotation → Invoice in one click",
    body: "Quote the client. They accept. The quotation becomes a draft invoice with the same line items, linked to the same matter. No retyping.",
  },
  {
    title: "Retainers with running balance",
    body: "Track each retainer separately. The trust-balance widget on the client view shows what's left — and it never gets confused with what you've billed.",
  },
  {
    title: "Audit trail at the database",
    body: "Every mutation on revenue or trust tables logs who, what, when, before, and after — as a Postgres trigger, not application code that a bug can skip.",
  },
  {
    title: "PDF that renders Greek",
    body: "Noto Sans Greek bundled locally. No missing-glyph squares for Χριστοδουλίδης. Cold-start render under five seconds.",
  },
  {
    title: "Aging report with reminders",
    body: "Monthly summary excludes trust money by construction. Aging report buckets overdue invoices. AI drafts polite reminder emails in the client's language.",
  },
];
