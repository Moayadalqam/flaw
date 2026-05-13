# Requirements: Lex

**Defined:** 2026-05-13
**Core Value:** Turn an hour of Cyprus-lawyer invoicing into thirty seconds of
asking — and be the only invoicing tool that handles the trust ledger correctly.
— [PRODUCT.md §Differentiation]

Requirements are grouped by the single milestone that delivers them. Each
requirement has a stable REQ-ID, is atomic, testable, and user-centric.

---

## Milestone 1 · Demo — Cyprus Lawyers' Invoicing Platform

The milestone delivers the entire demo: all 18 requirements ship together as a
real, seeded, running system so Fotini can interact with her own workflow
scenario live during the pitch meeting. — [PROJECT.md §Project type]

### Authentication + Workspace

- [ ] **AUTH-01** (= REQ-001): User can log in with email + magic link and land
  in their workspace without a page reload or manual token handling; SSR-safe
  Supabase auth via `lib/supabase/server.ts`. — [PROJECT.md REQ-001]
- [ ] **AUTH-02** (= REQ-002): User's workspace is bound exclusively to their
  authenticated `auth.uid()`; no data from another user's workspace is ever
  visible, even with a valid anon key. — [PROJECT.md REQ-002;
  research/SUMMARY.md §Architecture Summary RLS]

### Clients + Matters

- [ ] **CL-01** (= REQ-003): User can create, read, update, and delete Clients
  with Cyprus VAT/Tax ID, name in both Greek and English, preferred language
  (`el` | `en`), and contact info. — [PROJECT.md REQ-003; CONTEXT.md §Client]
- [ ] **MT-01** (= REQ-004): User can create, read, update, and delete Cases
  (Matters) with a matter number, type, status, and a link to exactly one Client.
  — [PROJECT.md REQ-004; CONTEXT.md §Matter]

### Invoicing Core

- [ ] **INV-01** (= REQ-005): User can create, edit, and delete Invoices with
  line items (flat fee, billable-hours-derived, or disbursement), 19% VAT applied
  automatically server-side, and a gap-free sequential invoice number
  (`2026/0001` format) allocated only on Finalize via advisory-lock DB stored
  procedure. — [PROJECT.md REQ-005; research/SUMMARY.md §Risk 1;
  research/ARCHITECTURE.md §Invoice numbering]
- [ ] **INV-02** (= REQ-006): User can issue a Receipt for a paid Invoice; the
  Receipt is generated from the Invoice record and carries the same line-item
  structure with a "Payment received" confirmation. — [PROJECT.md REQ-006;
  CONTEXT.md §Receipt]
- [ ] **INV-03** (= REQ-007): User can create a Quotation (estimating cost before
  work begins), review it with the client, and convert it to a finalized Invoice
  in one action. — [PROJECT.md REQ-007; CONTEXT.md §Quotation]
- [ ] **INV-04** (= REQ-008): User can create a Retainer agreement with a
  running balance that reflects deposits and drawdowns; Retainer balance is always
  drawn from the Trust ledger, never from revenue. — [PROJECT.md REQ-008;
  CONTEXT.md §Retainer]

### Billable-Hours Timer

- [ ] **TIME-01** (= REQ-009): User can start and stop a billable-hours timer
  against any open Case; logged hours convert to invoice line items in one click
  at a configurable hourly rate per Matter. — [PROJECT.md REQ-009;
  CONTEXT.md §Billable hours; research/SUMMARY.md §Features Summary]

### Trust Ledger

- [ ] **TRUST-01** (= REQ-010): User can view a Trust ledger that is physically
  separate from all revenue views; each Client has an independent trust balance
  computed from append-only ledger entries; the trust view uses the sage-olive
  (`--trust`) color surface and carries the "Trust ledger — Client funds. Not
  lawyer revenue." banner; no trust entries ever appear in any revenue summary.
  — [PROJECT.md REQ-010; DESIGN.md §Trust ledger view; CONTEXT.md §Trust ledger;
  research/SUMMARY.md §Risk 2]

