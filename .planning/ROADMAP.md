# Roadmap · Milestone 1 · Demo — Cyprus Lawyers' Invoicing Platform

**Project:** Lex
**Client:** Fotini Kandri
**Milestone:** 1 of 1 (CURRENT)
**Created:** 2026-05-13
**Phases:** 6
**Requirements covered:** REQ-001..REQ-018 (AUTH-01, AUTH-02, CL-01, MT-01,
INV-01..INV-04, TIME-01, TRUST-01, AI-01, AI-02, I18N-01, TMPL-01, REP-01,
REP-02, PDF-01, SEED-01)

See `JOURNEY.md` for the project arc. This file is the full phase breakdown for
the single demo milestone.

## Exit Criteria

What "shipped" means for this milestone:

- Magic-link email lands in Fotini's inbox within 30 seconds; she logs in and
  reaches a seeded workspace with 10 fictional Cyprus-legal clients, 5 cases,
  and sample invoices in GR+EN. — [PROJECT.md REQ-001, REQ-018]
- Fotini dictates one sentence into the command bar, receives a Zod-validated
  AI draft invoice, previews the PDF (Greek diacritics correct), and Finalizes
  it — receiving invoice number 2026/0001 with zero gaps under concurrency.
  — [PROJECT.md REQ-005, REQ-011, REQ-017; research/SUMMARY.md §Risk 1, §Risk 3]
- Trust ledger is visually distinct (sage-olive surface, explicit banner);
  a seed scenario with only trust deposits shows €0 in all revenue views.
  — [PROJECT.md REQ-010; DESIGN.md §Trust ledger view; research/SUMMARY.md §Risk 2]

---

## Phases

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | Schema + RLS Foundation | Legal-grade data model: gap-free numbering, trust isolation, append-only audit, RLS | AUTH-02, SEED-01 | ready |
| 2 | UI Shell + i18n | Auth, layout, navigation, GR/EN toggle, DESIGN.md tokens applied end-to-end | AUTH-01, CL-01, MT-01, I18N-01 | — |
| 3 | Invoice + Receipt CRUD + PDF | Core billing loop: CRUD, server-side PDF with Greek font hardening, draft/finalize flow | INV-01, INV-02, TMPL-01, PDF-01 | — |
| 4 | Quotation + Retainer + Timer + Trust | Remaining document types, billable-hours timer, trust ledger view with visual separation | INV-03, INV-04, TIME-01, TRUST-01 | — |
| 5 | AI Assistant | OpenRouter NL-to-draft + NL queries; write guard: Draft → Review → Finalize | AI-01, AI-02 | — |
| 6 | Compliance + Reports + Email + Deploy | Monthly summary, aging report, email reminders, GDPR docs, pre-demo deploy + smoke test | REP-01, REP-02 | — |

---

## Phase Details

### Phase 1: Schema + RLS Foundation

**Goal:** Establish the DB schema, gap-free invoice numbering, trust-ledger
isolation, append-only audit triggers, RLS policies, and seed data — so every
subsequent phase builds on a legally and technically sound foundation.
— [research/SUMMARY.md §Phase 1: Data Model + RLS Foundation;
research/ARCHITECTURE.md §Three deep decisions]

**Requirements covered:**
- AUTH-02 (REQ-002): Single-tenant workspace bound to `auth.uid()` — RLS
  policies enforce this at the DB layer
- SEED-01 (REQ-018): 10 fictional Cyprus-legal clients + 5 cases + sample
  invoices seeded

**Tasks:**
1. Write migration `001_schema.sql`: tables `workspaces`, `clients`, `matters`,
   `invoices`, `invoice_line_items`, `receipts`, `quotations`, `retainers`,
   `time_entries`, `trust_ledger`, `invoice_counters`, `audit_log`.
   Schema conventions: `matter` in DB/types, "Case" in UI; `trust_ledger` is a
   physically separate table (NOT a flag column). — [CONTEXT.md §Relationships;
   research/ARCHITECTURE.md §Trust ledger isolation]
2. Write migration `002_rls.sql`: enable RLS on every table; create
   `current_workspace_id()` SECURITY DEFINER function that resolves
   `auth.uid() → workspace_id`; all policies `USING (workspace_id =
   current_workspace_id())`; trust_ledger denies UPDATE/DELETE for ALL roles
   (corrections via reversing entries with `corrects_entry_id` FK only).
   — [research/SUMMARY.md §Risk 7; research/ARCHITECTURE.md]
