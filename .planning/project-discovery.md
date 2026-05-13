---
project_type: demo
discovered_at: 2026-05-13
discovery_mode: project
---

# Project Discovery, Lex

Captured during `/qualia-discuss` PROJECT MODE on 2026-05-13, in preparation for today's pitch meeting with Fotini Kandri. Demo path — 8 questions. The output of this file seeds PROJECT.md, PRODUCT.md, CONTEXT.md, and the (single) JOURNEY.md milestone.

## 1. The one-line pitch

> **Lex** — the invoicing platform built for lawyers. Cyprus-VAT-compliant invoices, receipts, quotations, and retainers, bilingual (GR+EN), generated in seconds by typing one line — *"Invoice Andreou €450 for the divorce filing, due in 14 days"* — or filling a clean form. Built around the way lawyers actually bill: by case, by hour, by retainer.

## 2. Who is it for

Three real users:

1. **Fotini Kandri** — Cyprus lawyer, handles divorce + immigration cases, uploads to iJustice. Reaches for Lex to generate invoices and receipts, track billable hours per case, and ask the AI which clients are overdue — without leaving her workspace.
2. **Marios Christodoulou** — solo practitioner in Limassol, corporate + property law, mid-50s. Reaches for Lex on Friday afternoons to generate the week's invoices, review the monthly financial summary, and chase late-paying clients on Monday.
3. **Elena Papadopoulou** — paralegal at a 4-lawyer firm in Nicosia, mid-30s. Reaches for Lex every morning to log billable hours for the partners, draft invoices from those hours, and check which retainers need topping up.

## 3. The "remember 24 hours later" sentence

> "Lex turned an hour of invoicing and document-drafting into thirty seconds of asking."

## 4. Three anti-references

1. **Clio / MyCase / generic US legal SaaS** — gradient-heavy, cluttered nav, "trusted by 150,000 lawyers" social-proof shouting. Lex should feel quiet and confident, not salesy.
2. **iJustice / typical Cyprus government portal** — gray tables, 1998 form fields, no hierarchy. Lex is the antidote to this, not a sibling of it.
3. **ChatGPT-style "single chat box in the middle of the page"** — Lex is a workspace, not a chat toy. The AI lives inside the work, not as the work.

## 5. Brand voice

**Adjectives:** Precise. Quiet. Respectful of expertise.

**In motion:**
- **Empty state (Invoices):** *"No invoices yet. Ask Lex to draft one — 'Invoice Andreou for the divorce filing, €450, due in 14 days' — or open a blank template."*
- **Confirmation:** *"Invoice #2026/0014 sent to maria.andreou@gmail.com. Receipt will post on payment."*
- **Error:** *"Couldn't read that PDF. The file may be password-protected — try unlocking it, or paste the text directly."*

No exclamation marks. No "Awesome!" / "Oops!" No emoji. Reads like a competent paralegal speaking to the lawyer they work for.

## 6. Success criterion

> **Fotini ends today's meeting saying "send me the cost proposal" — not "let me think about it" — and follows through with her feature list by email within 48 hours.**

Signal isn't praise. It's commitment of money or her time.

## 7. Hard constraints

- **Deadline:** Live URL Fotini can click in today's meeting (2026-05-13). No "we'll have it next week."
- **Stack:** Next.js 16 + React 19 + TypeScript + Supabase + Vercel (Qualia standard). AI via OpenRouter.
- **Compliance:** GDPR. EU data residency for Supabase project (Frankfurt or Ireland region). No US-hosted DB.
- **Cyprus VAT compliance:** 19% VAT, sequential gap-free invoice numbering, tax + VAT registration numbers on every invoice.
- **Languages:** Greek and English from day one. Not "Greek later."
- **No mock data anywhere user-visible.** Real invoices/cases seeded into Supabase; demo flows hit the real DB.
- **Real auth.** Fotini logs in with her email; no demo bypass button.
- **AI assistant must actually work.** Natural-language → draft invoice is the make-or-break moment.

## 8. Out of scope

**IN (the rich, lawyer-specific invoicing demo):**

Tier 1 (must ship today):
1. Invoices, receipts, quotations, retainer agreements — four document types.
2. Case-linked billing — every invoice attaches to a matter/case.
3. Billable-hours tracking — timer per case, hours convert to line items.
4. Trust / client-funds ledger — separate from operating revenue (disbarment-grade compliance feature).
5. Cyprus VAT compliance — 19% auto, sequential numbering (`2026/0001` format).
6. AI assistant for invoicing — natural language → invoice draft + queries ("who's overdue?", "draft reminders").
7. Bilingual (GR + EN) — UI + invoice content, side-by-side toggle.
8. Editable invoice templates — 2–3 modern designs, customizable (logo, colors, footer).
9. Monthly financial summary — revenue, outstanding, overdue, by case + by client.
10. Payment reminders + aging report — auto-drafted in client's language.

Tier 2 (bonus if time permits):
11. Recurring invoices for monthly retainers.
12. Disbursements / court fees as pass-through line items.
13. Multi-currency (€/USD/GBP) for international clients.
14. Conflict-check when creating a new client.

**OUT (firmly cut from today's demo):**

- AI legal-document drafting (motions, NDAs, letters).
- Case management UI (calendar, hearings, client portal).
- iJustice upload automation.
- WhatsApp / Telegram outbound channels (email-only).
- Voice commands.
- Payment processing / card charging.
- Multi-tenant firm accounts (single-workspace = Fotini's login).
- Importing her ~50 real cases (we seed ~10 fictional Cyprus-legal records).

---

## How this feeds `/qualia-new`

- §1–§5 seed PROJECT.md (one-line pitch, what we're building) and PRODUCT.md (users, register, voice, anti-references).
- §6 becomes the first row of the success-criteria table in ROADMAP.md (the demo milestone's exit gate).
- §7–§8 populate PROJECT.md's "Out of Scope" and the constraints section.
- §9–§14 are NOT captured (demo path stops at §8 — Lex is one milestone).
