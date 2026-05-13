---
phase: 2
goal: "Magic-link auth + workspace shell + GR/EN toggle + DESIGN.md tokens applied end-to-end, so every subsequent UI phase inherits the correct visual language and i18n primitives."
tasks: 6
waves: 3
---

# Phase 2: UI Shell + i18n

**Goal:** Replace the scaffold default page with a token-correct, bilingual workspace shell. When this phase is done: Fotini opens `/login`, requests a magic link, lands at `/dashboard`, sees Greek by default (with EN toggle), navigates a sidebar to Clients and Cases (both reading seed data with Greek-Cyprus currency + date formatting), and every surface uses the OKLCH palette + Crimson Pro display / Inter Tight body / Söhne Mono fallback typography. No `service_role` key in any client bundle.

**Why this phase:** Phase 1 gave us a legally-correct DB. Today's pitch needs Fotini to see and feel the product — not a `psql` shell. Every Phase 3-6 task assumes this shell exists. We get one shot at first impressions; the editorial typography + restrained palette is the differentiator versus the iJustice baseline she compares us against.

**Requirements covered:** AUTH-01 (REQ-001) · CL-01 (REQ-003) · MT-01 (REQ-004) · I18N-01 (REQ-013)

**Phase 1 carry-overs addressed:**
- D-CARRY-01 — Migration 005 adds `BEFORE TRUNCATE` trigger on `trust_ledger` to close the row-trigger bypass (Task 0).
- D-CARRY-02 — Application code that UPDATEs RLS-scoped rows must check `rowCount === 0` rather than relying on thrown exceptions (Tasks 4 + 5 `Action`).

**Pre-existing static demo (operational truth — DO NOT regress):**
The repo already ships a static demo at the top-level routes (`/`, `/clients`, `/invoices`, `/quotations`, `/retainers`, `/receipts`, `/trust-ledger`, `/reports/summary`) backed by `src/lib/demo-data.ts` and the `AppNav` / `CommandBar` / `ReminderModal` components. Phase 2 moves the route surface area inside the `(workspace)` group so the auth gate covers it, and swaps the data source from `demo-data.ts` to Supabase reads — **without losing the visual template, the AppNav surface, or any route Fotini can already click**. Every frontend task below states this explicitly in its Action section.

---

## Task 0 — Close the `trust_ledger` TRUNCATE backstop (Phase 1 carry-over)

**Wave:** 1
**Persona:** security
**Files:**
- `supabase/migrations/20260513000005_trust_truncate_guard.sql` (NEW)
- `supabase/tests/trust_truncate_guard.sql` (NEW)
- `supabase/tests/run.sh` (MODIFY — append the new test before the existing summary)

**Depends on:** none

**Why:** Migration 002 denies UPDATE/DELETE on `trust_ledger` via a row-level trigger, but `TRUNCATE` fires no row triggers and bypasses RLS entirely under `service_role`. A single mis-run admin script could wipe a disbarment-grade ledger silently. This closes that one remaining hole before the pitch.

**Acceptance Criteria:**
- Running `TRUNCATE public.trust_ledger` as `postgres` / `service_role` raises `insufficient_privilege` or a `RAISE EXCEPTION` from the guard.
- All four existing supabase tests still pass after `npm run db:test`.
- New test file `trust_truncate_guard.sql` asserts the exception is raised and the row count is unchanged.

**Action:**
1. Create `supabase/migrations/20260513000005_trust_truncate_guard.sql` with this body (the file is loaded after 004 by filename order):
   ```sql
   -- Backstop for TRUNCATE — Migration 002's deny_trust_mutation() is row-level,
   -- and TRUNCATE bypasses row triggers + RLS. STATEMENT-level trigger required.
   CREATE OR REPLACE FUNCTION public.deny_trust_truncate()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   AS $$
   BEGIN
     RAISE EXCEPTION 'trust_ledger is append-only; TRUNCATE denied'
       USING ERRCODE = 'insufficient_privilege';
   END
   $$;

   CREATE TRIGGER deny_trust_truncate
     BEFORE TRUNCATE ON public.trust_ledger
     FOR EACH STATEMENT EXECUTE FUNCTION public.deny_trust_truncate();
   ```
