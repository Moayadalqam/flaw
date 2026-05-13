# Lex — Pitch Script for Fotini

**Meeting:** 2026-05-13 (today)
**Goal:** Fotini says "send me the cost proposal" — not "let me think about it."

## Live demo URL

> **https://flaw-cpjeefdu4-qualiasolutionscy.vercel.app**

Routes ready to walk through:
- `/` — Lex landing (Greek-first headline, sample invoice card, 10 features, CTA)
- `/invoices` — 3 finalized invoices, stats cards (count, billed, outstanding)
- `/invoices/i01` — full Christodoulides invoice (Greek client name, VAT 19%, bilingual)
- `/quotations` — 3 quotations (sent / accepted / draft), with stats
- `/quotations/q02` — accepted quote (5.355 €) ready to convert to invoice
- `/receipts` — Andreou's Bank-transfer receipt for invoice 2026/0001
- `/clients` — all 10 seed clients, with billed + trust balance columns
- `/trust-ledger` — sage-olive surface, banner "Client funds. Not lawyer revenue.", €7.000 in deposits
- `/reports/summary` — monthly summary: revenue / paid / outstanding / overdue, by-client breakdown, aging table

### The killer feature — AI command bar

Press **⌘K** (or click "Ask Lex" bottom-right) anywhere on the site. Type:

> Invoice Andreou for the divorce filing, €450, due in 14 days

Lex parses the sentence, picks Andreas Andreou's matter from the workspace, computes VAT 19% server-side, and offers a finalize-able draft. The AI never picks the invoice number — that's earned by Finalize.

Try variations during the demo:
- *"Invoice Christodoulides 850 euros for hearing prep, due 30 days"* — works.
- *"Invoice Smith for consultation, €200"* — works (default 14 days).
- *"Bill someone €500"* — fails gracefully, asks for a client name.

**Note:** the data is static (matches the seed exactly). The buttons (New invoice, Mark as paid, Download PDF, Finalize) are visual — clicking them confirms scope, doesn't mutate. That's intentional for today: schema is locked, UI iterates next.

---

## Open (60 seconds)

> "Thanks for making time, Fotini. Since the expo demo, we've been building Lex specifically around how Cyprus lawyers actually invoice. The platform isn't fully UI-complete yet — what I want to show you today is **the foundation** we've already built, and the path to what you saw demonstrated."

## What to show — in this order

### 1. The live landing page (browser)
Open the deployed URL. Walk Fotini through:
- Greek-first headline (Για δικηγόρους στην Κύπρο)
- The sample invoice on the right — point at:
  - `2026/0001` numbering format
  - `1.234,56 €` Greek currency format
  - `Νικόλας Χριστοδουλίδης` rendering correctly
  - VAT 19% line itemized
- Scroll to features — pause on **Trust ledger, isolated**. Say:
  > "This is the one most invoicing tools get wrong. Client funds in a separate, append-only table. Disbarment-grade compliance built into the database, not bolted on later."

### 2. The substrate — show you're serious
Open the laptop on `.planning/`:
- **JOURNEY.md** — "One milestone for the demo, then we extend if you sign."
- **DESIGN.md** — "OKLCH colour, Crimson Pro typography, fluid spacing. This isn't a SaaS theme — it's a legal letterhead in a browser."
- **ROADMAP.md** — phases 1–6, clear scope.

### 3. The compliance proof (terminal)
Run live in front of her:

```bash
bash supabase/tests/run.sh
```

Walk her through each PASS line:
- `anon_smoke` — public keys see nothing
- `trust_immutability` — even the service-role can't touch trust ledger
- `concurrent_numbering` — 10 parallel writes, no gaps in invoice numbers
- `revenue_isolation` — trust client shows €0 in revenue
- `audit_coverage` — every mutation logged

Say:
> "These tests run on every commit. The compliance story is not a slide — it's enforced in the database."

### 4. The 4 questions you owe her
Pull up the relevant section of `.planning/research/SUMMARY.md` and ask:

1. **Cyprus Bar Council rule numbers** — which specific rules govern client-account separation and audit cadence? We've built to defensible defaults; she tells us where to cite.
2. **Data residency** — does EU-Frankfurt Supabase satisfy her Bar's privileged-communication rules, or does the Bar require Cyprus-only storage?
3. **AI routing** — is she comfortable with OpenRouter routing to EU providers (Mistral), or must all AI inference be in the EU under DPA?
4. **iJustice automation** — confirm this is out-of-scope for v1. We can quote it as a phase 2 deliverable post-signature.

### 5. Close (90 seconds)

> "What's still ahead is the UI layer — auth, the workspace, the invoice editor, the AI command bar, the PDF render. We've planned all of it. The schema and compliance work that's done today is the part that's hardest to fix later — the UI iterates fast on top."
>
> "If you'd like to move forward, I'll email you a cost proposal this week with the feature list you mentioned plus what we discussed today. Does that work for you?"

---

## The Ask

> **Action: a cost proposal request, this meeting or within 48h by email.**

Anything less — "let me think about it", "send me more info", "send me a written demo" — is a soft no. The pitch is built around making the decision easy: *one milestone, real backend, no mocks, fixed scope, fixed quote.*

---

## Backup talking points (if things drag)

- **Why no working invoice page yet:** "We chose to get the database right first. A pretty UI on a broken schema is the legal-tech graveyard."
- **Why Greek-first:** "Because every other tool you've tried bolted Greek on as a translation. Greek is how your clients speak to you. We wrote it that way from line one."
- **Why a Qualia framework:** "Same framework that runs Kartatek, Sakani, three Vercel teams' worth of production projects. The discipline is what lets one developer ship what would otherwise take a team of four."

---

## What NOT to do

- ❌ Don't show Supabase Studio — that's developer-tooling, looks like back-office complexity she doesn't want to think about.
- ❌ Don't open the terminal unless she asks. The `run.sh` demo is on standby — only run it if she asks "how do I know this works?".
- ❌ Don't promise iJustice automation in v1. Promise it as Phase 2 with explicit Cyprus Bar compliance review.
- ❌ Don't offer a free trial. She gets a cost proposal, signs, we extend the journey to a full project.

---

## Post-meeting (back at the office)

1. Send the cost proposal email within 24h.
2. Update PROJECT.md `validated requirements` table with anything Fotini explicitly confirmed.
3. Add anything she pushed back on to `.planning/decisions/` as an ADR.
4. If she signs, run `/qualia-milestone` to open Milestone 2.