### AI Assistant

- [ ] **AI-01** (= REQ-011): User can type a natural-language sentence into the
  command bar (⌘K) and receive a Zod-validated invoice draft (client, matter,
  line items, description) via OpenRouter structured-output; VAT is computed
  server-side, never by the AI; draft status='draft', created_by_ai=true, no
  invoice number allocated yet. — [PROJECT.md REQ-011;
  research/SUMMARY.md §Architecture Summary §AI service-role write path]
- [ ] **AI-02** (= REQ-012): User can ask the AI natural-language queries in the
  command bar ("who's overdue?", "draft reminders for all unpaid", "Q2 revenue
  by case") and receive accurate, Zod-validated responses drawn from workspace
  data only — no hallucinated client names, amounts, or dates. — [PROJECT.md
  REQ-012; research/SUMMARY.md §Risk 5]

### Bilingual UI + Templates

- [ ] **I18N-01** (= REQ-013): User can toggle the UI between Greek and English
  on any screen; invoice document content renders in the Client's preferred
  language (bilingual side-by-side GR+EN or single-language per Client setting);
  all numeric formatting uses `Intl.NumberFormat('el-CY', ...)` and all dates use
  `Intl.DateTimeFormat('el-CY', ...)`. — [PROJECT.md REQ-013; DESIGN.md §3
  Typography; PRODUCT.md §Strategic principles]
- [ ] **TMPL-01** (= REQ-014): User can choose from 2-3 editable invoice/receipt
  PDF templates and customize logo, colors, and footer text (IBAN, tax ID, VAT
  registration number); customization persists per workspace. — [PROJECT.md
  REQ-014]

### Reporting + Reminders

- [ ] **REP-01** (= REQ-015): User can view a monthly financial summary showing
  total revenue, outstanding, and overdue amounts broken down by Case and by
  Client; the summary never includes Trust ledger balances. — [PROJECT.md REQ-015;
  PRODUCT.md §Users Marios Christodoulou]
- [ ] **REP-02** (= REQ-016): User can view an Aging report grouping unpaid
  Invoices into 0-30, 31-60, and 60+ day buckets; user can trigger AI-drafted
  bilingual payment reminder emails (Resend) for selected overdue Invoices; drafts
  are shown for review before sending. — [PROJECT.md REQ-016;
  research/SUMMARY.md §Stack Summary email; CONTEXT.md §Aging report]

### PDF Export

- [ ] **PDF-01** (= REQ-017): User can export any Invoice, Receipt, Quotation, or
  Retainer agreement as a PDF; PDF renders Greek diacritics correctly (no boxes);
  server-side generation via `@react-pdf/renderer` with static Noto Sans Greek
  TTFs bundled in `public/fonts/`; draft PDFs carry a "DRAFT — NOT A TAX
  DOCUMENT" watermark; finalized PDFs do not. — [PROJECT.md REQ-017;
  research/SUMMARY.md §Risk 3; DESIGN.md §Invoice document]

### Seed Data

- [ ] **SEED-01** (= REQ-018): Workspace is pre-seeded with 10 fictional
  Cyprus-legal clients (at least 3 with full Greek names including diacritics),
  5 cases, and sample invoices across multiple document types so Fotini can
  interact with realistic data during the demo without manual entry. — [PROJECT.md
  REQ-018]

---

## Post-Demo (v2 — after Fotini signs)

Features acknowledged but deferred past the demo. None block the pitch.
— [PROJECT.md §Out of scope (demo)]

### Tier-2 Features

- **TIER2-01**: Recurring invoices — auto-generate invoices on a schedule
- **TIER2-02**: Disbursements / court-fee line items with separate VAT treatment
- **TIER2-03**: Multi-currency support (default EUR, add foreign currencies)
- **TIER2-04**: Conflict-check on new client creation (matter-type vs existing clients)
- **TIER2-05**: Multi-tenant firm accounts (multiple lawyers, shared workspace)
- **TIER2-06**: WhatsApp / Telegram outbound reminders (email-only in demo)
- **TIER2-07**: iJustice upload automation

