---
phase: 6
goal: "Monthly financial summary + aging report with AI-drafted bilingual email reminders (Resend), GDPR compliance docs, full smoke-test suite passing locally, then production deploy via Vercel CLI with post-deploy verification — all green before today's pitch meeting"
tasks: 6
waves: 4
---

# Phase 6: Compliance + Reports + Email + Deploy + Smoke Test

**Goal:** Add the two reporting views (`/reports/summary` monthly financial summary; `/reports/aging` overdue invoices with bilingual AI-drafted email reminders sent via Resend), publish the GDPR sub-processor + DPA + privacy notice scaffolds, run the full executable smoke-test suite against the local stack, then deploy to Vercel and verify the production URL is green. Trust ledger MUST remain invisible to revenue queries — this is the load-bearing demo claim. All Phase 6 surfaces use the existing user-scoped Supabase client; no new service-role consumers, no new SP migrations.

**Why this phase:** This is the FINAL phase before the pitch. REP-01 (REQ-015 monthly summary) and REP-02 (REQ-016 aging + reminders) close out the milestone scope. Without GDPR docs Fotini cannot legally engage; without a working deploy there is no demo URL; without the smoke suite there is no certainty any of the Phase 1–5 paths still work end-to-end. This phase ships all four — reports, email, compliance, deploy — and pre-flights the pitch with an executable green check.

---

## Task 1 — Resend adapter + reminder system prompt + OpenRouter cache entries + i18n keys

**Wave:** 1
**Persona:** backend
**Files:**
- CREATE `src/lib/resend/client.ts` — exports `sendReminderEmail({ to, subject, html, attachments? })` returning `{ ok: true, id } | { ok: false, error: 'no_api_key' | 'rate_limited' | 'invalid_email' | 'network' | 'provider_error', message?: string }`. In-process rate limiter (rolling 60-second window, max 10 sends). DEMO_CACHE gate identical to Phase 5: `process.env.DEMO_CACHE === 'true'` returns `{ ok: true, id: 'demo-cached-<sha256-prefix>' }` deterministically. Otherwise reads `process.env.RESEND_API_KEY` — if missing, returns `{ ok: false, error: 'no_api_key' }`. If set, calls Resend SDK (`new Resend(key).emails.send({ ... })`); maps Resend errors to the typed union; no retry.
- CREATE `src/lib/resend/types.ts` — `ResendSendArgs`, `ResendSendResult`, `ResendError`, `ReminderEmailPayload` (the typed payload built upstream).
- CREATE `src/lib/resend/rate-limiter.ts` — `tryAcquire(): boolean` against a module-level array of recent timestamps. Pure, no I/O.
- MODIFY `src/lib/openrouter/prompts.ts` — append `export function buildReminderSystemPrompt(invoice: ReminderContext, client: ReminderClientCtx, language: 'el' | 'en'): string`. The prompt enforces: formal lawyer register; greeting matches `client.preferred_language` (Greek: "Αγαπητέ/ή κύριε/κυρία [name]", English: "Dear Mr./Mrs./Ms. [name]"); states amount with VAT, invoice number, days overdue, due date; closes with a polite payment request and the firm's name; refuses if the invoice has no `invoice_number` (drafts cannot be reminded) or `total <= 0`. Quotes verbatim: `"AI MUST NOT propose new amounts, invoice_numbers, or VAT figures — reminder content describes the existing finalized invoice ONLY."`
- MODIFY `src/lib/openrouter/types.ts` — append `ReminderContext` (invoice_number, total, currency, due_at, days_overdue, matter_title), `ReminderClientCtx` (name_el, name_en, email, preferred_language), `ReminderCallArgs` (kind: 'reminder', text: string, contextData: { invoice, client, language }), `ReminderResult` (`{ ok: true; subject: string; body_html: string; body_text: string } | { ok: false; error: OpenRouterError; message?: string }`). Extend the `CallArgs` discriminated union and `CallResult<K>` to include `K extends 'reminder'`.
- MODIFY `src/lib/openrouter/client.ts` — extend `callOpenRouter` to handle `kind: 'reminder'`: build the system prompt via `buildReminderSystemPrompt`, request structured output (`response_format: { type: 'json_schema', strict: true }` matching `{ subject: string; body_html: string; body_text: string }`), Zod-validate the response with a new `ReminderResponseSchema = z.object({ subject: z.string().min(1).max(200), body_html: z.string().min(1).max(8000), body_text: z.string().min(1).max(8000) }).strict()`. Refusal / 5xx / fallback behavior identical to the existing draft path.
- MODIFY `src/lib/openrouter/demo-cache.json` — add 4 entries keyed by the normalized prompt template `"reminder for <invoice_number> <client_name> <language>"`. Two Greek entries (formal register, e.g. `"Αξιότιμη κυρία Παπαδοπούλου, σας ενημερώνουμε ότι το τιμολόγιο 2026/0002 ποσού €1.785,00 παραμένει ανεξόφλητο 35 ημέρες μετά τη λήξη του στις 09/04/2026..."`), two English entries (e.g. `"Dear Mr. Christodoulides, We write to remind you that invoice 2026/0001 for €1,285.20 has been outstanding for 42 days past its due date of 02/04/2026..."`). Each entry's value uses the new shape `{ kind: 'reminder', subject, body_html, body_text }`.
- MODIFY `src/lib/openrouter/client.ts` — extend `translateCacheEntry` to handle `kind === 'reminder'`, running through `ReminderResponseSchema.safeParse` before returning the cached result.
- MODIFY `messages/el-CY.json` AND `messages/en-CY.json` — add three top-level namespaces with KEY PARITY:
  - `reports.*` — `title`, `summary`, `aging`, `monthSelector`, `revenueCard`, `outstandingCard`, `overdueCard`, `byCase`, `byClient`, `trustIsolationNote` (Greek: "Τα υπόλοιπα παρακαταθηκών δεν περιλαμβάνονται στα έσοδα." / English: "Trust balances are excluded from revenue figures.").
  - `aging.*` — `title`, `bucket0to30`, `bucket31to60`, `bucket60Plus`, `clientCol`, `matterCol`, `invoiceCol`, `amountCol`, `daysOverdueCol`, `bucketTotal`, `selectAllInBucket`, `draftRemindersBtn`, `noOverdueEmpty`.
  - `reminders.*` — `modalTitle`, `previewSubject`, `previewBody`, `editBody`, `sendBtn`, `sending`, `sent`, `errorNoApiKey`, `errorRateLimit`, `errorInvalidEmail`, `errorProvider`, `errorNetwork`, `clientMissingEmail`, `disclaimer` (Greek: "Η AI έχει συντάξει αυτή την υπενθύμιση. Ελέγξτε πριν αποστείλετε." / English: "AI drafted this reminder. Review before sending.").
- MODIFY `.env.local.example` (CREATE if absent) — append documented `RESEND_API_KEY=` line with comment: `# Resend transactional email — Phase 6 reminders. If unset, the adapter returns no_api_key. DEMO_CACHE=true short-circuits to a cached response for offline pitch fallback.`

**Depends on:** none

**Why:** Tasks 3 and 4 both consume this. The Resend adapter must exist before the aging-report send flow can be wired. The OpenRouter `kind: 'reminder'` extension must exist before the draft-reminder modal can produce bilingual content. The i18n keys must exist before any frontend renders. We bundle these into Wave 1 so the two parallel Wave-2 frontend tasks have a stable, typed backend foundation. The DEMO_CACHE pattern ships because Fotini's pitch demo runs in an unreliable network and on a laptop where the Resend free tier may or may not be funded — the cache is the deterministic fallback per the locked decision. The rate limiter (10/min) is enforced in-process so the Resend free-tier quota (100/day) is never the first thing that breaks during a live demo bulk-send.

**Acceptance Criteria:**
- `sendReminderEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' })` with `DEMO_CACHE=true` returns `{ ok: true, id: 'demo-cached-<hash>' }` for a deterministic SHA-256 prefix derived from `to|subject|html`.
- `sendReminderEmail` with neither `DEMO_CACHE=true` nor `RESEND_API_KEY` set returns `{ ok: false, error: 'no_api_key' }`.
- 11 successive calls within 60 seconds: the 11th returns `{ ok: false, error: 'rate_limited' }` — the 10-per-minute window enforced.
- `callOpenRouter({ kind: 'reminder', text: '...', contextData: { invoice, client, language: 'el' } })` with `DEMO_CACHE=true` returns a Greek `{ ok: true, subject, body_html, body_text }` for a cache-hit prompt; the body uses formal register (contains "Αξιότιμ" or "παρακαλούμε"); `body_html` contains `<p>` tags; `body_text` is plain.
- `ReminderResponseSchema` rejects (Zod `safeParse` fails) any cached or live response missing `subject`, `body_html`, or `body_text`, or containing any extra key (`.strict()` enforced).
- i18n key parity: every key in `reports.*`, `aging.*`, `reminders.*` exists in BOTH locale files. (Verified by Task 5 smoke test.)
- No service-role import anywhere in `src/lib/resend/`. No `trust_ledger` reference anywhere in `src/lib/resend/` or in the added reminder prompts/types.

**Action:**
1. Verify Resend SDK shape: read `node_modules/resend/dist/index.d.ts` (or the package README) to confirm the call signature (`new Resend(key).emails.send({ from, to, subject, html, text? })`) and what error shape it raises. The package is already in `dependencies` (`"resend": "^6.12.3"`).
2. In `src/lib/resend/types.ts`:
   - `export interface ResendSendArgs { to: string; subject: string; html: string; text?: string; attachments?: Array<{ filename: string; content: Buffer | string }>; from?: string; }`
   - `export type ResendError = 'no_api_key' | 'rate_limited' | 'invalid_email' | 'network' | 'provider_error';`
   - `export type ResendSendResult = { ok: true; id: string } | { ok: false; error: ResendError; message?: string };`
3. In `src/lib/resend/rate-limiter.ts`:
   - Module-level `const recent: number[] = [];`
   - `export function tryAcquire(now: number = Date.now()): boolean { while (recent.length && now - recent[0] > 60_000) recent.shift(); if (recent.length >= 10) return false; recent.push(now); return true; }`
   - Pure function, deterministic, testable.