2. Create `supabase/tests/trust_truncate_guard.sql` following the same `DO $$ ... RAISE NOTICE` style as the other tests in `supabase/tests/`. Assert: attempting `TRUNCATE public.trust_ledger` raises `SQLSTATE 42501` (insufficient_privilege), and `SELECT COUNT(*) FROM public.trust_ledger` is unchanged before/after.
3. Add a line to `supabase/tests/run.sh` after the existing `trust_immutability.sql` invocation:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$here/trust_truncate_guard.sql"
   ```
4. Run `npm run db:test` and confirm all five tests pass.

**Validation:** (builder self-check before commit)
- `ls supabase/migrations/ | wc -l` → 5
- `npm run db:test` → exits 0; output contains `trust_truncate_guard.sql ... PASS` (or equivalent)
- `grep -c "BEFORE TRUNCATE" supabase/migrations/20260513000005_trust_truncate_guard.sql` → 1

**Context:** Read @supabase/migrations/20260513000002_rls.sql · @supabase/migrations/20260513000004_audit_triggers.sql · @supabase/tests/trust_immutability.sql · @supabase/tests/run.sh

---

## Task 1 — Design tokens + fonts + Tailwind v4 theme (the visual foundation)

**Wave:** 1
**Persona:** frontend
**Files:**
- `src/app/globals.css` (VERIFY/EXTEND — currently already contains DESIGN.md OKLCH tokens; confirm completeness against DESIGN.md §2-7 and add any missing surfaces, spacing, elevation, or motion tokens; do NOT regress the existing file to the Next scaffold)
- `src/app/layout.tsx` (MODIFY — `Crimson_Pro` + `Inter_Tight` already loaded via `next/font/google`; add `JetBrains_Mono` if missing, ensure `lang` is set dynamically from the `next-intl` locale, and wrap `{children}` in `NextIntlClientProvider`. Do NOT regress the existing font wiring)
- `src/lib/format.ts` (NEW — the only place `Intl.NumberFormat` / `Intl.DateTimeFormat` are constructed)
- `src/app/page.tsx` (KEEP — this is the Lex landing page with Greek hero + sample invoice card + 10 features. It is the public marketing surface. DO NOT replace it with a redirect. Phase 2 leaves `/` as the landing and uses `/dashboard` for the authenticated workspace home)

**Depends on:** none

**Why:** Every other Phase 2 task imports from this foundation. If the tokens aren't right on day one, Phases 3-6 each silently regress them — and the slop-detect rules treat the absence of OKLCH / presence of banned fonts as a commit blocker. We also centralise currency / date formatting in `lib/format.ts` so the verifier can prove (one grep) that no rogue `toLocaleString` calls bypass the `el-CY` locale.

**Acceptance Criteria:**
- `src/app/globals.css` contains the OKLCH tokens listed in DESIGN.md §2-7 (surfaces, text, lines, accent, trust, semantic, spacing, elevation, motion) — no `#hex`, no `rgb()`, no `hsl()`. (The file already conforms; this AC is a regression guard.)
- `src/app/layout.tsx` loads Crimson Pro (display, weights 600/700), Inter Tight (body, weights 400/500/600 — substituting Söhne per locked decision #5), and JetBrains Mono (mono fallback for Söhne Mono — weights 400/500). No `Geist`, no plain `Inter`, no `Arial`/`Helvetica`/`system-ui` anywhere.
- The body element uses `var(--bg)` background and `var(--text)` color; `.tabular` utility class applies `font-feature-settings: "tnum" 1, "lnum" 1;`.
- `Intl.NumberFormat('el-CY', { style: 'currency', currency: 'EUR' }).format(1234.56)` returned by `formatCurrency` is `"1.234,56 €"` (verified by validation grep + a Node REPL check during builder self-check).
- `node ~/.claude/bin/slop-detect.mjs src/app/globals.css src/app/layout.tsx` exits 0 (no critical findings).
- `/` continues to render the existing Lex landing (Greek hero + sample invoice card + 10 features). It is NOT a redirect.

**Action:**
1. **`src/app/globals.css`** — Read the file first. If the OKLCH token set, `@theme inline` block, body rules, and `.tabular` / `.display` / `.mono` / `.prose` utilities listed below are already present and match DESIGN.md, leave them alone. Otherwise add what is missing. The target shape:
   ```css
   @import "tailwindcss";

   :root {
     /* DESIGN.md §2 — light theme OKLCH tokens (verbatim) */
     --bg:        oklch(0.985 0.004 60);
     --bg-2:      oklch(0.965 0.006 60);
     --surface:   oklch(0.945 0.008 60);
     --surface-2: oklch(0.920 0.010 60);
     --text:      oklch(0.18 0.012 50);
     --muted:     oklch(0.45 0.012 50);
     --dim:       oklch(0.62 0.010 50);
     --line:      oklch(0.86 0.010 60);
     --line-soft: oklch(0.92 0.008 60);
     --accent:    oklch(0.55 0.150 35);
     --accent-2:  oklch(0.48 0.155 35);
     --accent-bg: oklch(0.55 0.150 35 / 0.10);
     --trust:     oklch(0.45 0.060 145);
     --trust-bg:  oklch(0.45 0.060 145 / 0.08);
     --ok:        oklch(0.55 0.130 150);
     --warn:      oklch(0.65 0.140 75);
     --kill:      oklch(0.52 0.180 25);

     /* DESIGN.md §4 — spacing */
     --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
     --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px; --space-24: 96px;
     --pad-x: clamp(1rem, 4vw, 3rem);
     --pad-section: clamp(1.5rem, 5vw, 4rem);
     --pad-card: 1rem 1.25rem;
     --gap-stack: 0.875rem;
     --gap-grid: 1rem;

     /* DESIGN.md §6 — elevation (tinted toward warm hue) */
     --elev-1: 0 1px 2px oklch(0.18 0.020 50 / 0.06);
     --elev-2: 0 4px 12px oklch(0.18 0.020 50 / 0.10);
     --elev-3: 0 12px 32px oklch(0.18 0.020 50 / 0.16);

     /* DESIGN.md §7 — motion */
     --ease-out-quart: cubic-bezier(0.22, 1, 0.36, 1);
     --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
     --d-quick: 150ms; --d-default: 200ms; --d-section: 300ms;
   }

   @theme inline {
     /* Tailwind v4 — expose CSS vars as Tailwind utilities (bg-bg, text-muted, etc.) */
     --color-bg: var(--bg);
     --color-bg-2: var(--bg-2);
     --color-surface: var(--surface);
     --color-surface-2: var(--surface-2);
     --color-text: var(--text);
     --color-muted: var(--muted);
     --color-dim: var(--dim);
     --color-line: var(--line);
     --color-line-soft: var(--line-soft);
     --color-accent: var(--accent);
     --color-accent-2: var(--accent-2);
     --color-trust: var(--trust);
     --color-ok: var(--ok);
     --color-warn: var(--warn);
     --color-kill: var(--kill);

     --font-display: var(--font-crimson-pro);
     --font-sans:    var(--font-inter-tight);
     --font-mono:    var(--font-jetbrains-mono);
   }

   body {
     background: var(--bg);
     color: var(--text);
     font-family: var(--font-inter-tight), ui-sans-serif;
     font-feature-settings: "ss01" 0;
     -webkit-font-smoothing: antialiased;
   }

   .tabular { font-feature-settings: "tnum" 1, "lnum" 1; }
   .display { font-family: var(--font-crimson-pro), Georgia, serif; }
   .mono    { font-family: var(--font-jetbrains-mono), ui-monospace, monospace; }

   .prose   { max-width: 65ch; }

   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```
2. **`src/app/layout.tsx`** — Read the file first. Crimson Pro + Inter Tight are already loaded. Add `JetBrains_Mono` if missing, wire `getLocale()` / `getMessages()` from `next-intl/server`, and wrap `<body>` content with `<NextIntlClientProvider>`. Target shape:
   ```tsx
   import type { Metadata } from "next";
   import { Crimson_Pro, Inter_Tight, JetBrains_Mono } from "next/font/google";
   import { NextIntlClientProvider } from "next-intl";
   import { getLocale, getMessages } from "next-intl/server";
   import "./globals.css";

   const crimson = Crimson_Pro({ subsets: ["latin", "latin-ext"], variable: "--font-crimson-pro", weight: ["600", "700"], display: "swap" });
   const interTight = Inter_Tight({ subsets: ["latin", "latin-ext", "greek"], variable: "--font-inter-tight", weight: ["400", "500", "600"], display: "swap" });
   const jbMono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-jetbrains-mono", weight: ["400", "500"], display: "swap" });

   export const metadata: Metadata = {
     title: "Lex",
     description: "Cyprus-VAT-compliant invoicing for lawyers.",
   };

   export default async function RootLayout({ children }: { children: React.ReactNode }) {
     const locale   = await getLocale();
     const messages = await getMessages();
     return (
       <html lang={locale} className={`${crimson.variable} ${interTight.variable} ${jbMono.variable} h-full antialiased`}>
         <body className="min-h-full flex flex-col">
           <NextIntlClientProvider locale={locale} messages={messages}>
             {children}
           </NextIntlClientProvider>
         </body>
       </html>
     );
   }
   ```
   Note: `getLocale()` + `getMessages()` work because Task 2 wires `next-intl` to read locale from a cookie set by the toggle (Task 4).
3. **`src/lib/format.ts`** — the single source of truth for `Intl.*`:
   ```ts
   const EUR = (locale: 'el-CY' | 'en-CY') =>
     new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });

   const DATE = (locale: 'el-CY' | 'en-CY') =>
     new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

   export function formatCurrency(amount: number | string, locale: 'el-CY' | 'en-CY' = 'el-CY'): string {
     const n = typeof amount === 'string' ? Number(amount) : amount;
     return EUR(locale).format(Number.isFinite(n) ? n : 0);
   }

   export function formatDate(value: string | Date, locale: 'el-CY' | 'en-CY' = 'el-CY'): string {
     const d = value instanceof Date ? value : new Date(value);
     return DATE(locale).format(d);
   }
   ```
4. **`src/app/page.tsx`** — DO NOT touch. The existing Lex landing (Greek hero + sample invoice card + 10 features, hardcoded `1.234,56 €` in the demo card) is the public marketing surface and is independent of the workspace shell. If you find yourself currency-formatting in the landing in a future phase, import from `@/lib/format` then — but Phase 2 explicitly does not touch it.
5. **Preserve the existing AppNav surface.** `src/components/AppNav.tsx` exists and is consumed by the static demo pages at `/clients`, `/invoices`, etc. Task 4 will introduce the new `(workspace)` sidebar shell that supersedes it for authenticated routes; Task 1 must not delete `AppNav.tsx` (the old static demo pages still mount it until Task 5 moves them into `(workspace)`).
6. **If a demo file already exists at this path, preserve the visual template and replace ONLY the data source — do not regress the styling, the AppNav, or the existing route surface area.** (Applies to `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` — all currently exist; this task only touches `globals.css` and `layout.tsx`, both as additive/verifying edits.)
7. Before commit run `node ~/.claude/bin/slop-detect.mjs src/` and fix every CRITICAL finding (banned fonts, hardcoded `#hex`, gradients, etc.).

**Validation:** (builder self-check before commit)
- `grep -cE '#[0-9a-fA-F]{3,8}\b' src/app/globals.css src/app/layout.tsx` → 0
- `grep -cE 'oklch\(' src/app/globals.css` → ≥ 20 (one per token)
- `grep -cE '\b(Roboto|Arial|Helvetica|system-ui|Geist|Space Grotesk)\b' src/app/layout.tsx src/app/globals.css` → 0 (the word `Inter_Tight` is allowed; the bare word `Inter` as a font name is banned — verify with `grep -wE '\bInter\b' src/app/layout.tsx src/app/globals.css` returns 0)
- `node -e "console.log(new Intl.NumberFormat('el-CY',{style:'currency',currency:'EUR'}).format(1234.56))"` → prints `1.234,56 €`
- `node ~/.claude/bin/slop-detect.mjs src/app/globals.css src/app/layout.tsx` → exits 0
- `npx tsc --noEmit` → exits 0
- `grep -c "Lex" src/app/page.tsx` → ≥ 1 (regression guard: the landing page survives)

**Design:**
- Register: `product`
- Tokens used: `var(--bg)`, `var(--bg-2)`, `var(--surface)`, `var(--surface-2)`, `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--line)`, `var(--line-soft)`, `var(--accent)`, `var(--accent-2)`, `var(--accent-bg)`, `var(--trust)`, `var(--trust-bg)`, `var(--ok)`, `var(--warn)`, `var(--kill)`, plus all `--space-*`, `--pad-*`, `--gap-*`, `--elev-*` and motion vars
- Scope: `app` (every subsequent component reads these)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/` pre-commit; commit blocked on critical findings

**Context:** Read @.planning/DESIGN.md · @.planning/PRODUCT.md · @src/app/globals.css · @src/app/layout.tsx · @src/app/page.tsx · @src/lib/supabase/server.ts · @AGENTS.md

---

## Task 2 — `next-intl` 4.x wiring + Greek-native message catalogues

**Wave:** 1
**Persona:** frontend
**Files:**
- `next.config.ts` (MODIFY — wrap with `createNextIntlPlugin`)
- `src/i18n/request.ts` (NEW — `getRequestConfig`, reads `NEXT_LOCALE` cookie, falls back to `el-CY`)
- `src/i18n/routing.ts` (NEW — `defineRouting({ locales: ['el-CY','en-CY'], defaultLocale: 'el-CY', localePrefix: 'never' })`)
- `messages/el-CY.json` (NEW — Greek strings, **written native**, NOT translated from English)
- `messages/en-CY.json` (NEW — English strings)
- `src/middleware.ts` (NEW — runs the Supabase session refresh from `@/lib/supabase/middleware`; matcher excludes static assets)

**Depends on:** none (runs in parallel with Tasks 0 + 1)

**Why:** I18N-01 (REQ-013). Greek is Fotini's working language; if the toggle is a Phase-3 retrofit, every UI string we write before then has to be re-localised. Doing it first means every Task 3-5 component reaches for `useTranslations()` natively. We use `localePrefix: 'never'` because Fotini opens one URL — switching locales rewrites the cookie, not the path. The middleware also wires Supabase SSR session refresh (`@supabase/ssr` requires it).

**Acceptance Criteria:**
- `next.config.ts` exports `createNextIntlPlugin('./src/i18n/request.ts')(nextConfig)`.
- `messages/el-CY.json` has top-level keys for `nav`, `auth`, `clients`, `cases`, `common` — written in Greek by someone who reads Greek (no English-phrased Greek). Equivalent file in `messages/en-CY.json`.
- Server components import `getTranslations` from `next-intl/server`; client components import `useTranslations` from `next-intl`. Neither file imports from the wrong entry point.
- `src/middleware.ts` runs `updateSession` from `@/lib/supabase/middleware`; matcher: `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)`.
- Default locale is `el-CY`; switching to `en-CY` sets a `NEXT_LOCALE` cookie and re-renders without a full page reload (Task 4 wires the toggle UI).

**Action:**
1. `src/i18n/routing.ts`:
   ```ts
   import { defineRouting } from 'next-intl/routing';
   export const routing = defineRouting({
     locales: ['el-CY', 'en-CY'] as const,
     defaultLocale: 'el-CY',
     localePrefix: 'never',
   });
   export type AppLocale = (typeof routing.locales)[number];
   ```
2. `src/i18n/request.ts`:
   ```ts
   import { cookies } from 'next/headers';
   import { getRequestConfig } from 'next-intl/server';
   import { routing } from './routing';

   export default getRequestConfig(async () => {
     const cookieStore = await cookies();
     const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
     const locale = (routing.locales as readonly string[]).includes(cookieLocale ?? '')
       ? (cookieLocale as (typeof routing.locales)[number])
       : routing.defaultLocale;
     const messages = (await import(`../../messages/${locale}.json`)).default;
     return { locale, messages };
   });
   ```
3. `next.config.ts`:
   ```ts
   import type { NextConfig } from 'next';
   import createNextIntlPlugin from 'next-intl/plugin';

   const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
   const nextConfig: NextConfig = {};
   export default withNextIntl(nextConfig);
   ```
4. `messages/el-CY.json` — write the strings native. Minimum coverage:
   ```json
   {
     "nav": { "dashboard": "Πίνακας", "clients": "Πελάτες", "cases": "Υποθέσεις", "invoices": "Τιμολόγια", "receipts": "Αποδείξεις", "quotations": "Προσφορές", "retainers": "Παρακαταθήκες", "trust": "Λογαριασμός παρακαταθηκών", "ai": "Βοηθός", "reports": "Αναφορές" },
     "auth":  { "title": "Είσοδος στο Lex", "emailLabel": "Διεύθυνση email", "submit": "Αποστολή συνδέσμου", "sent": "Στείλαμε σύνδεσμο στο email σας. Ελέγξτε τα εισερχόμενα.", "checkSpam": "Δεν το βρίσκετε; Ελέγξτε τα ανεπιθύμητα.", "signOut": "Αποσύνδεση" },
     "clients": { "title": "Πελάτες", "new": "Νέος πελάτης", "empty": "Δεν υπάρχουν πελάτες ακόμη.", "tableName": "Όνομα", "tableVat": "ΑΦΜ", "tableLang": "Γλώσσα", "tableCreated": "Δημιουργήθηκε", "form": { "nameEl": "Όνομα (Ελληνικά)", "nameEn": "Όνομα (Αγγλικά)", "vat": "ΑΦΜ", "taxId": "ΤΙΝ", "email": "Email", "phone": "Τηλέφωνο", "address": "Διεύθυνση", "preferredLanguage": "Προτιμώμενη γλώσσα", "save": "Αποθήκευση", "cancel": "Άκυρο", "deleteConfirm": "Διαγραφή πελάτη; Η ενέργεια δεν αναιρείται." } },
     "cases":   { "title": "Υποθέσεις", "new": "Νέα υπόθεση", "empty": "Δεν υπάρχουν υποθέσεις ακόμη.", "tableNumber": "Αριθμός", "tableClient": "Πελάτης", "tableTitle": "Τίτλος", "tableType": "Τύπος", "tableStatus": "Κατάσταση", "tableRate": "Ωριαία χρέωση", "form": { "matterNumber": "Αριθμός υπόθεσης", "client": "Πελάτης", "title": "Τίτλος", "matterType": "Τύπος", "status": "Κατάσταση", "hourlyRate": "Ωριαία χρέωση", "openedAt": "Ημερομηνία ανάληψης" }, "status": { "open": "Ανοικτή", "closed": "Κλειστή", "on_hold": "Σε αναμονή" } },
     "common":  { "loading": "Φόρτωση…", "error": "Κάτι πήγε στραβά.", "retry": "Δοκιμάστε ξανά", "save": "Αποθήκευση", "cancel": "Άκυρο", "delete": "Διαγραφή", "edit": "Επεξεργασία", "search": "Αναζήτηση", "filter": "Φίλτρο", "noResults": "Χωρίς αποτελέσματα.", "switchToEnglish": "English", "switchToGreek": "Ελληνικά" }
   }
   ```
   (The builder may extend, but MUST NOT remove keys. Write Greek that a Cyprus legal professional would write — short, factual, no exclamation marks, no emoji, no em-dashes — per PRODUCT.md §Brand voice.)
5. `messages/en-CY.json` — same shape, English strings:
   ```json
   {
     "nav": { "dashboard": "Dashboard", "clients": "Clients", "cases": "Cases", "invoices": "Invoices", "receipts": "Receipts", "quotations": "Quotations", "retainers": "Retainers", "trust": "Trust ledger", "ai": "Assistant", "reports": "Reports" },
     "auth": { "title": "Sign in to Lex", "emailLabel": "Email address", "submit": "Send link", "sent": "We sent a link to your email. Check your inbox.", "checkSpam": "Not there? Check your spam folder.", "signOut": "Sign out" },
     "clients": { "title": "Clients", "new": "New client", "empty": "No clients yet.", "tableName": "Name", "tableVat": "VAT", "tableLang": "Language", "tableCreated": "Created", "form": { "nameEl": "Name (Greek)", "nameEn": "Name (English)", "vat": "VAT", "taxId": "Tax ID", "email": "Email", "phone": "Phone", "address": "Address", "preferredLanguage": "Preferred language", "save": "Save", "cancel": "Cancel", "deleteConfirm": "Delete client? This cannot be undone." } },
     "cases":   { "title": "Cases", "new": "New case", "empty": "No cases yet.", "tableNumber": "Number", "tableClient": "Client", "tableTitle": "Title", "tableType": "Type", "tableStatus": "Status", "tableRate": "Hourly rate", "form": { "matterNumber": "Matter number", "client": "Client", "title": "Title", "matterType": "Type", "status": "Status", "hourlyRate": "Hourly rate", "openedAt": "Opened" }, "status": { "open": "Open", "closed": "Closed", "on_hold": "On hold" } },
     "common":  { "loading": "Loading…", "error": "Something went wrong.", "retry": "Try again", "save": "Save", "cancel": "Cancel", "delete": "Delete", "edit": "Edit", "search": "Search", "filter": "Filter", "noResults": "No results.", "switchToEnglish": "English", "switchToGreek": "Ελληνικά" }
   }
   ```
6. `src/middleware.ts`:
   ```ts
   import type { NextRequest } from 'next/server';
   import { updateSession } from '@/lib/supabase/middleware';

   export async function middleware(request: NextRequest) {
     return updateSession(request);
   }

   export const config = {
     matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
   };
   ```
7. Update `tsconfig.json` if needed so `messages/*.json` is reachable from `src/` (the import path `../../messages/${locale}.json` already works because the messages dir lives at the repo root). Add `"resolveJsonModule": true` is already present — confirm.

**Validation:**
- `npx tsc --noEmit` → exits 0
- `node -e "const m = require('./messages/el-CY.json'); if (!m.nav.clients || !m.auth.title) process.exit(1); console.log('el-CY OK')"` → prints `el-CY OK`
- `node -e "const a=require('./messages/el-CY.json'), b=require('./messages/en-CY.json'); const k=o=>Object.keys(o).sort().join(','); if (k(a)!==k(b)) {console.error('key mismatch'); process.exit(1)} console.log('keys match')"` → prints `keys match`
- `grep -c "createNextIntlPlugin" next.config.ts` → 1
- `npm run dev` (background) → home `/` continues to render the Lex landing (no 307); shut down

**Design:**
- Register: `product`
- Tokens used: none directly (this task is purely i18n + middleware plumbing)
- Scope: `app`
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/i18n/ src/middleware.ts` pre-commit; commit blocked on critical findings

**Context:** Read @.planning/PRODUCT.md · @.planning/CONTEXT.md · @src/lib/supabase/middleware.ts · @next.config.ts · @AGENTS.md

---

## Task 3 — `(auth)` route group: `/login` magic-link + callback

**Wave:** 1
**Persona:** security
**Files:**
- `src/app/(auth)/layout.tsx` (NEW — minimal centred layout, no sidebar)
- `src/app/(auth)/login/page.tsx` (NEW — Server Component shell with a Client Component form inside)
- `src/app/(auth)/login/LoginForm.tsx` (NEW — Client Component; calls `supabase.auth.signInWithOtp`)
- `src/app/auth/callback/route.ts` (NEW — Route Handler that exchanges the magic-link `code` for a session via `supabase.auth.exchangeCodeForSession`)
- `src/app/auth/sign-out/route.ts` (NEW — POST → `supabase.auth.signOut` → 303 redirect to `/login`)

**Depends on:** none (Wave-1 parallel — uses Phase 1's `src/lib/supabase/server.ts` only; needs no output from Tasks 1 or 2)

**Why:** AUTH-01 (REQ-001). No session = no workspace. The magic-link flow is the single point of entry for Fotini's pitch demo, and SSR-safe session reading is mandatory because the dashboard layout (Task 4) reads `auth.getUser()` on the server. Magic-link via `signInWithOtp` (not `signInWithPassword`) matches the project decision to skip password storage entirely. The login page deliberately uses inline DESIGN.md token references (`var(--accent)` etc.) — those tokens already exist in `globals.css` from Phase 1's static demo, so Task 3 does NOT depend on Task 1. i18n strings for the login page are kept inline in English-only for the auth-pre-state surface (matches success criterion 3 which scopes "GR/EN toggle" to in-workspace strings).

**Acceptance Criteria:**
- Visiting `/login` (unauthenticated) renders the form: email input + "Send link" button + helper copy from `messages/{locale}.json`.
- Submitting a valid email calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ${NEXT_PUBLIC_APP_URL}/auth/callback } })`, then renders the "Στείλαμε σύνδεσμο…" confirmation state. No page reload on success.
- The form validates email with Zod (`z.string().email().min(5)`); invalid → inline error using `--kill` color + `aria-describedby`.
- `/auth/callback?code=…` exchanges the code, sets the session cookie via Supabase SSR, then redirects to `/dashboard`. On error, redirects to `/login?error=invalid_link` and the page surfaces the error.
- `POST /auth/sign-out` clears the session and 303-redirects to `/login`.
- Visiting `/login` while authenticated immediately redirects to `/dashboard`.
- `grep -rn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/\(auth\)/ src/app/auth/` → 0.
- All visible strings come from `useTranslations()` / `getTranslations()`; no hardcoded English in JSX.

**Action:**
1. **If a demo file already exists at this path, preserve the visual template and replace ONLY the data source — do not regress the styling, the AppNav, or the existing route surface area.** (Applies here only as a guardrail; `/login`, `/auth/callback`, `/auth/sign-out` are NEW routes — no demo equivalents exist.)
2. **`src/app/(auth)/layout.tsx`** — centred 1-column layout for unauthenticated pages. Background `var(--bg)`, max-width `clamp(20rem, 90vw, 28rem)`, vertical centring. NO sidebar, NO top bar (those belong to `(workspace)`).
3. **`src/app/(auth)/login/page.tsx`** — Server Component:
   - Read session via `await createClient().auth.getUser()`. If user present, `redirect('/dashboard')`.
   - Render: title (from `t('auth.title')`, font-family `var(--font-crimson-pro)`, h1 scale per DESIGN.md), short subtitle, then `<LoginForm />`.
4. **`src/app/(auth)/login/LoginForm.tsx`** — Client Component (`'use client'`):
   - `useTranslations('auth')` for all strings.
   - State machine: `'idle' | 'submitting' | 'sent' | 'error'`.
   - On submit: `const supabase = createClient(); /* from @/lib/supabase/client */`, call `signInWithOtp`, transition to `'sent'`; surface `data` is `null` on success (Supabase magic-link contract).
   - Button uses `.btn-primary` semantics: `background: var(--accent); color: var(--bg); border-radius: 4px; padding: 0.55rem 1rem;` (inline classes since we haven't introduced a UI kit yet — Phase 3 may extract).
   - Loading state: button disabled + label `t('common.loading')`. Error state: `aria-describedby` red text under input.
   - Reads `?error=` query param via `useSearchParams()` and shows `t('auth.errorInvalidLink')` if present (add the key to messages if missing).
5. **`src/app/auth/callback/route.ts`**:
   ```ts
   import { NextResponse, type NextRequest } from 'next/server';
   import { createClient } from '@/lib/supabase/server';

   export async function GET(request: NextRequest) {
     const { searchParams, origin } = new URL(request.url);
     const code = searchParams.get('code');
     if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);
     const supabase = await createClient();
     const { error } = await supabase.auth.exchangeCodeForSession(code);
     if (error) return NextResponse.redirect(`${origin}/login?error=invalid_link`);
     return NextResponse.redirect(`${origin}/dashboard`);
   }
   ```
6. **`src/app/auth/sign-out/route.ts`**:
   ```ts
   import { NextResponse, type NextRequest } from 'next/server';
   import { createClient } from '@/lib/supabase/server';
   export async function POST(request: NextRequest) {
     const supabase = await createClient();
     await supabase.auth.signOut();
     return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
   }
   ```
7. **Verify env wiring** — confirm `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`. If missing, copy from `.env.local.example` and source values from `npx supabase status -o env` (note: local Supabase runs on port 54421 per OPERATOR.md, not the default 54321).
8. **Local smoke**: start the dev server with the local Supabase stack running. Submit `fotini.test@lex.local`. The local Supabase Inbucket UI (port 54424 by default) catches the magic-link email. Click the link → must land on `/dashboard` (Task 4 supplies that route; if Task 4 not yet built, transient redirect to `/login` is acceptable for this task's commit, with the verifier re-checking after Task 4).

**Validation:**
- `npx tsc --noEmit` → exits 0
- `grep -rcn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/` → 0
- `grep -c "signInWithOtp" src/app/\(auth\)/login/LoginForm.tsx` → ≥ 1
- `grep -c "exchangeCodeForSession" src/app/auth/callback/route.ts` → 1
- `grep -rE "(href=|className=)\"[A-Z][a-z]+" src/app/\(auth\)/ | grep -v "useTranslations\|t(" | wc -l` → low; manual sanity check that no English strings are hardcoded (the validation prompt tells the verifier this is a vibes-check, the deterministic check is in the contract)
- `node ~/.claude/bin/slop-detect.mjs src/app/\(auth\) src/app/auth` → exits 0

**Design:**
- Register: `product`
- Tokens used: `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--line)`, `var(--accent)`, `var(--kill)` (error state), `--space-4`, `--space-6`, `--pad-card`
- Scope: `page` (login is one page; layout group wraps both this page and any future auth pages)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/app/\(auth\) src/app/auth` pre-commit; commit blocked on critical findings