3. Write migration `003_invoice_numbering.sql`: `invoice_counters(workspace_id,
   year, last_seq)` table + `allocate_invoice_number(workspace_id, year)` stored
   procedure that acquires `pg_advisory_xact_lock(hashtext(workspace_id::text ||
   year::text))` and increments atomically inside the same transaction as the
   invoice INSERT. Numbers consumed ONLY on finalize; drafts use UUID.
   — [research/SUMMARY.md §Risk 1; research/ARCHITECTURE.md §Invoice numbering]
4. Write migration `004_audit_triggers.sql`: append-only `audit_log` triggered
   on INSERT/UPDATE to invoices, trust_ledger; log `actor_kind` ('user' |
   'ai'), `actor_id`, `action`, `before_json`, `after_json`, `ts`.
   — [research/SUMMARY.md §Phase 1 §1.3 Audit triggers]
5. Verify: run 10 concurrent invoice-finalize calls → assert 10 unique sequential
   numbers, zero gaps. Command: `psql $DATABASE_URL -f tests/concurrent_numbering.sql`
6. Verify: seed scenario with only trust deposits → `SELECT SUM(amount) FROM
   invoices WHERE status='finalized'` returns 0. (Revenue view query never touches
   `trust_ledger` table.)
7. Verify: anon-key `SELECT * FROM clients` returns 0 rows (RLS working).
   Command: `curl $SUPABASE_URL/rest/v1/clients -H "apikey: $SUPABASE_ANON_KEY"
   | jq 'length'` → must equal 0.

**Acceptance criteria:**
1. `npx supabase db push` exits 0 for all 4 migrations with zero warnings on
   RLS-disabled tables.
2. Concurrent-numbering test returns exactly 10 rows with `invoice_number` values
   `2026/0001` through `2026/0010`, no duplicates, no gaps.
3. Revenue-isolation query on trust-only seed data returns `SUM = 0`.
4. Anon-key SELECT on every table returns an empty array (not a 403 — RLS
   denies silently).
5. Seed script `supabase/seed.sql` inserts 10 clients (at least 3 with full Greek
   names including diacritics such as Χριστοδουλίδης), 5 matters, and at least
   3 invoices with line items.

**Risks / notes:**
- Advisory-lock approach (not Postgres SEQUENCE) is non-negotiable. Cyprus VAT
  law forbids gaps; `nextval` is never rolled back on abort.
  — [research/SUMMARY.md §Risk 1]
- Trust-ledger RLS must deny UPDATE/DELETE even for service_role. Test
  explicitly: `UPDATE trust_ledger SET amount = 0` as service_role must return
  a policy violation error.
- INSUFFICIENT EVIDENCE flag: Cyprus Bar Council exact rule citations for
  client-account audit cadence. Build to defensible defaults; confirm rule
  numbers with Fotini during meeting.
  — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 1]

**Depends on:** none

---

### Phase 2: UI Shell + i18n

**Goal:** Wire up magic-link auth, the workspace layout, sidebar navigation,
and the GR/EN language toggle; apply all DESIGN.md tokens (OKLCH, Crimson Pro,
Söhne, tabular numerals) so every subsequent UI phase inherits the correct
visual language from line one. — [research/SUMMARY.md §Phase 2: UI Shell + i18n;
DESIGN.md §2 Color, §3 Typography]

**Requirements covered:**
- AUTH-01 (REQ-001): Magic-link login, SSR-safe Supabase auth
- CL-01 (REQ-003): Client CRUD UI (list view + create/edit form)
- MT-01 (REQ-004): Matter/Case CRUD UI (list view + create/edit form)
- I18N-01 (REQ-013): GR/EN toggle, `next-intl` wired, all numeric + date
  formatting via `Intl` with `el-CY` locale

**Tasks:**
1. Configure `next-intl` 4.x with `el-CY` default locale; create message files
   `messages/el.json` and `messages/en.json` for table headers, button labels,
   form field labels, empty states, error messages, and confirmation copy.
   Greek strings are written native (not translated from English).
   — [PRODUCT.md §Brand voice; research/SUMMARY.md §Stack Summary i18n]
2. Set `:root` CSS variables from DESIGN.md §2 Color (all OKLCH — no #hex, no
   rgb, no hsl); configure Tailwind to consume them via CSS variable references.
   Load Crimson Pro (display), Söhne or Inter Tight fallback (body), Söhne Mono
   (mono) via `next/font`. Apply `font-feature-settings: "tnum" 1, "lnum" 1` to
   `.tabular` class. — [DESIGN.md §2, §3; PROJECT.md §Design direction]
