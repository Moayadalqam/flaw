---
phase: 2
result: FAIL
gaps: 7
---

# Phase 2 Verification

**Executed:** 2026-05-13  
**Verifier:** Qualia Verifier (Sonnet 4.6)  
**Goal:** Magic-link auth + workspace shell + GR/EN toggle + DESIGN.md tokens applied end-to-end.

---

## Contract Results

| Task | Check | Command | Result | Notes |
|------|-------|---------|--------|-------|
| Task 0 | file-exists | `test -f migrations/005 && test -f tests/trust_truncate_guard.sql` | **PASS** | Both files present |
| Task 0 | grep-match | `grep -c "trust_truncate_guard.sql" run.sh` | **PASS** | Returns 2 |
| Task 0 | command-exit | `npm run db:test` (Podman socket) | **PASS** | All 5 tests pass; output contains `PASS: TRUNCATE denied` |
| Task 1 | grep-match | OKLCH tokens ≥ 6 | **FAIL** | Returns **5** — `--space-4` and `--ease-out-quart` not defined; contract expects ≥ 6 |
| Task 1 | grep-match | no `#hex` in globals.css / layout.tsx | **PASS** | Both return 0 |
| Task 1 | command-exit | slop-detect `--severity=critical` on globals + layout | **PASS** | Exit 0 |
| Task 1 | grep-match | `lib/format.ts` has Intl constructors | **PASS** | Returns 10 (≥ 2) |
| Task 1 | command-exit | Greek currency `1.234,56 €` | **PASS** | `OK: 1.234,56 €` |
| Task 1 | grep-match | landing page `page.tsx` has "Lex" | **PASS** | Returns 5 |
| Task 2 | grep-match | `createNextIntlPlugin` in next.config.ts | **PASS** | Returns 2 |
| Task 2 | file-exists | both message catalogues | **PASS** | EXISTS |
| Task 2 | command-exit | key shape matches between el-CY / en-CY | **PASS** | OK |
| Task 2 | command-exit | el-CY.json contains Greek glyphs | **PASS** | Greek OK |
| Task 2 | grep-match | `updateSession` in middleware | **PASS** | Returns 2 |
| Task 3 | grep-match | `signInWithOtp` in login | **PASS** | Returns 1 |
| Task 3 | grep-match | `exchangeCodeForSession` in callback | **PASS** | Returns 1 |
| Task 3 | grep-match | no `service_role` in auth files | **PASS** | All files return 0 |
| Task 3 | command-exit | `npx tsc --noEmit` | **PASS** | Exit 0 |
| Task 3 | behavioral | magic-link end-to-end | NOT RUN — behavioral, flagged for manual test |
| Task 4 | grep-match | auth gate (`redirect('/login')`) in workspace layout | **PASS** | Returns 1 |
| Task 4 | grep-match | `router.refresh` in LocaleToggle | **PASS** | Returns 1 |
| Task 4 | file-exists + grep | locale route + zod enum validation | **FAIL** | Contract grep pattern `z.enum\(\[.el-CY..en-CY.\]\)` returns 0; however code uses `z.enum(locales)` where `locales = ["el-CY","en-CY"] as const` — functionally equivalent but grep fails; **contract verdict: FAIL** |
| Task 4 | grep-match | no heroicons/phosphor/react-icons in src/ | **PASS** | All files return 0 |
| Task 4 | grep-match | sidebar covers all 10 nav targets | **FAIL** | Returns **9** — sidebar uses `/assistant` not `/ai`; contract grep for `/ai` misses it |
| Task 4 | grep-match | dashboard `count: 'exact'` ≥ 3 | **FAIL** | Contract greps single-quote `'exact'`; code uses double-quote `"exact"` — functional 3 counts present but grep returns 1 |
| Task 5 | grep-match | clients list reads from DB | **FAIL** | Contract greps `from('clients')` (single); code uses `from("clients")` — functional but grep returns 0 |
| Task 5 | grep-match | cases list reads from DB | **FAIL** | Same quote issue; `from("matters")` present, grep returns 0 |
| Task 5 | grep-match | RLS empty-result `data.length === 0` ≥ 4 | **PASS** | clients/actions: 4, cases/actions: 4 — total 8 |
| Task 5 | grep-match | types.ts wired into consumers | **PASS** | Returns 25 (≥ 4) |
| Task 5 | grep-match | all formatting through lib/format | **PASS** | Returns 0 (no rogue Intl calls) |
| Task 5 | command-exit | slop-detect `--severity=critical` on all src/ | **FAIL** | Exit 1 — **3 CRITICAL** findings |
| Task 5 | grep-match | StatusPill wired into cases list | **PASS** | Returns 3 |
| Task 5 | grep-match | Table wired into BOTH list views | **PASS** | Returns 2 + 2 |
| Task 5 | command-exit | superseded demo files removed | **PASS** | "demo migrated" |
| Phase | grep-match | no service-role in app/ or components/ | **PASS** | Returns 0 |
| Phase | command-exit | `npx tsc --noEmit` | **PASS** | Exit 0 |
| Phase | behavioral | Greek currency on /clients, /cases | NOT RUN — behavioral |
| Phase | behavioral | Greek fits at 375px | NOT RUN — behavioral |