**Context:** Read @.planning/DESIGN.md · @.planning/PRODUCT.md · @src/lib/supabase/server.ts · @src/lib/supabase/client.ts · @src/lib/supabase/middleware.ts · @.env.local.example · @OPERATOR.md · @rules/security.md

---

## Task 4 — `(workspace)` shell: sidebar + top bar + locale toggle + dashboard with live count cards

**Wave:** 2
**Persona:** ux
**Files:**
- `src/app/(workspace)/layout.tsx` (NEW — auth-gated; renders `<Sidebar />` + `<TopBar />` + `{children}` slot)
- `src/app/(workspace)/dashboard/page.tsx` (NEW — dashboard with three live count cards reading clients/matters/finalized invoices via SSR Supabase)
- `src/components/Sidebar.tsx` (NEW — Server Component reading current pathname via `usePathname` requires client; split into `SidebarShell` (server) + `SidebarNav.tsx` (client) so translations + active state work)
- `src/components/SidebarNav.tsx` (NEW — Client Component using `usePathname` + `useTranslations('nav')` + Lucide icons)
- `src/components/TopBar.tsx` (NEW — Client Component with locale toggle button + sign-out form)
- `src/components/LocaleToggle.tsx` (NEW — Client Component; on click, POSTs to `/api/locale` to set `NEXT_LOCALE` cookie and `router.refresh()`)
- `src/app/api/locale/route.ts` (NEW — POST { locale } → sets `NEXT_LOCALE` cookie via `cookies().set`, returns 204)

