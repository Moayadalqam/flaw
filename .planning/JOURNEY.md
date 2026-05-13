---
project: "Lex"
total_milestones: 1
current_milestone: 1
created: 2026-05-13
---

# Lex — Journey

The full arc for the demo. One milestone: ship the thing Fotini says "yes" to.
There is no Handoff milestone. The demo IS the artifact. If Fotini signs,
`/qualia-milestone` converts this into a full project and the roadmapper
appends the next milestone at that point.

## Mission

Lex is a focused, premium invoicing platform built for Cyprus lawyers. It ships
four document types (invoices, receipts, quotations, retainers), case-linked
billing, billable-hours tracking, a trust ledger that is legally separate from
revenue, Cyprus-VAT-compliant sequential invoice numbering, an AI assistant that
turns one natural-language sentence into a billable invoice, and bilingual
Greek-English output throughout. The demo delivers all of this as a real,
running, seeded system — not a prototype — so that Fotini Kandri can interact
with her own workflow scenario live during the pitch meeting.

Success criterion (from project-discovery.md §6): Fotini ends the meeting saying
"send me the cost proposal" — not "let me think about it" — and follows through
with her feature list by email within 48 hours. — [PROJECT.md §Project type]

## The Path (1 milestone, demo)

```
M1 — Demo — Cyprus Lawyers' Invoicing Platform
│
└── [CURRENT]
```

---

## Milestone 1 · Demo — Cyprus Lawyers' Invoicing Platform     [CURRENT]

**Why now:** This is the only milestone. The pitch meeting is today (2026-05-13).
Everything ships in a single arc because the demo is the artifact — a real
backend, real data, real AI assistant — that Fotini can interact with live.
There are no prior foundations to build on and nothing to defer: all 18
requirements must pass before the meeting. — [PROJECT.md §Project type,
research/SUMMARY.md §Single-Milestone Demo Shape]

**Exit criteria** (what "shipped" means for this milestone):

- Magic-link email lands in Fotini's inbox within 30 seconds, she logs in, and
  reaches a seeded workspace showing 10 fictional Cyprus-legal clients, 5 cases,
  and sample invoices with correct GR+EN bilingual content. — [PROJECT.md
  REQ-001, REQ-018]
- Fotini types "Invoice Andreou for the divorce filing, €450, due in 14 days"
  into the command bar, receives a Zod-validated AI draft, previews the PDF
  (Greek diacritics render correctly, no boxes), reviews line items and VAT, and
  clicks Finalize — receiving invoice number 2026/0001 (gap-free, sequential).
  — [PROJECT.md REQ-005, REQ-011, REQ-017; research/SUMMARY.md §Risk 1, §Risk 3]
- The Trust ledger view is visually distinct from the revenue summary (sage-olive
  surface, "Trust ledger — Client funds. Not lawyer revenue." banner) and a
  seed scenario where only trust deposits exist shows €0 in the revenue view.
  — [PROJECT.md REQ-010; DESIGN.md §Trust ledger view; research/SUMMARY.md §Risk 2]

**Phases:**

1. **Schema + RLS Foundation** — Establish the data model, gap-free invoice
   numbering, trust-ledger isolation, append-only audit triggers, and RLS
   policies so every subsequent phase builds on a legally and technically sound
   base.
2. **UI Shell + i18n** — Wire up auth, the workspace layout, sidebar navigation,
   and the GR/EN toggle; apply all DESIGN.md tokens (OKLCH, Crimson Pro,
   Söhne, tabular numerals) so every subsequent UI phase inherits the correct
   visual language.
3. **Invoice + Receipt CRUD + PDF Render** — Build the core billing loop:
   create/edit/delete invoices and receipts, server-side PDF generation with
   Greek font rendering hardened end-to-end, and the draft-watermark / finalize
   flow.
4. **Quotation + Retainer + Billable-Hours Timer + Trust Ledger Views** — Add
   the remaining document types and the billable-hours timer; build the trust
   ledger view with visual separation enforced; wire the trust balance into
   retainer agreements.
5. **AI Assistant** — Integrate OpenRouter structured-output for NL-to-invoice
   drafting and NL queries (overdue clients, aging, reminder drafts); enforce
   the AI write guard (Draft → Review → Finalize; AI never allocates invoice
   numbers; VAT computed server-side only).
6. **Compliance Hardening + Reports + Email + Deploy + Smoke Test** — Add monthly
   financial summary, aging report, AI-drafted bilingual email reminders (Resend),
   GDPR sub-processor documentation, pre-demo deploy hardening, and the full
   smoke-test suite to confirm every demo-day-critical path is green.

**Requirements covered:** REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006,
REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, REQ-013, REQ-014,
REQ-015, REQ-016, REQ-017, REQ-018

**Research flags (require live validation with Fotini — NOT implementation
blockers):**

- Cyprus Bar Council exact rule citations for client-account separation, audit
  cadence, and disbarment triggers. Build to defensible defaults (separate table,
  append-only, never mixed in any view). Ask Fotini which Bar Council rule numbers
  to cite in the audit-trail UI. — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 1]
- Söhne typeface Greek glyph coverage for Qualia's license tier. Verify with Klim
  Type Foundry OR substitute Noto Sans Greek (guaranteed coverage) before demo.
  — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 2]
- OpenRouter exact EU-only routing capability and which downstream models are
  EU-eligible vs US-only. Check OpenRouter dashboard before demo; commit to
  Mistral (EU-only) OR explicitly consent to US models in DPA.
  — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 3]
- Whether EU-region Supabase satisfies Cyprus Bar's data-residency duty for
  privileged communications. EU region is necessary; some bar associations require
  explicit cloud-storage approval. — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 4]

---

## Rules for This Journey

1. **Single milestone.** This project has no Handoff milestone — the demo IS the
   artifact. If Fotini signs, `/qualia-milestone` extends the journey.
2. **No scope creep during the build.** Features not in REQ-001..REQ-018 go into
   the post-demo v2 list. — [PROJECT.md §Out of scope (demo)]
3. **Exit criteria are observable.** Every success criterion has a verification
   command — not "looks right."
4. **Research flags are conversation starters, not blockers.** The 4
   INSUFFICIENT-EVIDENCE items are de-risked by the Fotini meeting, not by
   inference. — [research/SUMMARY.md §INSUFFICIENT EVIDENCE]

---

*Last updated: 2026-05-13*
