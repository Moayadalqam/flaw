---
phase: 2
type: gap-closure
goal: "Close 3 blocking + 2 cheap-win gaps from phase-2-verification.md — design tokens, login i18n+Zod, slop-detect CRITICAL findings"
tasks: 3
waves: 1
source_report: .planning/phase-2-verification.md
---

# Phase 2 — Gap Closure

**Goal:** Bring `npm run db:test`-clean Phase 2 to a fully PASSing verification by closing the 3 blocking gaps (incomplete DESIGN.md token set, login page hardcoded English without Zod, slop-detect CRITICAL `[ABS-SIDE-STRIPE]` in 3 pages) and folding in 2 cheap wins (CommandBar `outline-none` a11y, SidebarNav `/assistant`→`/ai` route harmonization).

**Why this gap-closure exists:** Phase 2 verification scored Task 1 Completeness=2 (missing tokens), Task 3 Completeness=2 (login violates GR-default REQ-013), and the phase-level design gate FAIL (slop-detect exits 1 with 3 CRITICAL findings). The fix surface is small and orthogonal across files — all three tasks can run in parallel as Wave 1.

**Scope discipline:** No new features. No re-architecture. Each task fixes EXACTLY the cited findings from `.planning/phase-2-verification.md`. The verifier's contract grep false-negatives (Gap 5 locale-route `z.enum(locales)`, Gap 6 single-vs-double quotes) are NOT addressed — those are contract-pattern issues, not code issues; the verifier marked them functionally correct. They will be resolved by the next plan's quote-agnostic contracts.

---

## Task 1 — Complete DESIGN.md token set + load JetBrains Mono
**Wave:** 1
**Persona:** frontend
**Files:**
- `src/app/globals.css` — add spacing scale (`--space-1` through `--space-24`), `--pad-card`, `--gap-stack`, `--gap-grid`, 3 elevation tokens (`--elev-1/2/3`), 5 motion tokens (`--ease-out-quart`, `--ease-out-expo`, `--ease-out-std`, `--d-instant`, `--d-quick`, `--d-default`, `--d-section`, `--d-feature`); register `--font-mono: var(--font-jetbrains-mono)` in the `@theme inline` block; add `.mono` and `.prose` utility classes (`.display` is already present as `.font-display` — alias it).
- `src/app/layout.tsx` — import `JetBrains_Mono` from `next/font/google`, instantiate it with `variable: "--font-jetbrains-mono"`, `subsets: ["latin"]`, `weight: ["400", "500"]`, `display: "swap"`; append `${jetbrainsMono.variable}` to the `<html>` className.

**Depends on:** none

**Why:** DESIGN.md §3 specifies Söhne Mono with JetBrains Mono as the substitute; without it, `.mono` utility classes (invoice numbers, amounts, line items per §3 mandatory tabular numerals) have no font binding. DESIGN.md §4 spacing scale, §6 elevation tokens, §7 motion tokens are referenced by Phase 3+ components — without them every shadow/transition becomes a hardcoded `oklch(...)` slop violation. This is the substrate fix that unblocks Phases 3-6 from inventing tokens at use site.

**Acceptance Criteria:**
- `src/app/globals.css` declares every token from DESIGN.md §4 (`--space-1`,`--space-2`,`--space-3`,`--space-4`,`--space-6`,`--space-8`,`--space-12`,`--space-16`,`--space-24`,`--pad-card`,`--gap-stack`,`--gap-grid`), §6 (`--elev-1`,`--elev-2`,`--elev-3`), and §7 (`--ease-out-quart`,`--ease-out-expo`,`--ease-out-std`,`--d-instant`,`--d-quick`,`--d-default`,`--d-section`,`--d-feature`) — literal token names match DESIGN.md to the character.
- `globals.css` contains `--font-mono: var(--font-jetbrains-mono)` inside `@theme inline`, plus `.mono { font-family: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace; }` and `.prose { max-width: 65ch; }` utility classes.
- `src/app/layout.tsx` imports `JetBrains_Mono` from `next/font/google`, instantiates it with the `--font-jetbrains-mono` variable, and adds the variable to the `<html>` className alongside Crimson Pro and Inter Tight.
- No `#hex`, `rgb(`, or `hsl(` appears in either file — every new value uses OKLCH or `var(--…)`.
- All elevation tokens use the DESIGN.md §6 OKLCH-tinted formula (`oklch(0.18 0.020 50 / …)` for the shadow alpha).