**Depends on:** Task 1, Task 2, Task 3

**Why:** AUTH-01 + I18N-01. Every Phase 3-6 page renders inside `(workspace)`. Getting the shell right (auth gate on the layout, sidebar nav, locale toggle that doesn't full-reload, 44px touch targets) is the platform for everything that follows. The toggle's `router.refresh()` is the path that satisfies success criterion #3 ("switches strings without full page reload"). Greek-first means we test Greek string lengths in the sidebar — Greek `Λογαριασμός παρακαταθηκών` is ~25% longer than `Trust ledger` and MUST fit in the 240px sidebar without truncation.

**Acceptance Criteria:**
- Visiting any `(workspace)` route while unauthenticated redirects to `/login` (gate in the layout, not in each page).
- Sidebar shows 10 nav items in this order — Dashboard, Clients, Cases, Invoices, Receipts, Quotations, Retainers, Trust ledger, Assistant, Reports — each with a Lucide icon at 20px stroke 1.5px. Active route gets `var(--accent)` color + `var(--accent-bg)` background.
- Sidebar is persistent ≥ `lg` (1024px) and becomes a drawer at < `lg` (toggleable via a hamburger button in the top bar). Drawer state lives in the `TopBar` / `SidebarNav` client tree (no external store needed for the demo).
- Top bar shows: workspace name (read from `workspaces.name` server-side), locale toggle (button labelled `Ελληνικά` when locale is `en-CY`, `English` when locale is `el-CY`), sign-out form (POSTs to `/auth/sign-out`).
- Clicking the locale toggle: POST `/api/locale` with `{ locale: 'en-CY' }` (or `el-CY`), server sets cookie, response `router.refresh()` re-fetches Server Components → all visible strings switch language, NO full page reload (URL unchanged, scroll position preserved).
- Dashboard page renders three count cards — Clients (10), Cases (5), Invoices (3 finalized) — pulled live via `await supabase.from('clients').select('id', { count: 'exact', head: true })` etc. Numbers use `.tabular` class.
- At 375px viewport, the Greek string `Λογαριασμός παρακαταθηκών` in the drawer nav does not overflow or wrap mid-word: it either fits or wraps cleanly between words; no `overflow: hidden` clipping.
- All touch targets ≥ 44×44px (nav items, toggle, sign-out).
- `grep -rn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/\(workspace\) src/components/` → 0.

**Action:**
1. **If a demo file already exists at this path, preserve the visual template and replace ONLY the data source — do not regress the styling, the AppNav, or the existing route surface area.** (No demo file exists at `/dashboard` or `src/app/(workspace)/*` — Task 4 is entirely new ground. The existing static demo pages at top-level routes are untouched by Task 4 and will be migrated by Task 5.)
2. **`src/app/(workspace)/layout.tsx`** — server component:
   ```tsx
   import { redirect } from 'next/navigation';
   import { createClient } from '@/lib/supabase/server';
   import { Sidebar } from '@/components/Sidebar';
   import { TopBar } from '@/components/TopBar';

   export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
     const supabase = await createClient();
     const { data: { user } } = await supabase.auth.getUser();
     if (!user) redirect('/login');

     const { data: workspace } = await supabase
       .from('workspaces')
       .select('id, name')
       .eq('owner_user_id', user.id)
       .single();

     return (
       <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
         <Sidebar />
         <div className="flex-1 flex flex-col min-w-0">
           <TopBar workspaceName={workspace?.name ?? 'Lex'} userEmail={user.email ?? ''} />
           <main className="flex-1" style={{ padding: 'var(--pad-section) var(--pad-x)' }}>
             {children}
           </main>
         </div>
       </div>
     );
   }
   ```
3. **`src/components/Sidebar.tsx`** — split into server + client. The server file is just `<aside className="hidden lg:flex ..."><SidebarNav/></aside>`; the client file owns interactivity.
4. **`src/components/SidebarNav.tsx`** — `'use client'`. Imports Lucide icons: `LayoutGrid`, `Users`, `Briefcase`, `FileText`, `Receipt`, `FileCheck`, `Wallet`, `ShieldCheck` (trust — different visual semantic via `--trust` color), `Sparkles` (AI), `BarChart3` (reports). Nav array:
   ```ts
   const NAV = [
     { href: '/dashboard', icon: LayoutGrid, key: 'dashboard' },
     { href: '/clients',   icon: Users,      key: 'clients' },
     { href: '/cases',     icon: Briefcase,  key: 'cases' },
     { href: '/invoices',  icon: FileText,   key: 'invoices' },
     { href: '/receipts',  icon: Receipt,    key: 'receipts' },
     { href: '/quotations', icon: FileCheck, key: 'quotations' },
     { href: '/retainers', icon: Wallet,     key: 'retainers' },
     { href: '/trust',     icon: ShieldCheck, key: 'trust' },
     { href: '/ai',        icon: Sparkles,   key: 'ai' },
     { href: '/reports',   icon: BarChart3,  key: 'reports' },
   ];
   ```
   Each link: `min-h: 44px`, `padding: 0 var(--space-4)`, hover bg `var(--surface)`, active bg `var(--accent-bg)` + color `var(--accent)`, the trust item gets `color: var(--trust)` when active (and `--accent-bg` reverts to a `--trust-bg` tint for that one item — DESIGN.md §Trust ledger view: trust color NEVER on revenue surfaces, but the sidebar's trust ITEM may carry trust color as a destination signal).
5. **`src/components/TopBar.tsx`** — `'use client'`. Layout: workspace name on left (Crimson Pro h2 scale, `var(--text)`); on right `<LocaleToggle />` + `<form action="/auth/sign-out" method="post"><button>{t('auth.signOut')}</button></form>`. On `< lg`, a hamburger toggles a Sheet/drawer that renders `<SidebarNav />`.
6. **`src/components/LocaleToggle.tsx`** — `'use client'`:
   ```tsx
   'use client';
   import { useLocale, useTranslations } from 'next-intl';
   import { useRouter } from 'next/navigation';
   import { useTransition } from 'react';
   import { Languages } from 'lucide-react';

   export function LocaleToggle() {
     const t = useTranslations('common');
     const locale = useLocale();
     const router = useRouter();
     const [pending, start] = useTransition();
     const next = locale === 'el-CY' ? 'en-CY' : 'el-CY';
     const label = locale === 'el-CY' ? t('switchToEnglish') : t('switchToGreek');
     return (
       <button
         type="button"
         disabled={pending}
         onClick={() => start(async () => {
           await fetch('/api/locale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: next }) });
           router.refresh();
         })}
         className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded"
         style={{ color: 'var(--muted)' }}
         aria-label={label}
       >
         <Languages size={20} strokeWidth={1.5} aria-hidden />
         <span className="text-sm">{label}</span>
       </button>
     );
   }
   ```
7. **`src/app/api/locale/route.ts`**:
   ```ts
   import { NextResponse, type NextRequest } from 'next/server';
   import { cookies } from 'next/headers';
   import { z } from 'zod';

   const Body = z.object({ locale: z.enum(['el-CY', 'en-CY']) });

   export async function POST(request: NextRequest) {
     const parsed = Body.safeParse(await request.json().catch(() => null));
     if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
     const jar = await cookies();
     jar.set('NEXT_LOCALE', parsed.data.locale, {
       path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax',
     });
     return new NextResponse(null, { status: 204 });
   }
   ```
8. **`src/app/(workspace)/dashboard/page.tsx`** — server component reading counts:
   ```tsx
   import { getTranslations } from 'next-intl/server';
   import { createClient } from '@/lib/supabase/server';

   export default async function Dashboard() {
     const t = await getTranslations('nav');
     const supabase = await createClient();
     const [c, m, i] = await Promise.all([
       supabase.from('clients').select('id', { count: 'exact', head: true }),
       supabase.from('matters').select('id', { count: 'exact', head: true }),
       supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
     ]);
     // render three count cards. Use Crimson Pro for big numbers + .tabular class.
     // ... (see DESIGN.md §Cards)
   }
   ```
   Cards: `background: var(--surface)`, `border: 1px solid var(--line)`, `border-radius: 6px`, `padding: var(--pad-card)`. Numbers: Crimson Pro 700, `display` size from DESIGN.md scale, `.tabular`. Label: `caption` style (uppercase, +0.08em tracking, `var(--muted)`).
9. **Greek-first sanity check**: open the running dev server at `http://localhost:3000` with locale `el-CY` (default). At 375px viewport (browser dev tools), confirm `Λογαριασμός παρακαταθηκών` in the drawer wraps cleanly between `Λογαριασμός` and `παρακαταθηκών` — no mid-word clipping.

**Validation:**
- `npx tsc --noEmit` → exits 0
- `grep -rcn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/\(workspace\) src/components/` → 0
- `grep -c "router.refresh" src/components/LocaleToggle.tsx` → ≥ 1
- `grep -c "lucide-react" src/components/SidebarNav.tsx` → 1 (icons come from one family only)
- `grep -rE "(heroicons|@heroicons|phosphor)" src/components/ src/app/\(workspace\)` → 0 (Lucide is the only icon family per DESIGN.md §8)
- `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\) src/components` → exits 0
- Manual: with dev server running, click locale toggle → all strings switch, URL unchanged, scroll position preserved

**Design:**
- Register: `product`
- Tokens used: `var(--bg)`, `var(--bg-2)`, `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--line)`, `var(--line-soft)`, `var(--accent)`, `var(--accent-bg)`, `var(--trust)`, `var(--trust-bg)` (trust nav item only), `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--pad-x`, `--pad-section`, `--pad-card`, `--elev-1` (hovered nav row), `--ease-out-quart`
- Scope: `app` (layout wraps every workspace route)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\) src/components/` pre-commit; commit blocked on critical findings

**Context:** Read @.planning/DESIGN.md · @.planning/PRODUCT.md · @.planning/CONTEXT.md · @src/lib/supabase/server.ts · @messages/el-CY.json (after Task 2) · @rules/security.md

---

## Task 5 — Clients CRUD + Cases CRUD (list + create/edit/delete, both routes)

**Wave:** 3
**Persona:** frontend
**Files:**
- `src/lib/types.ts` (NEW — `ClientRow`, `MatterRow`, `Database` type aliases hand-written from Migration 001 — we are NOT running `supabase gen types` for the demo; the surface is small enough to maintain manually)
- `src/app/(workspace)/clients/page.tsx` (REPLACE the existing static `src/app/clients/page.tsx` — same visual template, swap `demo-data.ts` for a Supabase server-read; move to the `(workspace)` group so the auth gate covers it)
- `src/app/(workspace)/clients/new/page.tsx` (NEW — create form)
- `src/app/(workspace)/clients/[id]/page.tsx` (REPLACE the existing static `src/app/clients/[id]/page.tsx` — same visual template, swap `demo-data.ts` for a Supabase server-read + add the edit form)
- `src/app/(workspace)/clients/actions.ts` (NEW — Server Actions: `createClient`, `updateClient`, `deleteClient`; Zod-validated; check `rowCount === 0` per locked decision #6)
- `src/app/(workspace)/cases/page.tsx` (NEW — list view, joins matters→clients; uses the same visual template as the existing static client/invoice list pages)
- `src/app/(workspace)/cases/new/page.tsx` (NEW — create form, client picker)
- `src/app/(workspace)/cases/[id]/page.tsx` (NEW — edit form)
- `src/app/(workspace)/cases/actions.ts` (NEW — Server Actions: `createMatter`, `updateMatter`, `deleteMatter`)
- `src/components/Table.tsx` (NEW — reusable sortable table primitive used by both list views; sticky header, row-hover bg `var(--surface)`, right-align numerics, `.tabular` class on money/date columns)
- `src/components/StatusPill.tsx` (NEW — `ok` / `warn` / `kill` pill component using DESIGN.md §Tables semantics)
- `src/app/clients/page.tsx`, `src/app/clients/[id]/page.tsx` (DELETE — superseded by the `(workspace)/clients/*` versions; the route URLs `/clients` and `/clients/{id}` are preserved because the `(workspace)` group is URL-transparent)

**Depends on:** Task 1, Task 2, Task 4

**Why:** CL-01 (REQ-003) + MT-01 (REQ-004). Two list tables prove the design system at production density (10 clients × 5 matters, with Greek diacritic names and `el-CY` currency rendering). Pitch demos always tour list views first; if the tables don't shine, nothing else does. Building both at once lets us extract `<Table />` and `<StatusPill />` once instead of twice, which is critical because Phases 3+4 will reuse them for Invoices, Receipts, Quotations, Retainers, Trust ledger, Reports. The locked decision #6 (RLS deny-by-omission silently returns 0 rows) means our Server Actions check `rowCount === 0` to surface "row not found / not authorised" instead of pretending success.

**Acceptance Criteria:**
- `/clients` lists all 10 seed clients in a sortable table. Columns: Name (`el` label preferred when locale=`el-CY`, fallback to `en`), VAT, Preferred language pill, Created date. Names containing Greek diacritics (Χριστοδουλίδης, Παπαδοπούλου, …) render correctly with no `□` glyphs.
- Created date column renders as `DD/MM/YYYY` in `el-CY`, `DD/MM/YYYY` in `en-CY` (both Cyprus locales use the same date order — but the month/day separators stay slash, never dash).
- A "Νέος πελάτης" (`el-CY`) / "New client" (`en-CY`) button leads to `/clients/new`. Submitting the form (Zod-validated: `name_el` ≥ 2 chars, `name_en` ≥ 2 chars, `preferred_language ∈ {'el','en'}`, optional fields) inserts via Server Action and redirects to `/clients/{id}` on success.
- `/clients/{id}` shows the same fields editable; Save updates the row; Delete prompts confirmation (`t('clients.form.deleteConfirm')`) and deletes the row, then redirects to `/clients`.
- `/cases` lists all 5 seed matters. Columns: Number, Client (joined name), Title, Type, Status pill (`open` → `--ok`, `on_hold` → `--warn`, `closed` → `--muted`), Hourly rate (right-aligned, `.tabular`, formatted via `formatCurrency`).
- Hourly rate `250.00` renders as `250,00 €` in `el-CY`, `€250.00` in `en-CY`.
- Create / edit / delete a Matter follows the same Server Action pattern.
- Server Actions never expose the service-role key; they import from `@/lib/supabase/server` only. `grep -rn "createServiceClient\|service_role" src/app/\(workspace\)` → 0.
- After `delete`, when RLS returns 0 affected rows, the Server Action returns `{ error: 'not_found' }` (NOT a thrown exception) — surfaced to the user as `t('common.error')`.
- All numeric / date formatting goes through `@/lib/format`. `grep -rE "toLocaleString|toLocaleDateString|new Intl\\." src/app/\(workspace\)/clients src/app/\(workspace\)/cases src/components` → 0 (the only file allowed is `src/lib/format.ts`).
- `ClientRow` / `MatterRow` types from `src/lib/types.ts` are actually consumed: the list, detail, and CRUD action files type their Supabase reads against them.

**Action:**
1. **If a demo file already exists at this path, preserve the visual template and replace ONLY the data source — do not regress the styling, the AppNav, or the existing route surface area.** Concretely: `src/app/clients/page.tsx` and `src/app/clients/[id]/page.tsx` already exist as static reads against `src/lib/demo-data.ts`. Open them, copy the JSX/styling verbatim into the new `src/app/(workspace)/clients/page.tsx` and `src/app/(workspace)/clients/[id]/page.tsx`, then swap the `import { clients } from '@/lib/demo-data'` line for `const supabase = await createClient(); const { data: clients } = await supabase.from('clients').select('*').order('created_at', { ascending: false });`. The Greek hero, headers, AppNav (if present in the demo), and overall card/table styling MUST survive. After the new files compile and render, delete the top-level `src/app/clients/` directory (the route URL `/clients` is preserved by the `(workspace)` group). For Cases, no demo exists — build the new files following the same visual template as the migrated Clients list so the two pages feel consistent.
2. **`src/lib/types.ts`** — hand-roll the minimum Database types we need this phase:
   ```ts
   export type PreferredLanguage = 'el' | 'en';

   export interface ClientRow {
     id: string;
     workspace_id: string;
     name_el: string;
     name_en: string;
     vat_number: string | null;
     tax_id: string | null;
     email: string | null;
     phone: string | null;
     address: string | null;
     preferred_language: PreferredLanguage;
     created_at: string;
   }

   export interface MatterRow {
     id: string;
     workspace_id: string;
     client_id: string;
     matter_number: string;
     title: string;
     matter_type: string;
     status: 'open' | 'closed' | 'on_hold';
     default_hourly_rate: string | null;  // NUMERIC(12,2) — strings via supabase-js
     opened_at: string;
     closed_at: string | null;
     created_at: string;
   }
   ```
   Both types MUST be imported in the corresponding list page, detail page, and `actions.ts` (e.g., `import type { ClientRow } from '@/lib/types';`) and used to type the Supabase `data` return — this is what makes the wiring contract pass.
3. **`src/components/Table.tsx`** — reusable primitive (server-renderable, no client state needed for list views; sorting is URL-search-param driven so the server re-fetches):
   ```tsx
   interface Column<Row> {
     key: string;
     header: string;
     align?: 'left' | 'right' | 'center';
     numeric?: boolean; // adds .tabular
     render: (row: Row) => React.ReactNode;
   }
   export function Table<Row>({ columns, rows, emptyLabel, rowHref }: {
     columns: Column<Row>[]; rows: Row[]; emptyLabel: string;
     rowHref?: (row: Row) => string;
   }) { /* sticky thead, hover bg var(--surface), right-align numerics, .tabular on numeric columns */ }
   ```
   Styling: header row sticky `top-0`, `background: var(--bg-2)`, border-bottom `var(--line)`, caption style. Row borders use `var(--line-soft)`. Hover bg `var(--surface)`. Mobile (< md): cards instead of table per DESIGN.md §9 — for the demo, a single horizontally-scrollable table with `min-w-[640px]` is acceptable; flag in a TODO that the card-view mobile mode is Phase 6 polish.
4. **`src/components/StatusPill.tsx`** — `{ tone: 'ok' | 'warn' | 'kill' | 'muted'; children: ReactNode }`. Tone → CSS var mapping:
   - `ok` → bg `oklch(0.55 0.130 150 / 0.12)`, color `var(--ok)`
   - `warn` → bg `oklch(0.65 0.140 75 / 0.12)`, color `var(--warn)`
   - `kill` → bg `oklch(0.52 0.180 25 / 0.12)`, color `var(--kill)`
   - `muted` → bg `var(--surface)`, color `var(--muted)`
   Text: `caption` scale, uppercase, +0.08em tracking, `padding: 2px 8px`, `border-radius: 4px`. Per DESIGN.md §Tables.
5. **`src/app/(workspace)/clients/page.tsx`** — server component, typed with `ClientRow`:
   ```tsx
   import type { ClientRow } from '@/lib/types';
   // ...
   const supabase = await createClient();
   const { data: clients } = await supabase.from('clients').select('*').order('created_at', { ascending: false }).returns<ClientRow[]>();
   const t = await getTranslations('clients');
   const locale = await getLocale() as 'el-CY' | 'en-CY';
   // render <Table columns={[name, vat, language, created]} ... />
   ```
   Name column: pick `name_el` if locale=`el-CY`, else `name_en`. Show the secondary name as `<span style={{color:'var(--muted)'}}>` underneath. Preserve the existing demo's visual hierarchy (hero, list density, spacing) — only the data source changes.
6. **`src/app/(workspace)/clients/actions.ts`**:
   ```ts
   'use server';
   import { z } from 'zod';
   import { revalidatePath } from 'next/cache';
   import { redirect } from 'next/navigation';
   import type { ClientRow } from '@/lib/types';
   import { createClient } from '@/lib/supabase/server';

   const ClientInput = z.object({
     name_el: z.string().min(2),
     name_en: z.string().min(2),
     vat_number: z.string().optional().nullable(),
     tax_id: z.string().optional().nullable(),
     email: z.string().email().or(z.literal('')).optional().nullable(),
     phone: z.string().optional().nullable(),
     address: z.string().optional().nullable(),
     preferred_language: z.enum(['el', 'en']),
   });

   export async function createClientAction(formData: FormData) {
     const parsed = ClientInput.safeParse(Object.fromEntries(formData));
     if (!parsed.success) return { error: 'validation', issues: parsed.error.flatten() };
     const supabase = await createClient();
     const { data, error } = await supabase.from('clients').insert(parsed.data).select('id').single<Pick<ClientRow, 'id'>>();
     if (error || !data) return { error: 'insert_failed' };
     revalidatePath('/clients');
     redirect(`/clients/${data.id}`);
   }

   export async function updateClientAction(id: string, formData: FormData) {
     const parsed = ClientInput.safeParse(Object.fromEntries(formData));
     if (!parsed.success) return { error: 'validation', issues: parsed.error.flatten() };
     const supabase = await createClient();
     // Locked decision #6: RLS deny-by-omission returns 0 rows, not an exception.
     // Use .select() so we get rowCount via data.length.
     const { data, error } = await supabase.from('clients').update(parsed.data).eq('id', id).select('id');
     if (error) return { error: 'update_failed' };
     if (!data || data.length === 0) return { error: 'not_found' };
     revalidatePath('/clients');
     revalidatePath(`/clients/${id}`);
     return { ok: true };
   }

   export async function deleteClientAction(id: string) {
     const supabase = await createClient();
     const { data, error } = await supabase.from('clients').delete().eq('id', id).select('id');
     if (error) return { error: 'delete_failed' };
     if (!data || data.length === 0) return { error: 'not_found' };
     revalidatePath('/clients');
     redirect('/clients');
   }
   ```
7. **`src/app/(workspace)/clients/new/page.tsx`** + **`src/app/(workspace)/clients/[id]/page.tsx`** — labels in two columns at `≥ md`, single column at `< md`. Inputs follow DESIGN.md §Inputs: visible labels, placeholder only for examples, focus ring 2px offset `var(--accent)`, error text inline under field. Submit button uses `.btn-primary` semantics, cancel uses `.btn-secondary`. Forms post via Server Action. The detail page imports `ClientRow` from `@/lib/types` and types its Supabase fetch against it.
8. **Cases (matters) — analogous structure.** Key difference: the create / edit form has a client picker (`<select>` populated by server-fetched `clients` rows, showing `name_el — name_en`). Status field is the enum `'open' | 'closed' | 'on_hold'` rendered as a styled select. `default_hourly_rate` is a number input; format the displayed value via `formatCurrency` on the list view, but the input value is the raw number. The list page imports `MatterRow` and types the joined Supabase fetch with it (`.returns<(MatterRow & { clients: Pick<ClientRow,'name_el'|'name_en'> })[]>()`).
9. **Locale formatting**: every money / date cell calls `formatCurrency(row.default_hourly_rate, locale)` or `formatDate(row.created_at, locale)` from `@/lib/format`. The list view receives `locale` via `getLocale()` from `next-intl/server`.
10. **Verify Greek diacritics**: with locale = `el-CY`, open `/clients` and confirm names like `Χριστοδουλίδης`, `Παπαδοπούλου`, `Αλεξάνδρου` render correctly (no `□`, no mojibake). If they don't render, the font loaded by Task 1 lacks the Greek subset — fix by ensuring `Inter_Tight` is loaded with `subsets: ['latin', 'latin-ext', 'greek']`.
11. **Delete the superseded top-level demo files** (`src/app/clients/page.tsx`, `src/app/clients/[id]/page.tsx`) only AFTER the new `(workspace)/clients/*` files compile, render, and pass the Greek-diacritic smoke check. The route URLs stay `/clients` and `/clients/{id}` (group routing is URL-transparent). All OTHER demo top-level pages (`/invoices`, `/quotations`, etc.) are untouched in Phase 2 — they remain as visual prior-art for Phase 3 to migrate.
12. Run `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\)/clients src/app/\(workspace\)/cases src/components` and fix any critical findings before commit.

**Validation:**
- `npx tsc --noEmit` → exits 0
- `grep -rcn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/\(workspace\)/clients src/app/\(workspace\)/cases src/components` → 0
- `grep -rE "toLocaleString|toLocaleDateString|new Intl\\." src/app/\(workspace\) src/components | grep -v "src/lib/format"` → 0 (every formatter goes through `lib/format.ts`)
- `grep -c "rowCount\|data.length === 0\|!data || data.length" src/app/\(workspace\)/clients/actions.ts src/app/\(workspace\)/cases/actions.ts` → ≥ 4 (every update + delete checks)
- `grep -c "useTranslations\|getTranslations" src/app/\(workspace\)/clients/page.tsx src/app/\(workspace\)/cases/page.tsx` → ≥ 2 (both pages read messages)
- `grep -rE "ClientRow|MatterRow" src/app/\(workspace\)/clients src/app/\(workspace\)/cases src/components | wc -l` → ≥ 4 (types defined are types consumed)
- `test ! -f src/app/clients/page.tsx && test ! -f src/app/clients/\[id\]/page.tsx && echo "demo migrated"` → prints `demo migrated`
- `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\)/clients src/app/\(workspace\)/cases src/components` → exits 0
- Manual: with seed data loaded, `/clients` shows 10 rows, `/cases` shows 5 rows, Greek diacritics render, currency = `1.234,56 €` in `el-CY`

**Design:**
- Register: `product`
- Tokens used: `var(--bg)`, `var(--bg-2)`, `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--line)`, `var(--line-soft)`, `var(--accent)`, `var(--accent-2)`, `var(--ok)`, `var(--warn)`, `var(--kill)`, `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--pad-card`, `--gap-stack`, `--elev-1`
- Scope: `page` (Clients + Cases routes)
- Anti-pattern guard: builder runs `node ~/.claude/bin/slop-detect.mjs src/app/\(workspace\)/clients src/app/\(workspace\)/cases src/components/` pre-commit; commit blocked on critical findings

**Context:** Read @.planning/DESIGN.md · @.planning/PRODUCT.md · @.planning/CONTEXT.md · @supabase/migrations/20260513000001_schema.sql · @supabase/seed.sql · @src/lib/supabase/server.ts · @src/lib/format.ts (after Task 1) · @src/lib/demo-data.ts (to lift the visual template) · @src/app/clients/page.tsx (the existing static template to preserve) · @src/app/clients/[id]/page.tsx (the existing static template to preserve) · @messages/el-CY.json (after Task 2) · @messages/en-CY.json (after Task 2)

---

## Success Criteria

Phase-level truths — what must be observable when Phase 2 is done.

- [ ] **TS clean.** `npx tsc --noEmit` exits 0.
- [ ] **Magic-link works.** Submit email on `/login` → Inbucket (local) or Resend (cloud) receives a magic-link email within 30 seconds; clicking the link lands on `/dashboard` with session cookie set. No 500, no redirect loop.
- [ ] **Locale toggle, no reload.** Click the toggle on any workspace screen → all visible UI strings switch language; URL unchanged; scroll position preserved; no full page reload.
- [ ] **Greek currency format.** On `/clients` and `/cases` in `el-CY`, every money column renders `1.234,56 €` (Greek format with `.` thousands separator, `,` decimal, suffix euro), not `€1,234.56`.
- [ ] **Greek date format.** Date columns render `DD/MM/YYYY` in both `el-CY` and `en-CY` (Cyprus convention).
- [ ] **Greek-fit responsive.** At 375px viewport with locale `el-CY`, `Λογαριασμός παρακαταθηκών` in the sidebar drawer fits without mid-word truncation; the Greek table headers on `/clients` and `/cases` do not overflow horizontally.
- [ ] **No service-role key in client code.** `grep -rn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/ src/components/` returns zero.
- [ ] **DESIGN.md tokens applied end-to-end.** No `#hex`, no `rgb()`, no `hsl()`, no banned fonts (`Inter` bare, `Roboto`, `Arial`, `Helvetica`, `system-ui`, `Space Grotesk`, `Geist`) anywhere under `src/`.
- [ ] **slop-detect clean.** `node ~/.claude/bin/slop-detect.mjs src/` exits 0 (no critical findings).
- [ ] **CRUD works.** Create a new client + new matter via the UI, see them in the list, edit them, delete them. RLS-scoped: a freshly-spun anon session reading `/clients` returns the redirect-to-login (no 0-row data leak).
- [ ] **Landing survives.** `/` continues to render the Lex landing (Greek hero + sample invoice card + 10 features). Phase 2 did not regress the public marketing surface.
- [ ] **Trust-truncate guard.** `npm run db:test` passes all 5 tests including the new `trust_truncate_guard.sql`.

---

## Verification Contract

Machine-executable checks the verifier runs verbatim. Every task has at least one contract. Wiring contracts are explicit.

### Contract for Task 0 — `trust_ledger` TRUNCATE backstop
**Check type:** file-exists
**Command:** `test -f supabase/migrations/20260513000005_trust_truncate_guard.sql && test -f supabase/tests/trust_truncate_guard.sql && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Either file missing.

### Contract for Task 0 — guard runs in test suite
**Check type:** grep-match
**Command:** `grep -c "trust_truncate_guard.sql" supabase/tests/run.sh`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the new test exists but isn't wired into `run.sh`.

### Contract for Task 0 — guard fires at the DB layer
**Check type:** command-exit
**Command:** `npm run db:test 2>&1 | tail -5`
**Expected:** Output contains `trust_truncate_guard` and a PASS / OK marker; exit code 0.
**Fail if:** `npm run db:test` exits non-zero OR the test output for `trust_truncate_guard.sql` does not show PASS.

### Contract for Task 1 — OKLCH tokens present
**Check type:** grep-match
**Command:** `grep -cE "^\s*--(bg|text|accent|trust|line|space-4|ease-out-quart):" src/app/globals.css`
**Expected:** ≥ 6
**Fail if:** Fewer than 6 — some DESIGN.md tokens missing.

### Contract for Task 1 — no hardcoded colors
**Check type:** grep-match
**Command:** `grep -cE "#[0-9a-fA-F]{3,8}\b" src/app/globals.css src/app/layout.tsx`
**Expected:** `0`
**Fail if:** Non-zero — `#hex` colors leaked in.

### Contract for Task 1 — no banned fonts
**Check type:** command-exit
**Command:** `node ~/.claude/bin/slop-detect.mjs --severity=critical src/app/globals.css src/app/layout.tsx`
**Expected:** Exit code 0
**Fail if:** Non-zero exit — slop-detect found critical anti-patterns.

### Contract for Task 1 — `lib/format.ts` is the single Intl seam
**Check type:** grep-match
**Command:** `test -f src/lib/format.ts && grep -c "Intl.NumberFormat\|Intl.DateTimeFormat" src/lib/format.ts`
**Expected:** ≥ 2
**Fail if:** File missing OR Intl constructors not present.

### Contract for Task 1 — Greek currency output verified
**Check type:** command-exit
**Command:** `node -e "const s = new Intl.NumberFormat('el-CY',{style:'currency',currency:'EUR'}).format(1234.56); if (!/1\\.234,56/.test(s)) {console.error('Got:', s); process.exit(1)} console.log('OK:', s)"`
**Expected:** `OK: 1.234,56 €` (the exact non-breaking space character before € is OS/ICU-dependent; the regex tolerates it).
**Fail if:** Output does not contain `1.234,56`.

### Contract for Task 1 — landing page preserved
**Check type:** grep-match
**Command:** `test -f src/app/page.tsx && grep -c "Lex" src/app/page.tsx`
**Expected:** ≥ 1
**Fail if:** File missing OR no `Lex` reference — landing was replaced or regressed.

### Contract for Task 2 — next-intl plugin wired
**Check type:** grep-match
**Command:** `grep -c "createNextIntlPlugin\|next-intl/plugin" next.config.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — `next-intl` not wired into the Next config.

### Contract for Task 2 — both message catalogues exist
**Check type:** file-exists
**Command:** `test -f messages/el-CY.json && test -f messages/en-CY.json && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Either file missing.

### Contract for Task 2 — message catalogues share the same key shape
**Check type:** command-exit
**Command:** `node -e "const a=require('./messages/el-CY.json'), b=require('./messages/en-CY.json'); const w=o=>JSON.stringify(Object.keys(o).sort()); if (w(a)!==w(b)) {console.error('top-level mismatch'); process.exit(1)} for (const k of Object.keys(a)) { if (w(a[k])!==w(b[k])) {console.error('mismatch at', k); process.exit(1)} } console.log('OK')"`
**Expected:** `OK`
**Fail if:** Non-zero exit — the two catalogues diverge in shape.

### Contract for Task 2 — Greek strings actually contain Greek glyphs
**Check type:** command-exit
**Command:** `node -e "const m=require('./messages/el-CY.json'); const s=JSON.stringify(m); if (!/[\u0370-\u03ff\u1f00-\u1fff]/.test(s)) {console.error('no Greek characters in el-CY.json'); process.exit(1)} console.log('Greek OK')"`
**Expected:** `Greek OK`
**Fail if:** Non-zero exit — `el-CY.json` somehow contains no Greek (translated from English without language switch).

### Contract for Task 2 — Supabase middleware wired
**Check type:** grep-match
**Command:** `test -f src/middleware.ts && grep -c "updateSession" src/middleware.ts`
**Expected:** ≥ 1
**Fail if:** File missing OR `updateSession` not invoked.

### Contract for Task 3 — magic-link signing wired
**Check type:** grep-match
**Command:** `grep -rE "signInWithOtp" src/app/\\(auth\\)/login | wc -l`
**Expected:** ≥ 1
**Fail if:** Returns 0 — login form doesn't call magic-link API.

### Contract for Task 3 — callback exchanges code
**Check type:** grep-match
**Command:** `test -f src/app/auth/callback/route.ts && grep -c "exchangeCodeForSession" src/app/auth/callback/route.ts`
**Expected:** ≥ 1
**Fail if:** Either condition fails — callback isn't actually doing the SSR exchange.

### Contract for Task 3 — no service-role key in auth files
**Check type:** grep-match
**Command:** `grep -rcn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/\\(auth\\) src/app/auth`
**Expected:** `0`
**Fail if:** Non-zero — service-role key reachable from auth code.

### Contract for Task 3 — TypeScript clean
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Non-zero — TypeScript errors.

### Contract for Task 3 — magic-link end-to-end
**Check type:** behavioral
**Command:** (verifier runs `npm run dev` with local Supabase + Inbucket; submits an email on `/login`; opens Inbucket UI at the local port; clicks the magic link)
**Expected:** Lands on `/dashboard` with session cookie set; no 500; no redirect loop.
**Fail if:** Click results in 500, redirect loop, or stays on `/login`.

### Contract for Task 4 — workspace layout is auth-gated
**Check type:** grep-match
**Command:** `grep -E "redirect\\(.*/login.*\\)" src/app/\\(workspace\\)/layout.tsx | wc -l`
**Expected:** ≥ 1
**Fail if:** Returns 0 — layout has no auth gate, RLS becomes the only line of defence.

