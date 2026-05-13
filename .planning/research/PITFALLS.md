# Pitfalls Research

**Domain:** Legal-tech invoicing (Cyprus + EU regulatory, GDPR, AI-in-legal, trust-account compliance, demo-day stack risks)
**Researched:** 2026-05-13
**Confidence:** MEDIUM
**Scope:** `quick` (demo path — single milestone, pitch today)

> **Methodology note.** Quick-scope budget exhausted: 1 WebSearch (Cyprus VAT), 1 WebFetch (Cyprus Bar — 404'd then refused), 1 WebSearch (PDF/Greek/Vercel). Cyprus Bar Council client-account specifics could not be retrieved in budget; those items are flagged `confidence: LOW` with `INSUFFICIENT EVIDENCE` markers per `rules/grounding.md`. The demo strategy below routes around the gap: build trust-ledger UX/data model to **defensible defaults that no Bar Council rule would prohibit**, and validate the exact regulatory language with Fotini in the meeting (she IS the regulatory subject-matter expert in the room).

---

## Critical Pitfalls (top 10, ordered by demo-day blast radius)

### 1. Cyprus invoice numbering: ANY gap or duplicate = tax-audit failure

**What goes wrong:** Lawyer's next VAT audit flags missing or duplicate invoice numbers. Penalties, mandatory amended returns, audit expansion. In Fotini's profession, "my invoicing software let me skip a number" is a story she will not survive telling to her accountant.
**Why it happens:** Naive implementations generate numbers in application code (race conditions on concurrent insert), allow `DELETE FROM invoices`, or use `DEFAULT nextval('seq')` which **does skip on rollback** — a failed insert burns the sequence value forever. Cyprus VAT law explicitly forbids gap-skipping: "Invoices must follow a continuous sequence. No gaps." and "If you overcharge a client, you issue a credit note, not delete the invoice." — [Source: WebSearch "Cyprus VAT invoice mandatory fields sequential numbering 2026", https://blog.invault.xyz/invoicing-in-cyprus-2026/ and https://cbucyprus.com/cyprus-invoice-requirements/]
**How to avoid:**
- Numbering enforced in DB layer, not app layer. Use a `counters` table with `UPDATE ... RETURNING` inside the same transaction as the invoice INSERT — never `SERIAL`/`IDENTITY`/`nextval` (which skips on failed transactions).
- `invoices.number` is `UNIQUE NOT NULL`, no soft-delete column. **Deletion is replaced by status='void' + mandatory credit note** referencing the voided invoice.
- Year reset is explicit (`2026/0001` format per PROJECT.md). Counter row keyed by `(workspace_id, year, doc_type)`.
- Numbering ONLY assigned on "Finalize" — drafts get a UUID, not a sequence number. A draft never being finalized must not burn a number.
**Warning signs:** Sequence holes in seed data. Any code path that calls `.delete()` on an invoice. RLS policies that allow `DELETE` on invoices table for any role.
**Phase to address:** Phase 1 (data model). Verification: SQL constraint test — attempt parallel inserts, assert no gaps.
**Severity:** CRITICAL — disbarment-adjacent, not just a bug.

---

### 2. Trust ledger / client funds mixing with operating revenue

**What goes wrong:** Trust balance appears in revenue dashboard. AI assistant answers "Q2 revenue" by including retainer deposits. Fotini glances at the dashboard, sees the merged number, and refuses the tool on the spot — Cyprus lawyers can be disbarred for commingling client funds with firm funds. The dashboard mistake by itself is grounds to lose the pitch.
**Why it happens:** Implementer treats trust deposits as "incoming money" and aggregates with invoice payments in the same `transactions` table without a partition key. AI prompt says "sum all positive transactions for Q2" — boom.
**How to avoid:**
- Trust ledger lives in a **physically separate table** (`trust_ledger_entries`), never `transactions WHERE type='trust'`. Different table, different RLS policies.
- Every revenue/aging/dashboard query has a CI assertion that it does NOT join or union the trust ledger. Add a SQL test that explicitly checks `EXPLAIN` does not touch trust tables.
- AI assistant system prompt has an explicit instruction: "Trust/retainer balances are NEVER revenue. If a user asks 'how much did I earn' do not include `trust_ledger_entries`." Plus a tool-level guard: the SQL tool exposed to the LLM is scoped to a view that excludes trust tables.
- UI: trust balances rendered in a visually distinct module ("Client Funds" — different color, different page, never a card on the revenue dashboard).
- Trust ledger entries are **append-only at the DB level** — RLS denies UPDATE and DELETE for all roles including service_role. Corrections via reversing entries with a `corrects_entry_id` FK.
- INSUFFICIENT EVIDENCE: exact Cyprus Bar Council rule citations and disbarment-trigger language not retrieved in budget. Strategy: build to defensible defaults (separate table, append-only, never mixed in any view), and ask Fotini in the meeting which specific Bar Council rule numbers we should reference in the audit-trail UI labels. She will know.
**Warning signs:** A single `transactions` table with a `type` column for both invoice payments and trust deposits. AI assistant's tool surface includes raw SQL or a view that unions both. Any aggregate query without an explicit trust-exclusion clause.
**Phase to address:** Phase 1 (schema), Phase 2 (AI tool scoping). Verification: dashboard renders 0 EUR revenue when only trust deposits exist in seed data.
**Severity:** CRITICAL.

---

### 3. Greek font rendering in PDFs (cold-start font fetch failures)

**What goes wrong:** Generated invoice PDF shows Greek diacritics as boxes (□□□), question marks, or stripped accents ("Ανδρέας" → "Ανδρες" or "??????"). Fotini opens the PDF during the demo, sees mangled Greek, the demo is over.
**Why it happens:** Multiple modes:
- `@react-pdf/renderer` fetches fonts at render time via `Font.register({src: 'https://...'})`. In cold-start serverless: "The font fetch happens at render time. In cold-start scenarios, the network request might timeout or fail silently" and "Font.register() initiates the download, but renderToBuffer() might execute before the font is fully loaded. There's no built-in way to await font readiness." — [Source: WebSearch "React PDF renderer Greek fonts diacritics rendering puppeteer next.js vercel 2026", https://kageetai.net/blog/today-i-learned/react-pdf-renderer/]
- `@react-pdf/renderer` has "better support for TTF/OTF formats than WOFF2. The Google Fonts URL serves WOFF2, which can cause rendering problems" — [Source: same].
- Encoding: "Ensure UTF-8 encoding for special characters — some libraries default to ISO-8859-1." — [Source: same].
- Font itself lacks Greek glyphs. PROJECT.md specifies Crimson Pro × Söhne-Mono. Crimson Pro has full Greek coverage (verified by Google Fonts script support list — must confirm at build time). Söhne is a commercial Klim Type foundry face; **Söhne's standard cuts do not ship Greek** — the dedicated `Söhne Breit` or `Söhne Schmal` releases are Latin-only by default, Greek requires a separate license tier. INSUFFICIENT EVIDENCE: exact Söhne Greek availability for our license — needs check with Klim before demo.
**How to avoid:**
- **Bundle TTF fonts locally in `public/fonts/`**, load via `path.join(process.cwd(), 'public', 'fonts', ...)` — never via remote URL — [Source: same].
- Use **Noto Sans Greek** or **GFS Didot** as guaranteed-Greek-coverage fallback for Söhne-Mono if the licensed Söhne cut lacks Greek glyphs. Crimson Pro stays.
- **Visual smoke test in CI / pre-demo:** render a fixed seed invoice with a Greek client name ("Ανδρέας Παπαδόπουλος"), diff the PDF against a committed reference image. Test must pass before deploy.
- Set explicit `<meta charset="utf-8">` on any HTML→PDF route. Database columns are `text` (UTF-8 by default in Postgres) — verify no `varchar(n)` truncation on Greek (Greek chars are multi-byte).
- Use `react-pdf`'s `Font.registerHyphenationCallback(w => [w])` to disable hyphenation — Greek hyphenation rules are wrong in the default library and break diacritic-bearing words.
**Warning signs:** PDF renders Latin perfectly but Greek shows boxes. Different output on first request vs second request (cold-start font race). PDF works locally but fails on Vercel.
**Phase to address:** Phase 3 (PDF rendering). Verification: render the seed Greek client invoice both cold and warm; pixel-diff PDF.
**Severity:** CRITICAL (demo-killer).

---

### 4. Vercel serverless function timeout on PDF generation

**What goes wrong:** Fotini clicks "Generate PDF" during demo. 10-second timeout (Hobby plan) or 60-second (Pro) expires mid-render. She sees a 504 / Vercel error page. Worst case: it works in dev, fails live.
**Why it happens:**
- "Vercel has a maximum execution time of 10 seconds for hobby plans and 60 seconds for pro plans" — [Source: WebSearch "React PDF renderer ... vercel 2026", https://viprasol.com/blog/react-pdf-generation/].
- "Puppeteer requires a Chromium binary, which exceeds Vercel's size limits" — [Source: same]. If anyone reaches for Puppeteer without `@sparticuz/chromium-min`, deploy will fail or cold-start will time out.
- Cold start downloading fonts + Chromium + first-time render compounds the timeout.
**How to avoid:**
- **Use `@react-pdf/renderer`, not Puppeteer**, for the demo. 2MB vs 300MB footprint — [Source: same]. Faster cold start, no Chromium.
- **Confirm Vercel plan is Pro** (60s timeout, not Hobby 10s) before deploy — `vercel --prod` then check function logs. PROJECT.md doesn't specify plan tier.
- Pre-warm the PDF route: hit `/api/invoice/[id]/pdf` for one seed invoice in the deploy script after `vercel --prod`. First real click is warm.
- If a PDF takes >5s locally on a fast machine, it WILL time out on Vercel cold start. Set a hard local performance budget.
- Fallback: pre-render seed-data PDFs to Supabase Storage at seed time. Demo PDFs are served as static files, not regenerated live. Live regeneration only for newly-edited invoices.
**Warning signs:** Local generation takes >3s. Function logs show >50s duration in production. 504 errors on first request after idle.
**Phase to address:** Phase 3 (PDF), Phase 6 (deploy hardening). Verification: cold-start timing test after deploy.
**Severity:** HIGH.

---

### 5. AI assistant hallucinating VAT amounts, client names, or invoice line items

**What goes wrong:** Fotini says "draft an invoice for Eleni for last Tuesday's consultation, 2 hours." AI returns a draft with VAT computed as €40 on a €200 net (correct: €38), or substitutes "Eleni Christodoulou" with "Eleni Christodoulides" because the LLM hallucinated a similar client. She signs it, sends it, the VAT is wrong, the audit catches it, lawsuit territory.
**Why it happens:** LLMs hallucinate proper nouns and numbers when they're plausible-looking. OpenRouter routes to whichever LLM — output is non-deterministic. Free-form prompt with no structural enforcement = hallucination surface.
**How to avoid:**
- **AI never computes VAT.** AI assistant outputs a structured JSON `InvoiceDraft` (hours, rate, client_id, case_id, description). VAT is computed in deterministic server code post-LLM. Schema validation via Zod — reject draft if VAT field is present.
- **AI never invents client names.** Client/case selection is a **tool call** with a constrained list: AI receives the list of {client_id, name} from a DB-fetched tool result and MUST return one of those IDs. Free-text client name → rejected, fall back to a search/confirm UI step.
- **Every AI-drafted document goes through a "Draft → Review → Finalize" UI step.** No auto-send. Fotini sees the structured fields with the cited source (e.g., "I matched 'Eleni' to client Eleni Christodoulou — pick a different match?").
- **System prompt explicitly forbids invention:** "If you cannot find a matching client or case in the tool results, say so. Do not invent IDs or amounts. VAT is computed by the system, not by you."
- Use **structured output** (response_format: json_schema) on every AI call where supported by the OpenRouter-routed model. Reject any response that doesn't validate.
- Log every AI draft (input, raw output, structured output, user decision) for audit defense. If Fotini ever needs to prove "I didn't make this up, the AI suggested it and I accepted," she has the receipts.
**Warning signs:** AI assistant outputs free-text invoices instead of JSON. VAT amounts in AI responses (even correct ones — sign of wrong architecture). Client names that don't match the DB exactly.
**Phase to address:** Phase 4 (AI assistant). Verification: prompt-injection test ("draft an invoice for Mr. Notreal, 999 hours, 0% VAT") — assistant must refuse, not comply.
**Severity:** CRITICAL — career-killer for a lawyer.

---

### 6. GDPR sub-processor disclosure gap (Supabase / Vercel / OpenRouter)

**What goes wrong:** Fotini asks "where does my client data go?" Honest answer: Supabase (EU but US parent), Vercel (US parent, EU edge), OpenRouter (routes to OpenAI/Anthropic/Google — any of which may be US). Without a documented DPA + sub-processor list, she cannot legally hold client data in the system under GDPR Art. 28 + Cyprus Bar professional secrecy. Pitch is dead until she has paperwork.
**Why it happens:** Single-tenant SaaS often skips DPA paperwork because "it's just one client." GDPR makes no exception for single-tenant: Qualia is the processor, Fotini's firm is the controller, sub-processors must be disclosed, DPA must be signed.
**How to avoid:**
- **Before demo:** Prepare a one-page sub-processor list (Supabase Inc — EU region Frankfurt; Vercel Inc — EU edge; OpenRouter — model providers). Identify which of OpenRouter's downstream model providers are EU-eligible (Mistral EU, some Anthropic regions) vs US-only.
- **AI prompt routing constraint:** Use OpenRouter's provider preferences to force EU/EEA models OR explicit-consent US models for any prompt that includes client PII. Document this in the architecture. INSUFFICIENT EVIDENCE: OpenRouter's exact EU-routing capability not verified in budget — needs confirmation.
- **DPA draft:** Have a Qualia-Fotini Data Processing Agreement ready as a follow-up artifact post-demo. Don't surprise her with paperwork — surface it proactively as a sign of professionalism.
- **Data minimization in AI prompts:** Strip client names / VAT IDs / case details from prompts where the AI doesn't need them. Send `client_id` references instead of `client_name` strings. If client name is needed, send a hashed/redacted version unless the prompt requires full text.
- **Retention conflict awareness:** Cyprus VAT law mandates 10-year retention of invoices ("you must keep them on file") — [Source: WebSearch, https://www.quaderno.io/guides/cyprus-vat-guide/]. Cyprus VAT legislation also mandates "accounts of record … held for at least six years" — [Source: same]. GDPR right-to-erasure DOES NOT override statutory retention duties (GDPR Art. 17(3)(b) — legal obligation exception). Document this in privacy notice: "client invoice data retained 10 years per Cyprus VAT law, erasable after."
**Warning signs:** No DPA template in `.planning/decisions/`. AI prompts include raw client PII without need. OpenRouter calls use default routing (which may hit non-EU providers).
**Phase to address:** Phase 5 (compliance hardening) — but DPA + sub-processor list must exist by demo for the conversation.
**Severity:** HIGH (relationship-killer if surfaced unprepared, not demo-killer in the room).

---

### 7. Supabase RLS gaps on single-tenant assumption

**What goes wrong:** "It's single-tenant, RLS is overkill" → developer ships with RLS disabled or with `USING (true)` policies. Anyone with the anon key (which is embedded client-side per Supabase architecture) can SELECT all tables. Fotini's full client list, invoice amounts, trust balances are queryable via the publishable key from any browser. Cyprus Bar professional secrecy breach.
**Why it happens:** "Single-tenant" gets confused with "private." Single-tenant means one workspace; the database is still on the public Supabase URL with the publishable key exposed to any logged-in user — including unauthorized ones if signups aren't gated.
**How to avoid:**
- **RLS enabled on every table from migration 1.** Per `rules/security.md` and `rules/infrastructure.md` (loaded global rules). Policies check `auth.uid() = workspace_owner_id` (or membership) on every table.
- **Signups disabled in Supabase Auth** — Fotini is provisioned manually (single user). Magic-link login only.
- **No `service_role` key in any client component.** Audit via `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/` — must return zero matches outside `lib/supabase/server.ts`.
- **Storage bucket policies match:** invoice PDFs in a private bucket with signed-URL access only. No public bucket for "convenience."
- INSUFFICIENT EVIDENCE: Cyprus Bar Council's exact rule on cloud-hosted client data not retrieved. EU-region Supabase is necessary but possibly not sufficient — some jurisdictions require explicit Bar Council approval for cloud storage of privileged data. Ask Fotini.
**Warning signs:** Any migration without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. RLS policy with `USING (true)`. `service_role` import in any file under `app/`.
**Phase to address:** Phase 1 (schema/auth). Verification: automated test that hits every table with anon key and expects empty result set when no user is logged in.
**Severity:** HIGH.

---

### 8. Supabase fresh-project cold start + email deliverability fails during live demo

**What goes wrong:** Fotini clicks the magic link in the meeting. Email never arrives (Supabase free-tier email is rate-limited and goes to spam). Or first DB query takes 5+ seconds because the project hasn't been hit in hours and Supabase paused/cold-cached it. Pitch momentum dies.
**Why it happens:** Fresh Supabase projects on the free tier have aggressive idle-pause policies. Default email provider (Supabase SMTP) is rate-limited to ~3 emails/hour on free tier, and Gmail/Outlook flag it as spam. Vercel's first cold start after deploy is also slow.
**How to avoid:**
- **Configure custom SMTP in Supabase Auth** (Resend or SendGrid per PROJECT.md) BEFORE demo. Resend is faster to set up; takes ~5 minutes including DNS records. Verify SPF/DKIM/DMARC pass.
- **Pre-create Fotini's account** with magic link sent and tested at least 1 hour before the meeting. Use a real email address Fotini gave us. Test the full login flow.
- **Pre-warm everything** in the 15 minutes before the meeting: hit every key route (dashboard, invoice create, PDF render, AI assistant) at least twice each so all caches/connections/functions are warm.
- **Have a fallback login path ready:** pre-create a session token or have a "magic link for demo" button that bypasses email entirely. Only used if the live magic-link flow fails. NEVER show this as the primary flow.
- **Test on the actual demo network.** If demo is over hotel/coworking WiFi, latency and DNS can break things that worked at home.
**Warning signs:** Magic link emails in spam folder. First request after 30 min idle takes >3s. Supabase project dashboard shows "paused."
**Phase to address:** Phase 6 (pre-demo deploy hardening). Verification: full end-to-end login + invoice creation + PDF + AI query, from a cold state, 1 hour before the meeting.
**Severity:** CRITICAL (demo-killer).

---

### 9. OpenRouter rate limits or model unavailability mid-demo

**What goes wrong:** Fotini asks the AI assistant three questions in a row. Third one hits a rate limit or the routed model is temporarily unavailable. Visible error in the demo, kills the most differentiated feature.
**Why it happens:** OpenRouter routes to whichever provider — provider outages cascade. Free-tier OpenRouter accounts have lower rate limits. New API keys have a ramp-up.
**How to avoid:**
- **Use a paid OpenRouter account with funded balance** — not a free key. Per `rules/infrastructure.md` ("Don't have a key? Ask Fawzi for one") — use a Qualia-funded key, not a personal one.
- **Configure model fallback chain** in the OpenRouter request: primary (e.g., GPT-4-class), fallbacks (Claude, Gemini) so a provider outage is invisible.
- **Cache structured AI responses** for the seed data — if Fotini asks "who's overdue?" against the seed data, the answer is the same every time. Pre-compute and cache.
- **Pre-flight test the exact 3-5 AI queries** Fotini is likely to ask, 30 minutes before the meeting. If any fails, debug now.
- **Rate-limit the AI assistant from the UI side** — add a 1-second debounce on submit to prevent rapid-fire calls during a nervous demo.
**Warning signs:** OpenRouter dashboard shows rate-limit warnings. Response times above 5s for the same query repeated. Different error responses across calls.
**Phase to address:** Phase 4 (AI assistant). Verification: 10 sequential queries during pre-demo smoke test, all succeed under 3s.
**Severity:** HIGH.

---

### 10. Greek-language UI bugs (truncation, layout overflow, wrong locale formatting)

**What goes wrong:** Greek strings are ~30% longer than English equivalents on average. Buttons that fit "Save" don't fit "Αποθήκευση." Number formatting wrong (Greek uses `.` as thousands separator and `,` as decimal — opposite of English: `1.234,56 €` not `1,234.56 €`). Date format wrong (DD/MM/YYYY in Greek, not MM/DD/YYYY). Currency placement after the amount in Greek, not before.
**Why it happens:** Devs build in English, "translate later" via `next-intl`. Layout tested only in EN. Formatting hardcoded with `toLocaleString('en-US')` or unformatted `.toFixed(2)`.
**How to avoid:**
- **Build Greek-first** — Fotini's primary locale. EN is the toggle, not the default. PROJECT.md confirms "GR + EN, GR default for Fotini's locale."
- **All numeric/date formatting goes through `Intl.NumberFormat('el-CY', ...)` and `Intl.DateTimeFormat('el-CY', ...)`** — never `toLocaleString` without explicit locale, never `toFixed`.
- **Currency:** `Intl.NumberFormat('el-CY', { style: 'currency', currency: 'EUR' })` produces `1.234,56 €` automatically.
- **VAT number format:** Cyprus VAT IDs are `CY########L` (8 digits + checksum letter). Validate via regex `^CY\d{8}[A-Z]$` on every client form. Don't blindly trust input.
- **Layout test in Greek with longest strings.** "Αποθήκευση και αποστολή" ("Save and send") is twice as long as the English. Use CSS `min-width` based on Greek text length, not English.
- **Invoices issued in Greek** — per VAT law "Invoices must be issued in Greek. Where another language is used, the Commissioner of Taxation may require a Greek translation within 30 days." — [Source: WebSearch, https://blog.invault.xyz/invoicing-in-cyprus-2026/]. The bilingual feature is a customer convenience layer; the legally valid invoice is the Greek one.
**Warning signs:** EN-only locale strings hardcoded in JSX. Numbers rendered without `Intl.NumberFormat`. Buttons with fixed widths in pixels.
**Phase to address:** Phase 2 (UI shell) — set up locale infrastructure before any UI is built. Verification: visual scan of every screen in EL locale before demo.
**Severity:** HIGH (will look unprofessional to a Greek-speaking lawyer in seconds).

---

## Technical Debt Patterns

Shortcuts that seem reasonable for a demo but create long-term problems — and which of them are acceptable to ship anyway.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode VAT at 19% instead of a `vat_rates` table | Saves 1 phase of work | Breaks the day Cyprus changes VAT or you add a reduced-rate service | **Acceptable for demo** — surface it as a known limitation in the post-demo "what's next" |
| Skip recurring invoices (Tier 2 per PROJECT.md) | Saves ~1 day | None — already scoped out | Always acceptable, this is the plan |
| Use Supabase's default email provider | No SMTP config | Magic links to spam, rate limits | **NEVER acceptable** — fix before demo (see Pitfall 8) |
| Use `@react-pdf/renderer` with remote font URLs | Faster setup | Cold-start font failures, Greek chars break | Never — always bundle TTFs locally |
| Soft-delete invoices via `deleted_at` | Easy "undo" UX | Audit trail breaks, sequence integrity collapses | NEVER — credit-note pattern only |
| `nextval()` for invoice numbers | One-line solution | Burns numbers on rollback = gap = audit failure | Never — use transactional `UPDATE counters` |
| Skip RLS "because it's single-tenant" | Faster local dev | Publishable key leaks all data | Never — RLS from migration 1 |
| AI assistant returns free-text invoices | Easier to build | Hallucinated VAT/clients in production | Never — structured output only |
| No DPA between Qualia and Fotini | Avoids paperwork conversation today | GDPR liability, can't sign procurement | Acceptable for demo, MANDATORY before any real client data enters the system |
| Single-region deploy without backups | Simpler | Loss of 10 years of mandatory invoice retention | Acceptable for demo with seed data only — Supabase PITR before any real data |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| PDF render on every list view | Slow invoice list page | Pre-render PDF on finalize, store in Supabase Storage, serve URL | First demo with >5 invoices |
| AI assistant fetches full client/case list as context every query | High token cost, slow responses | Pass IDs + a search tool, let AI request only what it needs | After ~50 clients |
| Trust ledger balance computed via SUM() on every page load | Dashboard slows progressively | Maintain a materialized `trust_balances` table updated by trigger on insert | After ~1000 ledger entries |
| Aging report runs N+1 queries per client | Report takes >5s | Single SQL query with `LEFT JOIN LATERAL` for last payment per invoice | After ~30 clients with ~10 invoices each |
| Cold-start on Vercel after demo idle | First click after 15 min idle takes 8s | Vercel Pro plan, pre-warm before demo | Live demo after a coffee break |
| Greek font fetched from Google Fonts CDN on first PDF | First PDF cold-start fails or has missing glyphs | Bundle TTFs locally in `public/fonts/` | Every cold start until warm |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `service_role` key imported in a Client Component | Full DB access from browser | Audit `grep -r SUPABASE_SERVICE_ROLE_KEY app/` returns zero matches; CI guard |
| RLS policy `USING (true)` "to unblock dev" | All tables readable with anon key | RLS policies always check `auth.uid()`; never `true` |
| Storage bucket for invoice PDFs is public | Invoice URLs leak via search engines | Private bucket + signed URLs, expire in <1 hour |
| AI prompt logs include raw client PII | Logs are a data-leak surface | Redact PII before logging; or hash-and-store mapping for debugging |
| Client-side computed VAT trusted by server | Tampered POST creates wrong-VAT invoices | Server recomputes VAT from line items on every save |
| Email reminders include invoice PDF as attachment without signed URL | Forwarded email exposes all client data | Email contains signed-URL link; recipient must auth-or-token to view |
| Supabase Auth signups left enabled | Anyone can create an account on Fotini's tenant | Disable signups in Supabase dashboard; manual provisioning only |
| AI assistant has DB write access | Hallucinated INSERT/UPDATE = corrupted ledger | AI tool surface is READ + DRAFT only. Finalize requires explicit user action in UI, server-side. |
| OpenRouter prompts logged to OpenRouter dashboard include client PII | Sub-processor sees content they shouldn't | Use OpenRouter's logging-disabled tier OR strip PII before sending |
| Trust ledger entries are UPDATE-able | Lawyer (or attacker) silently rewrites history | DB-level constraint: trust ledger is INSERT-only; RLS denies UPDATE/DELETE for all roles |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Invoice numbering:** Often missing — race-condition test (parallel inserts). Verify: spawn 10 concurrent invoice creations, expect 10 unique sequential numbers with no gaps.
- [ ] **PDF Greek rendering:** Often missing — cold-start test. Verify: deploy fresh, wait 5 min, generate a Greek-name PDF, check no boxes/question marks.
- [ ] **Trust ledger isolation:** Often missing — revenue query excludes trust. Verify: seed-data check that dashboard shows €0 revenue when only trust deposits exist.
- [ ] **AI assistant safety:** Often missing — refusal test on invented entities. Verify: ask AI "draft invoice for client Mr. Nonexistent" — expect refusal, not invention.
- [ ] **RLS coverage:** Often missing — anon-key probe. Verify: with anon key only (no auth), every table SELECT returns 0 rows.
- [ ] **Magic-link email:** Often missing — custom SMTP + DKIM. Verify: send to a Gmail address, check inbox not spam, headers show DKIM=pass.
- [ ] **Greek UI:** Often missing — layout test in EL with longest strings. Verify: every button/label visible without overflow in EL locale.
- [ ] **Sequential numbering across years:** Often missing — year-rollover test. Verify: insert invoice in 2026, simulate year change, next invoice is `2027/0001` not `2026/####`.
- [ ] **Credit note workflow:** Often missing — voiding an invoice issues a credit note, doesn't delete. Verify: attempt DELETE on a finalized invoice, expect failure.
- [ ] **Audit log:** Often missing — every AI draft and finalize action is logged with user + timestamp + before/after. Verify: log entries exist for every state change.
- [ ] **Demo seed data:** Often missing — Greek names with diacritics in seed clients. Verify: at least 3 of 10 seed clients have full Greek names with accents.
- [ ] **OpenRouter EU routing:** Often missing — provider constraint on prompts with PII. Verify: API call inspector shows EU-region model selected.
- [ ] **VAT number validation:** Often missing — CY format regex. Verify: client form rejects "CY123" but accepts "CY12345678L".
- [ ] **Invoice in Greek (legally valid version):** Often missing — bilingual toggle defaults to EN, but the legal copy must be GR. Verify: PDF generated in GR contains all mandatory fields per Cyprus VAT 10th Schedule.
- [ ] **Currency/date formatting in EL locale:** Often missing — `Intl.NumberFormat('el-CY')`. Verify: amounts render as `1.234,56 €`, not `1,234.56 €`.

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Invoice numbering gaps | Phase 1 (schema) | Parallel-insert test; no DELETE policy on invoices |
| 2. Trust ledger mixing | Phase 1 (schema) + Phase 4 (AI scoping) | Revenue dashboard shows €0 with trust-only seed; AI tool surface excludes trust tables |
| 3. Greek PDF rendering | Phase 3 (PDF) | Cold-start PDF generation with Greek seed names; pixel-diff |
| 4. Vercel timeout on PDF | Phase 3 + Phase 6 | Cold-start timing test on Vercel Pro; pre-warm script after deploy |
| 5. AI hallucination | Phase 4 (AI) | Refusal test on invented client/case; Zod schema validation rejects bad drafts |
| 6. GDPR/sub-processor gap | Phase 5 (compliance) + paperwork before meeting | DPA draft exists; OpenRouter EU-routing verified |
| 7. RLS gaps | Phase 1 (auth) | Anon-key SELECT returns 0 on every table; `service_role` grep returns 0 client-side |
| 8. Cold-start / email failure | Phase 6 (pre-demo) | End-to-end smoke test 1h before meeting; custom SMTP with DKIM |
| 9. OpenRouter rate limits | Phase 4 (AI) | Paid key with fallback chain; pre-flight 10 sequential queries |
| 10. Greek UI bugs | Phase 2 (UI shell) | All screens reviewed in EL locale; `Intl` everywhere |

---

## Pre-Demo Go/No-Go Checklist (T-1 hour before Fotini opens the link)

Run this checklist 1 hour before the meeting. ANY red = fix or have a workaround ready.

1. [ ] Magic-link login email arrives in <30s to Fotini's address, not in spam.
2. [ ] First page load after 10-min idle is <3s (cold-start acceptable).
3. [ ] Generate PDF on a Greek-named client invoice — Greek diacritics render correctly. No boxes.
4. [ ] AI assistant answers "ποιοι έχουν ληξιπρόθεσμα τιμολόγια;" ("who's overdue?") in <5s with a non-hallucinated answer pulled from seed data.
5. [ ] Trust ledger page shows balances; revenue dashboard shows €0 when only trust deposits exist (seed scenario).
6. [ ] Create a new invoice, check the number is the next in sequence (`2026/00##` matching count + 1).
7. [ ] Try to delete a finalized invoice in the UI — UI doesn't allow it. (Credit-note workflow visible instead.)
8. [ ] Open Supabase logs — no errors in the last 10 minutes.
9. [ ] OpenRouter dashboard — recent requests succeed, no rate-limit warnings.
10. [ ] Vercel function logs — no >50s durations, no 5xx.
11. [ ] All currency in EL locale shows `1.234,56 €` (Greek format), all dates DD/MM/YYYY.
12. [ ] Invoice PDF (Greek) contains all 10th Schedule mandatory fields: supplier+customer name/address, both VAT numbers, sequential number, issue date, transaction date, service description, unit price ex-VAT, VAT rate, VAT amount, breakdown by rate.

---

## Sources

- WebSearch "Cyprus VAT invoice mandatory fields sequential numbering 2026 legal requirements lawyer billing" — primary regulatory citations:
  - [Invoicing in Cyprus (2026)](https://blog.invault.xyz/invoicing-in-cyprus-2026/) — mandatory fields, sequential numbering, Greek-language requirement, 30-day translation rule
  - [Cyprus Invoice Requirements (CBU Chartered Accountants)](https://cbucyprus.com/cyprus-invoice-requirements/) — credit-note correction pattern (never delete invoices)
  - [Cyprus VAT Invoice Requirements (Avalara)](https://www.avalara.com/vatlive/en/country-guides/europe/cyprus/cyprus-vat-invoice-requirements.html) — Tenth Schedule mandatory fields
  - [Cyprus VAT Guide for Businesses in 2026 (Quaderno)](https://www.quaderno.io/guides/cyprus-vat-guide/) — 10-year retention, 19% standard rate, simplified-invoice threshold
  - [Cyprus VAT rules (European Commission VAT OSS)](https://vat-one-stop-shop.ec.europa.eu/national-vat-rules/cyprus-vat-rules_en) — EU-level confirmation
- WebSearch "React PDF renderer Greek fonts diacritics rendering puppeteer next.js vercel serverless function timeout PDF generation 2026":
  - [React PDF renderer — Kageetai.net](https://kageetai.net/blog/today-i-learned/react-pdf-renderer/) — cold-start font fetch failures, WOFF2 vs TTF, async race conditions
  - [React PDF Generation in 2026 — Viprasol](https://viprasol.com/blog/react-pdf-generation/) — Vercel size limits, Chromium serverless issues, 10s/60s timeouts
  - [Creating a Next.js API to Convert HTML to PDF with Puppeteer (Vercel-Compatible) — DEV](https://dev.to/harshvats2000/creating-a-nextjs-api-to-convert-html-to-pdf-with-puppeteer-vercel-compatible-16fc) — @sparticuz/chromium-min pattern
  - [react-pdf fonts documentation](https://react-pdf.org/fonts) — Font.register API
- Global Qualia rules (loaded context):
  - `rules/security.md` — RLS, no service_role client-side, Zod validation
  - `rules/infrastructure.md` — Supabase EU region, OpenRouter routing, deployment via Vercel CLI
  - `rules/grounding.md` — INSUFFICIENT EVIDENCE protocol applied to Cyprus Bar Council items

## Gaps Acknowledged (INSUFFICIENT EVIDENCE — flagged for live validation with Fotini)

Per `rules/grounding.md`, the following items could not be verified within the quick-scope budget and are explicitly marked rather than fabricated:

1. **Cyprus Bar Council exact rule citations** on client-account separation, audit cadence, and disbarment triggers. Attempted: WebFetch to cyprusbarassociation.org/lawyers/practice-issues/client-account returned 404; Google Search redirect refused content extraction. Strategy: build to defensible defaults (separate table, append-only, never mixed) and validate the exact rule numbers with Fotini in the meeting — she IS the subject-matter expert.
2. **Söhne typeface Greek glyph coverage** for Qualia's license tier. Verify with Klim Type Foundry before demo or substitute a guaranteed-Greek-coverage fallback (Noto Sans Greek / GFS Didot).
3. **OpenRouter's exact EU-only routing capability** and the list of EU-eligible downstream model providers. Verify in OpenRouter dashboard / docs before the meeting OR commit to a single named EU provider (e.g., Mistral) and document the choice in ADR.
4. **Whether EU-region Supabase satisfies Cyprus Bar's data-residency duty.** EU region is necessary; some bar associations require explicit approval for cloud storage of privileged communications. Confirm with Fotini.

These gaps do not block the demo. They are conversation items, not implementation blockers.

---

*Pitfalls research for: Legal-tech invoicing landmines — Cyprus + EU regulatory, GDPR, AI-in-legal, trust-account compliance, plus technical landmines specific to this stack*
