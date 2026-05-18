# Production Review — 2026-05-14

**Scope:** all 6 phases of M1 (Demo — Cyprus Lawyers' Invoicing Platform). Run AFTER Phase 6 verified PASS + 3 live-bug hotfixes (i18n × 2 + `/trust-ledger` link × 1).

## Summary

| Category | Critical | High | Medium | Low | Score |
|----------|----------|------|--------|-----|-------|
| Security | 0 | 3 | 5 | 2 | **3**/5 |
| Quality  | 0 | 0 | 1 | 3 | **5**/5 |
| Perf     | 0 | 0 | 2 | 1 | **5**/5 |
| **Total** | **0** | **3** | **8** | **6** | **4.3**/5 |

**Verdict:** **FAIL** — 3 HIGH security findings (unprotected API routes) block `/qualia-ship`. None affect a pitch-from-localhost demo; all block a public production deploy.

## Findings

### CRITICAL

_None._ The service-role bridge is correctly isolated to `src/app/(workspace)/invoices/actions.ts:645` (the `finalizeInvoiceAction → allocate_invoice_number` SP call) with the documented workspace-ownership check before bridging. No client-side service-role import. Zero hardcoded secrets in source. Zero `.env` files tracked. Zero `dangerouslySetInnerHTML` / `eval()`.

### HIGH

#### HIGH-1 — `/api/ai/reminder` API route has no auth gate
**File:** `src/app/api/ai/reminder/route.ts`
**Evidence:** route handler does not call `getUser()` / `getSession()` / `createClient()` — any unauthenticated request can POST and consume an OpenRouter request (and burn the rate limit). Discovered via:
```
for f in $(find src/app/api -name "route.ts"); do
  grep -q "getUser\|getSession\|auth()\|createClient" "$f" || echo "UNPROTECTED: $f"
done
```
**Fix:** add `const { data: { user } } = await supabase.auth.getUser(); if (!user) return new Response('Unauthorized', { status: 401 });` at the top of the handler. Mirror the pattern from `/api/pdf/[invoiceId]/route.ts:146-160` which does it correctly.

#### HIGH-2 — `/api/test/finalize-concurrent` is a test endpoint reachable in production
**File:** `src/app/api/test/finalize-concurrent/route.ts`
**Evidence:** route exists at runtime-resolvable path; no `NODE_ENV !== 'production'` gate. Anyone hitting the prod URL can trigger 5 concurrent `allocate_invoice_number()` SP calls — burns 5 invoice numbers, pollutes audit log, potentially DoS via N parallel requests.
**Fix:** wrap the handler body in `if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });`. The route is needed for `tests/ai-concurrent-finalize.mjs` to work locally; this preserves that.

#### HIGH-3 — `/api/locale` writes a cookie without auth or CSRF protection
**File:** `src/app/api/locale/route.ts`
**Evidence:** unauthenticated endpoint that mutates a state-carrying cookie. Low impact (`NEXT_LOCALE` only switches translation files — not session state), but a cross-site form POST could flip a logged-in user's locale mid-pitch.
**Fix:** confirm the route only writes `NEXT_LOCALE` (not session-bearing cookies); accept POST only with `Origin` header matching the deployed host. If write is read-cookie-only, no fix needed — re-classify as LOW.

### MEDIUM

#### MED-1 — `audit_log` only records the status-flip side effect, not email delivery
**File:** `src/app/(workspace)/reports/aging/actions.ts:36-50`
**Evidence:** `sendReminderAction` triggers the audit row by `UPDATE invoices SET status='sent'` — the trigger logs `(before.status='finalized', after.status='sent')` but NOT the Resend message id, the recipient, or the timestamp of delivery. Phase 6 adversarial-verifier-flagged.
**Fix:** add a direct `audit_log` insert via a small SECURITY DEFINER SP `log_reminder_sent(invoice_id, resend_id, recipient)`, OR widen the audit trigger to capture per-action JSON metadata. Defer to a post-pitch hardening pass — the status flip is *some* audit, just not the one the pitch claim implies.

#### MED-2 — Re-clicking Send accumulates audit-log spam (no `IS DISTINCT FROM` guard)
**File:** `supabase/migrations/20260513000004_audit_triggers.sql`
**Evidence:** the AFTER UPDATE trigger fires on every UPDATE regardless of whether status actually changed. Re-clicking Send on an already-`sent` invoice writes another row with `before.status='sent', after.status='sent'`.
**Fix:** add `WHEN (OLD.status IS DISTINCT FROM NEW.status)` to the trigger definition (Postgres syntax), OR guard at the app layer (early-return in `sendReminderAction` if `invoice.status === 'sent'` already).

#### MED-3 — `tests/smoke.mjs` cascade-fails against production URL
**File:** `tests/smoke-helpers.mjs:323-324`
**Evidence:** `loginViaMailpit` unconditionally probes `localhost:54424`. Against prod (no Mailpit), auth check fails → cascades to fail 4 other checks. Phase 6 adversarial flagged.
**Fix:** add `if (process.env.SKIP_MAILPIT_PROBE === '1') return null;` early in `verifyMailpitReachable`. Document the flag in the deploy runbook.

#### MED-4 — `assistant/actions.ts` + `reports/aging/actions.ts` missing `data.length === 0` deny-by-omission on some paths
**File:** `src/app/(workspace)/assistant/actions.ts`, `src/app/(workspace)/reports/aging/actions.ts`
**Evidence:** 9 server-action files total, only 7 use the deny-by-omission pattern. Assistant is read-only (queries) — acceptable. Aging's `sendReminderAction` UPDATEs invoices but relies on the WHERE clause + trigger; no explicit `data.length === 0` check after the update. If RLS deny-by-omission misses, no audit row writes silently.
**Fix:** add `.select('id').single()` to the aging-actions UPDATE + check the returned row exists. Assistant module is fine as-is.

#### MED-5 — 3 moderate-severity npm vulnerabilities
**Command:** `npm audit --json`
**Evidence:** `critical: 0, high: 0, moderate: 3, low: 0`. No CRITICAL/HIGH transitive vulns.
**Fix:** `npm audit fix` (low-risk) before deploy. Document the 3 in OPERATOR.md if any are intentional non-fixes.

### LOW

- **LOW-1:** `src/app/layout.tsx:32` SEO meta description contains the literal string `"trust-ledger-aware"`. Not a route reference — just stale copy. Update to `"trust-ledger isolation"` or remove hyphen.
- **LOW-2:** `src/app/(workspace)/retainers/page.tsx:26` has a JSDoc comment mentioning `the deleted /trust-ledger`. Documentation, harmless.
- **LOW-3:** 2 `: any` / `as any` casts in `src/` — low impact, no security implication.
- **LOW-4:** 1 `TODO|FIXME|HACK|XXX` left in production code — locate via `grep -rn "TODO\|FIXME" src/` and either resolve or move to ROADMAP.
- **LOW-5:** 9 files >400 lines (`invoices/actions.ts` at 1047, `openrouter/client.ts` at 639, PDF templates at 500-630, `DraftReminderModal.tsx` at 582, `reports/aging/actions.ts` at 506, `NewInvoiceForm.tsx` at 490). PDF templates are inherently large (StyleSheet + JSX layout); others are refactor candidates for a post-pitch pass.
- **LOW-6:** Hardcoded `0.19` / `0.1900` appears 6 times — all documented as the Cyprus VAT rate. `src/lib/totals.ts` is the canonical source; the other 5 occurrences are demo-data or documentation references. Acceptable.

## Cross-cuts I checked (clean)

- **Trust isolation grep on AI + reports + Resend surfaces** → 0 hits ✓
- **Service-role bridge isolation** → only in `finalizeInvoiceAction` ✓
- **TypeScript clean** → 0 errors ✓
- **`dangerouslySetInnerHTML` / `eval()`** → 0 ✓
- **Hardcoded secrets** → 0 ✓
- **`.env` files tracked** → 0 ✓
- **Empty catch blocks** → 0 ✓
- **`<img>` without next/image** → 0 ✓ (project uses next/image consistently; PDF templates use `@react-pdf/renderer` Image which is fine)
- **9 SQL migrations applied** — schema, RLS, numbering, audit triggers, trust-truncate guard, template settings, convert-quotation SP, retainer-with-trust-deposit SP, create-invoice-from-time-entry SP. All Phase 1-5 migrations; no Phase 6 schema changes as planned.
- **Phase 4-6 stale-link cleanup** — `/trust-ledger` → `/trust` migration complete after today's 3 hotfixes (SidebarNav, app/page.tsx, AppNav.tsx).

## Verdict

**FAIL — 3 HIGH security findings.** All 3 are post-pitch ship blockers (unprotected API routes survive a public deploy + DoS). NONE block today's pitch from `http://localhost:3000` — the API routes work fine for an authenticated demo on a single laptop.

**Pitch-day recommendation:** demo from localhost as planned. Fix HIGH-1, HIGH-2, HIGH-3 (~30 min total) post-pitch, before `vercel --prod`. Document MEDIUMs in OPERATOR.md as known punch-list items.

**Next:** `/qualia-optimize --fix` to apply surgical fixes for the 3 HIGHs + 5 MEDIUMs in parallel specialist passes.