**Action:**
1. Open `src/app/globals.css`. After the existing `--pad-section: clamp(1.5rem, 5vw, 4rem);` line, append the rest of the §4 spacing scale exactly as DESIGN.md specifies:
   ```css
   --space-1: 4px;
   --space-2: 8px;
   --space-3: 12px;
   --space-4: 16px;
   --space-6: 24px;
   --space-8: 32px;
   --space-12: 48px;
   --space-16: 64px;
   --space-24: 96px;
   --pad-card: 1rem 1.25rem;
   --gap-stack: 0.875rem;
   --gap-grid: 1rem;
   ```
2. After the spacing block (still inside `:root`), append §6 elevation tokens copied from DESIGN.md:
   ```css
   --elev-1: 0 1px 2px oklch(0.18 0.020 50 / 0.06);
   --elev-2: 0 4px 12px oklch(0.18 0.020 50 / 0.10);
   --elev-3: 0 12px 32px oklch(0.18 0.020 50 / 0.16);
   ```
3. After elevation, append §7 motion tokens:
   ```css
   --ease-out-quart: cubic-bezier(0.22, 1, 0.36, 1);
   --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
   --ease-out-std:   cubic-bezier(0, 0, 0.2, 1);
   --d-instant: 100ms;
   --d-quick:   150ms;
   --d-default: 200ms;
   --d-section: 300ms;
   --d-feature: 500ms;
   ```
4. In the `@theme inline { … }` block, add `--font-mono: var(--font-jetbrains-mono);` on a new line after `--font-body`. This wires Tailwind's `font-mono` utility to JetBrains Mono.
5. After the existing `.font-display` rule, append:
   ```css
   .mono {
     font-family: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
     font-feature-settings: "tnum" 1, "lnum" 1;
   }
   .prose { max-width: 65ch; }
   ```
6. Open `src/app/layout.tsx`. Update the imports on line 2:
   ```ts
   import { Crimson_Pro, Inter_Tight, JetBrains_Mono } from "next/font/google";
   ```
7. After the `interTight` definition, append:
   ```ts
   const jetbrainsMono = JetBrains_Mono({
     variable: "--font-jetbrains-mono",
     subsets: ["latin"],
     weight: ["400", "500"],
     display: "swap",
   });
   ```
8. Update the `<html>` className from `${crimsonPro.variable} ${interTight.variable} h-full antialiased` to `${crimsonPro.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`.

**Validation:** (run BEFORE committing)
- `grep -cE "^\s*--(space-1|space-2|space-3|space-4|space-6|space-8|space-12|space-16|space-24|pad-card|gap-stack|gap-grid|elev-1|elev-2|elev-3|ease-out-quart|ease-out-expo|ease-out-std|d-instant|d-quick|d-default|d-section|d-feature):" src/app/globals.css` → `23` (one match per required token; missing one fails this check)
- `grep -c "JetBrains_Mono" src/app/layout.tsx` → `2` (one import, one constructor call)
- `grep -c "jetbrainsMono.variable" src/app/layout.tsx` → `1`
- `grep -cE "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" src/app/globals.css src/app/layout.tsx` → `0` (no hex/rgb/hsl introduced)
- `node ~/.claude/bin/slop-detect.mjs src/app/globals.css src/app/layout.tsx --severity=critical` → exit `0`
- `npx tsc --noEmit` → exit `0`

**Context:** Read @.planning/DESIGN.md (sections §4, §6, §7 are the source of truth — copy token names verbatim), @.planning/phase-2-verification.md (Gap 2 "Missing DESIGN.md token set"), @src/app/globals.css (current state), @src/app/layout.tsx (current font wiring pattern for Crimson Pro and Inter Tight — JetBrains Mono follows the same shape).

