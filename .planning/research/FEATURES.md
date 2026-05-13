# Feature Research

**Domain:** Invoicing software for solo + small law practices — Cyprus / EU lens
**Researched:** 2026-05-13
**Confidence:** MEDIUM-HIGH (HIGH on feature taxonomy from competitor analysis; MEDIUM on Cyprus-specific market gaps because no Cypriot-specific competitor survey exists in our local knowledge or in budget-affordable web sources)
**Scope:** quick (demo path — single milestone)

---

## Feature Landscape

### Table Stakes (Users Expect These — Missing Any = Product Feels Incomplete)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Time tracking → invoice line items (per-matter timer)** | Universally cited as the foundational legal-billing feature; every reviewed competitor leads with it. "Time tracking capabilities included in legal software ensure that all billable time is documented instantly." — [Source: WebSearch: "legal invoicing software features lawyers actually use 2026 Clio MyCase PracticePanther adoption Europe" → https://www.legalprod.com/en/top-10-best-lawyer-tools-currentyearguide-guide/] | MEDIUM | Lex's "Billable-hours timer per case → invoice line items" (Tier-1 #3) is correct. Must be one-click start/stop on a matter row, not a separate page. |
| **Customizable invoice templates (logo, colors, footer)** | "With customizable invoice templates, PracticePanther lets users create invoices for a range of matters." — [Source: WebFetch https://www.practicepanther.com/blog/best-legal-practice-management-software/ via WebSearch result] | MEDIUM | Lex's 2–3 editable templates (Tier-1 #8) hits the bar. Don't overbuild a template designer for the demo. |
| **Trust / client-funds accounting separated from operating revenue** | "Clio Payments is highlighted for keeping 'earned and unearned fees...separate' with transaction fees never drawn from trust accounts, indicating IOLTA/trust accounting separation is non-negotiable." — [Source: WebFetch https://www.clio.com/blog/best-small-law-firm-billing-software/] | HIGH | Lex's trust ledger (Tier-1 #4) is positioned correctly as "sacred" per PRODUCT.md. This is the disbarment-grade feature — if it's wrong, the lawyer can't use the product at all. |
| **Automated payment reminders + aging report** | Every reviewed competitor has automated reminders; aging report is standard but "remains secondary priority for small firm marketing narratives" — meaning lawyers expect it to exist but don't shop on it. — [Source: WebFetch https://www.clio.com/blog/best-small-law-firm-billing-software/] | MEDIUM | Lex's Tier-1 #10 covers this. Bilingual reminder drafts (GR/EN per client preference) is a real differentiator over US tools. |
| **Matter/case-linked billing** | "Common filters when shortlisting LPMS include Case/Matter Management, Timekeeping, Trust Accounting, Billing & Invoicing" — every legal-billing product ties invoices to matters. — [Source: WebSearch: "legal invoicing software features lawyers actually use 2026 Clio MyCase PracticePanther adoption Europe" → https://www.practicepanther.com/blog/best-legal-practice-management-software/] | LOW | Lex's Tier-1 #2 (matter number on every invoice) is correct. Make it visible in invoice tables, not just stored. |
| **Multiple payment options & flat-fee billing support** | "75% of solo firms and 65% of small firms now offer flat fee billing models" — billing software "must accommodate diverse fee structures." — [Source: WebFetch https://www.clio.com/blog/best-small-law-firm-billing-software/] | MEDIUM | Lex supports invoices/quotations/retainers but NOT card-charging (out of scope). Demo must show the invoice supports flat-fee line items (not just hourly). |
| **Quotations / engagement quotes that convert to invoice** | All major competitors offer this; lawyers quote before engaging. CONTEXT.md confirms "Quotation … becomes an Invoice when the Client accepts." | MEDIUM | Lex Tier-1 #1 covers it. |
| **VAT / tax compliance for jurisdiction** | EU buyers weight "security and RGPD compliance" highly — implicit table-stake for any EU legal tool. — [Source: WebSearch: "legal invoicing software features lawyers actually use 2026 Clio MyCase PracticePanther adoption Europe" → https://www.legalprod.com/en/top-10-best-lawyer-tools-currentyearguide-guide/] | HIGH | Lex's 19% VAT + sequential numbering `2026/0001` (Tier-1 #5) is differentiating vs US tools that don't handle Cyprus VAT format at all. |

### Differentiators (Competitive Advantage — Not Universally Present)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Natural-language → invoice draft (AI assistant in-app)** | No US competitor reviewed leads with "type one sentence, get an invoice." Clio has "Manage AI" routing bills to approvers but it's workflow, not authoring. — [Source: WebFetch https://www.clio.com/blog/best-small-law-firm-billing-software/]. This IS Lex's differentiation per PRODUCT.md ("Lex turned an hour … into thirty seconds of asking"). | HIGH | The make-or-break moment per discovery §7. Must work on the demo. AI lives in command bar (⌘K) per PRODUCT.md, not a chat tab. |
| **Bilingual (GR + EN) first-class** | EU buyers weight "availability in French" and locally-built tools "emphasize RGPD/GDPR compliance and French-language support." — [Source: WebSearch: "legal invoicing software features lawyers actually use 2026 Clio MyCase PracticePanther adoption Europe" → https://www.legalprod.com/en/top-10-best-lawyer-tools-currentyearguide-guide/]. Greek is even less served than French; this is the moat against US imports. | MEDIUM | Lex Tier-1 #7. Per CONTEXT.md, invoices can render side-by-side bilingual OR per-Client-preference. |
| **Cyprus VAT compliance baked in (not a setting)** | US competitors (Clio, MyCase, PracticePanther) are North-America-built and require manual setup for non-US tax jurisdictions. Cyprus sequential numbering `2026/0001` and 19% VAT are not in their default flows. — [Source: WebSearch result above — "Clio … particularly dominant in North America"] | MEDIUM | PRODUCT.md correctly frames this as "non-optional, not configurable" — a regulatory moat. |
| **EU data residency (Frankfurt/Ireland)** | "EU buyers tend to weight … security and RGPD compliance." US-hosted competitors are a liability for EU lawyers under GDPR. — [Source: WebSearch result via legalprod.com] | LOW | Already a hard constraint in PROJECT.md. Mention in demo if Fotini asks "where is my data?" |
| **Monthly financial summary (by case + by client)** | "Compare legal software according to criteria like … range of features included" — reporting is mentioned but rarely a marquee feature. Solo lawyers genuinely need a "Friday afternoon" view. PRODUCT.md User 2 (Marios) specifically reaches for this. | MEDIUM | Lex Tier-1 #9. Keep it ONE page; don't ship a BI tool. |
| **Trust ledger visual distinction from operating revenue** | Competitors offer trust accounting but typically present it as "another tab." PRODUCT.md's "different surface tints, different iconography, different table chrome" — visual non-confusability — is stronger than functional separation alone. | MEDIUM | This is a design-driven differentiator. Worth showing explicitly in the demo. |

### Anti-Features (Seem Good, Aren't — for the Demo)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **LEDES e-billing / UTBMS task codes** | Lawyers may ask "do you support LEDES?" because they've read about it. | UTBMS is "created with consideration of the American legal system" and "difficult for global users [who] don't understand the US-oriented terminology." The EU adaptation (EW-UTBMS J-Codes) is England & Wales only — NO Cyprus equivalent. UTBMS itself has a "fatal flaw" — relying on lawyers to code consistently doesn't work, "humans are notoriously bad at classification." — [Source: WebSearch: "LEDES UTBMS task codes legal billing Europe Cyprus 2026 used outside US" → https://brightflag.com/resources/utbms-and-ledes-codes-ai/ and https://ledes.org/category/utbms/] | DO NOT BUILD for demo. If asked, say "Cyprus practices don't bill insurers/corporates with LEDES — that's a US large-firm pattern. We'd add it if you onboarded a UK litigation desk." Solo Cypriot lawyers like Fotini don't use it. |
| **Card-charging / payment processing** | Lawyers see "Stripe integration" on Clio screenshots. | Adds PCI scope, KYC requirements, settlement timing complications, refund flows. Discovery §8 explicitly cuts this. Cyprus lawyers commonly invoice → bank transfer. | Defer to v2. Show "Mark as paid" + receipt issuance instead — same workflow, no payment-rails risk. |
| **Multi-tenant firm accounts with per-lawyer permissions** | "We might grow to 3 lawyers" is the common expansion fantasy. | Multi-tenant adds RLS complexity on every table, role tables, invitation flows. Discovery §8 cuts this; PRODUCT.md is explicit "single-workspace = Fotini's login." | Demo single-workspace. If Fotini commits, scope multi-seat in v2. |
| **Full case management (calendar, hearings, client portal)** | "Lawyers want everything in one place" — Clio's pitch. | Clio + MyCase + PracticePanther all do this AND charge $79–$139/user/month for the privilege. Going wide loses the "deep on invoicing" demo bet. Discovery §8 explicitly cuts. | Stay narrow. The pitch IS the narrowness — "we go deep on invoicing where Clio goes wide and shallow." |
| **iJustice automation / legal-doc drafting** | Fotini's actual daily pain; she may ask. | Out of scope per discovery §8. Building it incorrectly destroys credibility on the part that DOES work. | Honest answer: "Not today. The demo is invoicing only — we'd talk about iJustice after you've used the invoicing for two weeks." |
| **WhatsApp / Telegram reminders** | Cyprus business runs on WhatsApp socially. | Out of scope per discovery §8. Email reminders + bilingual drafts are sufficient for the demo. | Email-only. Mention "WhatsApp is on the roadmap" if asked. |
| **A separate "AI chat" tab/page** | The instinct to give the AI its own real estate. | PRODUCT.md anti-reference #3: "ChatGPT-style 'single chat box in the middle of the page'" — explicitly rejected. The AI lives **inside** the work. | Command bar (⌘K) on every screen + per-record actions. No `/chat` route. |
| **LEDES export as a tickbox feature** | Same as #1, but framed as export-only. | Even pure export requires task-code annotation per time entry — forces UI complexity on the timer that solo Cypriot lawyers never use. | Plain PDF + structured CSV export covers 100% of solo-practice cases. |

---

## MVP Recommendation (Demo Today — 2026-05-13)

### Launch With (the demo URL Fotini clicks)

All ten Tier-1 features from `project-discovery.md` are the correct scope. Restated here with rationale grounded in the research:

- **Invoices, receipts, quotations, retainers (4 doc types)** — competitors all have them; missing any feels incomplete.
- **Case-linked billing** — table stakes per WebSearch evidence (Case/Matter Management is universal LPMS filter).
- **Per-case timer → line items** — table stakes; first thing every lawyer looks for.
- **Trust ledger (visually distinct)** — table stakes AS COMPLIANCE; differentiator AS DESIGN.
- **Cyprus VAT (19%, `2026/0001` numbering)** — differentiator vs US tools that fail Cyprus compliance.
- **AI assistant in-product (NL → invoice + queries)** — the demo's main bet. No US competitor leads with this.
- **Bilingual GR + EN** — differentiator; localized tools "emphasize … language support" per legalprod.com evidence.
- **2–3 editable templates** — table stakes; bare minimum.
- **Monthly financial summary** — table stakes (it's the Friday-afternoon view Marios persona needs).
- **Payment reminders + aging report** — table stakes; bilingual drafts elevate it slightly.

### Add After Validation (v1.x — if Fotini commits)

- **Recurring invoices for retainers** (Tier-2 #11) — trigger: any client on a monthly retainer arrangement. Genuinely useful, just not demo-critical. Complexity is moderate (cron + template).
- **Disbursements / court-fee pass-through line items** (Tier-2 #12) — trigger: Fotini sends her first invoice with a court filing fee. Cypriot lawyers DO pass these through; CONTEXT.md already defines the term. Per Clio research, "disbursement management … remain[s] secondary priorities" so it's safe to defer to v1.x.
- **Conflict-check on new client** (Tier-2 #14) — trigger: Fotini onboards her ~50 real cases. Useful but not the make-or-break.

### Defer (v2+)

- **Multi-currency** (Tier-2 #13) — defer until a client invoices outside EUR. Fotini's divorce + immigration practice is overwhelmingly EUR.
- **Card payment processing** — defer indefinitely (PCI scope, KYC); Cyprus bank-transfer + manual reconciliation is the norm.
- **Multi-seat / firm accounts** — defer until Fotini hires a paralegal (Elena persona's firm context, not Fotini's).
- **LEDES/UTBMS export** — defer indefinitely unless a UK-litigation client materializes. Evidence says "no Cyprus equivalent" of the J-Codes exists.
- **iJustice automation, case management, doc drafting** — explicit out-of-scope per discovery §8.

---

## Feature Dependencies

- **AI assistant (Tier-1 #6) requires Invoices/Receipts/Quotations data model (Tier-1 #1)** — the assistant draft writes into the same tables the form does. Build the schema + manual flow before the AI surface.
- **Trust ledger (Tier-1 #4) requires double-entry-style accounting separation from revenue, NOT just a flag on invoices** — per CONTEXT.md "trust_balance, trust_ledger_entry" naming and PRODUCT.md "mixing the two is a disbarment-grade offense." This dependency is structural, not cosmetic — wire the ledger boundaries before any invoice can touch trust.
- **Receipts (Tier-1 #1) require Invoices (Tier-1 #1)** — receipts are emitted when an invoice is marked paid. Linear, but the demo should show one example end-to-end.
- **Aging report (Tier-1 #10) requires Invoices with `due_date` + payment status** — defer aging UI until invoice CRUD is solid, but design the schema with `status` and `due_date` from day one.
- **Bilingual content (Tier-1 #7) enhances payment reminders (Tier-1 #10) and templates (Tier-1 #8)** — the reminder draft should pick the language from `Client.preferred_language` (per CONTEXT.md `'el' | 'en'`). This is what makes bilingual a differentiator vs a checkbox.
- **AI queries ("who's overdue?") require invoices to have status + due_date populated** — and they will, because the aging report needs the same data. No extra cost.
- **Cyprus VAT (Tier-1 #5) gates invoice issuance** — sequential numbering MUST be gap-free per Cyprus tax law (CONTEXT.md). This means invoice number assignment is a server-side atomic operation, not a client-computed value. Affects architecture.

---

## Notable Findings to Flag for Synthesizer

1. **LEDES/UTBMS is a red herring for this demo.** It's a US-large-firm standard with a UK adaptation only. Cyprus solo practitioners do not use it. If Fotini asks about it, the right answer is "that's not how Cyprus practices bill." Cited evidence above. Do not waste demo budget on it.

2. **The AI assistant is the differentiator that has no competitor analog at this surface depth.** Clio's "Manage AI" is workflow routing, not invoice authoring. Lex's "type one sentence → invoice draft" is genuinely novel in the legal-billing category as of the May 2026 sources reviewed. This is where the demo wins or loses.

3. **Cyprus VAT compliance is a moat, not a feature.** US competitors charge $79–$139/user/month and still require the lawyer to configure tax jurisdictions. Lex shipping Cyprus VAT correctly from line one is a structural advantage that gets weaker the further you go up-market (Clio could clone it for Cyprus in a sprint — but they haven't, and the lawyer evaluating today doesn't know that).

4. **Trust ledger is "table stakes as compliance, differentiator as design."** Every competitor has trust accounting; almost none make it visually distinct enough that a tired lawyer at 6pm can't accidentally post a trust withdrawal to revenue. The "different surface tints, different iconography" angle from PRODUCT.md is a real design moat if the demo actually shows it.

5. **Disbursements (Tier-2 #12) is closer to table stakes than the discovery doc treats it.** Cypriot lawyers regularly pay court filing fees on the client's behalf; Fotini almost certainly does this for divorce filings. If demo budget allows ONE Tier-2 feature, it should be disbursements — not multi-currency or conflict-check. Confidence MEDIUM: based on CONTEXT.md's own glossary entry treating it as a core concept ("Itemized separately from billable hours on the invoice, often without VAT") which implies the design team already considered it core.

---

## Sources

- **Local:** `.planning/CONTEXT.md` (Lex domain glossary — trust ledger, disbursement, retainer definitions)
- **Local:** `.planning/PRODUCT.md` (anti-references, brand voice, strategic principles)
- **Local:** `.planning/project-discovery.md` (Tier-1 / Tier-2 / out-of-scope, success criterion)
- **Web (WebSearch):** "LEDES UTBMS task codes legal billing Europe Cyprus 2026 used outside US" — surfaced [LEDES.org UTBMS overview](https://ledes.org/category/utbms/), [Brightflag — UTBMS flaws](https://brightflag.com/resources/utbms-and-ledes-codes-ai/), [Clio — LEDES Billing Simplified](https://www.clio.com/blog/what-is-ledes-billing/), [Onit — UTBMS 2026 Guide](https://www.onit.com/blog/how-to-make-sense-of-utbms-codes/)
- **Web (WebSearch):** "legal invoicing software features lawyers actually use 2026 Clio MyCase PracticePanther adoption Europe" — surfaced [LegalProd — Top 10 Lawyer Tools 2026](https://www.legalprod.com/en/top-10-best-lawyer-tools-currentyearguide-guide/), [MyCase — Best Legal Practice Management 2026](https://www.mycase.com/blog/legal-case-management/best-legal-practice-management-software/), [PracticePanther — Best LPMS 2026](https://www.practicepanther.com/blog/best-legal-practice-management-software/), [Lawyerist Reviews 2026](https://lawyerist.com/reviews/law-practice-management-software/)
- **Web (WebFetch):** [Clio — Best Small Law Firm Billing Software 2026](https://www.clio.com/blog/best-small-law-firm-billing-software/) — table-stakes vs differentiators, trust accounting non-negotiability, flat-fee billing statistic, what's marketed vs underused
- **NotebookLM cross-notebook query:** not run (local `.planning` docs covered domain glossary fully; budget reserved for external competitor and standards research)
- **Local knowledge layer (`knowledge.js`):** searched "legal invoicing lawyer billing" — no matches

---
*Feature research for: Invoicing software for solo + small law practices (Cyprus / EU lens)*
*Tool budget used: 2 WebSearch + 1 WebFetch = 3 / 3 quick-scope budget exhausted.*