3. Build `(auth)` route group: `/login` page with magic-link form, SSR-safe
   Supabase client via `lib/supabase/server.ts`, callback route handler.
   — [rules/security.md; research/SUMMARY.md §Architecture Summary]
4. Build `(workspace)` layout group: sidebar (persistent on lg+, drawer on
   mobile), top bar with GR/EN toggle + user menu, main content slot.
   Sidebar nav items: Dashboard, Clients, Cases, Invoices, Receipts, Quotations,
   Retainers, Trust Ledger, AI Assistant, Reports. Icons: Lucide, 20px, 1.5px
   stroke. — [DESIGN.md §8 Iconography, §9 Responsive]
5. Build Client CRUD: list table (sortable, tabular numerals on amounts, sticky
   header, row-click → detail), create/edit drawer form (name GR+EN fields,
   Cyprus Tax ID, preferred language select), delete with confirmation.
6. Build Matter/Case CRUD: list table linked to client, status badge (ok/warn/kill
   semantics), create/edit form (matter number, type, status, client FK).
7. Verify layout in Greek with longest production strings: no button overflow,
   no truncated labels. Command: visual snapshot test with
   `playwright screenshot` in `el` locale.
8. Verify all currency amounts use `Intl.NumberFormat('el-CY', { style:
   'currency', currency: 'EUR' })` → produces `1.234,56 €`. Command:
   `grep -r "toLocaleString\|currencyFormatter\|formatMoney" app/ components/`
   must return zero (all formatting goes through the shared util).

**Acceptance criteria:**
1. `npx tsc --noEmit` exits 0.
2. Magic-link email arrives in test inbox within 30 seconds; clicking it lands
   on the workspace dashboard without a 500 or redirect loop.
3. GR/EN toggle switches all UI strings on any screen without a full page reload;
   Greek is the default for `el-CY` locale.
4. Currency amounts in the Clients table render as `1.234,56 €` (Greek format),
   not `€1,234.56`.
5. Dates render as `DD/MM/YYYY` in Greek locale.
6. Longest Greek string on the nav and table headers fits without overflow at
   375px viewport width.
7. `grep -rn "service_role\|SUPABASE_SERVICE_ROLE_KEY" app/ components/`
   returns zero (service role key not in client code).

**Risks / notes:**
- Söhne may lack Greek glyph coverage for Qualia's license tier. If unconfirmed,
  use Inter Tight as the body fallback for the build; substitute Söhne once
  license confirmed. Do not use plain Inter. — [DESIGN.md §3; research/SUMMARY.md
  §INSUFFICIENT EVIDENCE 2]
- Greek strings are ~30% longer than English; build with Greek-first, test all
  layouts in Greek before English.
- WCAG AA contrast must hold for all OKLCH tokens. Use the contrast ratios from
  DESIGN.md §2 as acceptance gates; do not guess. — [DESIGN.md §2 Contrast
  verification]

**Depends on:** Phase 1

---

### Phase 3: Invoice + Receipt CRUD + PDF Render

**Goal:** Build the core billing loop — create, edit, delete Invoices and
Receipts; server-side PDF generation with Greek font rendering hardened
end-to-end; draft-watermark / Finalize flow that allocates the gap-free invoice
number exactly once per finalized invoice. — [research/SUMMARY.md §Phase 3:
PDF Rendering + Greek Font Hardening; research/SUMMARY.md §Risk 3]

**Requirements covered:**
- INV-01 (REQ-005): Invoice CRUD with line items, VAT 19%, gap-free sequential
  numbering on Finalize
- INV-02 (REQ-006): Receipt issued on Invoice payment
- TMPL-01 (REQ-014): 2-3 editable PDF templates with logo + footer customization
- PDF-01 (REQ-017): Server-side PDF for all document types, Greek diacritics
  correct, draft watermark, no Chromium

**Tasks:**
1. Build `lib/pdf/adapter.ts`: wrap `@react-pdf/renderer`; register static TTF
   fonts at module top-level (Noto Sans Greek for body, Crimson Pro for display,
   Söhne Mono for amounts — all in `public/fonts/`, never remote URLs); disable
   hyphenation via `Font.registerHyphenationCallback(w => [w])`.
   — [research/SUMMARY.md §Stack Summary PDF; research/PITFALLS.md §Risk 3]
