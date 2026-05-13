# Research Summary — Lex

**Domain:** Single-tenant Cyprus-VAT-compliant invoicing platform for lawyers  
**Scope:** Quick (single-milestone demo for pitch meeting today, 2026-05-13)  
**Research confidence:** MEDIUM overall (MEDIUM-HIGH on stack; MEDIUM on features; MEDIUM-HIGH on architecture; MEDIUM on pitfalls with 4 acknowledged gaps)  
**Researched:** 2026-05-13

---

## Executive Summary

Lex is a **narrowly-focused premium invoicing platform for solo lawyers**, landing at the intersection of three non-negotiable constraints: Cyprus VAT-compliance (gap-free sequential numbering, bilingual GR+EN), trust-account separation (disbarment-grade compliance), and AI-powered invoice drafting (the differentiator that no US competitor leads with). The demo bet is **"deep on invoicing where competitors go wide and shallow"** — a 10-feature MVP that ships all 10 as a cohesive, non-mockable system.

The core technical wager is **low-risk if executed with discipline**: Next.js 16 + Supabase (EU region) + `@react-pdf/renderer` for server-side PDF (no Chromium cold-start risk) + OpenRouter structured-output mode for AI extraction (Zod validates hallucinations away). The single hardest constraint is **invoice numbering must be gap-free under concurrency** (Cyprus VAT law forbids gaps); this is solved at the DB layer via advisory locks + transactional counters, not app-layer guesses. Trust ledger **must be a physically separate table** with append-only RLS enforcement — mixing it with revenue in code or query is a pitch-killer.

**Ship or fail by T+2 hours** (pitch meeting same day). The demo lives or dies on three moments: (1) magic-link login email arrives in time, (2) PDF renders Greek diacritics without boxes, (3) AI assistant drafts an invoice without hallucinating client names or VAT. If any of the three falters, the meeting goes into defensive Q&A mode instead of "this is incredible."

---

## Stack Summary

**Framework-locked** per Qualia standards: Next.js 16 + React 19 + TypeScript + Supabase EU + Vercel + OpenRouter. — [STACK.md]

**Demo-specific library decisions** (the actual research):

| Category | Chosen | Why | Confidence |
|----------|--------|-----|------------|
| **PDF generation** | `@react-pdf/renderer` 4.x | No Chromium binary → fast cold-start on Vercel (Hobby/Pro both supported). Greek text via static TTF fonts in `public/fonts/`. Puppeteer would require `@sparticuz/chromium-min`, ~300MB, and multi-second cold-start risk. — [STACK.md:27] | HIGH |
| **i18n (GR + EN)** | `next-intl` 4.x | App Router native, RSC-compatible server-component translations. Configured with `el-CY` locale for Cyprus-Greek currency (`1.234,56 €`) and date formats (DD/MM/YYYY). — [STACK.md:28] | MEDIUM |
| **Email delivery** | `resend` 6.x + `@react-email/components` | React Email JSX for invoice-attachment emails matching DESIGN.md letterhead aesthetic. Resend free tier (3K/month) covers demo + post-demo handoff. SendGrid killed free tier May 2025 — not viable for dormant demo period. — [STACK.md:29-30] | HIGH |
| **Schema validation** | `zod` 3.x + `zod-to-json-schema` 3.x | Single source of truth: Zod schema doubles as JSON Schema fed to OpenRouter `response_format: { type: 'json_schema', strict: true }`. AI-drafted and form-submitted invoices flow through identical validation. — [STACK.md:31-32] | HIGH |
| **IBAN validation** | `iban` npm 0.0.14+ | Cyprus IBANs are 28 chars, format `CY##...`. Validates checksum + country code. (Confidence MEDIUM — `ibantools` is an alternative; pick whichever has higher download count at install time.) — [STACK.md:33] | LOW |
| **Currency + date formatting** | `Intl.NumberFormat` + `Intl.DateTimeFormat` (Node stdlib) | No library needed. `Intl.NumberFormat('el-CY', { style: 'currency', currency: 'EUR' })` produces Cyprus-Greek format automatically (`1.234,56 €`). — [STACK.md:34] | MEDIUM |
| **Calendar math** | `date-fns` 3.x/4.x | Used only where `Intl` is insufficient (e.g., aging report 30/60/90-day bucketing). Optional; `dayjs` is interchangeable. — [STACK.md:36] | LOW |