### Contract for Task 4 — locale toggle uses `router.refresh()` (no full reload)
**Check type:** grep-match
**Command:** `grep -c "router.refresh" src/components/LocaleToggle.tsx`
**Expected:** ≥ 1
**Fail if:** Returns 0 — toggle would do a full page reload, failing success criterion #3.

### Contract for Task 4 — locale POST endpoint exists + validates
**Check type:** file-exists
**Command:** `test -f src/app/api/locale/route.ts && grep -c "z.enum\\(\\[.el-CY..en-CY.\\]\\)\\|z.enum\\(\\['el-CY','en-CY'\\]\\)" src/app/api/locale/route.ts`
**Expected:** Non-zero
**Fail if:** Route file missing OR locale enum not validated server-side (untrusted client input).

### Contract for Task 4 — Lucide is the only icon family
**Check type:** grep-match
**Command:** `grep -rcE "@heroicons|phosphor-icons|react-icons|tabler-icons" src/`
**Expected:** `0`
**Fail if:** Non-zero — another icon family leaked in, violating DESIGN.md §8.

### Contract for Task 4 — sidebar covers all 10 nav targets
**Check type:** grep-match
**Command:** `grep -cE "/(dashboard|clients|cases|invoices|receipts|quotations|retainers|trust|ai|reports)" src/components/SidebarNav.tsx`
**Expected:** ≥ 10
**Fail if:** Fewer than 10 — sidebar is missing a destination.