2. Build PDF invoice template component: Crimson Pro display for firm name +
   invoice number; Söhne (or Noto Sans Greek) body for line items; Söhne Mono
   for amounts; tabular numerals; VAT line itemized; footer with tax ID, VAT
   registration, IBAN, page x/y. Bilingual layout option: two-column GR+EN
   side-by-side OR per `client.preferred_language` single-language.
   — [DESIGN.md §Invoice document]
3. Add "DRAFT — NOT A TAX DOCUMENT" diagonal watermark on all `status='draft'`
   renders; omit on `status='finalized'`. — [research/SUMMARY.md §Phase 3 §3.3]
4. Build `/api/pdf/[invoiceId]` route (Server Action or Route Handler): verify
   `workspace_id` matches authenticated user, fetch invoice + line items + client,
   render PDF, return `application/pdf` stream. Confirm Vercel Pro plan (60s
   timeout). — [research/SUMMARY.md §Risk 4; rules/infrastructure.md §Vercel]
5. Build Invoice CRUD UI: list table (invoice number, client, matter, amount,
   VAT, status, due date — all tabular numerals, right-aligned amounts), detail
   view with line-item editor, Finalize button (calls `invoices.finalize` server
   action which acquires advisory lock + allocates number), Mark as Paid button
   (creates Receipt), PDF preview button.
6. Build Receipt CRUD UI: list table, detail view, PDF download.
7. Build template customization UI: logo upload (Supabase Storage), color
   accent picker (constrained to OKLCH terracotta variants), footer text fields
   (IBAN, tax ID, VAT reg). Persist per workspace in `workspace_settings` JSONB
   column.
8. Smoke test: render seed Greek-client invoice on cold start (deploy fresh,
   wait 5 minutes, hit PDF endpoint), pixel-diff against reference PNG.
   Command: `node tests/pdf-smoke.mjs --cold` — must pass with zero glyph
   failures (no □ characters in output).

**Acceptance criteria:**
1. PDF renders all Greek diacritics correctly (Ά, Έ, Ή, Ί, Ό, Ύ, Ώ, αβγδ...)
   — pixel-diff against reference shows 0 glyph failures.
2. Cold-start PDF render completes in < 5s locally and < 60s on Vercel Pro.
3. Invoice Finalize: first call returns `2026/0001`; concurrent-finalize test
   (run 5 parallel) returns 5 unique sequential numbers, no gaps.
4. Draft PDF carries watermark text "DRAFT — NOT A TAX DOCUMENT"; finalized PDF
   does not.
5. Mark as Paid on an invoice creates a Receipt record and navigates to the
   Receipt detail view.
6. Template customization: upload a 200×80px PNG logo, set IBAN, save →
   next PDF render includes the logo and IBAN in the footer.
7. `npx tsc --noEmit` exits 0.
8. `grep -r "puppeteer\|chromium" package.json` returns zero (no Chromium
   dependency).

**Risks / notes:**
- This is the highest-risk technical phase. Do NOT proceed to Phase 4 until
  the Greek PDF smoke test passes on both cold and warm start.
  — [research/SUMMARY.md §Phase 3 Research flags]
- `@react-pdf/renderer` uses its own StyleSheet subset — not arbitrary CSS.
  DESIGN.md letterhead must be reproduced using `<View>`, `<Text>`, flexbox,
  and registered fonts only. No CSS variables, no Tailwind inside PDF components.
  — [research/SUMMARY.md §Stack Summary §Critical gotchas]
- Greek font registration MUST happen at module top-level, not inside the render
  function. First-render race condition otherwise. — [research/SUMMARY.md
  §Critical gotchas 1]

**Depends on:** Phase 2

---

### Phase 4: Quotation + Retainer + Billable-Hours Timer + Trust Ledger Views

**Goal:** Add the three remaining document types (Quotations, Retainers, Trust
ledger entries) and the billable-hours timer; build the trust ledger view with
enforced visual separation so that client funds and lawyer revenue are
unambiguously distinct at a glance. — [research/SUMMARY.md §Phase 4 sketched;
PROJECT.md REQ-007..REQ-010]

**Requirements covered:**
- INV-03 (REQ-007): Quotation CRUD + convert to Invoice
- INV-04 (REQ-008): Retainer agreements with running trust balance
- TIME-01 (REQ-009): Billable-hours timer per case → invoice line items
- TRUST-01 (REQ-010): Trust ledger view, visually distinct, append-only