---

## Scores

| Criterion | Correctness | Completeness | Wiring | Quality | Verdict |
|-----------|-------------|--------------|--------|---------|---------|
| Task 0 — TRUNCATE guard | 5 | 5 | 5 | 5 | **PASS** |
| Task 1 — Design tokens / fonts / format.ts | 3 | 2 | 4 | 3 | **FAIL** |
| Task 2 — next-intl wiring | 5 | 4 | 5 | 4 | **PASS** |
| Task 3 — Auth login / callback | 3 | 2 | 4 | 3 | **FAIL** |
| Task 4 — Workspace shell / sidebar / toggle | 4 | 3 | 4 | 4 | **PASS** |
| Task 5 — Clients + Cases CRUD | 4 | 4 | 4 | 3 | **PASS** |
| Phase — slop-detect gate | — | — | — | 1 | **FAIL** |

**Minimum threshold check:** Task 1 Completeness=2 → FAIL. Task 3 Completeness=2 → FAIL. Phase slop-detect Quality=1 → FAIL.

---

## Code Quality

- **TypeScript:** PASS — `npx tsc --noEmit` exits 0
- **Stubs found:** 0 in new Phase 2 files
- **service_role in client code:** 0 occurrences
- **Slop-detect:** EXIT 1 — 3 CRITICAL, 2 HIGH, 6 MEDIUM findings across `src/`
- **Format seam violations:** 0 — all Intl calls go through `src/lib/format.ts`

---

## Gaps

### Gap 1 — Task 0 (PASS — no gap)
No issues. All 5 DB tests pass. `BEFORE TRUNCATE` trigger confirmed.

### Gap 2 — Task 1: Missing DESIGN.md token set in globals.css (Completeness: 2)

`src/app/globals.css` implements only 15 of the ~30 tokens specified in DESIGN.md §2–7. Missing:

- `src/app/globals.css` — **no `--space-1` through `--space-24`** spacing scale (DESIGN.md §4 lists 9 spacing tokens). Only `--pad-x` and `--pad-section` present.
- `src/app/globals.css` — **no `--pad-card`, `--gap-stack`, `--gap-grid`** (DESIGN.md §4).
- `src/app/globals.css` — **no `--elev-1`, `--elev-2`, `--elev-3`** elevation tokens (DESIGN.md §6). All components using shadow references have nothing to pull from.
- `src/app/globals.css` — **no `--ease-out-quart`, `--ease-out-expo`, `--d-quick`, `--d-default`, `--d-section`** motion tokens (DESIGN.md §7).
- `src/app/globals.css` — **missing `.display`, `.mono`, `.prose`** utility classes. The plan's target shape requires `.display { font-family: var(--font-crimson-pro), Georgia, serif }` and `.mono { font-family: var(--font-jetbrains-mono), ... }`. Class `font-display` exists but `.display` does not.
- `src/app/globals.css:53-54` — `--font-display: var(--font-crimson)` and `--font-body: var(--font-inter-tight)` present but `--font-mono` is absent from `@theme inline`.
- `src/app/layout.tsx:2` — `import { Crimson_Pro, Inter_Tight } from "next/font/google"` — **`JetBrains_Mono` is not loaded**. The plan requires it as the Söhne Mono fallback; `--font-jetbrains-mono` CSS variable is never set.