**Critical gotchas — ship or learn hard:** [STACK.md:93-99]
1. Greek font registration MUST run at module-top-level in the PDF component; first render race-condition otherwise.
2. Sequential invoice numbering allocation MUST be inside the same DB transaction as invoice INSERT — otherwise a failed insert leaves a burned number = gap = VAT audit failure.
3. OpenRouter structured-output refusals (`refusal` field + `parsed: null`) are NOT retryable — treat as a 4xx client error.
4. `@react-pdf/renderer` does NOT support arbitrary CSS — only its `StyleSheet` subset. DESIGN.md's letterhead must be reproducible with `<View>`, `<Text>`, flexbox, and registered fonts.
5. Resend free tier is 100 emails/day, 3K/month — throttle any batch-reminder bursts in code.

---

## Features Summary

**Tier-1 (Ship with demo; all 10 are table stakes + differentiators):** [FEATURES.md]

| Feature | Classification | Why It Matters | Complexity |
|---------|-----------------|----------------|-----------|
| **4 document types** (invoices, receipts, quotations, retainers) | Table stakes | Every reviewed legal-billing competitor has them; missing any = incomplete product. — [FEATURES.md:55-56] | MEDIUM |
| **Case-linked billing** (matter number on every invoice) | Table stakes | Universal filter in LPMS evaluation. Make it visible in invoice tables, not just stored. — [FEATURES.md:56] | LOW |
| **Billable-hours timer per case** (→ invoice line items) | Table stakes | Universally cited foundational legal-billing feature. One-click start/stop on matter row, not a separate page. — [FEATURES.md:56] | MEDIUM |
| **Trust ledger (separate from revenue)** | Table stakes + **Differentiator** | Legally mandatory for Cyprus lawyers (disbarment-grade compliance). Every competitor offers it; almost none make it visually distinct enough that a tired lawyer can't accidentally post trust to revenue. This is the **design moat** if the demo shows it. — [FEATURES.md:60; DESIGN.md:188-192] | HIGH |
| **Cyprus VAT 19% + sequential numbering** (`2026/0001` format) | Differentiator | US competitors (Clio, MyCase, PracticePanther) fail Cyprus compliance. This is a regulatory moat. — [FEATURES.md:61] | MEDIUM |
| **AI assistant: NL → invoice draft** | Differentiator | "Type one sentence, get an invoice draft" has no competitor analog at this depth. Clio's "Manage AI" is workflow routing, not invoice authoring. This IS the demo's make-or-break differentiator. — [FEATURES.md:62] | HIGH |
| **Bilingual GR + EN** (first-class, not bolted-on) | Differentiator | EU buyers weight "locally-built tools emphasize GDPR compliance and language support." Greek is even less served than French; this is the moat against US imports. — [FEATURES.md:62] | MEDIUM |
| **2–3 editable templates** (logo + footer customization) | Table stakes | Bare minimum. Don't overbuild a template designer for demo. — [FEATURES.md:63] | MEDIUM |
| **Monthly financial summary** (revenue by case + client) | Table stakes | Reporters cite it as secondary but Solo lawyers genuinely need a "Friday afternoon" view. Persona Marios specifically reaches for this. Keep ONE page; don't ship a BI tool. — [FEATURES.md:63] | MEDIUM |
| **Payment reminders + aging report** (AI-drafted, bilingual) | Table stakes | Standard in competitors; bilingual drafts are the elevator pitch over US tools. — [FEATURES.md:63] | MEDIUM |