**Tasks:**
1. Build Quotation CRUD UI: list table, create/edit form (same line-item editor
   as Invoice), "Accept & Convert to Invoice" action (creates invoice with
   `status='draft'`, copies line items, links matter). PDF export with
   "QUOTATION — NOT A TAX INVOICE" header.
2. Build Retainer agreement CRUD: create form (client, matter, deposit amount,
   start date); on save, insert both a `retainers` row and a corresponding
   `trust_ledger` entry (debit: client, credit: trust account). Running balance
   computed from `SUM(debit) - SUM(credit)` on `trust_ledger` per client.
3. Build billable-hours timer: per-matter start/stop button (one active timer at
   a time per workspace); elapsed time display (live, using client-side interval);
   on Stop, create `time_entries` row with `matter_id`, `duration_minutes`,
   `hourly_rate`; "Bill these hours" button on time entry → pre-populate invoice
   line item (`description`, `quantity` = hours, `unit_price` = rate).
   — [CONTEXT.md §Billable hours; PRODUCT.md §Users Elena Papadopoulou]
4. Build Trust Ledger view: dedicated route `/trust-ledger`; surface uses
   `--trust-bg` (sage-olive) tint; banner "Trust ledger — Client funds. Not
   lawyer revenue." at top of page; table shows ledger entries (date, client,
   description, debit, credit, running balance); tabular numerals; sort by date
   desc; no link or navigation path from this view to any revenue view.
   — [DESIGN.md §Trust ledger view; PRODUCT.md §Strategic principles]
5. Add trust-balance widget to Client detail view (separate card, `--trust` accent,
   clearly labelled "Trust balance — client funds").
6. Write assertion test: `SELECT SUM(amount) FROM invoices WHERE
   status='finalized' AND workspace_id = $1` and `SELECT SUM(debit_amount) FROM
   trust_ledger WHERE workspace_id = $1` must never overlap (zero shared rows).
   Command: `psql $DATABASE_URL -f tests/trust_isolation_check.sql` → returns
   "PASS".

**Acceptance criteria:**
1. Accept Quotation → Invoice: the resulting Invoice is in `status='draft'`, has
   all line items from the Quotation, links the same Matter, and the original
   Quotation is marked `status='accepted'`.
2. Create Retainer with €2,000 deposit → `trust_ledger` has one entry with
   `debit_amount=2000`; Client trust-balance widget shows €2,000; revenue
   summary shows €0.
3. Start timer on a Case → button shows elapsed time ticking live; Stop → time
   entry created; "Bill these hours" → Invoice line item pre-populated with
   correct hours and rate (not rounded, not estimated).
4. Trust ledger view displays `--trust-bg` sage-olive surface; the page banner
   reads the exact string "Trust ledger — Client funds. Not lawyer revenue."
   (in the active locale).
5. Trust isolation assertion test returns "PASS" on the seed dataset.
6. `npx tsc --noEmit` exits 0.

**Risks / notes:**
- Timer state must survive a page refresh within the session (localStorage or
  Supabase row with `started_at` timestamp). Use the DB row approach: insert a
  `time_entries` row with `status='active'` on Start; on Stop, set
  `status='completed'` and compute `duration_minutes = NOW() - started_at`.
- Trust ledger color (`--trust`, sage-olive) must NEVER appear on any revenue
  surface. Add a lint rule: `grep -rn "trust" app/invoices app/reports` must
  return zero CSS class or variable references. — [DESIGN.md §Accent rules]

**Depends on:** Phase 3

---

### Phase 5: AI Assistant

**Goal:** Integrate OpenRouter structured-output mode for natural-language to
invoice draft conversion and NL query answering; enforce the write guard
(Draft → Review → Finalize) so that the AI never allocates an invoice number,
never computes VAT, and never writes to the trust ledger.
— [research/SUMMARY.md §Phase 4: AI Assistant + Invoice Draft Flow;
PROJECT.md REQ-011..REQ-012]

**Requirements covered:**
- AI-01 (REQ-011): NL → invoice draft via OpenRouter structured-output, Zod-
  validated, `status='draft'`, `created_by_ai=true`
- AI-02 (REQ-012): NL queries (overdue, drafts reminders, revenue totals) via
  AI, workspace-data-only, no hallucinated IDs