**Design:**
- Register: brand (Lex's editorial-legal substrate)
- Tokens used: every new declaration uses OKLCH (elevations) or scalar (spacing/motion). `--font-mono` resolves through `var(--font-jetbrains-mono)`.
- Scope: app (substrate file — affects every downstream component)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/app/globals.css src/app/layout.tsx --severity=critical` pre-commit; commit blocked on critical findings.

---

## Task 2 — LoginForm + login page: Zod validation + full next-intl coverage
**Wave:** 1
**Persona:** frontend
**Files:**
- `messages/el-CY.json` — add new top-level `login` namespace with 7 keys (Greek translations).
- `messages/en-CY.json` — add the same `login` namespace (English) — keys must be the EXACT same set; key-shape parity is a contract.
- `src/app/(auth)/login/LoginForm.tsx` — import `useTranslations` from `next-intl` and `z` from `zod`; replace all hardcoded English strings with `t(key)` calls; add a Zod schema (`z.object({ email: z.string().email().min(5) })`) and parse the email before `signInWithOtp`; surface validation errors via the existing `error` state.
- `src/app/(auth)/login/page.tsx` — convert to async server component that calls `getTranslations('login')`; replace the hardcoded subtitle and footer strings with `t('subtitle')` / `t('disclaimer')`.

**Depends on:** none (no file overlap with Task 1 or Task 3)

**Why:** REQ-013 mandates bilingual UI with Greek default. The login page is the SINGLE entry point for any Greek-locale user; today it renders English-only, violating Task 3 Acceptance Criteria "All visible strings come from useTranslations() / getTranslations()" and the phase-level "GR is the default locale." The plan's Task 3 also specified Zod email validation — currently delegated to the browser's `type="email"` only, which accepts `a@b` (no TLD) and gives no localized error message.

**Acceptance Criteria:**
- A Greek user visiting `/login` with `el-CY` cookie sees: "Ο νομικός σου χώρος εργασίας" (or equivalent native phrasing) as the subtitle, "Email" rendered as "Διεύθυνση email", the CTA button as "Στείλε μου τον σύνδεσμο" (sending state: "Αποστολή…"), success state as "Έλεγξε τα εισερχόμενά σου. Ο σύνδεσμος θα φτάσει μέσα σε 30 δευτερόλεπτα.", and the disclaimer in Greek. Zero English glyphs visible in the rendered DOM.
- A user typing `notanemail` into the email field and pressing submit sees a localized validation error ("Παρακαλώ εισάγετε έγκυρη διεύθυνση email" / "Please enter a valid email") and `signInWithOtp` is NOT called.
- `messages/el-CY.json` and `messages/en-CY.json` both contain a `login` namespace with EXACTLY these keys: `title`, `subtitle`, `emailLabel`, `emailPlaceholder`, `send`, `sending`, `checkInbox`, `error`, `invalidEmail`, `disclaimer`.
- `src/app/(auth)/login/LoginForm.tsx` imports `useTranslations` from `next-intl` and `z` from `zod`; contains zero hardcoded English strings in JSX text content.
- `src/app/(auth)/login/page.tsx` is async, imports `getTranslations` from `next-intl/server`, and contains zero hardcoded English strings in JSX text.
- `npx tsc --noEmit` exits 0.

**Action:**

1. **Add the i18n keys.** Open `messages/el-CY.json`. After the existing `"dashboard": { … }` closing brace (line 124), add a comma and then a new top-level `login` namespace:
   ```json
   "login": {
     "title": "Lex",
     "subtitle": "Συνδέσου στον χώρο εργασίας σου.",
     "emailLabel": "Διεύθυνση email",
     "emailPlaceholder": "you@firm.cy",
     "send": "Στείλε μου τον μαγικό σύνδεσμο",
     "sending": "Αποστολή…",
     "checkInbox": "Έλεγξε τα εισερχόμενά σου. Ο μαγικός σύνδεσμος θα φτάσει μέσα σε 30 δευτερόλεπτα.",
     "error": "Κάτι πήγε στραβά. Παρακαλώ δοκίμασε ξανά.",
     "invalidEmail": "Παρακαλώ εισάγετε έγκυρη διεύθυνση email.",
     "disclaimer": "Ένας μαγικός σύνδεσμος θα σου σταλεί με email. Χωρίς κωδικούς, ποτέ."
   }
   ```
2. Open `messages/en-CY.json`. Add the same namespace at the same position with English values:
   ```json
   "login": {
     "title": "Lex",
     "subtitle": "Sign in to your workspace.",
     "emailLabel": "Email address",
     "emailPlaceholder": "you@firm.cy",
     "send": "Email me the magic link",
     "sending": "Sending…",
     "checkInbox": "Check your inbox. The magic link will land within 30 seconds.",
     "error": "Something went wrong. Please try again.",
     "invalidEmail": "Please enter a valid email address.",
     "disclaimer": "A magic link will be emailed to you. No passwords, ever."
   }
   ```
3. **Rewrite the login server page.** Open `src/app/(auth)/login/page.tsx`. Convert to async, import `getTranslations` from `next-intl/server`, replace hardcoded strings:
   ```ts
   import type { Metadata } from "next";
   import { redirect } from "next/navigation";
   import { getTranslations } from "next-intl/server";
   import { createClient } from "@/lib/supabase/server";
   import { LoginForm } from "./LoginForm";

   export const metadata: Metadata = {
     title: "Sign in · Lex",
     description: "Sign in to your Lex workspace via magic link.",
   };

   export default async function LoginPage() {
     const supabase = await createClient();
     const {
       data: { user },
     } = await supabase.auth.getUser();
     if (user) {
       redirect("/dashboard");
     }
     const t = await getTranslations("login");

     return (
       <div>
         <div className="text-center mb-8">
           <div
             className="font-display text-3xl tracking-tight"
             style={{ color: "var(--accent)", letterSpacing: "-0.025em" }}
           >
             {t("title")}
           </div>
           <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
             {t("subtitle")}
           </p>
         </div>
         <LoginForm />
         <p
           className="text-xs text-center mt-8"
           style={{ color: "var(--dim)" }}
         >
           {t("disclaimer")}
         </p>
       </div>
     );
   }
   ```
4. **Rewrite the client form with Zod + i18n.** Open `src/app/(auth)/login/LoginForm.tsx`. Add imports at the top:
   ```ts
   "use client";

   import { useState } from "react";
   import type { FormEvent } from "react";
   import { useTranslations } from "next-intl";
   import { z } from "zod";
   import { createClient } from "@/lib/supabase/client";
   ```
5. Inside the component (above the `useState` calls), define the schema and pull translations:
   ```ts
   const t = useTranslations("login");
   const emailSchema = z.string().email().min(5);
   ```
6. In the `submit` handler, parse the email before calling Supabase. On failure, set `error` to `t("invalidEmail")` and short-circuit:
   ```ts
   async function submit(e: FormEvent<HTMLFormElement>) {
     e.preventDefault();
     const parsed = emailSchema.safeParse(email);
     if (!parsed.success) {
       setError(t("invalidEmail"));
       setState("error");
       return;
     }
     setState("sending");
     setError(null);
     const supabase = createClient();
     const { error: err } = await supabase.auth.signInWithOtp({
       email: parsed.data,
       options: {
         emailRedirectTo: `${window.location.origin}/auth/callback`,
       },
     });
     if (err) {
       setError(err.message || t("error"));
       setState("error");
       return;
     }
     setState("sent");
   }
   ```
7. Replace every hardcoded string in JSX with `t(key)`:
   - `Email` (label, line 43) → `{t("emailLabel")}`
   - `you@firm.cy` (placeholder, line 55) → `{t("emailPlaceholder")}`
   - `Check your inbox. The magic link will land within 30 seconds.` (line 78) → `{t("checkInbox")}`
   - `Sending…` (line 93) → `{t("sending")}`
   - `Email me the magic link` (line 93) → `{t("send")}`
8. Leave the existing `focus-visible:outline-2` and `focus-visible:outline-offset-2` patterns untouched — that fix already shipped in commit `c4ef6ba`.

**Validation:**
- `grep -c '"login":' messages/el-CY.json` → `1`
- `grep -c '"login":' messages/en-CY.json` → `1`
- `node -e "const el=require('./messages/el-CY.json').login;const en=require('./messages/en-CY.json').login;const a=Object.keys(el).sort().join(',');const b=Object.keys(en).sort().join(',');if(a!==b){console.error('MISMATCH',a,b);process.exit(1)}console.log('OK')"` → prints `OK`
- `grep -c "useTranslations" src/app/(auth)/login/LoginForm.tsx` → `≥1`
- `grep -c "z.string().email" src/app/(auth)/login/LoginForm.tsx` → `≥1`
- `grep -c "getTranslations" src/app/(auth)/login/page.tsx` → `≥1`
- `grep -cE "Sign in to your workspace|Email me the magic link|Check your inbox|Sending…|A magic link will be emailed" src/app/(auth)/login/page.tsx src/app/(auth)/login/LoginForm.tsx` → `0` (no hardcoded English remains)
- `npx tsc --noEmit` → exit `0`

**Context:** Read @.planning/DESIGN.md (microcopy register — legal-professional voice; no exclamation marks, no emoji), @.planning/phase-2-verification.md (Gap 3 "LoginForm.tsx missing Zod validation and i18n"), @src/app/(auth)/login/LoginForm.tsx (current state), @src/app/(auth)/login/page.tsx (current state), @messages/el-CY.json (existing namespaces — match the shape: `nav`, `common`, `auth`, `actions`…), @messages/en-CY.json (parity reference).

**Design:**
- Register: brand
- Tokens used: `var(--accent)`, `var(--muted)`, `var(--dim)`, `var(--bg)`, `var(--line)`, `var(--text)`, `var(--ok)`, `var(--kill)` (all already in use — no new tokens introduced)
- Scope: page (login)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs "src/app/(auth)/login/" --severity=critical` pre-commit; commit blocked on critical findings.

---

## Task 3 — Slop-detect remediation + cheap-win UI patches
**Wave:** 1
**Persona:** frontend
**Files:**
- `src/app/page.tsx` — line 181: replace `<article key={f.title} className="border-l-2 border-[var(--accent-bg)] pl-5">` with a full-border treatment that preserves the visual rhythm without triggering `[ABS-SIDE-STRIPE]`.
- `src/app/retainers/page.tsx` — line 47: replace `className="mb-8 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"` with `className="mb-8 px-5 py-4 rounded-md border bg-[var(--bg)]"` (also drop `borderLeftColor` on line 91 of the `<article>` block — switch to a full `borderColor: "var(--trust)"`).
- `src/app/trust-ledger/page.tsx` — line 18: replace `className="mb-6 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"` with `className="mb-6 px-5 py-4 rounded-md border bg-[var(--bg)]"`.
- `src/components/CommandBar.tsx` — line 94: add `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]` to the input className alongside the existing `outline-none` (or replace `outline-none` with the focus-visible pattern). HIGH a11y slop finding.
- `src/components/SidebarNav.tsx` — line 48: change `{ href: "/assistant", key: "assistant", icon: Sparkles }` to `{ href: "/ai", key: "assistant", icon: Sparkles }` (href changes; key stays `assistant` because the message catalogues are keyed on `nav.assistant` and we're not re-translating). The route harmonizes with the plan's `/ai` contract.

**Depends on:** none (no file overlap with Tasks 1 or 2)

**Why:** Three CRITICAL `[ABS-SIDE-STRIPE]` findings block the phase-level design gate (`node ~/.claude/bin/slop-detect.mjs src/` must exit 0). The fix pattern is already established in commit `077ffe4` (CommandBar.tsx + ReminderModal.tsx) — replace decorative `border-l-N` with full `border` and keep the color via `borderColor`. The CommandBar input has `outline-none` without focus replacement — HIGH a11y violation per the verifier; the pattern from LoginForm (commit `c4ef6ba`) ports directly. The SidebarNav `/assistant`→`/ai` rename harmonizes with the plan's nav contract that returned 9/10.

**Acceptance Criteria:**
- `node ~/.claude/bin/slop-detect.mjs src/ --severity=critical` exits `0` (zero CRITICAL findings remain in `src/`).
- Visual hierarchy on the landing page feature list, retainers banner, and trust-ledger banner is preserved — the section still reads as a callout, just with a full border instead of a left-only stripe. The terracotta/trust accent color survives via `borderColor`.
- The CommandBar input shows a 2px terracotta focus ring on keyboard focus (Tab key); the `outline-none` default behaviour for mouse-click focus is preserved.
- The sidebar "Assistant" link points to `/ai` and renders the same "Βοηθός" / "Assistant" label (the `nav.assistant` key is untouched).
- No new `border-l-N` patterns introduced anywhere in `src/`.

**Action:**

1. **Fix `src/app/page.tsx` line 181** — change the article className from `"border-l-2 border-[var(--accent-bg)] pl-5"` to `"border border-[var(--line-soft)] rounded-md p-5"`. This swaps the side-stripe for a full subtle border + matching padding (no `pl-5` needed because `p-5` covers it).
2. **Fix `src/app/retainers/page.tsx` line 47** — change `"mb-8 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"` to `"mb-8 px-5 py-4 rounded-md border bg-[var(--bg)]"`. The inline `style={{ borderColor: "var(--trust)" }}` survives unchanged and now applies to all 4 borders, preserving the sage-olive trust-ledger semantic.
3. **Fix `src/app/retainers/page.tsx` line 91** (same file, second occurrence — the per-retainer `<article>`): replace the `style={{ borderLeftWidth: 4, borderLeftColor: "var(--trust)" }}` with `style={{ borderColor: "var(--trust)" }}`. The element already has `border border-[var(--line)]` so the override changes all 4 sides to trust color — visually equivalent intent (this is a "trust ledger card") without the asymmetric stripe.
4. **Fix `src/app/trust-ledger/page.tsx` line 18** — change `"mb-6 px-5 py-4 rounded-md border-l-4 bg-[var(--bg)]"` to `"mb-6 px-5 py-4 rounded-md border bg-[var(--bg)]"`. The inline `style={{ borderColor: "var(--trust)" }}` survives.
5. **Fix `src/components/CommandBar.tsx` line 94** — change the input className from `"flex-1 bg-transparent outline-none text-[var(--text)] text-base placeholder:text-[var(--dim)]"` to `"flex-1 bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)] text-[var(--text)] text-base placeholder:text-[var(--dim)]"`. The `outline-none` stays for mouse-click; `focus-visible:` overrides on keyboard focus.
6. **Fix `src/components/SidebarNav.tsx` line 48** — change `{ href: "/assistant", key: "assistant", icon: Sparkles }` to `{ href: "/ai", key: "assistant", icon: Sparkles }`. The `key: "assistant"` stays untouched (i18n catalogue keys are stable).

**Validation:**
- `node ~/.claude/bin/slop-detect.mjs src/ --severity=critical` → exit `0`
- `grep -rn "border-l-[0-9]" src/app/ src/components/` → `0` matches (or only matches outside the 5 files we fixed — verify each is intentional and NOT a side-stripe)
- `grep -c 'href: "/ai"' src/components/SidebarNav.tsx` → `1`
- `grep -c 'href: "/assistant"' src/components/SidebarNav.tsx` → `0`
- `grep -cE "/(dashboard|clients|cases|invoices|receipts|quotations|retainers|trust|ai|reports)" src/components/SidebarNav.tsx` → `10` (all ten nav routes now present, harmonizing with the original Task 4 contract)
- `grep -c "focus-visible:outline-2" src/components/CommandBar.tsx` → `1`
- `npx tsc --noEmit` → exit `0`

**Context:** Read @.planning/DESIGN.md (§10 anti-pattern checklist — full borders over side-stripes; §5 Inputs — focus ring 2px offset, `--accent` color), @.planning/phase-2-verification.md (Gap 4 sidebar `/assistant`, Gap 7 slop-detect findings), the fix pattern from commit `077ffe4` (CommandBar.tsx + ReminderModal.tsx replaced `border-l-2` with `border`), the focus-visible pattern from commit `c4ef6ba` (`src/app/(auth)/login/LoginForm.tsx:57` and `:84` are the working reference), @src/app/page.tsx, @src/app/retainers/page.tsx, @src/app/trust-ledger/page.tsx, @src/components/CommandBar.tsx, @src/components/SidebarNav.tsx.

**Design:**
- Register: brand (workspace shell + landing)
- Tokens used: `var(--line-soft)`, `var(--trust)`, `var(--accent)` — all existing tokens, no new declarations
- Scope: component (5 surgical UI patches)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/ --severity=critical` pre-commit; commit blocked on critical findings. This is the phase-level gate that originally failed — it MUST exit 0 after this task.

---

## Success Criteria

- [ ] `src/app/globals.css` declares every DESIGN.md §4/§6/§7 token (23 token names match verbatim).
- [ ] `src/app/layout.tsx` loads JetBrains Mono via `next/font/google` and registers `--font-jetbrains-mono`.
- [ ] `src/app/(auth)/login/LoginForm.tsx` validates email with Zod and pulls every visible string via `useTranslations("login")`.
- [ ] `src/app/(auth)/login/page.tsx` is async and pulls every visible string via `getTranslations("login")`.
- [ ] `messages/el-CY.json` and `messages/en-CY.json` each carry a `login` namespace with identical key shape (10 keys).
- [ ] `node ~/.claude/bin/slop-detect.mjs src/ --severity=critical` exits `0` across the entire `src/` tree.
- [ ] `src/components/SidebarNav.tsx` href is `/ai` (matches the original plan's 10-route contract).
- [ ] `src/components/CommandBar.tsx` input has a `focus-visible:` outline replacement.
- [ ] `npx tsc --noEmit` exits `0`.
- [ ] No new `#hex`, `rgb(`, `hsl(`, or `border-l-N` patterns introduced anywhere.

---

## Verification Contract

### Contract for Task 1 — globals.css token completeness
**Check type:** grep-match
**Command:** `grep -cE "^\s*--(space-1|space-2|space-3|space-4|space-6|space-8|space-12|space-16|space-24|pad-card|gap-stack|gap-grid|elev-1|elev-2|elev-3|ease-out-quart|ease-out-expo|ease-out-std|d-instant|d-quick|d-default|d-section|d-feature):" src/app/globals.css`
**Expected:** `23`
**Fail if:** Returns < 23 — at least one DESIGN.md §4/§6/§7 token is missing.

### Contract for Task 1 — JetBrains Mono loaded
**Check type:** grep-match
**Command:** `grep -c "JetBrains_Mono" src/app/layout.tsx`
**Expected:** `2`
**Fail if:** Returns 0 — font not imported. Returns 1 — imported but not instantiated.

### Contract for Task 1 — font variable wired into html className
**Check type:** grep-match
**Command:** `grep -c "jetbrainsMono.variable" src/app/layout.tsx`
**Expected:** `1`
**Fail if:** Returns 0 — variable declared but not attached to `<html>`.

### Contract for Task 1 — no hex/rgb/hsl in CSS substrate
**Check type:** grep-match
**Command:** `grep -cE "#[0-9a-fA-F]{3,8}|rgb\(|hsl\(" src/app/globals.css src/app/layout.tsx`
**Expected:** `0`
**Fail if:** Returns > 0 — DESIGN.md §2 OKLCH-only rule broken.

### Contract for Task 2 — login namespace in both catalogues
**Check type:** grep-match
**Command:** `grep -l '"login":' messages/el-CY.json messages/en-CY.json | wc -l`
**Expected:** `2`
**Fail if:** Returns < 2 — at least one catalogue missing the namespace.

### Contract for Task 2 — login namespace key parity (el-CY vs en-CY)
**Check type:** command-exit
**Command:** `node -e "const el=require('./messages/el-CY.json').login;const en=require('./messages/en-CY.json').login;const a=Object.keys(el).sort().join(',');const b=Object.keys(en).sort().join(',');if(a!==b){console.error('MISMATCH el='+a+' en='+b);process.exit(1)}console.log('OK')"`
**Expected:** Prints `OK`, exit `0`
**Fail if:** Exit `1` — key shapes diverge; runtime `t()` calls will produce MISSING_MESSAGE warnings in one locale.

### Contract for Task 2 — Zod email validation present in LoginForm
**Check type:** grep-match
**Command:** `grep -c "z.string().email" src/app/\(auth\)/login/LoginForm.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — Zod email validation not implemented.

### Contract for Task 2 — useTranslations wired in LoginForm
**Check type:** grep-match
**Command:** `grep -c "useTranslations" src/app/\(auth\)/login/LoginForm.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — i18n hook not imported; strings still hardcoded.

### Contract for Task 2 — getTranslations wired in login page
**Check type:** grep-match
**Command:** `grep -c "getTranslations" src/app/\(auth\)/login/page.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — server page still hardcodes English.

### Contract for Task 2 — no hardcoded English on login route
**Check type:** grep-match
**Command:** `grep -cE "Sign in to your workspace|Email me the magic link|Check your inbox|Sending…|A magic link will be emailed" src/app/\(auth\)/login/page.tsx src/app/\(auth\)/login/LoginForm.tsx`
**Expected:** `0`
**Fail if:** Returns > 0 — one of the original English strings still appears in JSX.

### Contract for Task 3 — phase-level slop-detect gate (the original FAIL)
**Check type:** command-exit
**Command:** `node ~/.claude/bin/slop-detect.mjs src/ --severity=critical`
**Expected:** Exit `0`
**Fail if:** Exit `1` — any CRITICAL finding remains. This is THE gate that originally failed Phase 2.

### Contract for Task 3 — no decorative side-stripes remain
**Check type:** grep-match
**Command:** `grep -rn --include="*.tsx" "border-l-[0-9]" src/app/ src/components/`
**Expected:** `0` matches
**Fail if:** Returns any matches — verify each is NOT a decorative side-stripe (e.g. a divider on a table cell may be legitimate, but on a card/banner/article it's the anti-pattern).

### Contract for Task 3 — sidebar /ai route present
**Check type:** grep-match
**Command:** `grep -c 'href: "/ai"' src/components/SidebarNav.tsx`
**Expected:** `1`
**Fail if:** Returns 0 — sidebar still points to `/assistant`; original Task 4 contract still fails.

### Contract for Task 3 — sidebar /assistant route removed
**Check type:** grep-match
**Command:** `grep -c 'href: "/assistant"' src/components/SidebarNav.tsx`
**Expected:** `0`
**Fail if:** Returns > 0 — old href not replaced (would produce 11 nav items instead of 10).

### Contract for Task 3 — sidebar covers all 10 nav targets (re-runs original Task 4 contract)
**Check type:** command-exit
**Command:** `grep -oE '"/(dashboard|clients|cases|invoices|receipts|quotations|retainers|trust-ledger|ai|reports)"' src/components/SidebarNav.tsx | sort -u | wc -l`
**Expected:** `10`
**Fail if:** Returns < 10 — a route is missing from the sidebar.

### Contract for Task 3 — CommandBar input has focus-visible replacement
**Check type:** grep-match
**Command:** `grep -c "focus-visible:outline-2" src/components/CommandBar.tsx`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — `outline-none` still on the input without focus replacement; a11y HIGH finding persists.

### Contract for Phase — TypeScript compiles clean
**Check type:** command-exit
**Command:** `npx tsc --noEmit`
**Expected:** Exit `0`
**Fail if:** Any TypeScript error introduced by the gap-closure changes.

### Contract for Phase — behavioral (manual) — Greek login renders end-to-end
**Check type:** behavioral
**Command:** (verifier sets `NEXT_LOCALE=el-CY` cookie or opens `/login` in a fresh browser session with the locale switched, then visually inspects)
**Expected:** Every visible string on `/login` renders in Greek glyphs. Submitting `notanemail` shows the localized Zod error in Greek. Submitting a valid email shows the Greek "checkInbox" success state.
**Fail if:** Any English string is visible OR the validation error is in English OR the success state shows the original English copy.