---

## Out of Scope

Explicit exclusions — prevents scope creep during the demo build.
— [PROJECT.md §Out of scope (demo)]

| Feature | Reason |
|---------|--------|
| AI legal-document drafting (motions, NDAs, letters) | Risk + time; AI scoped to invoicing only — [PROJECT.md §Decisions] |
| Case management UI (calendar, hearings, client portal) | Stay narrow; "deep on invoicing where Clio goes wide" — [research/SUMMARY.md §Anti-features] |
| iJustice upload automation | Post-demo only — [PROJECT.md §Out of scope] |
| WhatsApp / Telegram outbound | Email-only for demo — [PROJECT.md §Out of scope] |
| Voice commands | Not requested — [PROJECT.md §Out of scope] |
| Payment processing / card charging | Show "Mark as paid" + receipt issuance instead — [research/SUMMARY.md §Anti-features] |
| Multi-tenant firm accounts | Single-workspace demo; multi-seat in v2 if Fotini commits — [PROJECT.md §Out of scope] |
| Importing real existing cases | Post-NDA onboarding only — [PROJECT.md §Out of scope] |
| Separate AI chat tab or /chat route | Command bar (⌘K) only — [PRODUCT.md §Anti-references] |

---

## Traceability

Every v1 requirement maps to exactly one phase.

| Requirement | REQ-ID | Phase | Status |
|-------------|--------|-------|--------|
| AUTH-01 | REQ-001 | Phase 2: UI Shell + i18n | Pending |
| AUTH-02 | REQ-002 | Phase 1: Schema + RLS Foundation | Pending |
| CL-01 | REQ-003 | Phase 2: UI Shell + i18n | Pending |
| MT-01 | REQ-004 | Phase 2: UI Shell + i18n | Pending |
| INV-01 | REQ-005 | Phase 3: Invoice + Receipt CRUD + PDF | Pending |
| INV-02 | REQ-006 | Phase 3: Invoice + Receipt CRUD + PDF | Pending |
| INV-03 | REQ-007 | Phase 4: Quotation + Retainer + Timer + Trust | Pending |
| INV-04 | REQ-008 | Phase 4: Quotation + Retainer + Timer + Trust | Pending |
| TIME-01 | REQ-009 | Phase 4: Quotation + Retainer + Timer + Trust | Pending |
| TRUST-01 | REQ-010 | Phase 4: Quotation + Retainer + Timer + Trust | Pending |
| AI-01 | REQ-011 | Phase 5: AI Assistant | Pending |
| AI-02 | REQ-012 | Phase 5: AI Assistant | Pending |
| I18N-01 | REQ-013 | Phase 2: UI Shell + i18n | Pending |
| TMPL-01 | REQ-014 | Phase 3: Invoice + Receipt CRUD + PDF | Pending |
| REP-01 | REQ-015 | Phase 6: Compliance + Reports + Deploy | Pending |
| REP-02 | REQ-016 | Phase 6: Compliance + Reports + Deploy | Pending |
| PDF-01 | REQ-017 | Phase 3: Invoice + Receipt CRUD + PDF | Pending |
| SEED-01 | REQ-018 | Phase 1: Schema + RLS Foundation | Pending |

**Coverage:**
- v1 requirements (demo milestone): 18 total
- Mapped to phases: 18
- Unmapped: 0

---

## Requirement Quality Rules

1. **ID format:** `{CATEGORY}-{NUMBER}` stable across project life
2. **User-centric:** "User can X" — not "System does Y"
3. **Atomic:** one capability per requirement
4. **Testable:** the observable behavior is nameable
5. **Independent:** minimal dependencies on other requirements
6. **Assigned to exactly one milestone:** no duplicates, no gaps

## Status Values

- **Pending** — not started
- **In Progress** — phase active, work in progress
- **Complete** — verified as passing
- **Blocked** — waiting on external factor

---

*Last updated: 2026-05-13*