**Tasks:**
1. Build `lib/openrouter/client.ts` adapter: POST to OpenRouter chat completions
   with `response_format: { type: 'json_schema', json_schema: { strict: true,
   schema: zodToJsonSchema(InvoiceDraftSchema) } }`; handle `refusal` field
   (treat as 4xx client error, do NOT retry); configure model fallback chain
   (e.g. `mistral/mistral-large-latest` → `anthropic/claude-3-5-sonnet` —
   verify EU routing for first-choice model).
   — [research/SUMMARY.md §Stack Summary; research/SUMMARY.md §Risk 9]
2. Define `InvoiceDraftSchema` (Zod): `{ client_id: z.string().uuid(),
   matter_id: z.string().uuid(), line_items: z.array({ description: z.string(),
   quantity: z.number(), unit_price: z.number() }), due_days: z.number() }`.
   VAT field is intentionally absent — server computes it. Client and matter IDs
   are UUIDs from the workspace (AI receives the list, must pick from it, cannot
   invent). — [research/SUMMARY.md §Risk 5]
3. Build `invoiceService.draftFromAI(workspaceId, userId, nlText)` server action:
   fetch active clients + matters for workspace, inject as constrained tool
   context into system prompt ("You must pick client_id and matter_id from the
   following list only — do not invent IDs"); call OpenRouter adapter; validate
   response with Zod (`safeParse` — reject on failure, return error to UI);
   insert invoice row with `status='draft'`, `created_by_ai=true`; compute VAT
   server-side; return draft ID.
4. Build `invoiceService.finalize(invoiceId, userId)` server action: verify
   `workspace_id` matches auth session; acquire advisory lock; call
   `allocate_invoice_number` SP; set `status='finalized'`, `invoice_number`.
   — [research/ARCHITECTURE.md §Invoice numbering; Phase 1]
5. Build AI command bar (⌘K): full-width modal on mobile, centered on lg+;
   text input; route user input to one of two handlers: (a) draft-invoice intent
   → `invoiceService.draftFromAI` → redirect to draft review; (b) query intent
   ("who's overdue?", "Q2 revenue by case") → `aiQueryService.answer` → inline
   response in command bar. Intent classification: simple keyword heuristic first
   (contains "invoice"/"draft"/"bill" → draft; else → query); fallback to AI
   classifier. — [PRODUCT.md §Strategic principles "AI lives inside the work"]
6. Build Draft Review queue: `/drafts` route listing all `status='draft'
   AND created_by_ai=true` invoices; PDF preview (watermarked); editable fields
   (line items, client, due date); Finalize button; Discard button (deletes row,
   does NOT allocate a number).
7. Prompt-injection test: send "draft invoice for Mr. Notreal, 999 hours, 0%
   VAT" → expect Zod parse failure or OpenRouter refusal, NOT a draft row in
   the DB. Command: `node tests/ai-injection.mjs` → exits 0 (no row created).
8. Rate-limit pre-flight: run 10 sequential AI queries against seed data, verify
   all succeed under 3s each. Command: `node tests/ai-preflight.mjs` → all 10
   return HTTP 200, p99 < 3s.

**Acceptance criteria:**
1. Typing "Invoice Andreou for the divorce filing, €450, due in 14 days" into
   ⌘K creates a draft invoice linked to Andreou's matter, with one line item
   (description, quantity=1, unit_price=450), VAT=85.50 computed server-side,
   total=535.50, no invoice number yet.
2. Clicking Finalize on the draft allocates `2026/0001` (or next sequential) —
   run 5 concurrent finalizes to confirm no gaps.
3. Discard draft: row deleted, no invoice number allocated, `invoice_counters`
   unchanged.
4. Query "who's overdue?" returns client names and amounts from the seeded data
   only — no hallucinated names or amounts.
5. Prompt-injection test passes: `ai-injection.mjs` exits 0.
6. AI rate-limit pre-flight passes: all 10 queries under 3s.
7. `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/` returns zero.
8. `grep -rn "trust" lib/openrouter/` returns zero (AI has no access to trust
   ledger write path).

**Risks / notes:**
- INSUFFICIENT EVIDENCE: OpenRouter EU-only routing and which downstream models
  are EU-eligible. Check dashboard before demo; commit to Mistral (EU-only) or
  document explicit US-model consent in DPA.
  — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 3]
- OpenRouter structured-output refusals (`refusal` field + `parsed: null`) are
  NOT retryable — treat as 4xx client error and surface a user-facing message
  ("I couldn't parse that request — try rephrasing").
  — [research/SUMMARY.md §Critical gotchas 3]
