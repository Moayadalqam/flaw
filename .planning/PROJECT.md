# Lex — Project Brief

> **The invoicing platform built for lawyers.** Cyprus-VAT-compliant invoices, receipts, quotations, and retainers, bilingual (GR+EN), generated in seconds by AI or a clean form. Built around how lawyers actually bill: by case, by hour, by retainer.

## At a glance

| Field | Value |
|---|---|
| Client | Fotini Kandri (Cyprus lawyer — divorce + immigration practice) |
| Project type | **Demo** — single shippable milestone, real backend, no mocks |
| Today | 2026-05-13 — pitch meeting same day |
| Workspace | Single-tenant (Fotini's login = workspace) |
| Region | EU data residency (Supabase Frankfurt or Ireland) |

## What we're building

A focused, premium invoicing tool that ONLY does invoicing — but does it the way lawyers need:

1. **Four document types** — invoices, receipts, quotations, retainer agreements.
2. **Case-linked billing** — every invoice attaches to a matter/case.
3. **Billable-hours tracking** — timer per case, hours convert to line items.
4. **Trust / client-funds ledger** — separate ledger for retainers/deposits, never mixed with operating revenue. **Disbarment-grade compliance.**
5. **Cyprus VAT compliance** — 19% auto, sequential gap-free numbering (`2026/0001` format).
6. **AI assistant for invoicing** — natural language → invoice draft. Also: *"who's overdue?"*, *"draft reminders for all unpaid"*, *"Q2 revenue by case"*.
7. **Bilingual (GR + EN)** — UI + invoice content, side-by-side toggle.
8. **Editable invoice templates** — 2–3 modern designs, customizable (logo, colors, footer).
9. **Monthly financial summary** — revenue, outstanding, overdue, by case + by client.
10. **Payment reminders + aging report** — auto-drafted, polite, in client's language.

Tier 2 (bonus if time permits during the build): recurring invoices, disbursements/court-fee line items, multi-currency, conflict-check on new clients.

## Validated requirements

(Populated as features ship and Fotini confirms behavior. Empty at kickoff.)

| ID | Requirement | Source | Status |
|---|---|---|---|

## Active requirements (the demo's REQ-IDs)

| ID | Requirement | Owner phase |
|---|---|---|
| REQ-001 | User can log in with email + magic link, SSR-safe Supabase auth | M1 |
| REQ-002 | Single-tenant workspace bound to authenticated user | M1 |
| REQ-003 | CRUD for Clients (Cyprus VAT/Tax IDs, name in GR+EN) | M1 |
| REQ-004 | CRUD for Cases (matter number, type, status, linked Client) | M1 |
| REQ-005 | CRUD for Invoices — line items, VAT 19%, sequential numbering | M1 |
| REQ-006 | CRUD for Receipts (issued on Invoice payment) | M1 |
| REQ-007 | CRUD for Quotations (becomes an Invoice on accept) | M1 |
| REQ-008 | CRUD for Retainer agreements with running balance | M1 |
| REQ-009 | Billable-hours timer per case; hours convert to invoice line items | M1 |
| REQ-010 | Trust ledger — separate balances per client, never mixed with revenue | M1 |
| REQ-011 | AI assistant: natural-language → invoice draft (OpenRouter) | M1 |
| REQ-012 | AI assistant: queries (overdue, drafts reminders, totals by case/client) | M1 |
| REQ-013 | Bilingual UI (GR/EN toggle); invoice doc content in both languages | M1 |
| REQ-014 | 2–3 editable invoice/receipt templates with logo + footer customization | M1 |
| REQ-015 | Monthly financial summary view (revenue, outstanding, overdue) | M1 |
| REQ-016 | Aging report + AI-drafted payment reminders sent by email | M1 |
| REQ-017 | PDF export for all document types (GR or EN) | M1 |
| REQ-018 | Seed ~10 fictional Cyprus-legal clients + cases + sample invoices | M1 |

## Out of scope (demo)

- AI legal-document drafting (motions, NDAs, letters).
- Case management UI (calendar, hearings, client portal).
- iJustice upload automation.
- WhatsApp / Telegram outbound (email-only).
- Voice commands.
- Payment processing / card charging.
- Multi-tenant firm accounts.
- Importing real existing cases (post-NDA onboarding only).

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **DB / Auth / Storage:** Supabase (EU region — Frankfurt or Ireland)
- **Hosting:** Vercel (`vercel --prod` only — no auto-deploys from git)
- **AI:** OpenRouter (`OPENROUTER_API_KEY`)
- **PDF:** Server-side generation (likely `@react-pdf/renderer` or `puppeteer` — decision in DESIGN/phase plan)
- **i18n:** `next-intl` (GR + EN, GR default for Fotini's locale)
- **Email:** Resend or SendGrid (decision in research)
- **Styling:** Tailwind + CSS variables from `DESIGN.md` (OKLCH)

## Design direction

See `DESIGN.md`. One-line: **luxury-editorial, OKLCH ink-on-paper neutrals with one warm accent (Cyprus-flag-derived), Crimson Pro × Söhne-Mono pair, tabular numerals throughout.** Reads like a well-designed legal letterhead, not a SaaS dashboard.

## Decisions

| Date | Decision | Rationale | ADR |
|---|---|---|---|
| 2026-05-13 | Demo path, 1 milestone | Today is the pitch — close the deal first, extend post-signature | — |
| 2026-05-13 | Strip AI legal-doc drafting from scope | Risk + time; AI assistant scoped to invoicing only | — |
| 2026-05-13 | Trust ledger as a Tier-1 feature | Disbarment-grade compliance differentiator; Cyprus lawyers will not adopt a tool that doesn't separate client funds | — |
| 2026-05-13 | EU-region Supabase | GDPR + Fotini's "dedicated server / NDA" concern | — |