**Contract failure:** `grep -cE "^\s*--(bg|text|accent|trust|line|space-4|ease-out-quart):" src/app/globals.css` → **5** (expected ≥ 6). `space-4` and `ease-out-quart` are absent.

**Severity:** HIGH — DESIGN.md §4 spacing tokens and §7 motion tokens are referenced by Task 4 components (e.g. `src/app/(workspace)/layout.tsx:38` uses `var(--pad-x)` and `var(--pad-section)`, which exist, but sidebar components referencing `--space-2`, `--space-3`, `--space-4`, `--elev-1` hit undefined vars).

### Gap 3 — Task 3: LoginForm.tsx missing Zod validation and i18n (Completeness: 2)

The plan's Task 3 Acceptance Criteria specify:
- "The form validates email with Zod (`z.string().email().min(5)`)" — **NOT IMPLEMENTED**
- "All visible strings come from `useTranslations()` / `getTranslations()`; no hardcoded English in JSX" — **VIOLATED**

Evidence:
- `src/app/(auth)/login/LoginForm.tsx:1-114` — no `zod` import, no `z.string().email()` validation. Validation is delegated to the browser's `type="email"` attribute only.
- `src/app/(auth)/login/LoginForm.tsx:40` — `"Email"` hardcoded label (English). No `useTranslations` import.
- `src/app/(auth)/login/LoginForm.tsx:78` — `"Check your inbox. The magic link will land within 30 seconds."` hardcoded English.
- `src/app/(auth)/login/LoginForm.tsx:93` — `"Email me the magic link"` / `"Sending…"` hardcoded English.
- `src/app/(auth)/login/page.tsx:27` — `"Sign in to your workspace."` hardcoded English. No `getTranslations` call.
- `src/app/(auth)/login/page.tsx:31` — `"A magic link will be emailed to you. No passwords, ever."` hardcoded English.

This means the login page renders entirely in English for Greek (`el-CY`) locale users — a direct violation of REQ-013 (I18N-01) and the phase acceptance criterion "All visible strings come from `useTranslations()` / `getTranslations()`."

**Severity:** HIGH — Feature broken for 100% of Greek-locale users; i18n is not wired on the entry point page.

### Gap 4 — Task 4: Sidebar nav missing `/ai` route; uses `/assistant` (Contract: 9 not 10)