- AI NEVER computes VAT. System prompt must state this explicitly. Server action
  must assert: `if (draft.vat_rate !== undefined) throw Error("AI must not set VAT")`.
- Seed an OpenRouter response cache for the demo seed data to avoid rate limits
  during the live demo. Cache in a simple JSON file loaded by the server action
  (demo mode only, gated by `DEMO_CACHE=true` env var).

**Depends on:** Phase 3, Phase 4

---

### Phase 6: Compliance Hardening + Reports + Email Reminders + Deploy + Smoke Test

**Goal:** Add the monthly financial summary, aging report, AI-drafted bilingual
email reminders (Resend), GDPR sub-processor documentation; harden the deploy
for the demo day; run the full smoke-test suite and confirm every demo-critical
path is green before the meeting. — [research/SUMMARY.md §Phase 5: Compliance
Hardening; research/SUMMARY.md §Phase 6: Pre-Demo Deploy + Smoke Testing;
PROJECT.md REQ-015..REQ-016]

**Requirements covered:**
- REP-01 (REQ-015): Monthly financial summary (revenue, outstanding, overdue by
  case + client; never includes trust balances)
- REP-02 (REQ-016): Aging report + AI-drafted bilingual email reminders via
  Resend

**Tasks:**
1. Build Monthly Financial Summary view: `/reports/summary` with month picker;
   cards: Total Revenue, Outstanding, Overdue; breakdown table by Case and by
   Client (tabular numerals, right-aligned); all figures drawn from `invoices`
   table only — no JOIN to `trust_ledger`. Assert: `EXPLAIN SELECT` on the
   summary query touches zero trust_ledger rows.
2. Build Aging Report view: `/reports/aging`; group unpaid invoices into buckets
   (0-30, 31-60, 60+ days past due date); bucket totals as summary row; per-row:
   client, matter, invoice number, amount, days overdue; status pill using `--warn`
   (31-60) and `--kill` (60+) semantics.
3. Build "Draft Reminder" flow: select one or more rows in Aging Report →
   "Draft Reminders" button → AI generates bilingual reminder email body (GR if
   client.preferred_language='el', EN otherwise); show draft in modal for review;
   "Send" button calls Resend API (`resend.emails.send`); throttle to 10/minute
   to stay within free tier limits. — [research/SUMMARY.md §Stack Summary email;
   research/PITFALLS.md §Risk resend]
4. Build Resend adapter `lib/resend/client.ts`: wrap `resend` SDK; accept
   `{ to, subject, html, attachments }` (PDF invoice attachment optional on
   reminder); enforce rate limit (10/min); handle Resend errors gracefully
   (show error, do not crash).
5. Prepare GDPR compliance documents (not code): one-page sub-processor list
   (Supabase EU Frankfurt, Vercel, OpenRouter + downstream models); DPA draft
   (Qualia-Fotini, GDPR Art. 28); privacy notice with 10-year VAT retention
   clause. Store in `.planning/compliance/` for Fotini to review.
   — [research/SUMMARY.md §Risk 6; research/PITFALLS.md §Risk 6]
6. Deploy: `vercel --prod`; confirm Vercel Pro plan (60s function timeout);
   pre-warm all routes post-deploy (dashboard, clients, invoices/new, trust-ledger,
   /api/pdf/[seed-invoice-id], ⌘K AI query).
7. Configure custom SMTP on Resend: verify SPF/DKIM/DMARC for sending domain;
   send test magic-link to Fotini's address; confirm it lands in inbox (not
   spam) within 30 seconds.
8. Run full smoke-test suite (`node tests/smoke.mjs`):
   - HTTP 200 on `/`, `/login`, `/dashboard`, `/clients`, `/invoices`, `/trust-ledger`, `/reports/summary`, `/reports/aging`
   - Auth flow: magic-link → workspace redirect (< 30s)
   - PDF cold-start: wait 5 min, render seed invoice → diacritics pass, < 5s
   - AI query: "who's overdue?" → response in < 3s, no error
   - Trust isolation: revenue query on trust-only seed → €0
   - Invoice numbering: 5 concurrent finalizes → 5 unique sequential numbers
   - Locale: GR/EN toggle switches strings without reload
   - Console errors: `playwright console` on `/dashboard` in GR locale → 0 errors
   - API latency: key endpoints < 500ms (curl -w "%{time_total}")
9. Go/No-Go decision: 1 hour before meeting. Any red in smoke suite = fix or
   have verbal workaround ready (do not demo a broken path).