### Contract for Task 4 — dashboard reads counts via SSR Supabase
**Check type:** grep-match
**Command:** `grep -c "count: 'exact'" src/app/\\(workspace\\)/dashboard/page.tsx`
**Expected:** ≥ 3
**Fail if:** Fewer than 3 — at least three counts (Clients, Cases, Invoices) required.

### Contract for Task 5 — Clients list reads from DB
**Check type:** grep-match
**Command:** `grep -c "from('clients')" src/app/\\(workspace\\)/clients/page.tsx`
**Expected:** ≥ 1
**Fail if:** Returns 0 — list page doesn't query Supabase.

### Contract for Task 5 — Cases list joins matters→clients
**Check type:** grep-match
**Command:** `grep -E "from\\('matters'\\)" src/app/\\(workspace\\)/cases/page.tsx | wc -l`
**Expected:** ≥ 1
**Fail if:** Returns 0 — cases page doesn't read matters.

### Contract for Task 5 — RLS empty-result handling (Locked Decision #6)
**Check type:** grep-match
**Command:** `grep -cE "data\\.length === 0|!data \\|\\| data\\.length|rowCount === 0|rowCount\\s*==\\s*0" src/app/\\(workspace\\)/clients/actions.ts src/app/\\(workspace\\)/cases/actions.ts`
**Expected:** ≥ 4 (each of update + delete on both clients + cases checks)
**Fail if:** Fewer than 4 — Server Actions assume RLS throws on deny, which it doesn't.