4. In `src/lib/resend/client.ts`:
   - Top of file: docblock mirroring `src/lib/openrouter/client.ts` shape — explain DEMO_CACHE gate, rate limit, typed error union, NO RETRY policy ("Resend errors surface to the user; we do not retry because reminder sends are user-initiated and idempotency-key support is not enabled on the free tier").
   - Import `Resend` from `'resend'`, `tryAcquire` from `./rate-limiter`, `createHash` from `'node:crypto'` for the demo cache ID derivation.
   - `function deterministicId(args: ResendSendArgs): string { return 'demo-cached-' + createHash('sha256').update(`${args.to}|${args.subject}|${args.html}`).digest('hex').slice(0, 16); }`
   - Email regex validation: `const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;` — if `!EMAIL_RE.test(args.to)` return `{ ok: false, error: 'invalid_email' }`.
   - Rate-limit check next: `if (!tryAcquire()) return { ok: false, error: 'rate_limited' };`
   - DEMO_CACHE gate: `if (process.env.DEMO_CACHE === 'true') return { ok: true, id: deterministicId(args) };`
   - API key gate: `const key = process.env.RESEND_API_KEY; if (!key) return { ok: false, error: 'no_api_key' };`
   - Live call: `try { const { data, error } = await new Resend(key).emails.send({ from: args.from ?? 'Lex <onboarding@resend.dev>', to: args.to, subject: args.subject, html: args.html, text: args.text, attachments: args.attachments }); if (error) return { ok: false, error: 'provider_error', message: error.message }; if (!data?.id) return { ok: false, error: 'provider_error', message: 'no_id_in_response' }; return { ok: true, id: data.id }; } catch (e) { return { ok: false, error: 'network', message: e instanceof Error ? e.message : String(e) }; }`
   - The `from` default uses `onboarding@resend.dev` (Resend's no-config sandbox sender — works without DNS verification for the demo; Task 6 documents the production `lex@<verified-domain>` step).
5. In `src/lib/openrouter/types.ts`:
   - `export interface ReminderContext { invoice_number: string; total: string; currency: string; due_at: string; days_overdue: number; matter_title: string; }`
   - `export interface ReminderClientCtx { name_el: string; name_en: string; email: string; preferred_language: PreferredLanguage; }`
   - Extend `CallArgs` to include `{ kind: 'reminder'; text: string; contextData: { invoice: ReminderContext; client: ReminderClientCtx; language: PreferredLanguage } }`.
   - Extend `CallResult<K>`: `K extends 'reminder' ? ({ ok: true; subject: string; body_html: string; body_text: string } | { ok: false; error: OpenRouterError; message?: string }) : ...`
   - Add to `DemoCacheEntry` union: `| { kind: 'reminder'; subject: string; body_html: string; body_text: string }`.
6. In `src/lib/openrouter/prompts.ts`, append:
   - `export function buildReminderSystemPrompt(invoice: ReminderContext, client: ReminderClientCtx, language: PreferredLanguage): string` — returns a multi-line string with explicit constraints. Required substrings: `"AI MUST NOT propose new amounts, invoice_numbers, or VAT figures"`, `"reminder describes the existing finalized invoice ONLY"`, `"formal register"`, and the conditional `language === 'el' ? "Greek (formal lawyer register, use «παρακαλούμε», «οφειλόμενο ποσό», «προθεσμία»)" : "English (formal register, use 'kindly', 'outstanding amount', 'due')"`. Inject the invoice context as a JSON block at the end of the prompt for the model to reference.
7. In `src/lib/openrouter/client.ts`:
   - Add `ReminderResponseSchema = z.object({ subject: z.string().trim().min(1).max(200), body_html: z.string().trim().min(1).max(8000), body_text: z.string().trim().min(1).max(8000) }).strict();`
   - Add the corresponding hand-rolled JSON-Schema mirror (`reminderJsonSchema()` helper, `additionalProperties: false` at every level).
   - In the `callOpenRouter` switch on `args.kind`: add a `reminder` branch that wires `buildReminderSystemPrompt`, sets `responseFormat` to the reminder JSON schema, and decodes the response via `ReminderResponseSchema.safeParse(JSON.parse(content))`.
   - Extend `translateCacheEntry`: when `kind === 'reminder' && entry.kind === 'reminder'`, run the entry through `ReminderResponseSchema.safeParse({ subject: entry.subject, body_html: entry.body_html, body_text: entry.body_text })` and return `{ ok: true, subject, body_html, body_text }` on success, `{ ok: false, error: 'parse_failed' }` on failure.
8. In `src/lib/openrouter/demo-cache.json`:
   - Add 4 entries. Cache keys are the normalized free-text identifier from upstream call sites — e.g. `"reminder for 2026/0002 papadopoulou el"` and `"reminder for 2026/0001 christodoulides en"`. Greek bodies use formal phrasing including `"Αξιότιμη"`, `"παρακαλούμε"`, `"οφειλόμενο ποσό"`. English bodies use `"Dear"`, `"kindly"`, `"outstanding"`. Each entry has the full `{ kind: 'reminder', subject, body_html, body_text }` shape.
9. In `messages/el-CY.json` and `messages/en-CY.json`:
   - Add `reports`, `aging`, `reminders` namespaces with the keys listed in the Files section above. Greek must use formal lawyer register (e.g. `reports.title`: `"Αναφορές"`, `reports.summary`: `"Μηνιαία σύνοψη"`, `aging.bucket60Plus`: `"60+ ημέρες"`, `reminders.modalTitle`: `"Σύνταξη υπενθύμισης"`). English mirrors: `reports.title`: `"Reports"`, `reports.summary`: `"Monthly summary"`, `aging.bucket60Plus`: `"60+ days"`, `reminders.modalTitle`: `"Draft reminder"`.
10. In `.env.local.example`:
    - Append `RESEND_API_KEY=` with the documented comment. Do NOT commit any real key.

**Validation:** (builder self-check)
- `test -f src/lib/resend/client.ts && test -f src/lib/resend/types.ts && test -f src/lib/resend/rate-limiter.ts && echo OK` → expect `OK`.
- `npx tsc --noEmit 2>&1 | grep -cE "(resend|openrouter|messages)" ` → expect `0`.
- `grep -c "trust_ledger\|trust\\.ledger\|\\btrust\\b" src/lib/resend/ -r` → expect `0` (the Resend adapter has no business touching trust state).
- `grep -c "SUPABASE_SERVICE_ROLE_KEY\|createServiceClient\|service-role" src/lib/resend/ -r` → expect `0` (no service-role bridge expansion).
- `grep -c "AI MUST NOT propose" src/lib/openrouter/prompts.ts` → expect ≥ `2` (existing draft + query prompts plus the new reminder prompt — defense-in-depth substring).
- `node --input-type=module -e "import('./src/lib/openrouter/client.ts').then(m=>console.log(typeof m.callOpenRouter==='function'?'OK':'FAIL'))"` → expect `OK` (module loads, export present).
- `node --input-type=module -e "import c from './src/lib/openrouter/demo-cache.json' assert {type:'json'}; const v=Object.values(c).filter(e=>e.kind==='reminder'); console.log(v.length>=4?'OK':'FAIL')"` → expect `OK`.
- Key-parity grep: `node -e "const a=Object.keys(require('./messages/el-CY.json').reminders).sort().join(','); const b=Object.keys(require('./messages/en-CY.json').reminders).sort().join(','); console.log(a===b?'OK':'MISMATCH '+a+' vs '+b)"` → expect `OK`. Repeat for `reports` and `aging` namespaces.

**Context:** Read
- @.planning/PROJECT.md
- @.planning/DESIGN.md (sections 1–3 for token reference if any prompt text appears in UI surfaces)
- @src/lib/openrouter/client.ts
- @src/lib/openrouter/prompts.ts
- @src/lib/openrouter/types.ts
- @src/lib/openrouter/demo-cache.json
- @src/lib/totals.ts (VAT semantics — Phase 6 reminders mention totals but never propose them)
- @messages/el-CY.json
- @messages/en-CY.json
- @node_modules/resend/dist/index.d.ts (confirm SDK signature before writing the live call)
- @node_modules/next/dist/docs/ (Next.js 16 server-only module guidance — Resend must never load on the client)

---

## Task 2 — GDPR compliance docs (sub-processor list, DPA, privacy notice)

**Wave:** 1
**Persona:** none
**Files:**
- CREATE `.planning/compliance/sub-processors.md` — one-page table: vendor, location, data accessed, purpose, EU residency confirmation, transfer mechanism. Rows for: Supabase (EU — Frankfurt, all rows), Vercel (US edge with EU regional functions, page renders + serverless), OpenRouter (US, prompts + completions; downstream Mistral EU-routed and Anthropic US — flagged for Fotini's review), Resend (US, transactional email envelope + body), UptimeRobot (US, public-endpoint pings only — no user data). Cite Art. 28 GDPR.
- CREATE `.planning/compliance/dpa-draft.md` — Data Processing Agreement template (Qualia Solutions = processor, Fotini Kandri = controller). Section 1 scope & roles; Section 2 categories of personal data (client names, VAT IDs, billing emails, invoice line-item descriptions which may include sensitive matter context — flagged); Section 3 sub-processors (refers to `sub-processors.md`); Section 4 transfer mechanisms (SCCs + UK addendum); Section 5 security measures (TLS, RLS, audit triggers — references our Migration 002 and 004); Section 6 data-subject rights (access, rectification, erasure caveat for retained VAT records); Section 7 retention (10 years for VAT-relevant tax records per Cyprus tax law; 1 year for audit logs beyond that horizon); Section 8 termination & deletion procedure; Section 9 audit rights; Section 10 governing law (Cyprus). Mark verbatim: `STATUS: DRAFT — for Fotini's lawyer review before counter-signature.`
- CREATE `.planning/compliance/privacy-notice.md` — client-facing privacy notice for the lawyer to publish on her firm's site or attach to engagement letters. Plain language. Sections: (a) who we are, (b) what data we collect & why (necessary for billing + Cyprus tax-law compliance), (c) legal basis (contract + legal obligation under Cyprus VAT Law L.95(I)/2000 and tax retention), (d) recipients (Lex / Qualia as processor; Cyprus Tax Department on lawful request; banking partners on payment), (e) retention (10-year VAT retention clause stated verbatim with statutory basis), (f) data-subject rights with Cyprus DPC contact, (g) cookies disclosure (auth session cookie only, no marketing trackers). Bilingual document: English (primary text, legally operative draft) first, then Greek section flagged `Πελάτες — Αναγνώριση Επεξεργασίας Δεδομένων` for Fotini's review.
- CREATE `.planning/compliance/README.md` — index page: brief description of each doc, where each should live post-engagement (DPA in counter-signature file, privacy notice on Fotini's website footer, sub-processor list reviewed quarterly), and a one-line `Insufficient evidence` flag for any unconfirmed item (e.g. EU-region Supabase data-residency confirmation pending — Fotini to confirm at first onboarding).

**Depends on:** none

**Why:** ROADMAP acceptance criterion #7 — GDPR docs exist in `.planning/compliance/`. Fotini's risk objection at first pitch was data-protection liability; surfacing real, lawyer-readable scaffolds (not "TODO: write privacy notice") converts that objection. These are pure docs in `.planning/` — they ship in the repo for Fotini to review at the meeting; they do NOT block any code path. Drafted today; signed post-engagement.

**Acceptance Criteria:**
- All four files exist at the paths specified.
- `sub-processors.md` includes a row each for Supabase, Vercel, OpenRouter, Resend, UptimeRobot — five rows minimum.
- `dpa-draft.md` includes the verbatim 10-year VAT retention clause and an explicit `STATUS: DRAFT` flag in the first 20 lines.
- `privacy-notice.md` cites Cyprus VAT Law `L.95(I)/2000` (or the closest accurate Cyprus statute reference — `INSUFFICIENT EVIDENCE` flag if unconfirmed at write time) and includes a Greek-language section heading.
- No file in `.planning/compliance/` contains source code (no `.ts`, `.tsx`, `.js` extensions; no fenced code blocks executing logic — config-style fences for example SQL are fine).
- `README.md` lists every other file in the directory with one-line descriptions.

**Action:**
1. Write `sub-processors.md` as a single Markdown table. Header row: `Vendor | Role | Data accessed | Location | Transfer mechanism | EU residency`. Cite GDPR Art. 28(3)(a–h) under the table for the contractual basis. Include a top note: `STATUS: DRAFT — Fotini's lawyer reviews and counter-signs at engagement.`
2. Write `dpa-draft.md` following the 10-section structure above. Use plain Markdown headings (`##`, `###`). The retention clause must read verbatim: `Records subject to Cyprus tax retention obligations (invoices, receipts, accounting records) are retained for ten (10) years from the end of the relevant tax year, in accordance with Article 8 of the Assessment and Collection of Taxes Law (N.4/1978, as amended) and Cyprus VAT Law L.95(I)/2000.` If the statute citation cannot be verified at write time, prefix the clause with `INSUFFICIENT EVIDENCE: confirm statute reference with Fotini's tax counsel before counter-signature.`
3. Write `privacy-notice.md` with the seven sections listed. Keep paragraphs short (≤ 3 sentences). End with the Greek section header `## Πελάτες — Αναγνώριση Επεξεργασίας Δεδομένων` and a one-line note `(Greek translation to follow — reserved for the Greek translation pass post-engagement.)` This is a legitimate translation-deferred flag, not scope reduction — the English text is the legally operative draft at this stage.
4. Write `README.md` as a four-row table: filename, purpose, status (DRAFT in all four cases), reviewer (Fotini's lawyer / Fotini / Qualia legal / public). Top of file: one-paragraph statement that these documents are scaffolds Fotini's counsel must review before any go-live — they are NOT legally binding until counter-signed.
5. Do NOT include any real personal data (no real client names, real email addresses, real VAT numbers). Use placeholders like `[FIRM NAME]`, `[REGISTERED ADDRESS]`, `[CYPRUS DPC CONTACT EMAIL]`.

**Validation:** (builder self-check)
- `test -d .planning/compliance && test -f .planning/compliance/sub-processors.md && test -f .planning/compliance/dpa-draft.md && test -f .planning/compliance/privacy-notice.md && test -f .planning/compliance/README.md && echo OK` → expect `OK`.
- `grep -c "STATUS: DRAFT" .planning/compliance/dpa-draft.md` → expect ≥ `1`.
- `grep -c "10 years\|ten (10) years" .planning/compliance/dpa-draft.md` → expect ≥ `1`.
- `grep -l "Supabase\|Vercel\|OpenRouter\|Resend\|UptimeRobot" .planning/compliance/sub-processors.md | wc -l` → expect `1` (the file matches all five vendors).
- `find .planning/compliance -name "*.ts" -o -name "*.tsx" -o -name "*.js" | wc -l` → expect `0` (docs only, no code).

**Context:** Read
- @.planning/PROJECT.md (scope + EU region decision)
- @.planning/ROADMAP.md (acceptance criterion #7 wording)
- @supabase/migrations/20260513000002_rls.sql (so the security-measures section cites real controls)
- @supabase/migrations/20260513000004_audit_triggers.sql (so the audit section cites real triggers)

---

## Task 3 — Monthly financial summary view (`/reports` index + `/reports/summary`)

**Wave:** 2
**Persona:** frontend
**Files:**
- CREATE `src/app/(workspace)/reports/page.tsx` — server component, index page. Two navigation cards: "Monthly summary" (links `/reports/summary`) and "Aging report" (links `/reports/aging`). Reuses the Phase 2 page-frame conventions (heading, subtitle, card grid).
- CREATE `src/app/(workspace)/reports/summary/page.tsx` — server component. Reads `?month=YYYY-MM` (default: current month from `new Date()`). Auth + workspace-id lookup via `src/lib/supabase/server.ts`. Computes three figures from the `invoices` table ONLY:
  1. **Total revenue** = `SUM(total) WHERE status IN ('paid')` AND `paid date in month`.
  2. **Outstanding** = `SUM(total) WHERE status IN ('finalized', 'sent')` AND `issued_at within month` (i.e. issued this month, not yet paid).
  3. **Overdue** = `SUM(total) WHERE status IN ('finalized', 'sent') AND due_at < CURRENT_DATE`.
  Breakdown by case: aggregate `total` grouped by `matter_id` with `JOIN matters` for the matter number + title. Breakdown by client: aggregate by `client_id` with `JOIN clients` for the name. NEVER references `trust_ledger`, `retainers.deposit_amount`, or any trust-domain column.
- CREATE `src/app/(workspace)/reports/summary/MonthPicker.tsx` — client component. `<input type="month" value={month} onChange={navigate to /reports/summary?month=YYYY-MM} />`. Replaces history so back-button works.
- CREATE `src/app/(workspace)/reports/summary/SummaryCards.tsx` — server component, accepts the three figures + locale. Renders three large stat cards using `formatMoney` from `src/lib/format.ts`. Trust-isolation footnote at the bottom: `t('reports.trustIsolationNote')` — the literal explanatory sentence. The card layout uses `--surface`, `--text`, `--accent`, `--space-*` tokens; the overdue card uses `--kill` for its accent strip.
- CREATE `src/app/(workspace)/reports/summary/queries.ts` — server-only module (top of file: `import "server-only";`). Exports `getMonthlySummary(client: SupabaseClient, workspaceId: string, year: number, month: number): Promise<MonthlySummary>` where `MonthlySummary = { totalRevenue: string; outstanding: string; overdue: string; byCase: Array<{ matter_id: string; matter_number: string; title: string; total: string }>; byClient: Array<{ client_id: string; name_el: string; name_en: string; total: string }> }`. ALL queries are `from('invoices').select(...)` — no `from('trust_ledger')`, no `from('retainers')`.
- MODIFY `src/components/SidebarNav.tsx` (or `src/components/AppNav.tsx` — whichever owns the workspace sidebar links) — add a "Reports" link pointing to `/reports`. Use the `nav.reports` i18n key (already present in both locale files).

**Depends on:** Task 1 (consumes the `reports.*` i18n namespace and `formatMoney` from the existing format seam — not Task 1 directly, but the i18n additions land in Wave 1)

**Why:** REQ-015 (REP-01) — Fotini's monthly summary view is the second pitch moment ("here's what your month looks like"). The trust-isolation invariant is the load-bearing compliance claim: client funds are NEVER mixed with operating revenue. By keeping the entire summary query graph rooted in `invoices` we make the absence of `trust_ledger` a property of the source code, verifiable by grep — not a documentation promise. The month picker is server-driven so the URL is shareable and back-button works; no client-side state needed.

**Acceptance Criteria:**
- Visiting `/reports/summary` (no query string) renders the current month's figures: total revenue, outstanding, overdue, broken down by case AND by client. All amounts use `formatMoney` (Greek default locale shows `1.234,56 €`, EN-CY shows `€1,234.56`).
- The page renders three stat cards in a responsive grid (1 column at 375px mobile, 3 columns at ≥ 768px). The overdue card uses `--kill` as its visual accent (top strip or icon color).
- Changing the `<input type="month">` value navigates to `/reports/summary?month=2026-04` and re-renders the page for that month. Server-side, not client-side fetching.
- Trust-isolation footnote appears below the cards: `reports.trustIsolationNote` text rendered with `--dim` color, sub-heading typography.
- Empty state: if no invoices exist for the month, all three cards show `€0,00` and a muted hint reads `t('reports.noActivity')` (key added in Task 1).
- Screen reader: each stat card has `aria-label="<card label>: <amount>"` so the figures are read aloud.
- Keyboard: month picker is reachable via Tab; cards are not interactive; the "Open aging report" link in the page footer is reachable.
- Page works at 375px and 1440px; Greek and English; light theme only.

**Action:**
1. Query layer (`queries.ts`):
   - `getMonthlySummary` accepts the workspace ID + year + month (both `number`).
   - Compute month boundaries: `const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString(); const monthEnd = new Date(Date.UTC(year, month, 1)).toISOString();`
   - Revenue query: `await client.from('invoices').select('total').eq('workspace_id', workspaceId).eq('status', 'paid').gte('paid_at', monthStart).lt('paid_at', monthEnd)` — if `paid_at` column exists (check the schema; if absent use `finalized_at` as a proxy and note in code comment). Sum the returned `total` strings via `reduce(parseFloat)`.
   - Outstanding query: `.in('status', ['finalized', 'sent']).gte('issued_at', monthStart).lt('issued_at', monthEnd)`. Sum.
   - Overdue query: `.in('status', ['finalized', 'sent']).lt('due_at', new Date().toISOString())`. Sum.
   - Breakdown by case: `select('matter_id, total, matters(matter_number, title)').eq('workspace_id', workspaceId).in('status', ['paid', 'finalized', 'sent']).gte('issued_at', monthStart).lt('issued_at', monthEnd)` — aggregate in JS via a `Map<matter_id, number>`. The supabase-js v2 SDK does not have a GROUP BY operator — server-side aggregation by JS reduce is the idiomatic approach.
   - Breakdown by client: same shape, group by `client_id`.
   - Return shape: every numeric field is a `toMoney`-formatted string for consistency with `InvoiceRow.total`.
   - HARD RULE in a top-of-file comment: `// This module references the `invoices` table only. NEVER add `trust_ledger`, `retainers`, or `trust_*` joins here — the trust-isolation invariant is grep-verified in Phase 6 verification.`
2. Server component (`summary/page.tsx`):
   - Mark `'use cache: no-store'` is unnecessary here; this is a server component reading fresh data on each request.
   - Read locale via `getLocale()` from next-intl.
   - Parse the `month` searchParam: `const [year, monthStr] = (searchParams.month ?? defaultYM()).split('-'); const monthNum = parseInt(monthStr, 10);`. Default to current YM.
   - Call `getMonthlySummary`; render `<SummaryCards summary={data} locale={locale} />` and `<MonthPicker initial={...} />`.
   - Wrap in the standard workspace page frame (heading: `t('reports.summary')`, subtitle: name of the month formatted via `formatDate`).
3. `SummaryCards.tsx`:
   - Three cards in a `grid-cols-1 md:grid-cols-3 gap-[var(--space-4)]` layout (or the project-standard space token — check existing dashboard cards).
   - Each card: `<article style={{ background: 'var(--surface)', borderTop: '3px solid var(--accent)' }}>` for revenue/outstanding (terracotta strip), `borderTop: '3px solid var(--kill)'` for overdue.
   - Typography: amount uses display-scale tabular numerals (`font-variant-numeric: tabular-nums`); label uses caption-scale uppercase.
   - Below cards: two two-column tables — "By case" and "By client", reusing the `Table` primitive from `src/components/Table.tsx`. Each row: name + total.
   - Footnote `<p style={{ color: 'var(--dim)' }}>{t('reports.trustIsolationNote')}</p>`.
4. `MonthPicker.tsx`:
   - `'use client';`
   - `<input type="month" defaultValue={initial} onChange={e => router.replace('/reports/summary?month=' + e.target.value)} />`
   - Style: matches existing form inputs in `/invoices/new` (read `NewInvoiceForm.tsx` for the exact input class names / inline styles).
5. Sidebar nav update: add the Reports link between Drafts and Trust ledger (alphabetical or by feature group — match existing ordering). Use the same icon component pattern as other entries.

**Validation:** (builder self-check)
- `test -f src/app/\(workspace\)/reports/page.tsx && test -f src/app/\(workspace\)/reports/summary/page.tsx && test -f src/app/\(workspace\)/reports/summary/queries.ts && echo OK` → expect `OK`.
- `npx tsc --noEmit 2>&1 | grep -cE "reports/"` → expect `0`.
- **TRUST-ISOLATION GREP (load-bearing):** `grep -rE "trust_ledger|trust\\.ledger|from\\(['\"]trust_ledger['\"]\\)|retainers\\.deposit|from\\(['\"]retainers['\"]\\)" src/app/\(workspace\)/reports/ src/lib/resend/` → expect `0`. This is the single most important contract in the phase.
- `grep -c "service-role\|createServiceClient\|SUPABASE_SERVICE_ROLE_KEY" src/app/\(workspace\)/reports/` → expect `0`.
- `grep -rc "invoices" src/app/\(workspace\)/reports/summary/queries.ts` → expect ≥ `3` (three SELECTs from `invoices`).
- Manual smoke (builder runs `npm run dev`, opens `http://localhost:3001/reports/summary` after login): page renders, all three cards show numbers, month picker switches months, Greek toggle relabels the page.
- Console errors check (browser DevTools, builder-confirmed): zero errors on page load in both locales.

**Context:** Read
- @.planning/PROJECT.md
- @.planning/DESIGN.md (color palette + typography scale — use `--surface`, `--accent`, `--kill`, `--text`, `--dim` tokens)
- @src/lib/supabase/server.ts (the only DB seam allowed here)
- @src/lib/format.ts (the only formatting seam)
- @src/lib/totals.ts (string-money semantics)
- @src/components/Table.tsx (table primitive for the by-case / by-client breakdowns)
- @src/app/\(workspace\)/dashboard/page.tsx (page-frame conventions + stat card patterns to mirror)
- @src/app/\(workspace\)/invoices/page.tsx (workspace page conventions, locale-aware client/matter joins)
- @src/components/SidebarNav.tsx (sidebar link insertion point)
- @messages/el-CY.json, @messages/en-CY.json (after Task 1's additions land)

**Design:**
- Register: product
- Tokens used: `var(--surface)`, `var(--surface-2)`, `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--accent)`, `var(--kill)`, `var(--line)`, `--space-*` scale, display/h1/h2/caption type tokens, `font-variant-numeric: tabular-nums` on every money figure.
- Scope: page + components
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\)/reports/summary/` pre-commit; commit blocked on critical findings.

---

## Task 4 — Aging report (`/reports/aging`) + Draft Reminder modal + send action

**Wave:** 2
**Persona:** frontend
**Files:**
- CREATE `src/app/(workspace)/reports/aging/page.tsx` — server component. Reads RLS-scoped `invoices` joined with `clients` and `matters` WHERE `status IN ('finalized', 'sent') AND due_at < CURRENT_DATE`. Computes `days_overdue = DATE_DIFF(CURRENT_DATE, due_at, 'day')` server-side. Buckets into 0–30, 31–60, 60+. Sorts by `days_overdue DESC`. Returns to the client component: `OverdueInvoice[]` with `{ id, invoice_number, client_id, client_name, client_email, client_preferred_language, matter_number, matter_title, total, currency, due_at, days_overdue, bucket: '0-30' | '31-60' | '60+' }`.
- CREATE `src/app/(workspace)/reports/aging/queries.ts` — server-only. `getOverdueInvoices(client, workspaceId): Promise<OverdueInvoice[]>` — single query, no `trust_ledger` or `retainers` reference.
- CREATE `src/app/(workspace)/reports/aging/AgingTable.tsx` — client component (needs row selection state). Three accordion-style bucket sections with a `<details open>` element each, bucket totals row, a `<table>` per bucket with checkbox column + client + matter + invoice_number + amount + days_overdue. Per-row status pill from `StatusPill.tsx`: `--warn` for 31–60, `--kill` for 60+. "Draft Reminders" CTA at the top, disabled until ≥ 1 row selected. Clicking opens the modal.
- CREATE `src/app/(workspace)/reports/aging/DraftReminderModal.tsx` — client component. Receives the selected invoice IDs. On open, sequentially calls `draftReminderAction(invoiceId)` for each — server action fetches the invoice + client, calls `callOpenRouter({ kind: 'reminder', ... })` with the client's preferred language. Renders a list of editable cards: one per invoice, with `<input>` for subject and `<textarea>` for body (pre-populated from AI). Each card has its own "Send" button that calls `sendReminderAction(invoiceId, subject, body)` → server action calls `sendReminderEmail` from `src/lib/resend/client.ts`. Modal is `<dialog>` (native HTML), Escape-to-close, focus trap.
- CREATE `src/app/(workspace)/reports/aging/actions.ts` — two server actions:
  1. `draftReminderAction(invoiceId: string): Promise<DraftReminderResult>` — auth + workspace check, RLS-scoped invoice fetch (with client + matter), guard rails: must have `invoice_number !== null`, `status IN ('finalized', 'sent')`, `due_at < CURRENT_DATE`, client must have `email`. Calls `callOpenRouter({ kind: 'reminder', text: 'reminder for <invoice_number> <client_name> <language>', contextData: { invoice, client, language: client.preferred_language } })`. Returns `{ ok: true, subject, body_html, body_text, to } | { ok: false, error }`.
  2. `sendReminderAction(invoiceId: string, subject: string, body_html: string): Promise<SendResult>` — auth + workspace check, fetch invoice (RLS), validate `client.email` still present, validate `subject.length <= 200` and `body_html.length <= 8000`, sanitize HTML to remove `<script>` tags via a simple regex strip (no full DOM-sanitization library — the body is composed server-side from the AI which already returns clean HTML, and we run server-side in a non-rendering context; for the Send path the HTML is forwarded to Resend whose API renders it in the recipient's email client where script tags are inert). Calls `sendReminderEmail`. On success, inserts an `audit_log` row noting the send (reuses the existing audit-trigger pattern — DO NOT add a new table). Returns the typed result.

**Depends on:** Task 1 (consumes `sendReminderEmail` adapter, `kind: 'reminder'` OpenRouter mode, `reminders.*` + `aging.*` i18n keys)

**Why:** REQ-016 (REP-02) — aging report + AI-drafted bilingual email reminders is the third pitch moment ("here's what's overdue, here's a reminder ready to send"). The bucket coloring (--warn for 31–60, --kill for 60+) gives Fotini an at-a-glance read; the draft-then-review flow keeps the human in the loop before any email leaves the building. The two server actions are the only seam between the UI and the adapters — they enforce the guard rails (must be finalized, must have client email, must have invoice_number) that prevent embarrassing demo failures ("Lex sent a reminder for invoice [null]"). The audit-log row on send means Fotini can prove deliverability post-meeting.

**Acceptance Criteria:**
- Visiting `/reports/aging` renders three bucket sections (0–30 days, 31–60 days, 60+ days). Each bucket shows its row count and total amount. Buckets with zero overdue invoices show `t('aging.bucketEmpty')` muted.
- Each row shows: checkbox, client name (locale-aware), matter number, invoice_number, total (formatMoney), days_overdue (e.g. "42 days"), status pill (--warn for 31–60, --kill for 60+).
- Selecting one or more rows enables the "Draft Reminders" button; clicking it opens the modal.
- Modal sequentially generates a reminder for each selected invoice. While generating, shows a per-row spinner with `t('reminders.drafting')`. Once ready, shows editable subject + body, recipient email, and a "Send" button per row.
- Clicking Send (with `DEMO_CACHE=true`) returns `{ ok: true, id: 'demo-cached-...' }`; the UI replaces the card with a green-stripe success state showing `t('reminders.sent')` + the cached send ID. The audit_log table records the send event.
- If `client.email` is null on a selected invoice, the modal shows that row with a disabled state and `t('reminders.clientMissingEmail')` — no AI call, no send.
- Greek-language client → reminder body is in Greek (formal register: contains "Αξιότιμ" or "παρακαλούμε" or "οφειλόμενο"). English-language client → reminder body is in English (contains "Dear" or "kindly" or "outstanding").
- Rate limiting: selecting 11+ rows and clicking Send-all shows the 11th row with `t('reminders.errorRateLimit')` and a 60-second cooldown notice — the in-process limiter from Task 1 enforces this.
- Empty state: if no overdue invoices exist, the page shows a centered `t('aging.noOverdueEmpty')` message and a link back to `/reports`.
- Keyboard: every checkbox, button, and modal field is reachable via Tab; modal traps focus; Escape closes the modal; status pills have proper `role="status"` and screen-reader text.
- Page works at 375px (table becomes a stacked card layout per row) and 1440px (full table); Greek and English; light theme only.

**Action:**
1. Query layer (`queries.ts`):
   - Single SELECT: `from('invoices').select('id, invoice_number, total, currency, due_at, status, client_id, matter_id, clients(name_el, name_en, email, preferred_language), matters(matter_number, title)').eq('workspace_id', workspaceId).in('status', ['finalized', 'sent']).lt('due_at', today).order('due_at', { ascending: true });`
   - Today = `new Date().toISOString().slice(0, 10)`.
   - Compute `days_overdue` and `bucket` in JS post-fetch. Bucket assignment: 0–30 inclusive of 0 (today exactly due → not overdue, would be excluded by `.lt`); 31–60 inclusive of 31; 60+ for anything ≥ 61. (Adjust to roadmap's 60+ which says "60+ days past due_at"; if the roadmap wording is strict on >60 vs ≥60, default to >60 and note in code.)
   - HARD RULE comment at top: `// invoices-only query. NEVER add trust_ledger / retainers JOINs — trust-isolation invariant grep-verified.`
2. Page (`page.tsx`):
   - Server component. Auth + workspace fetch (standard pattern).
   - Call `getOverdueInvoices`. Pass the array into `<AgingTable rows={rows} />`.
   - Page header: `t('aging.title')` with subtitle showing total overdue across all buckets in `formatMoney`.
3. `AgingTable.tsx`:
   - `'use client';` — needs `useState<Set<string>>` for selected IDs.
   - Three `<details open>` sections (one per bucket). Inside each: `<table>` with the `Table` primitive's `<thead>` styling, body rows from the slice of `rows` matching the bucket.
   - Each row: `<input type="checkbox" checked={selected.has(id)} onChange={toggle(id)} />`, then cells.
   - Top toolbar: `<button disabled={selected.size === 0} onClick={() => setModalOpen(true)}>{t('aging.draftRemindersBtn')} ({selected.size})</button>` styled as a CTA (--accent bg, --bg text). Disabled state uses --dim.
   - Each bucket total row at the bottom of its `<table>` shows `Σύνολο: <formatMoney>` (Greek) / `Total: <formatMoney>` (English).
   - Render `<DraftReminderModal open={modalOpen} onClose={() => setModalOpen(false)} invoiceIds={Array.from(selected)} />` at the bottom.
4. `DraftReminderModal.tsx`:
   - `'use client';`
   - `<dialog>` element. On `open` prop change, call `dialogRef.current?.showModal()` / `close()`.
   - `useEffect` on open: sequentially call `draftReminderAction(id)` for each invoice; build a `Map<id, DraftState>` where `DraftState = { status: 'loading' | 'ready' | 'error' | 'sending' | 'sent'; subject?: string; body_html?: string; body_text?: string; to?: string; error?: string; sendId?: string }`.
   - Render a list — one `<section>` per invoice. While loading: spinner + `t('reminders.drafting')`. Once ready: editable `<input>` for subject, `<textarea>` for body (showing `body_text` — plain-text editing; we send the same text on submit, server constructs a minimal HTML wrapper if needed; alternatively send the body verbatim as `body_html`). Send button.
   - On Send click: call `sendReminderAction(invoiceId, subject, body_html)` (we forward the AI's `body_html` because the AI returned it sanitized; if the user edited only the plain text, we wrap it in `<p>` server-side — handled in `sendReminderAction`). On success, swap the section into a success card; on failure, show the typed error message via the matching i18n key.
   - Focus trap: when modal opens, focus the first interactive element; on Escape, close + restore focus to the page's "Draft Reminders" button.
5. `actions.ts`:
   - `'use server';`
   - `draftReminderAction(invoiceId: string)`:
     - Auth: `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { ok: false, error: 'unauthorized' };`
     - Workspace fetch: same pattern as `createInvoiceAction` (read `src/app/(workspace)/invoices/actions.ts` for the exact lines).
     - Invoice fetch (RLS auto-scoped): `from('invoices').select('id, invoice_number, status, due_at, total, currency, matters(title), clients(name_el, name_en, email, preferred_language)').eq('id', invoiceId).maybeSingle();`
     - Guard rails:
       - `if (!invoice) return { ok: false, error: 'not_found' };`
       - `if (invoice.status !== 'finalized' && invoice.status !== 'sent') return { ok: false, error: 'not_eligible' };`
       - `if (!invoice.invoice_number) return { ok: false, error: 'no_invoice_number' };`
       - `const dueAt = new Date(invoice.due_at); if (dueAt >= new Date()) return { ok: false, error: 'not_overdue' };`
       - `if (!invoice.clients?.email) return { ok: false, error: 'no_email' };`
     - Build `ReminderContext` and `ReminderClientCtx`. Compute `days_overdue`.
     - Build the prompt text: `const text = 'reminder for ' + invoice.invoice_number + ' ' + (invoice.clients.preferred_language === 'el' ? invoice.clients.name_el : invoice.clients.name_en).toLowerCase().split(' ')[0] + ' ' + invoice.clients.preferred_language;` — this is the cache-lookup key shape. (Cache entries in Task 1 use this exact normalized form.)
     - Call `callOpenRouter({ kind: 'reminder', text, contextData: { invoice: reminderCtx, client: clientCtx, language: invoice.clients.preferred_language } })`.
     - On success: return `{ ok: true, subject, body_html, body_text, to: invoice.clients.email }`.
     - On error: return `{ ok: false, error: result.error, message: result.message }`.
   - `sendReminderAction(invoiceId: string, subject: string, body_html: string)`:
     - Auth + workspace + invoice fetch (same guard rails — re-validate even after the draft step because state may have changed between drafting and sending).
     - Validate inputs: `z.object({ invoiceId: z.string().regex(UUID_RE), subject: z.string().trim().min(1).max(200), body_html: z.string().trim().min(1).max(8000) }).safeParse(...)`.
     - Sanitize: `body_html = body_html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+=/gi, ' data-removed=');` — defense-in-depth; the AI does not produce script tags but a user could paste one into the textarea.
     - Build the plain-text fallback: `const body_text = body_html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();`
     - Call `sendReminderEmail({ to: invoice.clients.email, subject, html: body_html, text: body_text, from: 'Lex <onboarding@resend.dev>' })`.
     - On success: insert `audit_log` via the existing audit-trigger surface (no new code path — `from('audit_log').insert({ action: 'reminder_sent', resource_id: invoice.id, metadata: { resend_id: result.id, to: invoice.clients.email } })` if the table is user-writable; otherwise add a no-op `UPDATE` on the invoice that the existing trigger captures — read `supabase/migrations/20260513000004_audit_triggers.sql` first to decide which path is sound).
     - Return `{ ok: true, id: result.id }` or `{ ok: false, error: result.error }`.
6. Status-pill colors: in `AgingTable.tsx`, the pill for 31–60 uses `--warn` (yellow-amber); for 60+ uses `--kill` (red). Reuse `StatusPill.tsx` — pass `kind="warn" | "kill"`.

**Validation:** (builder self-check)
- `test -f src/app/\(workspace\)/reports/aging/page.tsx && test -f src/app/\(workspace\)/reports/aging/actions.ts && test -f src/app/\(workspace\)/reports/aging/DraftReminderModal.tsx && echo OK` → expect `OK`.
- `npx tsc --noEmit 2>&1 | grep -cE "reports/aging"` → expect `0`.
- **TRUST-ISOLATION GREP (load-bearing):** `grep -rE "trust_ledger|trust\\.ledger|from\\(['\"]trust_ledger['\"]\\)|retainers\\.deposit|from\\(['\"]retainers['\"]\\)" src/app/\(workspace\)/reports/aging/` → expect `0`.
- `grep -c "service-role\|createServiceClient\|SUPABASE_SERVICE_ROLE_KEY" src/app/\(workspace\)/reports/aging/` → expect `0`.
- `grep -c "callOpenRouter" src/app/\(workspace\)/reports/aging/actions.ts` → expect ≥ `1`.
- `grep -c "sendReminderEmail" src/app/\(workspace\)/reports/aging/actions.ts` → expect ≥ `1`.
- `grep -c "kind: 'reminder'\|kind:\"reminder\"" src/app/\(workspace\)/reports/aging/actions.ts` → expect ≥ `1`.
- Manual smoke: builder runs `DEMO_CACHE=true npm run dev`, opens `/reports/aging` (after seeding overdue rows; seed already includes ≥ 2 overdue invoices per the seed comments), selects two rows, clicks "Draft Reminders", confirms modal opens, confirms Greek body for Greek client and English body for English client, clicks Send on one card, confirms success state.

**Context:** Read
- @.planning/PROJECT.md
- @.planning/DESIGN.md (color tokens — especially `--warn` and `--kill` for bucket pills)
- @src/lib/supabase/server.ts
- @src/lib/format.ts
- @src/lib/openrouter/client.ts (after Task 1's reminder extension lands)
- @src/lib/openrouter/types.ts
- @src/lib/resend/client.ts (after Task 1 lands)
- @src/components/StatusPill.tsx
- @src/components/Table.tsx
- @src/app/\(workspace\)/invoices/actions.ts (auth + workspace pattern + audit_log insertion convention)
- @supabase/migrations/20260513000004_audit_triggers.sql (audit table shape + which actions trigger it)
- @supabase/seed.sql (locate overdue seed rows for the manual smoke)
- @messages/el-CY.json, @messages/en-CY.json (after Task 1's additions)

**Design:**
- Register: product
- Tokens used: `var(--surface)`, `var(--surface-2)` (modal background), `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--accent)` (CTA), `var(--warn)`, `var(--kill)` (bucket pills), `var(--ok)` (success state), `var(--line)`, `--space-*` scale, body / caption type tokens, tabular-nums on every money + days_overdue figure.
- Scope: page + multiple components (table, modal, success state, error state)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\)/reports/aging/` pre-commit; commit blocked on critical findings.

---

## Task 5 — Full executable smoke-test suite (`tests/smoke.mjs`)

**Wave:** 3
**Persona:** backend
**Files:**
- CREATE `tests/smoke.mjs` — Node.js script executed as `DEMO_CACHE=true node tests/smoke.mjs http://localhost:3001` (or with no URL arg defaulting to `http://localhost:3001`). Exits 0 on all checks pass; exits non-zero with the first failure line and a count summary at the end.
- CREATE `tests/smoke-helpers.mjs` — shared helpers: `assert(cond, msg)`, `fetchJson(url, opts)`, `fetchHtml(url, opts)`, `loginViaInbucket(email, baseUrl)` (polls the local inbucket API at `http://localhost:54324/api/v1/mailbox/<inbox>` for the magic-link URL and follows it), `signedSupabaseClient()` (uses the seeded session for authenticated requests).
- MODIFY `package.json` — append a script `"test:smoke": "DEMO_CACHE=true node tests/smoke.mjs"`. Append `"test:all": "npm run test:ai-injection && npm run test:ai-preflight && npm run test:ai-concurrent && npm run test:smoke"`. This is the single command Task 6 (deploy) runs as the pre-deploy gate.

**Depends on:** Task 3 (smoke hits `/reports/summary`), Task 4 (smoke hits `/reports/aging` and exercises the reminder send via DEMO_CACHE)

**Why:** Acceptance criterion #6 — full smoke suite exits 0. This is the single deterministic check that says "every Phase 1–6 path still works." Running the suite locally before `vercel --prod` catches breakage before it hits production, which on demo day is the difference between a confident pitch and a panicked rollback. Every check below maps to a concrete acceptance criterion or risk note in the roadmap.

**Acceptance Criteria:**
- `npm run test:smoke` against a running local stack (`npm run dev` + `npx supabase start`) exits 0.
- The script exercises ALL 9 checks below — each check prints a green line on pass and a red line + exits non-zero on first fail.
- Locale toggle check: passes when EN and GR render different `<title>` content on `/dashboard` without a full reload (verified by HTTP fetch of both locales and asserting the rendered HTML contains the locale-matching string).
- Console-error check: explicitly documents that this is a builder-manual check (loading `/dashboard` in Greek and confirming zero console errors in DevTools); the script prints the URL and pauses with `Press Enter when verified...` only if `INTERACTIVE=1` is set, otherwise auto-passes with a printed reminder.

**The 9 checks (each a top-level function in `smoke.mjs`):**
1. **HTTP 200 sweep:** `/`, `/login`, `/dashboard`, `/clients`, `/invoices`, `/trust`, `/drafts`, `/reports`, `/reports/summary`, `/reports/aging`, `/quotations`, `/retainers`, `/timer`. Authenticated routes use the seeded session cookie.
2. **Auth flow (inbucket-based):** POST to `/login` with `fawzi.ygoussous@gmail.com` (or the seeded test email), poll `http://localhost:54324/api/v1/mailbox/<inbox>` for the magic-link email (timeout 30s), extract the magic-link URL, GET it, assert redirect lands on `/dashboard` within 30 seconds.
3. **PDF cold-start:** Sleep 5 minutes (or skip with `SKIP_COLD_PDF=1` for fast iterative runs), then GET `/api/pdf/invoice/<seed-finalized-invoice-id>`, assert HTTP 200, assert response time < 5 seconds, assert the PDF binary contains the Greek font glyphs (verify by checking `Content-Length > 10000` and `Content-Type: application/pdf`; deeper diacritics-text-extraction is owned by `tests/pdf-smoke.mjs` — smoke just invokes that script: `await import('./pdf-smoke.mjs').then(m => m.runSmoke?.())`).
4. **AI query latency:** With `DEMO_CACHE=true`, call the AI query path (server action via a POST to `/api/ai/query` if such a route exists, or programmatically import `aiQueryAction` and invoke it) with the cached prompt `who's overdue?`. Assert response time < 3 seconds. Assert response text contains both seeded overdue invoice numbers.
5. **Trust isolation:** Read the trust-only seeded client (client #10 per seed.sql comments). Query revenue via `getMonthlySummary` for that client across the current year. Assert `byClient` entry for that client's `total === '0.00'` (the client has retainer deposits but zero invoiced revenue). Assert the `byClient` array does NOT contain any retainer balance.
6. **Invoice numbering concurrency:** Re-invoke the existing `tests/ai-concurrent-finalize.mjs` programmatically: `await import('./ai-concurrent-finalize.mjs').then(m => m.runSmoke?.())`. If that script is not module-exportable, shell out: `await execFile('node', ['tests/ai-concurrent-finalize.mjs'])`.
7. **Locale toggle:** GET `/dashboard` with `Cookie: NEXT_LOCALE=el-CY`, assert HTML contains `Πίνακας ελέγχου` (Greek dashboard heading). GET again with `Cookie: NEXT_LOCALE=en-CY`, assert HTML contains `Dashboard`.
8. **Console errors on dashboard:** Builder-manual check (per acceptance note above); printed as a green `[ ] MANUAL: open http://localhost:3001/dashboard in Greek and confirm 0 console errors` line — automated as a no-op pass.
9. **API latency:** GET each of the workspace API endpoints (e.g. `/api/pdf/invoice/<id>`, `/api/ai/query` if exposed, `/api/ai/reminder` if exposed). Assert each completes in < 500ms. Cold PDF excluded from this — it has its own dedicated 5s budget in check #3.

**Action:**
1. Build `tests/smoke-helpers.mjs` first:
   - `assert(cond, msg)`: if `!cond`, `console.error('FAIL:', msg); process.exit(1);`. Otherwise `console.log('  pass:', msg);`.
   - `fetchHtml(url, opts)`: wraps `fetch`, asserts status, returns text.
   - `loginViaInbucket(email, baseUrl)`: POSTs to `/login`, polls inbucket REST API (`http://localhost:54324/api/v1/mailbox/<inbox-id>/messages`, where `inbox-id` is the local-part of the email), times out after 30s, returns the magic-link URL.
2. Build `tests/smoke.mjs`:
   - Read CLI args: `const baseUrl = process.argv[2] ?? 'http://localhost:3001';`
   - Print a banner: `=== Lex smoke suite (Phase 6 acceptance gate) ===`.
   - Run each of the 9 checks in sequence. Each check is a top-level `async function check_<n>_<name>()` that calls `assert(...)` repeatedly.
   - Track timing per check and print the elapsed ms at the end of each.
   - Final summary: `=== <total-pass> / <total-checks> passed in <total-elapsed>ms ===`. If any failed, exit 1.
3. The trust-isolation check (check #5) is the LOAD-BEARING demo claim. Implement it carefully:
   - Look up the trust-only client's UUID from the seed (per seed.sql comments: client #10 — typically the highest `c0010` UUID; confirm by reading the seed).
   - Call `getMonthlySummary` for the current year-month, then iterate `byClient` to find the trust-only client. Assert the entry's `total === '0.00'`. If the client is absent from `byClient` entirely (because they have zero revenue), that's also a pass — assert via `byClient.find(c => c.client_id === TRUST_ONLY_CLIENT_ID)?.total ?? '0.00' === '0.00'`.
   - Separately, query `from('trust_ledger').select('debit_amount').eq('client_id', TRUST_ONLY_CLIENT_ID)`. Assert `SUM > 0` (the retainer deposit exists). This proves trust state exists for that client but is invisible to revenue.
4. The locale-toggle check (check #7) uses cookies; document in code that next-intl reads `NEXT_LOCALE` from the cookie store by default — if a different mechanism is in use, read `src/i18n/request.ts` first to find the actual cookie/header key.
5. The PDF cold-start check (#3) defaults to skipping the 5-minute wait unless `SLOW=1` is set in env. Print `SKIPPED (set SLOW=1 to enable 5-minute cold-start wait)` when skipping.

**Validation:** (builder self-check)
- `test -f tests/smoke.mjs && test -f tests/smoke-helpers.mjs && grep -c '"test:smoke"' package.json | grep -q 1 && echo OK` → expect `OK`.
- `node --check tests/smoke.mjs` → expect exit 0 (syntax valid).
- `node --check tests/smoke-helpers.mjs` → expect exit 0.
- With `npx supabase start` running and `npm run dev` running locally: `npm run test:smoke` → expect exit 0 and all 9 checks green.
- `grep -c "trust_ledger" tests/smoke.mjs` → expect ≥ `1` (the trust-isolation check explicitly queries the trust ledger to prove it has data, but that data is invisible to revenue — so the smoke test ITSELF must reference trust_ledger; this is the only file in Phase 6 outside the existing trust UI surfaces where the reference is permitted).
- `grep -c "TRUST_ONLY\|trust-only\|trust_only" tests/smoke.mjs` → expect ≥ `1` (the trust-isolation check is explicit).

**Context:** Read
- @.planning/ROADMAP.md (Phase 6 smoke-test section)
- @tests/pdf-smoke.mjs
- @tests/ai-injection.mjs
- @tests/ai-preflight.mjs
- @tests/ai-concurrent-finalize.mjs
- @supabase/seed.sql (trust-only client UUID + finalized invoice IDs for HTTP smoke)
- @supabase/config.toml (confirm inbucket port is 54324 — default Supabase local stack)
- @src/i18n/request.ts (locale cookie/header mechanism)
- @src/app/api/ (existing API route shapes — confirm which paths exist before asserting HTTP 200 on them)
- @package.json

---

## Task 6 — Deploy to Vercel + post-deploy verification

**Wave:** 4
**Persona:** none
**Files:**
- CREATE `.planning/phase-6-deploy.md` — deploy runbook + post-deploy verification report. Filled in by the builder as they execute. Sections: (1) Vercel link status (UNKNOWN at plan time; first builder action is to check), (2) commit + push, (3) `vercel --prod` output (stdout/stderr captured), (4) production URL, (5) post-deploy verification table (the 5 checks from `rules/deployment.md`), (6) UptimeRobot check (visit URL, confirm UP), (7) Resend domain config status (SPF/DKIM/DMARC — if Resend was used with custom domain; sandbox sender if not), (8) Go/No-Go decision, (9) any deviations.
- MODIFY `OPERATOR.md` (CREATE if absent) — append a `## Phase 6 production secrets` section listing the required production env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`, `DEMO_CACHE=true` for the pitch). For each, note whether it must be set in Vercel env or is local-only.
- MODIFY `.env.local.example` — add a brief comment block noting that `RESEND_API_KEY` is optional in dev (DEMO_CACHE handles it) but should be set in Vercel production env if reminder emails will fire live.

**Depends on:** Task 5 (deploy ONLY after smoke suite passes locally — this is the locked decision)

**Why:** Acceptance criterion #4 — `vercel --prod` exits 0 and `curl <prod-url>` returns 200. Acceptance criterion #5 — magic-link email to Fotini's test address arrives within 30s. Acceptance criterion #8 — UptimeRobot shows UP after deploy. This task is the final gate. Without it, there is no demo URL to point to. The Vercel link status is UNKNOWN at plan time, so the first action in this task is `vercel link` to discover the state — the runbook documents whichever path is taken (link vs already-linked).

**Acceptance Criteria:**
- `.planning/phase-6-deploy.md` exists and is filled in with every section completed (no `TODO` placeholders left at the time the task completes).
- `vercel link` status is documented (either "already linked to <project>" or "linked fresh to <project>" with the team/scope shown).
- `vercel --prod` command output is captured in the runbook. Exit code 0 documented.
- `curl -s -o /dev/null -w "%{http_code}" <prod-url>` returns `200`. Captured in the runbook.
- `curl -s -o /dev/null -w "%{http_code}" <prod-url>/login` returns `200`. Captured.
- `curl -w "%{time_total}" -s -o /dev/null <prod-url>/dashboard` (with valid auth cookie) returns `< 0.5` seconds. Captured.
- UptimeRobot status (https://stats.uptimerobot.com/bKudHy1pLs) is documented as UP, with a screenshot URL or timestamp note.
- Magic-link email arrives in Fotini's test inbox within 30 seconds of `/login` submission against the prod URL. Captured.
- Production env vars verified in Vercel dashboard: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` set. `RESEND_API_KEY` set OR `DEMO_CACHE=true` set (one of the two paths is live).
- Go/No-Go decision recorded with the timestamp (target: 1 hour before the pitch meeting).

**Action:**
1. **Pre-flight (local):**
   - Confirm Tasks 1–5 are committed on the feature branch.
   - Run `DEMO_CACHE=true npm run test:smoke` against the local stack one final time. If anything red: STOP, fix, do not deploy.
   - Run `npx tsc --noEmit` — expect exit 0.
   - Run `npm run lint` — expect exit 0.
2. **Vercel link discovery:**
   - From the project root: `vercel whoami`. Note the active user.
   - `vercel link --yes` if not already linked, OR `vercel project ls` if linked — discover the project name and team.
   - Document the result in `.planning/phase-6-deploy.md` section 1.
3. **Production env vars:**
   - `vercel env ls production` — list. Compare against the required list in `OPERATOR.md`.
   - For any missing var, add via `vercel env add <name> production` (paste value from `.env.local`).
   - Set `DEMO_CACHE=true` in production env if `RESEND_API_KEY` and/or `OPENROUTER_API_KEY` are not yet provisioned. This is the pitch-mode fallback.
4. **Deploy:**
   - `git push origin feature/bootstrap` (current branch per `git status` is `feature/bootstrap`). Per `rules/security.md`, feature branches only — do NOT push to main.
   - `vercel --prod` (deploys the current branch's HEAD to production). Capture the full stdout/stderr to `.planning/phase-6-deploy.md` section 3.
   - On exit 0, capture the production URL the CLI prints.
5. **Pre-warm routes:** `curl -s <prod-url>/dashboard >/dev/null; curl -s <prod-url>/reports/summary >/dev/null; curl -s <prod-url>/reports/aging >/dev/null` — first hit pays the cold-start tax so Fotini's first click is warm.
6. **Post-deploy verification (the 5 checks from `rules/deployment.md`):**
   - HTTP 200 on `/` — `curl -s -o /dev/null -w "%{http_code}" <prod-url>` → 200.
   - Auth flow — submit `/login` from a fresh browser, confirm magic-link email arrives within 30 seconds. Click it. Confirm redirect to `/dashboard`.
   - Console errors — open prod `/dashboard` in DevTools, confirm zero errors. Repeat on `/reports/summary` and `/reports/aging`.
   - API latency — `curl -w "%{time_total}" -s -o /dev/null <prod-url>/api/pdf/invoice/<seed-invoice-id>` (warm hit, expect < 500ms after pre-warm).
   - UptimeRobot — visit https://stats.uptimerobot.com/bKudHy1pLs, confirm the Lex monitor shows UP. (If no monitor exists yet, document the gap; Phase 6 does not block on creating a new UptimeRobot monitor — that is post-pitch work.)
7. **Supabase production confirm:**
   - `npx supabase projects list` — confirm the linked project ID.
   - Open Supabase dashboard, confirm tables `clients`, `matters`, `invoices`, `invoice_line_items`, `receipts`, `quotations`, `retainers`, `trust_ledger`, `time_entries`, `audit_log` all exist with RLS enabled.
   - If migrations have not been pushed yet: `npx supabase db push`. Confirm exit 0.
8. **Resend domain / sender:**
   - If `RESEND_API_KEY` is set in production and a custom domain is configured: confirm SPF, DKIM, DMARC records in the DNS provider. Send a test reminder to a test address; confirm inbox delivery within 30s (not spam).
   - If using the Resend sandbox sender (`onboarding@resend.dev`): document that reminders will arrive but with a sandbox `From:` address. This is acceptable for the pitch demo and noted in `OPERATOR.md` as a pre-go-live punch-list item.
9. **Fotini's test account:**
   - Confirm Fotini's auth.users row exists in the production project (per seed.sql comments, the seed inserts a placeholder UUID that the operator replaces post-cloud-link with her real auth.users.id).
   - Test the magic-link to her test email address. Confirm delivery + redirect.
10. **Go/No-Go decision (1 hour before meeting):**
    - Re-run a fast subset of the smoke suite against production: `BASE_URL=<prod-url> SKIP_COLD_PDF=1 npm run test:smoke`. (The smoke helpers accept a `BASE_URL` env override so the same script runs against prod.)
    - If all green: record `GO` with timestamp in section 8.
    - If any red: record the specific failure + the workaround (verbal explanation, hide affected feature, manual demo path).

**Validation:** (builder self-check)
- `test -f .planning/phase-6-deploy.md && grep -c "GO\|NO-GO\|GO/NO-GO" .planning/phase-6-deploy.md` → expect ≥ `1` (decision is recorded).
- `grep -c "exit code 0\|exit code: 0\|vercel.*--prod" .planning/phase-6-deploy.md` → expect ≥ `1` (deploy step is captured).
- `grep -cE "https?://[a-z0-9.-]+\.vercel\.app|https?://[a-z0-9.-]+\.lex\.[a-z]+" .planning/phase-6-deploy.md` → expect ≥ `1` (production URL captured).
- `curl -s -o /dev/null -w "%{http_code}" <prod-url>` → expect `200`. (Builder runs and writes the result into the runbook.)
- `curl -s -o /dev/null -w "%{http_code}" <prod-url>/reports/summary` (with auth) → expect `200`. Captured.
- `git log --oneline -3` → expect a commit on `feature/bootstrap` containing Phase 6 changes.

**Context:** Read
- @rules/deployment.md (the 5-check post-deploy protocol)
- @rules/security.md (feature-branch-only rule)
- @rules/infrastructure.md (Vercel CLI-only, no auto-deploys, Supabase EU region)
- @.planning/PROJECT.md (single-tenant, EU region, demo path)
- @.planning/ROADMAP.md (Phase 6 acceptance criteria #4, #5, #8)
- @supabase/seed.sql (operator-replace placeholder UUID procedure)
- @OPERATOR.md (after this task's edits)

---

## Success Criteria

- [ ] `/reports/summary` renders monthly revenue, outstanding, and overdue figures from the `invoices` table only — verified by Task 3 trust-isolation grep returning 0.
- [ ] `/reports/aging` buckets overdue invoices into 0–30 / 31–60 / 60+, with 60+ rendered using the `--kill` status pill.
- [ ] Selecting overdue rows and clicking "Draft Reminders" produces an editable AI-generated bilingual reminder per row; clicking Send returns a Resend ID (cached or live) and records an audit-log row.
- [ ] Resend adapter mirrors the Phase 5 DEMO_CACHE pattern: cache → live API (if key) → typed `no_api_key` error. Rate-limited to 10/minute in-process.
- [ ] GDPR docs (sub-processor list, DPA draft, privacy notice, README) exist in `.planning/compliance/` and reference Cyprus VAT retention and EU sub-processors.
- [ ] `tests/smoke.mjs` exists and exits 0 against the local stack — exercising HTTP 200 sweep, auth flow, PDF cold-start (or skip flag), AI query, trust isolation, concurrent finalize, locale toggle, console errors (manual flag), and API latency.
- [ ] `vercel --prod` exits 0; production URL returns HTTP 200; `.planning/phase-6-deploy.md` captures every step including the Go/No-Go decision.
- [ ] No new SP migration introduced in Phase 6 (the schema is stable — verified by file count in `supabase/migrations/`).
- [ ] No new service-role consumer introduced — grep for `SUPABASE_SERVICE_ROLE_KEY` or `createServiceClient` in Phase 6 surfaces returns 0.
- [ ] No `trust_ledger` reference in Phase 6 surfaces outside of `tests/smoke.mjs` (which explicitly tests trust isolation by querying it and asserting it does not leak into revenue).
- [ ] i18n key parity maintained across `messages/el-CY.json` and `messages/en-CY.json` for the three new namespaces (`reports.*`, `aging.*`, `reminders.*`).
- [ ] Magic-link email to Fotini's test address arrives in inbox (not spam) within 30 seconds of `/login` submission against the production URL.
- [ ] UptimeRobot monitor (https://stats.uptimerobot.com/bKudHy1pLs) shows UP after deploy, or absence of a monitor is documented as a post-pitch punch-list item in `.planning/phase-6-deploy.md`.

---

## Verification Contract

### Contract for Task 1 — Resend adapter (files exist)
**Check type:** file-exists
**Command:** `test -f src/lib/resend/client.ts && test -f src/lib/resend/types.ts && test -f src/lib/resend/rate-limiter.ts && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any of the three files is missing.

### Contract for Task 1 — Resend adapter (DEMO_CACHE gate)
**Check type:** grep-match
**Command:** `grep -c "DEMO_CACHE" src/lib/resend/client.ts`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the DEMO_CACHE pattern is not implemented in the adapter.

### Contract for Task 1 — Resend adapter (no trust ledger reference)
**Check type:** grep-match
**Command:** `grep -rc "trust_ledger\|trust\\.ledger" src/lib/resend/ || true`
**Expected:** `0`
**Fail if:** Any non-zero count — the Resend adapter has no business referencing trust state.

### Contract for Task 1 — Resend adapter (rate limit boundary)
**Check type:** grep-match
**Command:** `grep -c "tryAcquire\|rate_limit\|rate-limit" src/lib/resend/client.ts`
**Expected:** Non-zero
**Fail if:** Returns 0 — rate limiter not wired into the send path.

### Contract for Task 1 — OpenRouter reminder mode
**Check type:** grep-match
**Command:** `grep -c "kind === ['\"]reminder['\"]\\|kind:\\s*['\"]reminder['\"]" src/lib/openrouter/client.ts`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — `callOpenRouter` does not handle the new `reminder` kind.

### Contract for Task 1 — Reminder cache entries (count)
**Check type:** command-exit
**Command:** `node --input-type=module -e "import c from './src/lib/openrouter/demo-cache.json' assert {type:'json'}; const v=Object.values(c).filter(e=>e.kind==='reminder'); process.exit(v.length>=4?0:1)"`
**Expected:** exit 0
**Fail if:** Fewer than 4 reminder cache entries — Greek and English coverage requires at least 2 per language.

### Contract for Task 1 — Reminder prompt formal-register substring
**Check type:** grep-match
**Command:** `grep -cE "παρακαλούμε|formal register" src/lib/openrouter/prompts.ts`
**Expected:** Non-zero
**Fail if:** Returns 0 — the Greek formal-register constraint is not encoded in the reminder system prompt.

### Contract for Task 1 — i18n key parity (reports namespace)
**Check type:** command-exit
**Command:** `node -e "const a=Object.keys(require('./messages/el-CY.json').reports||{}).sort().join(','); const b=Object.keys(require('./messages/en-CY.json').reports||{}).sort().join(','); process.exit(a===b && a.length>0 ? 0 : 1)"`
**Expected:** exit 0
**Fail if:** Greek and English keys differ in the `reports` namespace.

### Contract for Task 1 — i18n key parity (aging namespace)
**Check type:** command-exit
**Command:** `node -e "const a=Object.keys(require('./messages/el-CY.json').aging||{}).sort().join(','); const b=Object.keys(require('./messages/en-CY.json').aging||{}).sort().join(','); process.exit(a===b && a.length>0 ? 0 : 1)"`
**Expected:** exit 0
**Fail if:** Greek and English keys differ in the `aging` namespace.

### Contract for Task 1 — i18n key parity (reminders namespace)
**Check type:** command-exit
**Command:** `node -e "const a=Object.keys(require('./messages/el-CY.json').reminders||{}).sort().join(','); const b=Object.keys(require('./messages/en-CY.json').reminders||{}).sort().join(','); process.exit(a===b && a.length>0 ? 0 : 1)"`
**Expected:** exit 0
**Fail if:** Greek and English keys differ in the `reminders` namespace.

### Contract for Task 2 — GDPR docs exist
**Check type:** file-exists
**Command:** `test -f .planning/compliance/sub-processors.md && test -f .planning/compliance/dpa-draft.md && test -f .planning/compliance/privacy-notice.md && test -f .planning/compliance/README.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any of the four docs missing.

### Contract for Task 2 — 10-year retention clause
**Check type:** grep-match
**Command:** `grep -cE "ten \\(10\\) years|10 years" .planning/compliance/dpa-draft.md`
**Expected:** Non-zero
**Fail if:** Returns 0 — the verbatim Cyprus VAT retention clause is missing from the DPA.

### Contract for Task 2 — All five sub-processors listed
**Check type:** grep-match
**Command:** `grep -c "Supabase\|Vercel\|OpenRouter\|Resend\|UptimeRobot" .planning/compliance/sub-processors.md`
**Expected:** ≥ 5
**Fail if:** Fewer than 5 hits — one or more vendor rows missing.

### Contract for Task 2 — No code in compliance docs
**Check type:** command-exit
**Command:** `find .planning/compliance -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \\) | wc -l | grep -q '^0$'`
**Expected:** exit 0
**Fail if:** Any source-code files in `.planning/compliance/` — this directory is docs only.

### Contract for Task 3 — Summary route exists
**Check type:** file-exists
**Command:** `test -f src/app/\\(workspace\\)/reports/page.tsx && test -f src/app/\\(workspace\\)/reports/summary/page.tsx && test -f src/app/\\(workspace\\)/reports/summary/queries.ts && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any of the three files missing.

### Contract for Task 3 — Trust-isolation invariant (THE load-bearing contract)
**Check type:** grep-match
**Command:** `grep -rcE "trust_ledger|trust\\.ledger|from\\(['\"]trust_ledger['\"]\\)|retainers\\.deposit|from\\(['\"]retainers['\"]\\)" src/app/\\(workspace\\)/reports/summary/ src/app/\\(workspace\\)/reports/aging/ src/lib/resend/ 2>/dev/null | awk -F: '{sum+=$NF} END {print sum}'`
**Expected:** `0`
**Fail if:** Any non-zero count — Phase 6 surfaces MUST NOT join, reference, or import the trust ledger. This is the disbarment-grade demo claim.

### Contract for Task 3 — No service-role import on report surfaces
**Check type:** grep-match
**Command:** `grep -rc "SUPABASE_SERVICE_ROLE_KEY\|createServiceClient" src/app/\\(workspace\\)/reports/ src/lib/resend/ 2>/dev/null | awk -F: '{sum+=$NF} END {print sum}'`
**Expected:** `0`
**Fail if:** Any non-zero count — Phase 6 report surfaces use the user-scoped client only.

### Contract for Task 3 — Invoices-only query layer
**Check type:** grep-match
**Command:** `grep -c "from\\(['\"]invoices['\"]\\)" src/app/\\(workspace\\)/reports/summary/queries.ts`
**Expected:** ≥ 3
**Fail if:** Fewer than 3 — the three figures (revenue, outstanding, overdue) require three separate invoices SELECTs.

### Contract for Task 3 — Reports nav link wired
**Check type:** grep-match
**Command:** `grep -cE "/reports" src/components/SidebarNav.tsx src/components/AppNav.tsx 2>/dev/null | awk -F: '{sum+=$NF} END {print sum}'`
**Expected:** Non-zero
**Fail if:** Returns 0 — Reports is unreachable from the navigation.

### Contract for Task 3 — TypeScript clean on reports surface
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -cE "reports/" | grep -q '^0$'`
**Expected:** exit 0
**Fail if:** Any TS errors mentioning the reports/ path.

### Contract for Task 4 — Aging route exists
**Check type:** file-exists
**Command:** `test -f src/app/\\(workspace\\)/reports/aging/page.tsx && test -f src/app/\\(workspace\\)/reports/aging/actions.ts && test -f src/app/\\(workspace\\)/reports/aging/DraftReminderModal.tsx && test -f src/app/\\(workspace\\)/reports/aging/AgingTable.tsx && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any of the four files missing.

### Contract for Task 4 — Send action wires Resend adapter
**Check type:** grep-match
**Command:** `grep -c "sendReminderEmail" src/app/\\(workspace\\)/reports/aging/actions.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — the send action exists but does not call the adapter.

### Contract for Task 4 — Draft action wires OpenRouter reminder mode
**Check type:** grep-match
**Command:** `grep -cE "kind:\\s*['\"]reminder['\"]\\|kind: ['\"]reminder['\"]" src/app/\\(workspace\\)/reports/aging/actions.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — the draft action does not invoke the reminder OpenRouter mode.

### Contract for Task 4 — Guard rails on draft action
**Check type:** grep-match
**Command:** `grep -cE "invoice_number|not_eligible|no_email|not_overdue" src/app/\\(workspace\\)/reports/aging/actions.ts`
**Expected:** ≥ 3
**Fail if:** Fewer than 3 — the guard rails (eligible status, has invoice_number, has client email, is overdue) are not encoded.

### Contract for Task 4 — Bucket pill colors
**Check type:** grep-match
**Command:** `grep -cE "--warn|--kill|var\\(--warn\\)|var\\(--kill\\)" src/app/\\(workspace\\)/reports/aging/AgingTable.tsx`
**Expected:** ≥ 2
**Fail if:** Fewer than 2 — both `--warn` (31–60) and `--kill` (60+) tokens must be used for bucket pills.

### Contract for Task 4 — Behavioral: bilingual reminder body
**Check type:** behavioral
**Command:** (verifier runs `DEMO_CACHE=true npm run dev`, navigates to `/reports/aging`, selects a Greek-language client's overdue invoice, opens the modal, observes the body)
**Expected:** Body contains Greek formal register (`Αξιότιμ`, `παρακαλούμε`, or `οφειλόμενο`). Then repeats for an English client, expects `Dear`, `kindly`, or `outstanding`.
**Fail if:** Either language returns the wrong-language body or generic text.

### Contract for Task 5 — Smoke suite file exists and parses
**Check type:** command-exit
**Command:** `test -f tests/smoke.mjs && node --check tests/smoke.mjs && test -f tests/smoke-helpers.mjs && node --check tests/smoke-helpers.mjs`
**Expected:** exit 0
**Fail if:** Either file missing or has a syntax error.

### Contract for Task 5 — npm script registered
**Check type:** grep-match
**Command:** `grep -c "test:smoke" package.json`
**Expected:** ≥ 1
**Fail if:** Returns 0 — Task 6 cannot invoke the smoke suite without the script.

### Contract for Task 5 — Trust-isolation check present
**Check type:** grep-match
**Command:** `grep -cE "TRUST_ONLY|trust_only|trust-only|trust isolation" tests/smoke.mjs`
**Expected:** ≥ 1
**Fail if:** Returns 0 — check #5 is missing.

### Contract for Task 5 — All 9 checks defined
**Check type:** grep-match
**Command:** `grep -cE "check_[1-9]|HTTP 200|auth flow|PDF cold|AI query|trust isolation|concurrent|locale|API latency" tests/smoke.mjs`
**Expected:** ≥ 7
**Fail if:** Fewer than 7 — some of the 9 checks are not represented in the smoke script.

### Contract for Task 5 — Behavioral: smoke exits 0 locally
**Check type:** behavioral
**Command:** (verifier runs `DEMO_CACHE=true SKIP_COLD_PDF=1 npm run test:smoke` against the local stack)
**Expected:** Exit code 0 and a summary line `<n>/<n> passed`.
**Fail if:** Any check fails or the script exits non-zero.

### Contract for Task 6 — Deploy runbook exists
**Check type:** file-exists
**Command:** `test -f .planning/phase-6-deploy.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File missing — deploy was not documented.

### Contract for Task 6 — Production URL captured
**Check type:** grep-match
**Command:** `grep -cE "https?://[a-z0-9.-]+\\.vercel\\.app|https?://[a-z0-9.-]+\\.lex\\.[a-z]+" .planning/phase-6-deploy.md`
**Expected:** ≥ 1
**Fail if:** Returns 0 — production URL not captured.

### Contract for Task 6 — Go/No-Go decision recorded
**Check type:** grep-match
**Command:** `grep -cE "\\bGO\\b|\\bNO-GO\\b|Go/No-Go" .planning/phase-6-deploy.md`
**Expected:** ≥ 1
**Fail if:** Returns 0 — the explicit Go/No-Go gate was not recorded.

### Contract for Task 6 — Behavioral: production HTTP 200
**Check type:** behavioral
**Command:** (verifier runs `curl -s -o /dev/null -w "%{http_code}" <prod-url>` using the URL captured in the runbook)
**Expected:** `200`
**Fail if:** Any non-200 status — production deploy is not healthy.

### Contract for Task 6 — Behavioral: magic-link delivery
**Check type:** behavioral
**Command:** (verifier submits `/login` from the production URL with a test email, waits up to 30 seconds, confirms inbox delivery)
**Expected:** Magic-link email arrives in the inbox (not spam) within 30 seconds.
**Fail if:** Email does not arrive, lands in spam, or arrives outside the 30-second window.

### Contract for Task 6 — UptimeRobot status
**Check type:** behavioral
**Command:** (verifier loads https://stats.uptimerobot.com/bKudHy1pLs and inspects the Lex monitor)
**Expected:** Monitor shows UP. If the monitor does not yet exist, the runbook documents this as a post-pitch punch-list item — not a Phase 6 blocker.
**Fail if:** Monitor exists and shows DOWN.

---

## Decision Coverage Audit

| Locked decision | Covering task | How |
|---|---|---|
| `RESEND_API_KEY` not yet in `.env.local` — DEMO_CACHE pattern required | Task 1 | Resend adapter implements cache-first → live API → typed `no_api_key` fallback identical to Phase 5. |
| OpenRouter reused for reminder via new `kind: 'reminder'` mode + `buildReminderSystemPrompt` helper + demo-cache entries | Task 1 | `callOpenRouter` extended with reminder branch; prompt builder appended; 4 cache entries added. |
| NO new SP migrations | Tasks 3 + 4 | All Phase 6 queries are reads against existing tables; the audit-log insert reuses the existing trigger / `audit_log` table (no schema additions). |
| NO new service-role consumer | Tasks 3 + 4 | Reports and reminders use the user-scoped `createClient` from `src/lib/supabase/server.ts` only — verified by grep contract. |
| Deploy AFTER smoke tests pass | Task 6 | Task 6 explicitly depends on Task 5; the runbook's first action is `npm run test:smoke` and the deploy proceeds only on exit 0. |
| Vercel project link state UNKNOWN | Task 6 | First action documents the `vercel link` discovery step in section 1 of the runbook. |
| Smoke tests EXECUTABLE before deploy | Task 5 | `tests/smoke.mjs` + `npm run test:smoke` script; deploy task runs it as the pre-deploy gate. |

REQ coverage:
- REQ-015 (REP-01 monthly summary) → Task 3.
- REQ-016 (REP-02 aging report + AI-drafted bilingual email reminders) → Tasks 1 + 4.
- Acceptance criterion #1 (summary EXPLAIN touches zero trust_ledger) → Task 3 trust-isolation grep + Task 5 smoke check #5 (trust isolation).
- Acceptance criterion #2 (aging buckets, 60+ uses --kill) → Task 4 Design field + grep contract.
- Acceptance criterion #3 (reminder flow end-to-end) → Task 4 behavioral contract.
- Acceptance criterion #4 (`vercel --prod` exits 0, prod HTTP 200) → Task 6 contracts.
- Acceptance criterion #5 (magic-link arrives in 30s) → Task 6 behavioral contract.
- Acceptance criterion #6 (smoke suite exits 0) → Task 5 behavioral contract.
- Acceptance criterion #7 (GDPR docs in `.planning/compliance/`) → Task 2 contracts.
- Acceptance criterion #8 (UptimeRobot UP) → Task 6 behavioral contract.