`src/components/SidebarNav.tsx:48` — `{ href: "/assistant", key: "assistant", icon: Sparkles }` — plan requires `href: '/ai'` and `key: 'ai'`. The contract grep for `/(dashboard|clients|cases|invoices|receipts|quotations|retainers|trust|ai|reports)` returns **9** (the `/assistant` route doesn't match `/ai`).

**Severity:** MEDIUM — The nav is functionally complete (10 items) but deviates from the plan's route specification. Any Phase 3+ route handler built at `/ai` will not match the sidebar link. Minor wiring risk.

### Gap 5 — Task 4: Locale route contract grep mismatch (contract pattern vs code)

`src/app/api/locale/route.ts:5-6` — `z.enum(locales)` where `locales = ["el-CY","en-CY"] as const` is functionally equivalent to the plan's `z.enum(['el-CY','en-CY'])`. The contract grep `z.enum\(\[.el-CY..en-CY.\]\)` does not match because the code imports from `routing.ts`. This is a **contract grep false negative** — the validation is present and correct. The verifier notes this as a grep-pattern discrepancy, not a functional gap. The route correctly validates and rejects invalid locales.

**Severity:** LOW — No functional gap. Contract grep is poorly scoped. Noted as test-quality issue.

### Gap 6 — Task 4/5: Dashboard count and DB query contracts fail due to quote style

Dashboard page uses `count: "exact"` (double quotes); contracts grep `count: 'exact'` (single quotes) → returns 1 instead of 3. Similarly, `from("clients")` / `from("matters")` vs. `from('clients')` / `from('matters')`. The code is functionally correct.

**Severity:** LOW — No functional gap. All three count queries exist at `src/app/(workspace)/dashboard/page.tsx:17-23`. Contract grep patterns need to be quote-agnostic. Noted for plan revision.

### Gap 7 — Phase slop-detect CRITICAL findings (Design Gate FAIL)

`node ~/.claude/bin/slop-detect.mjs src/` exits 1 with **3 CRITICAL** findings:

1. `src/app/page.tsx:181` — `[ABS-SIDE-STRIPE]` `<article key={f.title} className="border-l-2 border-[var(--accent-bg)] pl-5">` — side-stripe border on the landing page feature list. The plan states Task 1 must NOT touch `page.tsx`, so this is a pre-existing anti-pattern from Phase 1. However, the slop-detect contract is phase-level ("exits 0 across all src/") and it fails.
2. `src/app/retainers/page.tsx:47` — `[ABS-SIDE-STRIPE]` `className="mb-8 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"` — side-stripe on static demo page (pre-existing).
3. `src/app/trust-ledger/page.tsx:18` — `[ABS-SIDE-STRIPE]` `className="mb-6 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"` — side-stripe on static demo page (pre-existing).

**Additionally:** `src/components/CommandBar.tsx:94` — `[HI-OUTLINE-NONE]` `outline-none` without focus replacement (a11y HIGH).

The phase-level contract "slop-detect exits 0 across all src/" **FAILS** because pre-existing demo pages (landed in Phase 1) carry side-stripe borders. Phase 2 task 5 did not regress them, but the contract scope covers `src/` — which includes the untouched demo pages.

**Severity:** HIGH — The 3 CRITICAL findings block the design gate. Two are on pre-existing demo pages not touched by Phase 2; one is in the landing page. The contract is absolute.

---

## Design Rubric — Phase 2

Scored against representative routes: `/login` (auth page), `/dashboard` (workspace home), `/clients` (data list), `/cases` (data list with joins). Phase 2 is a page/section phase — all 8 dimensions apply.

| Dim | Score | Evidence |
|---|---|---|
| Typography | 3 | `src/app/layout.tsx:8-20` — Crimson Pro (weights 400–700) + Inter Tight (400/500/600, with Greek subset) loaded via `next/font/google`. JetBrains Mono absent — `src/app/layout.tsx:2` shows no `JetBrains_Mono` import. Scale classes (`font-display`, `tabular`) used at `src/app/(workspace)/dashboard/page.tsx:102`. Missing `.mono` utility class in `globals.css`. |
| Color cohesion | 4 | `src/app/globals.css:4-31` — 15 OKLCH tokens present, all surfaces, text, accent, trust, semantic. Zero `#hex` or `rgb()`. `@theme inline` block exposes vars to Tailwind. Missing `--color-surface-2`, `--color-accent-2` in `@theme`. Strategy: Restrained (terracotta single accent). |
| Spacing | 2 | `src/app/globals.css:33-36` — only `--pad-x` and `--pad-section` (fluid clamp). **Missing 9 spacing tokens** (`--space-1` through `--space-24`, `--pad-card`, `--gap-stack`, `--gap-grid`). Components reference undefined vars. |
| States | 3 | Loading/pending: `src/app/(workspace)/clients/ClientForm.tsx:50` uses `isPending` via `useTransition`; `src/app/(auth)/login/LoginForm.tsx:83` disables button during send. Empty: `src/components/Table.tsx` likely has `emptyLabel` prop (confirmed from plan wiring). Error: `src/app/(auth)/login/LoginForm.tsx:97` error block with `aria-live`. No skeleton loaders. |
| Motion intent | 1 | `src/app/globals.css` — **zero** motion tokens (`--ease-out-quart`, `--ease-out-expo`, `--d-quick`, `--d-default`, `--d-section` all absent). Only `prefers-reduced-motion` override present. Components have no transition declarations pulling from CSS vars. |
| Microcopy | 3 | `messages/el-CY.json` — native Greek strings with legal-professional voice (no exclamation marks, no emoji). Dashboard: `src/app/(workspace)/dashboard/page.tsx:65-79` uses translation keys. Login: **FAILS** — `src/app/(auth)/login/LoginForm.tsx:78` hardcodes English. |
| Layout originality | 3 | `/dashboard`: 3-column count card grid (MEDIUM slop finding but not CRITICAL for this rubric dimension). `/clients`, `/cases`: full-width table with sticky header — appropriate for legal data density. No generic hero/CTA layout on workspace pages. |
| Container depth | 4 | Sidebar shell → main → section → article card (3 levels max). `src/app/(workspace)/layout.tsx:33` — sidebar + main split. Cards at `src/app/(workspace)/dashboard/page.tsx:88-118` — surface bg on var(--surface) with line border. No nesting beyond depth 2 per DESIGN.md §1. |

**Aggregate:** 23/40 (avg 2.9)  
**Design verdict: FAIL** — Motion intent scored 1 (zero motion tokens defined). Spacing scored 2 (missing 9 spacing tokens). Both below mandatory threshold of 3. The slop-detect gate (3 CRITICAL findings) also fails the design gate independently.

---

## Summary of Failures

| # | Gap | Severity | Criterion |
|---|-----|----------|-----------|
| 1 | globals.css missing spacing / elevation / motion tokens; JetBrains Mono not loaded | HIGH | Task 1 Completeness=2; Design Spacing=2, Motion=1 |
| 2 | LoginForm.tsx: no Zod validation, no i18n (all strings hardcoded English) | HIGH | Task 3 Completeness=2; Microcopy=3 (page-level fail) |
| 3 | slop-detect exits 1: 3 CRITICAL side-stripe findings (2 pre-existing, 1 landing) | HIGH | Phase design gate FAIL |
| 4 | Sidebar nav uses `/assistant` not `/ai`; contract returns 9 not 10 | MEDIUM | Task 4 contract FAIL |
| 5 | Locale route contract grep false-negative (functionally correct) | LOW | Contract pattern issue, no functional gap |
| 6 | DB query quote style causes contract grep false-negatives (functionally correct) | LOW | Contract pattern issue, no functional gap |
| 7 | CommandBar has `outline-none` without focus replacement | MEDIUM | A11y HIGH slop-detect finding |

---

## Verdict

**FAIL** — 3 blocking gaps found.

1. **Task 1 Completeness=2:** `src/app/globals.css` is missing the spacing scale (`--space-1`–`--space-24`, `--pad-card`, `--gap-stack`, `--gap-grid`), all 3 elevation tokens (`--elev-1/2/3`), and all 5 motion tokens (`--ease-out-quart`, `--ease-out-expo`, `--d-quick`, `--d-default`, `--d-section`). `JetBrains_Mono` is not loaded in `src/app/layout.tsx`. Design Rubric Spacing=2, Motion=1 both below threshold.

2. **Task 3 Completeness=2:** `src/app/(auth)/login/LoginForm.tsx` has no Zod email validation and no `useTranslations` — all strings are hardcoded English, breaking the GR-default requirement for the login flow.

3. **Phase slop-detect FAIL:** `node ~/.claude/bin/slop-detect.mjs src/` exits 1 with 3 CRITICAL findings (`[ABS-SIDE-STRIPE]` at `src/app/page.tsx:181`, `src/app/retainers/page.tsx:47`, `src/app/trust-ledger/page.tsx:18`). Two are pre-existing demo pages from Phase 1 scope, one is in the preserved landing page.

Run `/qualia-plan 2 --gaps` to fix. Concrete actions needed:
- **globals.css:** Add the full spacing, elevation, and motion token set from DESIGN.md §4-7.
- **layout.tsx:** Add `JetBrains_Mono` font loading; add `jbMono.variable` to `html` className.
- **LoginForm.tsx:** Import `useTranslations('auth')`; replace all hardcoded strings with `t(key)` calls; add Zod `z.string().email().min(5)` client-side validation.
- **page.tsx / retainers / trust-ledger:** Replace `border-l-*` side-stripe classes with full borders or background tints per design-laws.md §8.
- **SidebarNav.tsx:** Rename `/assistant` to `/ai` to match the plan's nav contract (or update the plan to reflect `/assistant`).
