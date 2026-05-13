---
phase: 3
result: FAIL
gaps: 3
---

# Phase 3 Verification — Invoice + Receipt CRUD + PDF Render

## Contract Results

| Task | Check | Command | Result | Notes |
|------|-------|---------|--------|-------|
| T1 | file-exists | `test -f src/lib/pdf/adapter.ts` | PASS | File exists, 300+ lines |
| T1 | Font.register top-level | `grep -n "Font.register" src/lib/pdf/adapter.ts` | PASS | Lines 102, 111 — `renderInvoicePDF` starts at line 259; registrations precede it |
| T1 | Hyphenation disabled | `grep -c "registerHyphenationCallback" src/lib/pdf/adapter.ts` | PASS | 1 match at line 127 |
| T1 | No Chromium | `grep -r "puppeteer\|chromium" package.json \| wc -l` | PASS | 0 matches |
| T2 | file-exists | `test -f src/lib/pdf/templates/InvoiceDocument.tsx` | PASS | File exists |
| T2 | StyleSheet-subset rule | `grep -cE "(oklch\(|var\(--|className=)" InvoiceDocument.tsx` | PASS | 0 matches |
| T2 | Tabular numerals | `grep -c "tabular-nums" InvoiceDocument.tsx` | PASS | 7 matches |
| T2 | Watermark texts | `grep -E "(ΠΡΟΧΕΙΡΟ\|DRAFT — NOT A TAX DOCUMENT)" InvoiceDocument.tsx \| wc -l` | PASS | 3 matches |
| T3 | Node runtime export | `grep -c "export const runtime = 'nodejs'" route.ts` | **FAIL** (literal) / PASS (intent) | Code uses `"nodejs"` (double quotes) not `'nodejs'` (single); runtime is correctly `"nodejs"` at line 48. Contract grep used single-quote syntax, code uses double-quote. Functionally correct. |
| T3 | renderInvoicePDF wired | `grep -c "renderInvoicePDF" route.ts` | PASS | 4 matches |
| T3 | workspace_id defense | `grep -c "workspace_id" route.ts` | PASS | 5 matches |
| T4 | All invoice files present | `test -f ... && echo ALL_PRESENT` | PASS | All 5 files exist |
| T4 | Top-level invoices deleted | `test ! -d src/app/invoices && echo GONE` | PASS | `GONE` |
| T4 | allocate_invoice_number wired | `grep -c "allocate_invoice_number" actions.ts` | PASS | 3 matches |
| T4 | Service-role bridge | `grep -c "createServiceClient" actions.ts` | PASS | 4 matches |
| T4 | RLS deny-by-omission | `grep -cE "(data\??\.length\s*===?\s*0)" actions.ts` | PASS | 8 matches (threshold ≥ 3) |
| T5 | All receipt files present | `test -f ... && echo ALL_PRESENT` | **FAIL** (contract literal) / PASS (actual) | Contract checks `src/app/api/pdf/receipt/[receiptId]/route.ts` (singular); actual path is `src/app/api/pdf/receipts/[receiptId]/route.ts` (plural). File exists; page links consistently use `/api/pdf/receipts/`. |
| T5 | Top-level receipts deleted | `test ! -d src/app/receipts && echo GONE` | PASS | `GONE` |
| T5 | Receipt route wires adapter | `grep -c "renderReceiptPDF" route.ts` | PASS | 4 matches (at actual path) |
| T6 | Migration 006 file exists | `test -f supabase/migrations/20260513000006_workspace_template_settings.sql` | PASS | EXISTS |
| T6 | Migration adds column | `grep -c "ADD COLUMN template_settings"` | PASS | 1 match |
| T6 | Smoke test file exists | `test -f tests/pdf-smoke.mjs && echo EXISTS` | PASS | EXISTS |
| T6 | Production guard on test route | `grep -c "NODE_ENV === 'production'"` | PASS | 1 match; guard is `process.env.NODE_ENV === "production"` (double quotes — functionally equivalent) |
| T6 | TypeScript clean | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` | PASS | `0` errors |
| T6 | Behavioral: Greek smoke test | `node tests/pdf-smoke.mjs --cold` | **FAIL** | Exit code 1; 2/4 sub-tests pass (see Gap 1 below) |

---

## Gap 1 — CRITICAL: Smoke test cold-start + Greek glyph sub-tests fail

`tests/pdf-smoke.mjs:49` — `"process.env.SMOKE_SEED_INVOICE_ID ?? '00000000-0000-0000-0000-0000000b0001'"` — the default SEED_INVOICE_ID has UUID version `0`, which fails the route's RFC-4122 regex at `src/app/api/pdf/[invoiceId]/route.ts:54-55` (`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`), returning HTTP 400.

Observed output:
```
[PASS] No headless-browser deps
[FAIL] Cold-start fetch /api/pdf/<seed> — HTTP 400 after 1373ms
[FAIL] Greek glyph scan — no PDF buffer to scan
[PASS] Concurrent finalize x5 — numbers=2026/0006,2026/0004,...  unique=true gap_free=true
Summary: 2/4 passed
```

Root causes:
1. **UUID version mismatch** — Seed data uses `00000000-0000-0000-0000-0000000b0001` (version 0, non-RFC-4122). The route correctly enforces `[1-5]` for the UUID version nibble. The smoke test hardcodes this non-v4 UUID as the default.
2. **No authentication** — The smoke test fetches the PDF route with no session cookie. Even with a valid UUID format, the request would receive HTTP 401 because `src/app/api/pdf/[invoiceId]/route.ts:150-152` returns `Unauthorized` when `auth.getUser()` returns null. The smoke test has no mechanism to authenticate as the seed user.

Impact: **Acceptance Criteria AC1 (Greek glyphs) and AC2 (cold-start latency) cannot be verified by the smoke test**. The PDF rendering code itself may be correct (fonts registered at module top-level, Noto Sans covers Greek codepoints), but the behavioral gate is broken. Severity: **CRITICAL** (matches "crashes on happy path" in the Severity Rubric — the primary QA gate for the highest-risk Phase 3 feature is non-functional).

Fix options:
- Option A (recommended): Add a dedicated `/api/pdf/smoke/[invoiceId]` endpoint that uses `createServiceClient()` and is guarded by `NODE_ENV !== 'production'`, analogous to the finalize-concurrent route. The smoke test calls this endpoint (no auth required). Accepts any UUID format (no RFC-4122 restriction needed for this test-only path).
- Option B: Relax the UUID regex to `[0-9a-f]{4}` for version nibble (accepts version 0). Add a JWT cookie to the smoke test using a seed-user service token.

---

## Gap 2 — HIGH: AC4 (draft watermark) not covered by smoke test

`tests/pdf-smoke.mjs` has 4 checks but none is the draft-watermark check. The plan's `Acceptance Criteria` section specifies:
> `[4/4] Draft watermark present on draft / absent on finalized ... PASS`

The smoke test's 4th check is `checkConcurrentFinalize`, not a watermark scan. AC4 has no programmatic verification. The `InvoiceDocument.tsx` does implement the watermark (`src/lib/pdf/templates/InvoiceDocument.tsx:393` — `transform: "rotate(-30deg)"` and Greek/English watermark text present), but no test asserts that a draft PDF contains it and a finalized PDF does not. Severity: **HIGH** (feature works in code but QA gate is missing for a spec-named AC).

---

## Gap 3 — MEDIUM: Inline `oklch()` strings in `style={}` attributes

12 occurrences of bare `oklch(...)` strings inside `style={}` objects across:
- `src/app/(workspace)/invoices/[id]/page.tsx:167` — `boxShadow: "0 4px 20px oklch(0.18 0.020 50 / 0.06)"`
- `src/app/(workspace)/invoices/InvoiceActions.tsx:139,154,214,227` — button colors and error backgrounds
- `src/app/(workspace)/invoices/LineItemEditor.tsx:171` — error background
- `src/app/(workspace)/invoices/NewInvoiceForm.tsx:148` — error background
- `src/app/(workspace)/receipts/[id]/page.tsx:167` — boxShadow
- `src/app/(workspace)/settings/templates/TemplateSettingsForm.tsx:404,417` — background colors

The plan's anti-pattern guard (Task 4 Design section) says: `node bin/slop-detect.mjs src/app/(workspace)/invoices/` must return 0 critical findings, and explicitly bans `oklch()` strings inside `style={}`. The DESIGN.md tokens should be used via CSS variables (`var(--text)`, `var(--kill)`, etc.) rather than hardcoded oklch values. Severity: **MEDIUM** (matches "hardcoded values that should be vars" in Severity Rubric). Additionally, `bin/slop-detect.mjs` does not exist in the repo.

---

## Scores

| Criterion | Correctness | Completeness | Wiring | Quality | Verdict |
|-----------|-------------|--------------|--------|---------|---------|
| AC1 (Greek glyphs) | 3 | 4 | 1 | 4 | **FAIL** |
| AC2 (cold-start latency) | 3 | 4 | 1 | 4 | **FAIL** |
| AC3 (gap-free concurrent finalize) | 5 | 5 | 5 | 5 | PASS |
| AC4 (draft watermark) | 4 | 3 | 2 | 4 | **FAIL** |
| AC5 (Mark Paid → Receipt) | 5 | 5 | 5 | 5 | PASS |
| AC6 (template customization) | 4 | 4 | 4 | 4 | PASS |
| AC7 (TypeScript clean) | 5 | 5 | 5 | 5 | PASS |
| AC8 (no Chromium) | 5 | 5 | 5 | 5 | PASS |
| Demo migration complete | 5 | 5 | 5 | 5 | PASS |

Evidence per FAIL:

**AC1/AC2 — Wiring score 1:**
`tests/pdf-smoke.mjs:47-49` — hardcoded seed UUID `00000000-0000-0000-0000-0000000b0001` fails route UUID validator at `src/app/api/pdf/[invoiceId]/route.ts:54-55`. Smoke test output: `[FAIL] Cold-start fetch /api/pdf/<seed> — HTTP 400`. PDF bytes never returned; Greek glyph scan gets no buffer.

**AC4 — Wiring score 2:**
Watermark is implemented at `src/lib/pdf/templates/InvoiceDocument.tsx:393` — `transform: "rotate(-30deg)"` — but no smoke test or automated check verifies draft watermark present/absent. The plan's `[4/4]` sub-test was not implemented in `tests/pdf-smoke.mjs`.

**Minimum threshold check:** AC1, AC2, AC4 score below 3 on Wiring → FAIL.

---

## Code Quality

- TypeScript: PASS (`0` errors, `npx tsc --noEmit`)
- Stubs found: 0 (HTML `placeholder=` attributes only — not code stubs)
- Empty handlers: 0
- Unused imports: 0
- Inline `oklch()` in `style={}`: 12 occurrences (MEDIUM finding)
- `outline: "none"` without focus replacement: 1 (`src/app/(workspace)/invoices/LineItemEditor.tsx:434`)
- `bin/slop-detect.mjs`: NOT FOUND — the pre-commit guard referenced in the plan does not exist in the repo

---

## Path Deviation

The receipt PDF route is at `src/app/api/pdf/receipts/[receiptId]/route.ts` (plural `receipts`) rather than `src/app/api/pdf/receipt/[receiptId]/route.ts` (singular `receipt`) as specified in the plan. This is a **minor** deviation — the actual path is internally consistent (the detail page at `src/app/(workspace)/receipts/[id]/page.tsx:137` links to `/api/pdf/receipts/${receipt.id}`). The contract grep fails on the literal path but the route is wired correctly.

---

## Design Rubric — Phase 3

Frontend files touched: `src/app/(workspace)/invoices/*`, `src/app/(workspace)/receipts/*`, `src/app/(workspace)/settings/templates/*`, `src/lib/pdf/templates/InvoiceDocument.tsx`, `src/lib/pdf/templates/ReceiptDocument.tsx`.

| Dim | Score | Evidence |
|---|---|---|
| Typography | 4 | `src/app/layout.tsx:2` — Crimson Pro + Inter Tight (Söhne substitute) + JetBrains Mono loaded; 3 weights each; DESIGN.md §3 hierarchy met. PDF templates use Crimson Pro 600/700 for headers and Noto Sans 400/500/600 for body per spec |
| Color cohesion | 3 | CSS vars from `globals.css` used extensively (110 `var(--` occurrences in invoice pages); OKLCH strategy: Restrained. MEDIUM: 12 inline `oklch()` literals in `style={}` instead of vars (`InvoiceActions.tsx:139`, `LineItemEditor.tsx:171`, etc.) |
| Spacing | 4 | `var(--space-4)` through `var(--space-8)` throughout; 8px grid followed; page padding consistent with DESIGN.md §4 |
| States | 3 | Empty states via `emptyLabel` prop on `<Table />` in both list pages; error handling in all Server Actions with typed return. No loading states — expected for server components. `LineItemEditor.tsx` uses `useTransition` for optimistic UI |
| Responsiveness | 3 | 10 responsive breakpoint declarations (`sm:`, `md:`, `lg:`) across templates page; invoice list table is responsive. Low count for a full page suite — mobile experience is partial |
| Accessibility | 3 | Labels on inputs in forms; `alt` attributes on images; `outline: "none"` without focus replacement at `src/app/(workspace)/invoices/LineItemEditor.tsx:434` (LOW finding); no skip link in templates page |
| Motion intent | 4 | PDF watermark rotate(-30deg) transform; `useTransition` in LineItemEditor for optimistic updates; no gratuitous animation |
| Container depth | 4 | Consistent 2-level nesting max per DESIGN.md §surface-2 rule; no deeply nested card-on-card-on-card patterns visible |

**PDF Templates (special scope — StyleSheet subset exception applies):**

| Template | Verdict |
|---|---|
| `InvoiceDocument.tsx` | PASS — no `oklch()`, no CSS vars, no Tailwind; `LexPdfTokens` hex values used throughout; watermark, tabular-nums, bilingual labels, logo branch all present |
| `ReceiptDocument.tsx` | PASS — same StyleSheet contract; Greek labels `ΑΠΟΔΕΙΞΗ`, English `RECEIPT`; no watermark (correct — receipts are terminal state) |

**Aggregate:** 28/40 (avg 3.5)

**Design verdict:** PASS (all dims ≥ 3). One MEDIUM finding (inline oklch) noted for next polish cycle.

---

## Verdict

**FAIL — 3 gaps found.**

The phase goal — "Fotini can preview a watermarked Greek PDF, click Finalize once to lock the gap-free invoice number, Mark as Paid to spawn a Receipt" — is architecturally complete. The PDF adapter, templates, route handler, CRUD surfaces, and concurrent finalize SP bridge are all correctly implemented and TypeScript-clean.

The phase FAILS because the behavioral smoke test — the primary QA gate for the highest-risk features (Greek glyph rendering, cold-start latency) — is broken due to a UUID validator mismatch and missing authentication in the test harness. AC4 (draft watermark) has no programmatic verification.

**Specific failures:**

1. **Gap 1 (CRITICAL):** `tests/pdf-smoke.mjs` exits 1. `checkColdStart` and `checkGreekScan` both fail because the hardcoded seed UUID `00000000-0000-0000-0000-0000000b0001` fails the route's RFC-4122 version regex (requires `[1-5]` in position 3; seed UUID has `0`). AC1 and AC2 are unverified.

2. **Gap 2 (HIGH):** AC4 (draft watermark present/absent) is not tested in `tests/pdf-smoke.mjs`. The `[4/4]` sub-test described in the plan was not implemented.

3. **Gap 3 (MEDIUM):** 12 inline `oklch()` string literals in `style={}` attributes across workspace frontend files, violating the anti-pattern guard in the plan. `bin/slop-detect.mjs` does not exist.

Run `/qualia-plan 3 --gaps` to address these three issues before advancing to Phase 4.
