# Stack Research

**Domain:** Cyprus legal-tech invoicing (single-tenant demo for Fotini Kandri pitch)
**Researched:** 2026-05-13
**Confidence:** HIGH for the load-bearing decisions (PDF, AI structured output, email). MEDIUM for Greek-locale formatting / IBAN / VAT validation (drawn from Node-stdlib + well-known libraries; no fresh 2026 benchmark consulted under quick-scope budget).

> **Framework-locked.** Next.js 16 (App Router) + React 19 + TypeScript + Supabase EU + Vercel + OpenRouter are pre-decided per `~/.claude/rules/infrastructure.md` and PROJECT.md. This file surfaces only the **demo-specific** library choices: server-side PDF, email, structured-output AI, locale formatting, and Cyprus-VAT/IBAN validation.

## Recommended Stack

### Core Technologies (framework-locked, listed for completeness)

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| Next.js | 16.x (App Router) | Full-stack framework, RSC + Server Actions for invoice mutations | Locked by Qualia framework (`CLAUDE.md`). App Router + Server Actions are the canonical wiring for the "form → PDF → email" loop without exposing a separate API surface. |
| React | 19.x | UI runtime | Locked by Qualia framework. Required peer of Next.js 16. |
| TypeScript | 5.x | Type safety end-to-end | Locked by Qualia framework. Mandatory for the Zod-validated invoice schema flowing from form → AI extraction → DB → PDF. |
| Supabase | Postgres 15 / latest hosted, EU region (Frankfurt or Ireland) | Auth (magic link), Postgres (invoices, clients, cases, trust ledger), Storage (logos, generated PDFs) | Locked by Qualia framework. EU region is a hard PROJECT.md constraint for GDPR. RLS is mandatory (see `rules/security.md`). — [Source: `~/.claude/rules/infrastructure.md`] |
| Vercel | latest | Hosting; `vercel --prod` only, no git auto-deploy | Locked by Qualia framework. Hobby/Pro function-timeout caps are the dominant constraint on PDF library choice (see below). — [Source: `~/.claude/rules/infrastructure.md`] |
| OpenRouter | REST API v1 | LLM gateway for invoice-draft NL extraction + assistant queries | Locked by Qualia framework. Supports `response_format: { type: 'json_schema', strict: true }` for invoice extraction. — [Source: WebSearch "OpenRouter structured outputs JSON schema invoice extraction Next.js 2026" → https://openrouter.ai/docs/guides/features/structured-outputs] |
| Tailwind CSS | v4 | Styling (OKLCH tokens from DESIGN.md) | Locked by Qualia framework. v4 has native OKLCH support which matches DESIGN.md's ink-on-paper palette. (confidence: MEDIUM — version not re-verified under quick-scope budget) |

### Supporting Libraries (THE actual decisions this research surfaces)

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `@react-pdf/renderer` | 4.x (latest 2026) | Server-side PDF generation for invoices, receipts, quotations, retainers | **Primary PDF engine.** No Chromium binary, no cold-start, ships inside Vercel function-size limits, and Greek Unicode is solved by one `Font.register()` call with a Greek-supporting webfont (e.g., Noto Sans Greek, U+0370–U+03FF). — [Source: WebSearch "@react-pdf/renderer vs puppeteer Vercel serverless Greek text Unicode 2026" — synthesized from https://www.pkgpulse.com/blog/react-pdf-vs-react-pdf-renderer-vs-jspdf-pdf-in-react-2026 and https://github.com/diegomura/react-pdf/issues/1775] |
| `next-intl` | 4.x (latest 2026) | i18n for UI strings + invoice document content (GR default, EN toggle) | Used per PROJECT.md decision. App-Router-native, supports server-component translation lookups, GR locale `el-CY` for Cyprus-specific date/number formats. (confidence: MEDIUM — PROJECT.md says "most likely"; library is canonical for App Router; no fresh 2026 comparison run under quick-scope budget) |
| `resend` | 6.x (latest 2026) | Transactional email (invoice delivery, payment reminders, magic-link auth fallback) with PDF attachments | **Email provider.** React Email integration means invoice-attachment emails can be JSX components matching the DESIGN.md letterhead aesthetic. Free tier (3K/month, no trial expiry) covers the demo and post-demo handoff. Pass `@react-pdf/renderer` output as base64 buffer to `attachments` field. — [Source: WebSearch "Resend vs SendGrid Next.js 16 transactional email PDF attachment 2026" — synthesized from https://mailflowauthority.com/email-comparisons/sendgrid-vs-resend and https://dev.to/thiago_alvarez_a7561753aa/resend-vs-sendgrid-2026-sendgrid-killed-its-free-tier-now-what-2gh4] |
| `react-email` / `@react-email/components` | 3.x (latest 2026) | Email template authoring as JSX, compiled to email-safe HTML | Pair with Resend; ~1.35M weekly npm downloads as of Feb 2026 confirms this is the canonical React-stack choice. — [Source: WebSearch result above, https://mailflowauthority.com/email-comparisons/sendgrid-vs-resend] |
| `zod` | 3.x | Schema validation for: invoice form input, OpenRouter `response_format` JSON Schema source-of-truth, Server Action payloads | Mandatory per `rules/security.md`. The same Zod schema for an invoice doubles as the JSON Schema fed to OpenRouter `response_format` (via `zod-to-json-schema`), so AI-extracted invoices and form-submitted invoices flow through identical validation. (confidence: HIGH for use of Zod; MEDIUM for `zod-to-json-schema` being the right bridge — common pattern, not freshly verified) |
| `zod-to-json-schema` | 3.x | Converts Zod schemas to JSON Schema for OpenRouter `response_format.json_schema` | Eliminates schema drift between Server-Action validation and AI extraction. (confidence: MEDIUM — well-known idiom, not freshly verified) |
| `iban` (npm package) | 0.0.14+ / latest | IBAN validation and formatting for client bank-account fields | Cyprus IBANs are 28 chars `CY##`. The `iban` package validates checksum + country format. (confidence: LOW — common Node library; not freshly compared against alternatives like `ibantools` under quick-scope budget. Acceptable fallback: `ibantools` — pick whichever has higher current download counts at install time.) |
| `Intl.NumberFormat` / `Intl.DateTimeFormat` | Node 22 stdlib | Greek currency (`EUR`, `€`, decimal-comma) and date formatting (`el-CY` locale) | Built into Node 22 / V8 — no library needed. `new Intl.NumberFormat('el-CY', { style: 'currency', currency: 'EUR' }).format(1234.5)` produces `1.234,50 €` which is the correct Cyprus-Greek convention. (confidence: MEDIUM — standard ECMA-402; `el-CY` locale tags are well-defined but specific formatting output not re-verified under quick-scope budget) |
| `@supabase/ssr` | latest | SSR-safe Supabase auth in App Router (server components + Server Actions + Route Handlers) | Replaces deprecated `@supabase/auth-helpers-nextjs`. Required for REQ-001 magic-link auth working under RSC. (confidence: HIGH — current canonical; per Qualia framework infrastructure rules.) |
| `date-fns` (with `date-fns/locale/el`) | 3.x or 4.x | Calendar arithmetic for aging report (overdue 30/60/90 days), retainer-expiry calculations | Only used where `Intl` is insufficient (date math, not formatting). `el` locale provides Greek month names if `Intl` proves too coarse for templates. (confidence: LOW — interchangeable with `dayjs`; pick whichever the team is more familiar with) |

## Installation

```bash
# Runtime deps — the demo-specific additions on top of the standard Qualia template
npm install \
  @react-pdf/renderer \
  next-intl \
  resend \
  @react-email/components \
  zod \
  zod-to-json-schema \
  iban \
  date-fns

# Dev deps
npm install -D \
  @types/iban
```

(Assumed already-installed by the Qualia base template: `next@16`, `react@19`, `typescript`, `@supabase/ssr`, `@supabase/supabase-js`, `tailwindcss@4`, `lucide-react`, `clsx`, `tailwind-merge`.)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| `@react-pdf/renderer` | Puppeteer + `@sparticuz/chromium-min` + `puppeteer-core` | If invoice templates need pixel-perfect HTML/CSS fidelity (e.g., complex print stylesheets, web fonts with specific kerning, embedded charts). **Not needed for this demo** — invoice/receipt/quotation/retainer layouts are well within `<Document>/<Page>/<Text>/<View>` primitives. Puppeteer also costs Chromium cold-start time (multi-second), eating into Vercel's 10s/60s function caps. — [Source: WebSearch result, https://medium.com/@ubermensch1/running-puppeteer-on-vercel-511dfec154a1] |
| `@react-pdf/renderer` | `pdf-lib` | If we needed to **edit** existing PDFs (stamp signatures onto a PDF Fotini uploaded). Not in scope for the demo. |
| `resend` | SendGrid | If multi-channel marketing + transactional in one platform is required, or HIPAA/BAA compliance is needed. Cyprus legal practice is GDPR not HIPAA; Resend's BAA situation is moot. SendGrid also killed its free tier in May 2025 — only a 60-day trial remains, making it a bad fit for a demo project that may sit dormant between pitch and signed engagement. — [Source: WebSearch result, https://dev.to/thiago_alvarez_a7561753aa/resend-vs-sendgrid-2026-sendgrid-killed-its-free-tier-now-what-2gh4] |
| `resend` | Postmark | If deliverability for >5M emails/month is critical. Not relevant for a single-lawyer practice sending ~50 invoices/month. (confidence: LOW — Postmark not directly compared this round.) |
| `next-intl` | `next-i18next`, `react-i18next` | Older Pages-Router-era libraries. Don't use — they don't compose cleanly with RSC. |
| `Intl` stdlib for currency/date | `numeral.js`, `moment.js` | Don't use — `numeral.js` is unmaintained, `moment.js` is in maintenance-only mode. `Intl` is in V8, free, faster, locale-aware. |
| OpenRouter `response_format: json_schema` | OpenAI/Anthropic direct SDK with Zod | Direct provider SDKs forbidden by `rules/infrastructure.md` ("Never hardcode a specific model provider"). OpenRouter normalizes structured-output support across providers, so model swaps are env-var changes only. — [Source: WebSearch result, https://openrouter.ai/docs/guides/features/structured-outputs] |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| Default `@react-pdf/renderer` fonts (Helvetica, Times-Roman, Courier) for Greek text | Built-in fonts have NO Greek glyph coverage — text renders as boxes / missing-glyph squares. This is the #1 silent-failure mode for this stack. | `Font.register({ family: 'NotoSansGreek', src: <Noto Sans Greek webfont URL or local file in /public> })` and reference via `fontFamily` in `StyleSheet.create`. Greek covers U+0370–U+03FF (modern monotonic) — sufficient for Cyprus legal Greek which doesn't use polytonic accents. — [Source: WebSearch result + https://github.com/diegomura/react-pdf/issues/1775] |
| Puppeteer on Vercel Hobby plan | 10s function timeout + Chromium cold start (multi-second) + 50MB function size limit = unreliable. | `@react-pdf/renderer` (no binary, no cold start). — [Source: WebSearch result, https://github.com/meeehdi-dev/vercel-puppeteer] |
| Asking the AI to "return JSON" via prompt alone | Models wrap output in markdown backticks, hallucinate fields, omit required fields, produce conversational filler. Will crash the invoice-draft parser at runtime. | OpenRouter `response_format: { type: 'json_schema', strict: true, additionalProperties: false }` with a Zod-derived schema. — [Source: WebSearch result, https://openrouter.ai/docs/guides/features/structured-outputs] |
| Direct OpenAI / Anthropic SDK | Forbidden by `rules/infrastructure.md` — never hardcode a provider. | OpenRouter REST API with `OPENROUTER_API_KEY`. |
| Client-side PDF generation (e.g., `jsPDF` in the browser, WASM PDF builders) | Explicitly excluded by PROJECT.md ("no client WASM"). Also: sequential invoice numbering MUST be allocated server-side under a DB transaction to guarantee gap-free per Cyprus VAT — client-side generation breaks that guarantee. | Server Action that allocates the invoice number from a Postgres sequence (or atomic `UPDATE ... RETURNING`) inside the same transaction that inserts the invoice row, then streams the `@react-pdf/renderer` output. |
| `service_role` Supabase key in any client component or AI prompt context | RLS bypass = trust ledger compromise = disbarment-grade incident. | `SUPABASE_SERVICE_ROLE_KEY` only in `lib/supabase/server.ts` and only behind a route handler / Server Action; per `rules/security.md`. |
| Non-EU Supabase region | Hard GDPR fail per PROJECT.md. | EU region (Frankfurt `eu-central-1` or Ireland `eu-west-1`) at project creation — irreversible without data migration. |
| Spreading invoice numbering across multiple Postgres sequences or app-layer counters | Cyprus VAT requires sequential gap-free numbering per issuer per year. Multiple counters create gaps under concurrency. | One Postgres `BIGSERIAL` or a `sequences(year, last_number)` table updated via `SELECT ... FOR UPDATE` inside the invoice-create transaction. (confidence: MEDIUM — pattern is canonical, but Cyprus-specific VAT regulation not re-cited under quick-scope budget; planner should confirm with `~/.claude/rules` or domain SME.) |

## Version Compatibility

- **Next.js 16 + React 19**: peer-compatible by design; both ship with concurrent features that `@react-pdf/renderer` ignores (it renders server-side only — fine).
- **`@react-pdf/renderer` + Node 22 (Vercel default)**: confirmed compatible; the library is pure JS, no native binaries. Greek `Font.register()` fetches happen at PDF-render time, so the fetch must complete before stream close — keep network calls minimal in the render path. (confidence: MEDIUM — Node 22 + react-pdf compatibility not freshly re-verified, but no known regressions reported.)
- **`next-intl` 4 + Next.js 16 App Router**: native RSC support; configure in `i18n.ts` + middleware. (confidence: MEDIUM)
- **`resend` SDK + Next.js Server Actions**: works inside Server Actions and Route Handlers; not callable from client components (which is correct — the API key must stay server-side).
- **OpenRouter `response_format` + model choice**: `json_schema` strict mode is supported on GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Gemini 2.x Flash and Pro. For the demo's invoice-draft extraction, **Gemini 2.5 Flash** or **GPT-4o-mini** through OpenRouter is the cost/latency sweet spot. — [Source: WebSearch result, https://openrouter.ai/docs/guides/features/structured-outputs]
- **`@supabase/ssr` + Next.js 16**: canonical pairing; PKCE flow for magic links is the default. (confidence: HIGH per framework rules.)

## Critical Demo-Day Gotchas (concise call-outs)

1. **Greek font registration MUST run before any `<Text>` element renders Greek.** Register at module-top-level in the PDF document module, not inside the component, to avoid race conditions on first render.
2. **Sequential invoice numbering allocation MUST be inside the same DB transaction as the invoice INSERT.** Otherwise a failed insert leaves a burned number = gap = VAT non-compliance.
3. **OpenRouter structured-output refusals are NOT retryable.** A `refusal` field set with `parsed: null` means the model declined — treat as a 4xx, surface to user, don't retry-loop.
4. **`@react-pdf/renderer` does not support arbitrary CSS** — only its `StyleSheet` subset. DESIGN.md's letterhead aesthetic must be reproduced with `<View>`, `<Text>`, flexbox, and registered fonts only. No `box-shadow`, no `background-image: linear-gradient(...)` complexities. Confirm DESIGN.md is achievable in this subset BEFORE building the template.
5. **Resend free tier is 100 emails/day, 3K/month.** Plenty for the demo. If Fotini's onboarding seeds trigger a burst of reminder emails, throttle in code.

## Sources

- WebSearch: "@react-pdf/renderer vs puppeteer Vercel serverless Greek text Unicode 2026" — synthesized from:
  - https://www.pkgpulse.com/blog/react-pdf-vs-react-pdf-renderer-vs-jspdf-pdf-in-react-2026
  - https://github.com/diegomura/react-pdf/issues/1775 (Unicode/non-Latin script font registration)
  - https://medium.com/@ubermensch1/running-puppeteer-on-vercel-511dfec154a1 (Vercel + Chromium constraints)
  - https://github.com/meeehdi-dev/vercel-puppeteer (`@sparticuz/chromium-min` pattern)
- WebSearch: "OpenRouter structured outputs JSON schema invoice extraction Next.js 2026" — synthesized from:
  - https://openrouter.ai/docs/guides/features/structured-outputs (primary)
  - https://openrouter.ai/docs/api/reference/overview
  - https://superjson.ai/blog/2025-08-17-json-schema-structured-output-apis-complete-guide/
  - https://dev.to/lovanaut55/openrouter-structured-output-broke-before-translation-quality-did-3-layers-of-defense-for-1cdb (production-hardening + Next.js patterns)
- WebSearch: "Resend vs SendGrid Next.js 16 transactional email PDF attachment 2026" — synthesized from:
  - https://mailflowauthority.com/email-comparisons/sendgrid-vs-resend (primary)
  - https://dev.to/thiago_alvarez_a7561753aa/resend-vs-sendgrid-2026-sendgrid-killed-its-free-tier-now-what-2gh4 (SendGrid free-tier removal)
  - https://www.pkgpulse.com/guides/resend-vs-sendgrid-vs-brevo-transactional-email-api-2026
- Local: `~/.claude/rules/infrastructure.md` (framework stack lock — Supabase EU, OpenRouter, Vercel CLI-only)
- Local: `~/.claude/rules/security.md` (RLS mandatory, service-role-key isolation)
- Local: `/home/moayad-qualia/projects/flaw/.planning/PROJECT.md` (REQ-001…REQ-018, stack decisions, EU-region GDPR constraint)

INSUFFICIENT EVIDENCE (acknowledged gaps, mark for planner follow-up):
- Cyprus VAT-specific invoice numbering regulation text not freshly cited — the "sequential gap-free per issuer per year" rule is asserted from PROJECT.md, not from a Cyprus Tax Department primary source. Planner should validate format `YYYY/####` and per-year reset assumption with Fotini directly during demo.
- `iban` vs `ibantools` npm packages not compared this round — pick on download count + last-commit recency at install time.
- Greek polytonic vs monotonic glyph coverage: Cyprus legal Greek is monotonic, but if any client name uses polytonic accents (rare in modern names), Noto Sans Greek covers both ranges. Not freshly verified.

---
*Stack research for: Cyprus legal-tech invoicing — Lex demo for Fotini Kandri pitch, 2026-05-13*
