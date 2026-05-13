# Lex — Domain Glossary

<!-- Loaded by every road agent before PROJECT.md / DESIGN.md. Keep entries terse: 1 sentence + Avoid line. -->

## Language

### Matter
A legal engagement — what a lawyer is working on for a client (e.g., a divorce case, a property dispute). Has a matter number, type, status, and one or more invoices/retainers tied to it.
**Avoid:** "case" alone (ambiguous), "ticket", "project", "engagement" (too vague).

### Case
Synonym for Matter in this product. Lawyer-facing UI says "Case"; code may use either, but DB and types use `matter`.
**Avoid:** mixing with framework-internal "task" or "ticket."

### Client
The lawyer's customer — the human or company who hires the lawyer and receives the invoice. Has a name, contact info, Cyprus tax/VAT ID (optional), preferred language.
**Avoid:** "Customer" (too commerce-coded), "User" (means the lawyer here, not the client).

### User
The lawyer using Lex. Single-tenant: one workspace per authenticated user.
**Avoid:** ambiguity with Client — when referring to the Cyprus lawyer's customer, always say "Client" not "User".

### Invoice
A document the lawyer issues asking a Client for payment. Cyprus-VAT-compliant: 19% VAT, sequential gap-free number (`2026/0001`), tax + VAT registration shown.
**Avoid:** "bill" (informal), "charge."

### Receipt
A document the lawyer issues confirming payment was received. Generated from an Invoice when marked paid.
**Avoid:** "payment confirmation," "acknowledgement."

### Quotation
A document the lawyer issues estimating cost before work begins. Becomes an Invoice when the Client accepts.
**Avoid:** "quote" (too casual), "estimate," "proposal."

### Retainer
A pre-paid balance the Client deposits with the lawyer. Drawn down as work is performed and billed. Lives in the **Trust ledger**, NEVER in operating revenue.
**Avoid:** "advance," "deposit" alone.

### Trust ledger
The dedicated accounting view for Client-owned funds (retainers, deposits) held by the lawyer. Separate from the lawyer's revenue. Mixing the two is a disbarment-grade offense in Cyprus.
**Avoid:** "escrow" (different legal meaning), "client account" (ambiguous with bank account).

### Billable hours
Time the lawyer logs against a Matter, at a configurable hourly rate. Hours convert to invoice line items.
**Avoid:** "time entries" alone, "logs."

### Disbursement
A pass-through cost the lawyer pays on the Client's behalf (court filing fees, expert witness fees, translation). Itemized separately from billable hours on the invoice, often without VAT.
**Avoid:** "expense," "fee" alone.

### Aging report
A view of unpaid Invoices grouped by how overdue they are (e.g., 0–30 days, 31–60, 60+).
**Avoid:** "overdue list."

### Workspace
The single tenant per User. Demo is single-workspace — no firm-switching.
**Avoid:** "Org," "team," "firm" (firm support is post-demo).

## Relationships

- **User** owns one **Workspace**
- **Workspace** holds many **Clients**
- **Client** has many **Matters** (cases)
- **Matter** has many **Invoices**, **Quotations**, **Retainers**, and **Billable-hours entries**
- **Invoice** has many **Line items** (each derived from billable hours or a flat fee or a disbursement)
- **Invoice** issues a **Receipt** when paid
- **Retainer** posts to the **Trust ledger** (separate from the **Revenue ledger**)
- **AI assistant** acts on Workspace data (read + write Invoices, Receipts, Quotations) on the User's behalf

## Flagged ambiguities

### "Client" → recipient of the Invoice (NOT the lawyer)
- In Lex, **Client** always means the lawyer's customer.
- The **lawyer** is the **User** — never call them "client" in code or UI.

### "Matter" vs "Case"
- DB + types: `matter`, `matter_id`, `MatterRow`.
- UI strings (English): "Case."
- UI strings (Greek): "Υπόθεση."
- One concept, three labels — picked for natural language at each surface.

### "Trust" / "Client funds" / "Escrow"
- We say **Trust ledger** in UI.
- We DO NOT say "Escrow" — different legal meaning in Cyprus.
- In code: `trust_balance`, `trust_ledger_entry`.

### Currency
- Default: EUR (Cyprus).
- Multi-currency is Tier 2; default views show EUR only.

### Language
- UI strings: GR or EN per User toggle.
- Invoice document content: bilingual side-by-side OR single-language per Client preference (Client row has `preferred_language: 'el' | 'en'`).