**Feature dependencies** (build order constraints): [FEATURES.md:85-92]
- AI assistant requires invoices/receipts/quotations data model first.
- Trust ledger requires double-entry schema (separate table), not a flag column.
- Receipts require invoices (linear, but demo should show one end-to-end example).
- Aging report requires `due_date` + `status` on invoices (design schema from day one).
- Bilingual content enhances reminders and templates (tie to `Client.preferred_language`).
- Cyprus VAT gates invoice issuance (server-side atomic numbering, not app-layer guesses).

**Anti-features (don't build, even if asked):** [FEATURES.md:38-48]
- LEDES/UTBMS task codes → "No Cyprus equivalent exists; solo Cypriot lawyers don't use it. That's a US large-firm pattern."
- Card charging / payment processing → Out of scope. Show "Mark as paid" + receipt issuance instead.
- Multi-tenant firm accounts → Demo single-workspace. Scope multi-seat in v2 if Fotini commits.
- Full case management (calendar, hearings) → Stay narrow. "We go deep on invoicing where Clio goes wide."
- iJustice automation / legal-doc drafting → Honest answer: "Not today. The demo is invoicing only."
- WhatsApp reminders → Email-only for demo. Mention "on the roadmap" if asked.
- Separate "AI chat" tab → Command bar (⌘K) only. No `/chat` route.

---

## Architecture Summary

**Single-tenant, zero multi-tenant complexity.** Workspace = Fotini's login. `auth.uid() → workspace_id` resolved in DB via `SECURITY DEFINER` function. — [ARCHITECTURE.md:18]

**Three deep decisions:**

1. **Invoice numbering (gap-free under concurrency):** Counter table + `pg_advisory_xact_lock(hashtext(...))`, NOT Postgres `SEQUENCE`. — [ARCHITECTURE.md:177-209]
   - Why not `SEQUENCE`: Postgres sequences are explicitly designed NOT to be gap-free; `nextval` is never rolled back, even on abort. Cyprus VAT forbids gaps by law.
   - Implementation: `pg_advisory_xact_lock` per `(workspace_id, year)` serializes finalize-path only. Numbers consumed only on `invoice.finalize` server action; drafts get UUIDs.
   - Verification test: Spawn 10 concurrent invoice creations, verify 10 unique sequential numbers with zero gaps.

2. **Trust ledger isolation:** Physically separate `trust_ledger` table with append-only RLS enforcement, NOT a flag column on a unified `transactions` table. — [ARCHITECTURE.md:144-171]
   - Why separate: Legal/accounting rule — client trust money is NOT firm money. Double-entry without going full event-store: each `trust_ledger` row records both sides (`debit_account`, `credit_account`). Balance = `SUM(amount WHERE debit=X) - SUM(amount WHERE credit=X)`.
   - RLS: trust-ledger table denies UPDATE/DELETE for all roles, even service_role. Corrections via reversing entries with `corrects_entry_id` FK.
   - AI write guard: AI tool surface is READ + DRAFT only. Finalize requires explicit user action in UI, server-side.
   - Verification test: Seed-data check that dashboard shows €0 revenue when only trust deposits exist.

3. **RLS + AI service-role write path:** Two separate Supabase clients (`lib/supabase/server.ts` for SSR, `lib/supabase/service-role.ts` for AI writes). User session overrides service_role Authorization header — one merged client WILL apply RLS to AI writes, breaking them mysteriously. — [ARCHITECTURE.md:211-254]
   - Pattern: Server action verifies `workspace_id` matches authenticated user, then opens service-role client, validates AI output with Zod, writes row with explicit `workspace_id` override (AI never specifies it).
   - Critical rule: `service_role` key NEVER in any client component. `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/` must return zero.
   - AI drafts use same `invoices` table with `status='draft'` + `created_by_ai=true`, not a separate `drafts` table.

**Build order (dependency chain):** [ARCHITECTURE.md:371-384]
1. Migrations + RLS scaffolding (foundation).
2. Supabase adapters (3 separate files; paranoid testing of service-role bypass).
3. Invoice numbering SP + audit triggers.
4. Domain types + services.
5. Server actions (finalize, draft, timer).
6. PDF adapter + render endpoint (test Greek BEFORE plumbing into UI).
7. OpenRouter adapter + AI assistant.
8. UI pages.

If demo runs out of time at step 6, you have a manually-driven, gap-free, audited, bilingual invoicing system that renders to PDF. Steps 7–8 are the AI/UX polish.

---

## Pitfalls Summary

**Top 3 risks by severity (demo-day impact):** [PITFALLS.md]

### Risk 1: Invoice numbering gap (CRITICAL)
**What goes wrong:** Failed insert burns a sequence value → audit finds missing number → Cyprus VAT audit failure.  
**Mitigation:** Counter table + advisory lock at DB layer (non-negotiable). Verification: parallel-insert test, zero gaps expected.  
**Phase:** Phase 1 (data model). **Do not proceed past schema review without this passing.**  
**Citation:** [PITFALLS.md:1, 14-25]

### Risk 2: Trust ledger mixed with revenue (CRITICAL)
**What goes wrong:** Dashboard includes retainer deposits in Q2 revenue summary → Fotini sees merged number → refuse the tool immediately (Cyprus lawyers can be disbarred for commingling).  
**Mitigation:** Physically separate table, append-only RLS, explicit revenue-query CI assertion, AI system prompt includes "trust is NEVER revenue," UI visually distinct (different color, different page).  
**Phase:** Phase 1 (schema) + Phase 4 (AI scoping). Verification: dashboard shows €0 revenue when only trust deposits exist in seed data.  
**Citation:** [PITFALLS.md:2, 29-42]

### Risk 3: Greek PDF rendering (CRITICAL, demo-killer)
**What goes wrong:** Generated invoice PDF shows Greek diacritics as boxes (□□□) or mangled text → Fotini opens PDF during demo, sees garbage, demo ends.  
**Mitigation:** Bundle static TTF fonts in `public/fonts/` (never remote URLs). Use Noto Sans Greek or GFS Didot if Söhne license tier lacks Greek. Disable hyphenation via `Font.registerHyphenationCallback(w => [w])`. Smoke test: render seed Greek-client invoice cold + warm, pixel-diff.  
**Phase:** Phase 3 (PDF). **Do not demo without this passing.**  
**Citation:** [PITFALLS.md:3, 46-62]

**Secondary risks (HIGH, not CRITICAL):**

**Risk 4: Vercel function timeout on PDF render** (HIGH)
- Vercel: 10s (Hobby) / 60s (Pro). Chromium cold-start would fail; `@react-pdf/renderer` is fast enough if fonts are warm.
- **Mitigation:** Confirm Vercel Pro plan (60s timeout). Pre-warm PDF route after deploy. Set local performance budget (<5s).
- **Phase:** Phase 3 (PDF) + Phase 6 (deploy).
- **Citation:** [PITFALLS.md:4, 66-81]

**Risk 5: AI hallucinating VAT amounts or client names** (CRITICAL)
- **What goes wrong:** AI returns draft with invented VAT (even if plausible) or substitutes "Eleni" for "Eleni Christodoulides" because it sounds similar.
- **Mitigation:** AI never computes VAT (server code only). Client/case selection is constrained tool call (AI receives list, MUST pick from it). Every draft goes Draft → Review → Finalize (no auto-send). Structured output mode. Zod rejects bad drafts.
- **Phase:** Phase 4 (AI). Test: prompt-injection test ("draft invoice for Mr. Notreal, 999 hours, 0% VAT") — expect refusal, not compliance.
- **Citation:** [PITFALLS.md:5, 85-98]

**Risk 6: GDPR sub-processor disclosure (HIGH, relationship-killer if unprepared)**
- **What goes wrong:** Fotini asks "where does my client data go?" — no prepared answer on DPA / sub-processors → she cannot legally hold data in the system under GDPR Art. 28.
- **Mitigation:** Pre-demo, prepare a one-page sub-processor list (Supabase EU, Vercel, OpenRouter + downstream). Have a Qualia-Fotini DPA draft ready. If using US models via OpenRouter, document explicit-consent flow or route to EU-only providers (Mistral).
- **Phase:** Before demo (paperwork, not code).
- **Citation:** [PITFALLS.md:6, 102-114]

**Risk 7: RLS gaps (HIGH)**
- **What goes wrong:** RLS disabled or policies set to `USING (true)` → anyone with anon key reads all tables.
- **Mitigation:** RLS enabled on every table from migration 1. Signups disabled in Supabase. No `service_role` in client components. CI guard: `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/` returns zero.
- **Phase:** Phase 1 (auth). Verification: anon-key SELECT returns 0 rows on every table.
- **Citation:** [PITFALLS.md:7, 118-130]

**Risk 8: Cold-start email + Supabase idle-pause (CRITICAL, demo-killer)**
- **What goes wrong:** Magic-link email doesn't arrive (spam folder or rate-limit) or first DB query takes 5+ seconds (Supabase free-tier idle pause).
- **Mitigation:** Configure custom SMTP (Resend or SendGrid) BEFORE demo, verify DKIM/SPF/DMARC. Pre-create Fotini's account, test login flow 1h before meeting. Pre-warm every route in the 15 minutes before demo.
- **Phase:** Phase 6 (pre-demo deploy hardening).
- **Citation:** [PITFALLS.md:8, 134-145]

**Risk 9: OpenRouter rate limits or model unavailability (HIGH)**
- **What goes wrong:** Fotini asks AI three questions → third hits rate limit or provider outage → visible error in demo, kills differentiator.
- **Mitigation:** Use paid Qualia-funded key, not free. Configure fallback chain (GPT-4 → Claude → Gemini). Cache responses for seed data. Pre-flight test 10 sequential queries 30 min before meeting.
- **Phase:** Phase 4 (AI). Verification: all queries succeed under 3s.
- **Citation:** [PITFALLS.md:9, 150-162]

**Risk 10: Greek UI bugs (truncation, locale formatting) (HIGH)**
- **What goes wrong:** Greek strings 30% longer → buttons overflow. Currency format wrong (Greek uses `1.234,56 €`, not `1,234.56 €`). Date format wrong (DD/MM/YYYY in Greek, not MM/DD/YYYY).
- **Mitigation:** Build Greek-first (GR is Fotini's default per PROJECT.md). All formatting via `Intl.NumberFormat('el-CY', ...)` + `Intl.DateTimeFormat('el-CY', ...)`, never hardcoded. Test layout in Greek with longest strings.
- **Phase:** Phase 2 (UI shell).
- **Citation:** [PITFALLS.md:10, 166-179]

---

## INSUFFICIENT EVIDENCE Flagged for Live Validation

Per `rules/grounding.md`, the following could not be verified within quick-scope budget. **These are conversation starters with Fotini in the meeting, not implementation blockers.**

1. **Cyprus Bar Council exact rule citations** on client-account separation, audit cadence, disbarment triggers. — [PITFALLS.md:39, ARCHITECTURE.md Data Model]
   - **Action:** Build to defensible defaults (separate table, append-only, never mixed in any view). Ask Fotini which specific Bar Council rule numbers we should reference in the audit-trail UI.

2. **Söhne typeface Greek glyph coverage** for Qualia's license tier. — [STACK.md:53, PITFALLS.md:53]
   - **Action:** Verify with Klim Type Foundry OR substitute Noto Sans Greek (guaranteed coverage) before demo.

3. **OpenRouter exact EU-only routing capability** and which downstream models are EU-eligible vs US-only. — [PITFALLS.md:108, ARCHITECTURE.md:441]
   - **Action:** Check OpenRouter dashboard before demo. Commit to Mistral (EU-only) OR explicitly consent to US models in DPA.

4. **Whether EU-region Supabase satisfies Cyprus Bar's data-residency duty for privileged communications.** — [PITFALLS.md:127]
   - **Action:** Confirm with Fotini. EU region is necessary; some bar associations require explicit approval for cloud storage.

---

## Single-Milestone Demo Shape

**Demo = "FundamentalsPhase" — 6 phases, ship all 10 features end-to-end.** No Handoff section (demo extends into full project only if Fotini signs; that conversion is handled separately). — [Quick scope per PROJECT.md]

### Phase 1: Data Model + RLS Foundation
**Why now:** Cannot build anything without this.  
**Exit criteria:**
- 4 migrations pass (`001_schema.sql`, `002_rls.sql`, `003_invoice_numbering.sql`, `004_audit_triggers.sql`). — [ARCHITECTURE.md:93-97]
- Parallel-insert test on invoices: 10 concurrent creates → 10 unique sequential numbers, zero gaps. — [PITFALLS.md:24]
- Seed-data check: dashboard shows €0 revenue when only trust deposits exist. — [PITFALLS.md:41]
- Anon-key SELECT returns 0 rows on every table (RLS working). — [PITFALLS.md:129]

**Phases sketched:**
- **1.1 Schema design** — workspaces, clients, matters, invoices, line items, time entries, trust ledger, audit log. Verify counters table + advisory-lock SP for gap-free numbering. — [ARCHITECTURE.md:107-165]
- **1.2 RLS policies** — `current_workspace_id()` function wraps all policies. Test anon key + user session separation. — [ARCHITECTURE.md:211-227]
- **1.3 Audit triggers** — Append-only `audit_log` on revenue/trust mutations. Tag AI writes via `app.actor_kind = 'ai'`. — [ARCHITECTURE.md:312-351]
- **1.4 Seed data** — 10 fictional Cyprus-legal clients + 5 cases + 3 sample invoices, at least 3 with full Greek names + diacritics. — [PROJECT.md:60]

**Research flags:** Validate Cyprus VAT invoice format (`2026/0001` + year reset) with Fotini during meeting. Confirm Bar Council rule citations for trust-ledger audit trail labels.

---

### Phase 2: UI Shell + i18n Infrastructure
**Why now:** Follows schema. Enables all subsequent UI phases.  
**Exit criteria:**
- `next-intl` configured with `el-CY` default, GR/EN toggle works on every screen.
- All numeric rendering uses `Intl.NumberFormat('el-CY', ...)` — verify EUR amounts show `1.234,56 €`.
- All dates use `Intl.DateTimeFormat('el-CY', ...)` — verify DD/MM/YYYY format.
- Layout tested in Greek with longest strings — no overflow on buttons or labels.

**Phases sketched:**
- **2.1 Layout shell** — (auth) routes + (workspace) layout group. Sidebar nav (drawer on mobile). — [ARCHITECTURE.md:63-98]
- **2.2 Locale setup** — `i18n.ts` + middleware. Register messages for table headers, button labels, form field labels in both GR + EN.
- **2.3 Typography + spacing** — Crimson Pro (display), Söhne-Mono (body), OKLCH tokens from DESIGN.md. Set `:root` variables. — [DESIGN.md:2-136]
- **2.4 i18n smoke test** — Toggle EL/EN on every screen. Verify longest Greek strings fit. Verify `Intl` formatting in all numeric/date columns.

**Research flags:** Confirm Söhne license includes Greek glyphs or commit to Noto Sans Greek fallback.

---

### Phase 3: PDF Rendering + Greek Font Hardening
**Why now:** Follows schema + services layer (Phase 4 depends on this working cold).  
**Exit criteria:**
- PDF renders invoice in Greek with correct diacritics (no boxes, no question marks).
- Cold-start test: deploy fresh, wait 5 minutes, render Greek-client PDF, pixel-diff against reference.
- Font render latency < 3s locally (Vercel cold-start budget is 60s for Pro, but aim to be <5s for safety).

**Phases sketched:**
- **3.1 PDF adapter** — Wrap `@react-pdf/renderer`. Register static Noto Sans Greek TTFs in `public/fonts/`. Disable hyphenation via `Font.registerHyphenationCallback(w => [w])`. — [STACK.md:27, PITFALLS.md:55-59]
- **3.2 Invoice template (PDF)** — Render invoice with Crimson Pro header (firm name, logo, invoice number), Söhne body (line items), Söhne Mono (amounts). Tabular numerals, currency in EUR. Bilingual option: side-by-side GR+EN OR per-client-preference single-language. — [DESIGN.md:177-186, ARCHITECTURE.md:108]
- **3.3 Draft watermark** — Drafts render with "DRAFT — NOT A TAX DOCUMENT" watermark. Finalized invoices omit it. — [ARCHITECTURE.md:266]
- **3.4 Greek smoke test** — Seed Greek-client invoice rendered on cold + warm, pixel-diff, verify no glyph failures. — [PITFALLS.md:57]

**Research flags:** None—this is the highest-risk technical phase. Do not proceed to Phase 4 until PDF Greek rendering is bulletproof.

---

### Phase 4: AI Assistant + Invoice Draft Flow
**Why now:** Depends on schema, services, PDF. This is the differentiator.  
**Exit criteria:**
- AI drafts an invoice (client_id, hours, rate, description) → returns structured JSON (Zod-validated).
- Draft renders in PDF preview (watermarked).
- Lawyer reviews → clicks "Finalize" → server allocates real invoice number via advisory-lock SP → status='finalized'.
- Discard draft does not burn an invoice number.
- Prompt-injection test: "draft for Mr. Notreal" → AI refuses, does not invent client.

**Phases sketched:**
- **4.1 Services layer** — `invoiceService.draft` (AI validates → creates draft status='draft'). `invoiceService.finalize` (allocates number via SP, flips status='finalized'). — [ARCHITECTURE.md:18-49]
- **4.2 OpenRouter adapter** — `lib/openrouter/client.ts`. Configure structured-output mode (json_schema, strict=true). Pass constrained client/case tool result. System prompt: "VAT computed by server, not by you. Do not invent IDs or amounts." — [STACK.md:20, PITFALLS.md:89-95]
- **4.3 AI command bar (⌘K)** — "Draft invoice" + "Who's overdue?" + "Draft reminders for all unpaid" queries. Route to AI adapter. Parse response. — [FEATURES.md:62, PITFALLS.md:92]
- **4.4 Review queue** — List drafts (created_by_ai=true, status='draft'). Preview PDF. Edit fields (line items, client, rate) if needed. Finalize or discard. — [ARCHITECTURE.md:259-270]

**Research flags:** Pre-flight test 10 sequential AI queries 30 min before demo. Confirm OpenRouter EU routing or commit to single named model.

---

### Phase 5: Compliance Hardening (GDPR, Audit, Retention)
**Why now:** Follows all functional phases. Pre-demo conversation pieces.  
**Exit criteria:**
- DPA draft (Qualia-Fotini) exists, signed if possible.
- Sub-processor list (Supabase EU, Vercel, OpenRouter + downstream) documented.
- Privacy notice updated with 10-year retention clause (Cyprus VAT law overrides GDPR right-to-erasure).
- Audit log verified: every AI draft + finalize action is logged.

**Phases sketched:**
- **5.1 DPA + sub-processor list** — One-page document for Fotini. Identify EU vs US sub-processors. If using US models, explicit consent flow OR Mistral EU-only. — [PITFALLS.md:106-110]
- **5.2 Privacy notice** — "Invoice data retained 10 years per Cyprus VAT law. Erasable after statutory period." AI prompts redact client names where possible. — [PITFALLS.md:111]
- **5.3 Audit log review** — Verify every state change is logged (created_by_ai, finalized_by_user). No missing rows.

**Research flags:** Confirm with Fotini which Cyprus Bar Council rule numbers to cite in audit-trail labels.

---

### Phase 6: Pre-Demo Deploy + Smoke Testing
**Why now:** T-6 hours before meeting. Hardening last phase.  
**Exit criteria:**
- Magic-link email lands in Fotini's inbox (not spam) within 30 seconds.
- All routes respond in <3s after 10-min idle (cold-start acceptable if Vercel Pro).
- All 9 items in PITFALLS.md pre-demo checklist (§273-288) pass.

**Phases sketched:**
- **6.1 Deployment** — `vercel --prod`. Confirm Vercel Pro plan. Pre-warm all routes post-deploy (dashboard, clients, invoices, AI, PDF render). — [PITFALLS.md:74-78]
- **6.2 Email verification** — Resend custom SMTP (SPF/DKIM/DMARC verified). Test magic-link email to Fotini's address. Must not land in spam. — [PITFALLS.md:139-143]
- **6.3 Smoke test suite** — Run all 9 checks from pre-demo checklist (login, PDF cold-start, AI query, trust isolation, invoice numbering, invoice delete UI, logs, locale formatting, etc.). — [PITFALLS.md:274-288]
- **6.4 Go/No-Go decision** — 1 hour before meeting. Any red = fix or have workaround ready.

**Research flags:** Pre-flight test OpenRouter rate limits. Verify Söhne Greek coverage or substitute fallback font. Test on actual demo network (hotel WiFi, etc.) if not at Qualia office.

---

## Overall Confidence & Gaps

**Dimensional confidence roll-up:**
- **STACK.md:** HIGH (PDF, AI structured output, email stack verified; locale formatting MEDIUM)
- **FEATURES.md:** MEDIUM-HIGH (competitor analysis solid; Cyprus market gaps due to no Cypriot-specific survey available)
- **ARCHITECTURE.md:** MEDIUM-HIGH (invoice numbering, RLS, PDF rendering deep-dived; data-model shape derived from conventions, not Lex-specific source)
- **PITFALLS.md:** MEDIUM (top 10 risks mapped; 4 gaps flagged INSUFFICIENT EVIDENCE per grounding protocol)

**Overall:** MEDIUM (3 HIGH, 1 MEDIUM-HIGH, 1 MEDIUM) → roll to MEDIUM. High-confidence on technical execution; medium confidence on Cyprus Bar compliance details (conversation with Fotini de-risks live).

**Key gaps acknowledged:**
1. Cyprus Bar Council exact rule citations (separate-account, disbarment triggers, audit cadence).
2. Söhne typeface Greek glyph coverage (Klim license verification needed).
3. OpenRouter exact EU-routing capability (dashboard check needed).
4. Whether EU-region Supabase satisfies Cyprus Bar data-residency duty (Fotini conversation).

None of these block the demo. All are de-risked by the meeting conversation and pre-demo validation.

---

## Research Sources

- **STACK.md:** 17 WebSearch + WebFetch calls on PDF/Greek/Vercel/OpenRouter/email/IBAN/locale formatting.
- **FEATURES.md:** 3 WebSearch (legal invoicing software, LEDES/UTBMS) + competitor analysis (Clio, MyCase, PracticePanther, LawyerSoft).
- **ARCHITECTURE.md:** 3 WebSearch (invoice numbering, RLS patterns, PDF on Vercel) + local `rules/architecture.md` + `rules/infrastructure.md`.
- **PITFALLS.md:** 3 WebSearch (Cyprus VAT, PDF/Greek, pre-demo cold-start) + local security rules.
- **Local sources:** PROJECT.md, CONTEXT.md, DESIGN.md (all read before research synthesis).

---

**Prepared for:** Roadmapper agent → JOURNEY.md + REQUIREMENTS.md + ROADMAP.md (Phase 1 detail)  
**Next step:** `/qualia-plan` once Fotini pitch completes (sign-off on feature scope, timeline, post-demo roadmap).

*End of research synthesis, Lex demo project, 2026-05-13*