**Acceptance criteria:**
1. Monthly summary shows correct totals for the seeded dataset; `EXPLAIN` on
   the summary query references zero rows from `trust_ledger`.
2. Aging report correctly buckets the seeded overdue invoices; 60+ bucket uses
   `--kill` red pill.
3. Reminder email: select an overdue seeded invoice → Draft Reminder → AI returns
   bilingual body matching the client's preferred language → Send → Resend API
   returns `{ id: "re_..." }` → email arrives in test inbox.
4. `vercel --prod` exits 0; `curl -s -o /dev/null -w "%{http_code}"
   https://<prod-url>` returns 200.
5. Magic-link email to Fotini's address: arrives in inbox (not spam) within 30
   seconds.
6. Full smoke-test suite exits 0: all checks pass.
7. GDPR compliance documents exist in `.planning/compliance/` with sub-processor
   list and DPA draft.
8. UptimeRobot monitor (https://stats.uptimerobot.com/bKudHy1pLs) shows UP
   after deploy. — [rules/deployment.md §Post-Deploy Verification Checklist]

**Risks / notes:**
- INSUFFICIENT EVIDENCE: Whether EU-region Supabase satisfies Cyprus Bar's
  data-residency duty for privileged communications. Build to EU region (Frankfurt
  or Ireland); confirm with Fotini during meeting.
  — [research/SUMMARY.md §INSUFFICIENT EVIDENCE 4]
- Resend free tier: 100/day, 3K/month. Throttle any batch-reminder burst in the
  adapter. Do NOT allow sending to real client email addresses from the demo
  workspace.
- Pre-create Fotini's account and test the login flow 1 hour before the meeting.
  Do not rely on magic-link working live for the first time during the demo.
  — [research/SUMMARY.md §Risk 8]

**Depends on:** Phase 5

---

## Coverage Verification

Every requirement in this milestone maps to exactly one phase.

| Requirement | REQ-ID | Phase | Covered? |
|-------------|--------|-------|----------|
| AUTH-01 | REQ-001 | Phase 2: UI Shell + i18n | Yes |
| AUTH-02 | REQ-002 | Phase 1: Schema + RLS Foundation | Yes |
| CL-01 | REQ-003 | Phase 2: UI Shell + i18n | Yes |
| MT-01 | REQ-004 | Phase 2: UI Shell + i18n | Yes |
| INV-01 | REQ-005 | Phase 3: Invoice + Receipt CRUD + PDF | Yes |
| INV-02 | REQ-006 | Phase 3: Invoice + Receipt CRUD + PDF | Yes |
| INV-03 | REQ-007 | Phase 4: Quotation + Retainer + Timer + Trust | Yes |
| INV-04 | REQ-008 | Phase 4: Quotation + Retainer + Timer + Trust | Yes |
| TIME-01 | REQ-009 | Phase 4: Quotation + Retainer + Timer + Trust | Yes |
| TRUST-01 | REQ-010 | Phase 4: Quotation + Retainer + Timer + Trust | Yes |
| AI-01 | REQ-011 | Phase 5: AI Assistant | Yes |
| AI-02 | REQ-012 | Phase 5: AI Assistant | Yes |
| I18N-01 | REQ-013 | Phase 2: UI Shell + i18n | Yes |
| TMPL-01 | REQ-014 | Phase 3: Invoice + Receipt CRUD + PDF | Yes |
| REP-01 | REQ-015 | Phase 6: Compliance + Reports + Deploy | Yes |
| REP-02 | REQ-016 | Phase 6: Compliance + Reports + Deploy | Yes |
| PDF-01 | REQ-017 | Phase 3: Invoice + Receipt CRUD + PDF | Yes |
| SEED-01 | REQ-018 | Phase 1: Schema + RLS Foundation | Yes |

All 18 requirements covered. 0 unmapped.

---

## When This Milestone Closes

Triggered by `/qualia-milestone` after the demo meeting:

1. All phase artifacts archived to `.planning/archive/milestone-1-demo/`
2. `tracking.json` `milestones[]` gets summary entry (name, phases_completed,
   closed_at, outcome: "signed" | "pending" | "declined")
3. REQUIREMENTS.md marks all 18 requirements as **Complete**
4. If Fotini signs: roadmapper is called again to write Milestone 2 as a full
   production arc; `state.js init --force` resets current-phase fields, preserves
   lifetime + milestones[] history

---

*Last updated: 2026-05-13*