### Contract for Task 5 — types.ts wired into consumers
**Check type:** grep-match
**Command:** `grep -rE "ClientRow|MatterRow" src/app/\\(workspace\\)/clients src/app/\\(workspace\\)/cases src/components | wc -l`
**Expected:** ≥ 4
**Fail if:** Fewer than 4 — types defined but not used in the CRUD files that depend on them.

### Contract for Task 5 — all formatting goes through `lib/format`
**Check type:** grep-match
**Command:** `grep -rE "toLocaleString|toLocaleDateString|new Intl\\.NumberFormat|new Intl\\.DateTimeFormat" src/app/\\(workspace\\) src/components | grep -v "src/lib/format" | wc -l`
**Expected:** `0`
**Fail if:** Non-zero — at least one component bypasses the centralised formatter, breaking the `el-CY` guarantee.

### Contract for Task 5 — slop-detect clean across all UI
**Check type:** command-exit
**Command:** `node ~/.claude/bin/slop-detect.mjs --severity=critical src/`
**Expected:** Exit code 0
**Fail if:** Non-zero — design anti-patterns leaked in during CRUD build.

### Contract for Task 5 — Status pill component wired into Cases list
**Check type:** grep-match
**Command:** `grep -c "StatusPill" src/app/\\(workspace\\)/cases/page.tsx`
**Expected:** ≥ 1
**Fail if:** Returns 0 — component built but not consumed (the #1 failure mode).

### Contract for Task 5 — Table component wired into BOTH list views
**Check type:** grep-match
**Command:** `grep -c "Table" src/app/\\(workspace\\)/clients/page.tsx src/app/\\(workspace\\)/cases/page.tsx`
**Expected:** ≥ 2 (at least one import + render in each file)
**Fail if:** Fewer than 2 — reusable Table not used by both lists.

### Contract for Task 5 — superseded demo files removed
**Check type:** command-exit
**Command:** `test ! -f src/app/clients/page.tsx && test ! -f src/app/clients/\\[id\\]/page.tsx && echo "demo migrated"`
**Expected:** `demo migrated`
**Fail if:** Old static demo files still present alongside the new `(workspace)/clients/*` files — would result in route collision or stale code.

### Contract for Phase — no service-role key in any client code
**Check type:** grep-match
**Command:** `grep -rcn "service_role\|SUPABASE_SERVICE_ROLE_KEY" src/app/ src/components/`
**Expected:** `0`
**Fail if:** Non-zero — phase-level acceptance criterion #7 violated.

### Contract for Phase — TypeScript clean across the whole tree
**Check type:** command-exit
**Command:** `npx tsc --noEmit`
**Expected:** Exit code 0
**Fail if:** Non-zero — phase-level acceptance criterion #1 violated.

### Contract for Phase — Greek currency end-to-end
**Check type:** behavioral
**Command:** (verifier opens `/clients` in `el-CY` locale on the running dev server, inspects any hourly-rate cell on `/cases`)
**Expected:** Currency renders as `1.234,56 €` (or whatever the seed value is, formatted Greek-style); no `€1,234.56` strings visible.
**Fail if:** Any visible money cell uses English/US format.

### Contract for Phase — Greek fits at 375px
**Check type:** behavioral
**Command:** (verifier loads the workspace shell at 375px viewport in `el-CY`)
**Expected:** Sidebar drawer item `Λογαριασμός παρακαταθηκών` is fully readable, no mid-word truncation, no overflow scroll on the nav.
**Fail if:** Text is clipped, truncated mid-word, or causes horizontal scroll.

---

## Wave Graph

Deterministic wave assignment per the file-based dependency rule (writes ∩ reads or explicit `Depends on`):

| Wave | Tasks (parallel-safe) | Rationale |
|------|----------------------|-----------|
| 1 | Task 0, Task 1, Task 2, Task 3 | Four independent foundations running in parallel: DB TRUNCATE guard (Task 0), design tokens / fonts / format.ts / landing-preservation (Task 1), i18n plumbing + middleware (Task 2), and the `(auth)/login` flow (Task 3). Task 3 uses Phase 1's `src/lib/supabase/server.ts` (already on disk) and inline DESIGN.md tokens that exist in `globals.css` from the deployed demo, so it has no actual dependency on Tasks 1 or 2 — confirmed by writes-set inspection (all four tasks write to disjoint paths). |
| 2 | Task 4 | Workspace shell + dashboard depends on Task 3 (auth gate redirects to `/login`) and Tasks 1 + 2 (tokens + i18n), which are all Wave-1 outputs by the time Wave 2 starts. |
| 3 | Task 5 | Clients + Cases CRUD depends on Task 4 (the `(workspace)` layout that wraps these pages) plus Tasks 1 + 2 outputs already available. |

No two tasks in the same wave write to the same file. Wave 1 packs four file-disjoint tasks; Waves 2 and 3 are serialised by genuine layout dependencies.

---

## Decision Coverage Audit

| ID | Decision | Covering Task(s) |
|----|----------|------------------|
| D-CARRY-01 | Trust-truncate guard (Migration 005) | Task 0 |
| D-CARRY-02 | RLS deny-by-omission → check `rowCount === 0` | Task 5 (Server Actions for clients + cases) |
| Lock #1 | Import from existing `src/lib/supabase/*`, do not recreate | Tasks 1, 3, 4, 5 (all use `@/lib/supabase/server` or `@/lib/supabase/client`) |
| Lock #2 | App Router + src-dir + `@/` alias, `(auth)` + `(workspace)` groups | Tasks 3, 4, 5 |
| Lock #3 | DESIGN.md OKLCH tokens replace scaffold globals.css; slop-detect on commit | Task 1 (foundation) + every UI task (slop-detect in Validation) |
| Lock #4 | Bilingual GR+EN, `el-CY` default, currency `1.234,56 €`, Greek-native strings | Task 2 (catalogues + plugin) + Task 5 (formatting + display) |
| Lock #5 | Fonts: Crimson Pro + Inter Tight fallback + JetBrains Mono fallback; never plain Inter / banned fonts | Task 1 |
| Lock #6a | Migration 005 trust_truncate guard | Task 0 |
| Lock #6b | UPDATE checks `rowCount === 0` (RLS silent deny) | Task 5 Server Actions |
| Lock #7 | Preserve the existing static demo as visual template; replace data layer only | Task 1 (landing preserved) + Task 5 (clients migrated visually, demo files deleted only after the new route works) |

No deferred ideas. No discretion items requiring audit.

---

*Plan generated 2026-05-13 for Phase 2 of Milestone 1 (Demo). Revised 2026-05-13 to (a) move Task 4 → Wave 3 and Task 5 → Wave 4 (resolving the Wave 2 self-dependency), (b) replace the word "placeholder" in Task 4 with the actual deliverable label, (c) add a wiring contract for `src/lib/types.ts`, and (d) thread the "preserve existing demo template, swap only the data layer" operational truth into every relevant task's Action section.*
