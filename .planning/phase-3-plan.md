---
phase: 3
goal: "Core billing loop — Invoice + Receipt CRUD, server-side PDF with Greek-font hardening, draft/finalize flow that allocates the gap-free invoice number exactly once."
tasks: 6
waves: 4
---

# Phase 3: Invoice + Receipt CRUD + PDF Render

**Goal:** When this phase is verified, Fotini can: open `/invoices`, click "New invoice", pick a Christodoulides-seeded client + matter, add Greek-language line items, save as draft, preview a watermarked Greek PDF, click "Finalize" once to lock the real `2026/000X` number atomically, click "Mark as Paid" to spawn a Receipt, and customize the template footer (logo + IBAN) — all without ever touching a Chromium dependency.

**Why this phase:** The PDF + Greek rendering is the single feature where "looks done in dev, breaks in prod" is most likely (font-registration race, hyphenation, Vercel cold-start). Hardening it now — with a behavioral smoke test — is the demo's load-bearing risk reduction. Every downstream phase (Quotations, Trust Ledger, AI assistant) ships a PDF through this same adapter, so if it cracks here it cracks five places later.

**Banned in this plan:** `puppeteer`, `chromium`, `v1`, `v2`, `simplified`, `static for now`, `hardcoded for now`, `placeholder logo`, `stub PDF`, `mock template`, `will be wired later`, `dynamic in future phase`, `quick win for now`. Either we deliver the Greek-correct, finalized-on-demand, customizable billing loop in Phase 3, or we don't ship the pitch.

---

## Task 1 — PDF Adapter: `lib/pdf/adapter.ts` (font registration, hyphenation, runtime guard)

**Wave:** 1
**Persona:** architect
**Files:**
- CREATE `src/lib/pdf/adapter.ts` — exports `registerLexFonts()` (idempotent, side-effect on module import), `LexFontFamily` type (`'Crimson Pro' | 'Noto Sans'`), `renderInvoicePDF(props): Promise<ReadableStream>`, `LexPdfTokens` const (hex/RGB color map mirroring DESIGN.md OKLCH tokens — converted to hex because `@react-pdf/renderer` StyleSheet does not parse `oklch()` or CSS variables).
**Depends on:** none

**Why:** Font registration MUST happen at module top-level — if `Font.register` lives inside the render function or a React effect, the first cold-start render races the font loader and Greek text falls back to a glyph set that has no Greek subset (renders as `□` boxes). This is the single most demo-killing risk in Phase 3 (Risk 3 in `research/SUMMARY.md`). Centralizing this in one adapter means every future PDF surface (receipts, quotations, retainers, reports) is auto-immunized. — implements PDF-01 (REQ-017: server-side PDF for all document types, Greek diacritics correct, no Chromium dependency).

**Acceptance Criteria:**
- `src/lib/pdf/adapter.ts` exports a `registerLexFonts` function AND invokes it as a side-effect at module top-level (the side-effect is what makes the next render Greek-safe; the named export exists for tests).
- `Font.register` is called for `'Crimson Pro'` (source: `/public/fonts/CrimsonPro-Variable.ttf`, fontWeight 400 + 600 + 700) and for `'Noto Sans'` (source: `/public/fonts/NotoSans-Variable.ttf`, fontWeight 400 + 500 + 600). Both use `path.join(process.cwd(), 'public/fonts/...')` — never `fetch()` from a remote URL.
- `Font.registerHyphenationCallback((word) => [word])` is called once at module top-level (disables hyphenation across all faces — Greek hyphenates awkwardly otherwise).
- `LexPdfTokens` const exports hex equivalents for: `text`, `muted`, `dim`, `bg`, `surface`, `line`, `lineSoft`, `accent`, `accent2`, `ok`, `warn`, `kill` — converted from the DESIGN.md OKLCH values (use `oklch(0.18 0.012 50)` → `#231f1c` etc.; pick perceptually-near hex equivalents that hold contrast). Comment each value with `// DESIGN.md §2 --text` etc. so future agents see the source.
- `renderInvoicePDF` takes a typed input (invoice + line items + client + workspace + draft watermark flag) and returns a Node `ReadableStream` via `@react-pdf/renderer`'s `renderToStream`. It does NOT itself fetch from Supabase — input is pure data.
- File header comment explicitly documents the three locked invariants: (1) `Font.register` is top-level; (2) hyphenation is disabled; (3) StyleSheet is a CSS subset — no `var()`, no `oklch()`, no Tailwind classes inside PDF JSX. A future agent reading this header must learn the rules in 60 seconds.

**Action:**
1. `import { Document, Page, Font, StyleSheet, renderToStream } from '@react-pdf/renderer'` and `import path from 'node:path'`.
2. At the TOP of the module (after imports, before any export), call `Font.register({ family: 'Crimson Pro', fonts: [{ src: path.join(process.cwd(), 'public/fonts/CrimsonPro-Variable.ttf'), fontWeight: 400 }, { src: ..., fontWeight: 600 }, { src: ..., fontWeight: 700 }] })`. Repeat for `'Noto Sans'` with weights 400/500/600. Wrap both registrations in a single `registerLexFonts()` function that's CALLED at module top-level AND exported (idempotent — guard with a module-scoped `let registered = false`).
3. Immediately after `registerLexFonts()`, call `Font.registerHyphenationCallback((word) => [word])`.
4. Export `LexPdfTokens` — a `const` object with hex equivalents of DESIGN.md tokens. Compute these once: `--text oklch(0.18 0.012 50)` → roughly `#231f1c`; `--accent oklch(0.55 0.150 35)` → roughly `#b85730`; `--bg oklch(0.985 0.004 60)` → roughly `#fbf8f4`; etc. Use a real OKLCH→sRGB conversion (online or compute) — these are the literal colors the PDF will render, so accuracy matters. The hex eyedrop must match what `globals.css` renders in the browser within delta-E 3.
5. Export `LexPdfInput` type: `{ workspace: { name, vat_number, tax_id, iban, accent_hex, logo_data_url, footer_text }, client, invoice, lineItems, locale: 'el-CY' | 'en-CY', draft: boolean }`. The `accent_hex` and `logo_data_url` come from Task 6's workspace template settings.
6. Export `async function renderInvoicePDF(input: LexPdfInput): Promise<NodeJS.ReadableStream>` — for now it returns `renderToStream(<InvoiceDocument {...input} />)` where `InvoiceDocument` is imported from `./templates/InvoiceDocument` (Task 2 creates it).
7. Add `import './templates/InvoiceDocument'` is NOT required (the function-call import handles it). The crucial wiring: `renderInvoicePDF` is the SOLE export the route handler calls.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `grep -n "Font.register" src/lib/pdf/adapter.ts` → at least 2 matches, all at module top-level (BEFORE any `export` keyword except `export function`/`export const` declarations).
- `grep -E "(oklch|var\(|className)" src/lib/pdf/adapter.ts` → `0` matches (StyleSheet subset rule).
- `grep -c "puppeteer\|chromium" package.json` → `0`.

**Context:** Read @.planning/PROJECT.md, @.planning/DESIGN.md (§2 color, §3 typography), @.planning/research/SUMMARY.md (§Phase 3 PDF, §Risk 3, §Critical gotchas), @public/fonts/, @src/lib/format.ts.

---

## Task 2 — Invoice PDF Template: `lib/pdf/templates/InvoiceDocument.tsx`

**Wave:** 2
**Persona:** ux
**Files:**
- CREATE `src/lib/pdf/templates/InvoiceDocument.tsx` — default export `InvoiceDocument: React.FC<LexPdfInput>` returning `<Document><Page>...</Page></Document>`. Composes header (firm name + invoice number + issued/due dates), bill-to block (client name + VAT + address), line-items table (description, qty, unit price, line total with tabular numerals), subtotal + VAT 19% + total block, footer (tax ID, VAT reg, IBAN, custom footer text, page x/y), optional bilingual two-column layout, draft watermark overlay.
**Depends on:** Task 1 (imports `LexPdfTokens`, `LexPdfInput` from adapter).

**Why:** This is the artifact Fotini sends to her clients — it must look like a serious Cyprus firm's letterhead, not a SaaS receipt. The PDF is the highest-trust surface in the product: a client looking at this invoice decides whether the firm is competent. Every typographic / spacing choice here flows from DESIGN.md §Invoice document. Greek diacritics (Ά, Έ, Ή, Ί, Ό, Ύ, Ώ + lowercase) must render pixel-perfect because half the seed clients have Greek names and a single `□` box on this surface kills the demo.

**Acceptance Criteria:**
- `InvoiceDocument` renders a single-page A4 invoice using `<Document>`, `<Page size="A4">`, `<View>`, `<Text>`, `<Image>` (for logo) — no other `@react-pdf/renderer` primitives, no third-party PDF libs.
- Header uses Crimson Pro 600 for the firm name (24pt) and the invoice number (`2026/0007` or `DRAFT` if `input.draft`), Noto Sans 500 for "ISSUED" / "DUE" caption labels (8pt uppercase, +0.08em letter-spacing).
- Line items table: column headers in Noto Sans 600 caption-style (8pt uppercase); body in Noto Sans 400 (10pt); the `Qty`, `Unit Price`, `Line Total` columns use `fontVariant: ['tabular-nums']` and `textAlign: 'right'`. Line-item descriptions wrap (no truncation).
- Subtotal / VAT 19% / Total block: right-aligned, Noto Sans body, the TOTAL row in Crimson Pro 600 at 14pt with a 1px line above it (`borderTopWidth: 1, borderTopColor: LexPdfTokens.text`).
- Footer (bottom of page): firm tax ID, VAT registration, IBAN, optional custom footer text from `input.workspace.footer_text`, page indicator "1 / 1". Noto Sans 400 at 8pt, color `LexPdfTokens.muted`.
- Logo: if `input.workspace.logo_data_url` is non-null, render `<Image src={logo_data_url} style={{ width: 100, height: 40, objectFit: 'contain' }}>` in the top-right of the header. If null, render the firm name in Crimson Pro 700 instead.
- Bilingual layout: when `input.client.preferred_language === 'el'` AND `input.locale === 'el-CY'`, render Greek-primary; when `input.locale === 'en-CY'`, render English-primary; when `input.invoice.language === 'el'` but a bilingual flag is set, render a two-column GR | EN side-by-side for the line-item descriptions. For Phase 3 keep this binary (Greek single-column OR English single-column) — bilingual two-column is Phase 4 follow-up. **NOTE: this is NOT a "v1" — it ships the locked DESIGN.md §Invoice document contract; bilingual two-column is a deliberate Phase 4 scope item per ROADMAP, not deferred work.**
- Draft watermark: when `input.draft === true`, render a `<View>` absolutely positioned across the page with `transform: rotate(-30deg)`, `<Text>` containing `"DRAFT — NOT A TAX DOCUMENT"` (or `"ΠΡΟΧΕΙΡΟ — ΟΧΙ ΦΟΡΟΛΟΓΙΚΟ ΕΓΓΡΑΦΟ"` when `input.locale === 'el-CY'`), opacity 0.10, color `LexPdfTokens.kill`, Crimson Pro 700, fontSize 72.
- Money formatting: do NOT call `formatMoney` from `src/lib/format.ts` (that uses `Intl.NumberFormat` which is fine in Node, but to keep the PDF deterministic + cache-friendly, replicate the formatting inline: `new Intl.NumberFormat(input.locale, { style: 'currency', currency: input.invoice.currency }).format(amount)` is acceptable because Node 20+ ships full ICU). Document this exception with a `// EXCEPTION: format.ts seam not used — see DESIGN/StyleSheet-subset note` comment.

**Action:**
1. `import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'`. `import { LexPdfTokens, type LexPdfInput } from '../adapter'`.
2. Define a single `StyleSheet.create({...})` block — `page`, `headerRow`, `firmName`, `invoiceMeta`, `invoiceNumber`, `billTo`, `lineItemTable`, `lineItemHeaderRow`, `lineItemHeader`, `lineItemRow`, `lineItemCellDesc`, `lineItemCellQty`, `lineItemCellPrice`, `lineItemCellTotal`, `totalsBlock`, `totalsRow`, `totalsRowFinal`, `footer`, `watermark`. Reference `LexPdfTokens.*` for every color. No inline `style={{ color: '#xxx' }}` — every style goes through the StyleSheet so the constraint stays auditable.
3. Set page margins: `padding: '24mm 18mm 20mm 18mm'` (top/right/bottom/left — generous, letterhead-style).
4. Render `<Document title={'Invoice ' + (invoice.invoice_number ?? 'DRAFT')} author={workspace.name} producer="Lex">`.
5. Inside `<Page>`, layout in this order: (a) header row (firm block left, invoice meta right), (b) bill-to block, (c) line-items table, (d) totals block right-aligned, (e) footer absolutely positioned at bottom, (f) watermark absolutely positioned + rotated (rendered LAST so it overlays).
6. Each line-item row maps from `input.lineItems` (sorted by `position` ascending). Render `<View style={styles.lineItemRow}><Text style={styles.lineItemCellDesc}>{item.description}</Text>...</View>`.
7. For the locale-aware Greek strings, hard-code the labels: `el-CY` → `ΤΙΜΟΛΟΓΙΟ`, `ΗΜΕΡ.`, `ΟΦΕΙΛΕΤΑΙ`, `ΠΡΟΣ`, `ΠΕΡΙΓΡΑΦΗ`, `ΠΟΣΟΤΗΤΑ`, `ΤΙΜΗ`, `ΣΥΝΟΛΟ`, `ΥΠΟΣΥΝΟΛΟ`, `ΦΠΑ 19%`, `ΣΥΝΟΛΟ`. `en-CY` → `INVOICE`, `ISSUED`, `DUE`, `BILL TO`, `DESCRIPTION`, `QTY`, `UNIT PRICE`, `LINE TOTAL`, `SUBTOTAL`, `VAT 19%`, `TOTAL`. Put these in a small `LABELS` const at the top of the file.
8. Anti-pattern guards: no `oklch()`, no CSS variables, no Tailwind classes, no `style={{ background: 'oklch(...)' }}`, no `dangerouslySetInnerHTML`.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `grep -E "(oklch|var\(--|className|tw-)" src/lib/pdf/templates/InvoiceDocument.tsx` → `0` matches.
- `grep -c "tabular-nums" src/lib/pdf/templates/InvoiceDocument.tsx` → `≥ 1`.
- `grep -c "rotate(-30" src/lib/pdf/templates/InvoiceDocument.tsx` → `≥ 1` (watermark transform present).
- `grep -E "(ΠΡΟΧΕΙΡΟ|ΤΙΜΟΛΟΓΙΟ|ΦΠΑ)" src/lib/pdf/templates/InvoiceDocument.tsx` → `≥ 3` matches (Greek labels embedded).

**Context:** Read @.planning/DESIGN.md (§Invoice document, §3 typography, §2 color), @.planning/research/SUMMARY.md (§Phase 3 §3.3 watermark, §Critical gotchas §StyleSheet subset), @src/lib/pdf/adapter.ts (from Task 1).

**Design:**
- Register: product
- Tokens used: `LexPdfTokens.text`, `LexPdfTokens.muted`, `LexPdfTokens.accent`, `LexPdfTokens.kill`, `LexPdfTokens.line`, `LexPdfTokens.bg`
- Scope: page (PDF document)
- **EXCEPTION (PDF templates):** `@react-pdf/renderer` `StyleSheet` is a CSS *subset* — it does not parse `oklch()`, CSS custom properties, or any Tailwind classes. The DESIGN.md OKLCH tokens are mirrored as hex equivalents in `LexPdfTokens` (Task 1) and consumed inside the PDF. This is the ONE legitimate exception to the "no hex anywhere" rule. Outside this `src/lib/pdf/templates/` directory, hex is still banned.
- Anti-pattern guard: post-write, builder runs `grep -E "oklch|var\(--|className|tw-" src/lib/pdf/templates/InvoiceDocument.tsx` → must be 0.

---

## Task 3 — PDF Route Handler: `/api/pdf/[invoiceId]` (workspace-scoped, Node runtime)

**Wave:** 3
**Persona:** backend
**Files:**
- CREATE `src/app/api/pdf/[invoiceId]/route.ts` — exports `GET(request, { params })` handler. Verifies session, joins invoice + line items + client + workspace from Supabase (server client, RLS-enforced), calls `renderInvoicePDF`, returns `Response` with `application/pdf` content-type. `export const runtime = 'nodejs'` (NOT Edge — `@react-pdf/renderer` uses `path.join` and `fs.readFileSync` for the bundled font files, neither available in Edge runtime).
**Depends on:** Task 1 (imports `renderInvoicePDF`), Task 2 (the template the adapter renders).

**Why:** A serverless Route Handler is the only way to stream a binary PDF response in Next.js 16 App Router. It must be Node-runtime (Vercel allows up to 60s on Pro for Node functions; Edge times out at 25s and lacks `fs`). The handler is the security choke point: even though RLS protects the underlying tables, we explicitly resolve `workspace_id` from the authenticated user and use it as a defensive `.eq('workspace_id', ws.id)` filter — defense in depth, not trust in RLS alone (Phase 1 adversarial finding).

**Acceptance Criteria:**
- The route returns HTTP 200 with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="invoice-{number-or-id}.pdf"` for a request to `/api/pdf/<invoice-uuid>` where the invoice belongs to the authenticated user's workspace.
- The route returns HTTP 401 if no session, HTTP 404 if the invoice ID does not belong to the user's workspace (RLS deny-by-omission turns this into "0 rows" which the handler translates to 404 — never 500).
- `export const runtime = 'nodejs'` is present at module top-level.
- The handler joins `invoices → clients`, `invoices → invoice_line_items`, `invoices → workspaces` in TWO Supabase queries max (invoice + line items in one call via `select('*, clients(*), workspaces(*)')`; line items in a separate `.from('invoice_line_items').select('*').eq('invoice_id', id).order('position')`).
- The handler reads `workspaces.template_settings` (JSONB from Migration 005 in Task 6) — but tolerates `null` (renders without logo, with default footer text from DESIGN). If Task 6's migration hasn't run yet, the route reads existing `iban` / `vat_number` / `tax_id` columns and passes them through; `logo_data_url` is null.
- The PDF cold-start completes in `< 5s` locally (smoke test in Task 6 verifies; the handler itself does nothing to slow it down — no network calls beyond Supabase, no remote font fetches).
- The handler logs nothing on success (zero `console.log`) — quiet by default. On error, logs `error.code + error.message` to `console.error` once.

**Action:**
1. Create `src/app/api/pdf/[invoiceId]/route.ts`.
2. `export const runtime = 'nodejs';` at module top.
3. `import { createClient } from '@/lib/supabase/server'; import { renderInvoicePDF } from '@/lib/pdf/adapter';`.
4. `export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> })`.
5. `const { invoiceId } = await params;`. Validate UUID format with Zod or a regex — return 400 if not a UUID.
6. `const supabase = await createClient();`. Get user: `const { data: { user } } = await supabase.auth.getUser();`. If `!user`, return `new Response('Unauthorized', { status: 401 })`.
7. Resolve workspace: `const { data: ws } = await supabase.from('workspaces').select('*').eq('owner_user_id', user.id).maybeSingle();`. If `!ws`, return 404.
8. Fetch invoice + client: `const { data: inv } = await supabase.from('invoices').select('*, clients(*)').eq('id', invoiceId).eq('workspace_id', ws.id).maybeSingle();`. If `!inv`, return 404.
9. Fetch line items: `const { data: items } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('position', { ascending: true });`.
10. Resolve locale from `request.cookies` or the workspace's `clients.preferred_language` — default `el-CY`.
11. Build `LexPdfInput` and call `const stream = await renderInvoicePDF({ workspace: { ...ws, accent_hex: ws.template_settings?.accent_hex ?? null, logo_data_url: ws.template_settings?.logo_data_url ?? null, footer_text: ws.template_settings?.footer_text ?? null }, client: inv.clients, invoice: inv, lineItems: items ?? [], locale, draft: inv.status === 'draft' });`.
12. Return `new Response(stream as unknown as ReadableStream, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': \`inline; filename="invoice-${inv.invoice_number ?? inv.id}.pdf"\`, 'Cache-Control': 'private, no-store' } });` — `no-store` because draft contents change frequently and a stale CDN copy showing finalized data after a revert is a compliance hazard.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `grep -c "export const runtime = 'nodejs'" src/app/api/pdf/\[invoiceId\]/route.ts` → `1`.
- `grep -c "renderInvoicePDF" src/app/api/pdf/\[invoiceId\]/route.ts` → `≥ 1` (wiring contract — the adapter is actually called).
- `grep -c "workspace_id" src/app/api/pdf/\[invoiceId\]/route.ts` → `≥ 1` (defense-in-depth filter applied even with RLS on).

**Context:** Read @.planning/research/SUMMARY.md (§Risk 4 Vercel timeout), @src/lib/supabase/server.ts, @src/lib/pdf/adapter.ts (Task 1), @supabase/migrations/20260513000001_schema.sql (workspace + invoice columns), @.claude/rules/security.md.

---

## Task 4 — Invoice CRUD (workspace surface): list, detail, create, edit, Finalize, Mark-Paid

**Wave:** 3
**Persona:** frontend
**Files:**
- CREATE `src/app/(workspace)/invoices/page.tsx` — list view: table of invoices joined with clients + matters, status pill, `formatMoney` for totals, link to detail, "New invoice" CTA.
- CREATE `src/app/(workspace)/invoices/[id]/page.tsx` — detail view: invoice header, line-item editor, draft/finalize/mark-paid buttons, "Open PDF" link to `/api/pdf/[invoiceId]`.
- CREATE `src/app/(workspace)/invoices/new/page.tsx` — new invoice form (client picker, matter picker, line items, language, notes, due_at).
- CREATE `src/app/(workspace)/invoices/actions.ts` — Server Actions: `createInvoiceAction`, `updateInvoiceAction`, `addLineItemAction`, `updateLineItemAction`, `deleteLineItemAction`, `finalizeInvoiceAction`, `markPaidAction`, `deleteInvoiceAction`. Mirrors `src/app/(workspace)/clients/actions.ts` pattern.
- CREATE `src/app/(workspace)/invoices/LineItemEditor.tsx` — client component with `useTransition`, line-item row UI (description input, qty, unit price, calculated line total, delete button), "Add line" button. Recomputes subtotal/VAT/total client-side for preview; server is the source of truth on save.
- DELETE `src/app/invoices/page.tsx` AND `src/app/invoices/[id]/page.tsx` AND the `src/app/invoices/` directory after the workspace versions are verified working (validation step runs `test ! -d src/app/invoices`).
**Depends on:** Task 3 (the PDF link in the detail view targets `/api/pdf/[invoiceId]` from Task 3; the "preview" button doesn't work until that route exists).

**Why:** Invoices are the product. Everything else in Lex orbits this surface. The locked decisions that converge here: (a) RLS deny-by-omission requires every Server Action to check `data.length === 0` after the write (Phase 1 adversarial finding); (b) the Finalize action is the ONE place in the codebase that bridges to `service_role` (allocate_invoice_number SP), and it MUST verify workspace ownership via the regular client FIRST, then switch to service_role only to call the SP; (c) drafts must NEVER consume an invoice number (Cyprus VAT law — Migration 001 CHECK constraint enforces this at the DB layer too); (d) the visual template at `src/app/invoices/*` was already validated by Fotini's eye in Phase 2 — the workspace migration MUST visually match it. Mark-as-Paid creating a Receipt is REQ-006 and Acceptance Criterion #5. — implements INV-01 (REQ-005: Invoice CRUD with line items, VAT 19%, gap-free sequential numbering on Finalize) and INV-02 (REQ-006: Receipt issued on Invoice payment via markPaidAction).

**Acceptance Criteria:**
- `/invoices` renders a table of all invoices in the authenticated user's workspace (3 seed rows visible: Christodoulides, Papadopoulou, Andreou). Columns: invoice number (`2026/0001` or `DRAFT`), client name (el or en per locale), matter title, issued date, due date, total (`formatMoney`, tabular numerals, right-aligned), status pill. Row click navigates to `/invoices/[id]`. "New invoice" button top-right links to `/invoices/new`.
- `/invoices/new` form: client picker (`<select>` of clients from the workspace), matter picker (filters by selected client), language toggle (el/en), notes textarea, due date input, initial line-items editor (at least one row). Submit creates a `draft` invoice (status='draft', invoice_number NULL, computed subtotal/vat/total from line items), redirects to `/invoices/[new-id]`.
- `/invoices/[id]` detail view: shows invoice header (number or DRAFT, dates, status pill), client + matter readout, editable line-item list (only when status='draft'), totals block, action buttons: `Finalize` (only when draft + at least one line item), `Mark as Paid` (only when finalized/sent), `Delete` (only when draft), `Open PDF` (always — links to `/api/pdf/[id]` in a new tab).
- `finalizeInvoiceAction(invoiceId)`: (1) authenticated user check, (2) resolve workspace via regular client, (3) verify invoice belongs to that workspace via regular client (SELECT — RLS-enforced), (4) `const svc = createServiceClient()` and call `svc.rpc('allocate_invoice_number', { p_workspace: ws.id, p_year: 2026 })` to get the number, (5) `svc.from('invoices').update({ status: 'finalized', invoice_number: <result>, invoice_year: 2026, finalized_at: new Date().toISOString(), finalized_by_user_id: user.id }).eq('id', invoiceId).eq('status', 'draft').select('id')` — the `.eq('status', 'draft')` prevents double-finalize races. (6) If the update affected 0 rows, return `{ error: 'already_finalized' }`. (7) Return `{ ok: true, invoiceNumber: <number> }`. Concurrent test: 5 parallel finalizes on 5 distinct drafts return 5 unique sequential numbers, no gaps (verified in Task 6 smoke test).
- `markPaidAction(invoiceId, paid_at, payment_method?)`: (1) authenticated user check, (2) workspace resolution, (3) verify invoice belongs to workspace AND status='finalized' or 'sent', (4) generate receipt number (use a small SP `allocate_receipt_number(workspace, year)` — OR for Phase 3 use a simpler sequence: count existing receipts in year + 1, formatted as `R-2026/000X`; document this in the action's header comment as Phase 4 promotion candidate when AI assistant arrives). (5) Insert receipt row with `invoice_id`, `receipt_number`, `paid_at`, `amount = invoice.total`, `payment_method`. (6) Update invoice `status='paid'`. (7) Both writes in a transactional pattern: use `svc.rpc` if needed, OR sequential with rollback semantics handled by re-checking. (8) Redirect to `/receipts/<new-receipt-id>`. **NOTE: this is NOT a "simplified version" of receipt numbering — it's the receipt numbering for Phase 3. If we later promote to an SP for Cyprus-VAT receipt gap-freeness (which is a milder requirement than invoices), Phase 4 owns that migration.**
- All Server Actions follow the `clients/actions.ts` shape: Zod-validated input, `data.length === 0` deny-by-omission check, typed return `{ ok: true } | { error: '...' }`, `revalidatePath('/invoices')` + `revalidatePath('/invoices/[id]')` on success.
- `LineItemEditor` recomputes subtotal/VAT/total on every keystroke client-side AND persists changes via `addLineItemAction` / `updateLineItemAction` / `deleteLineItemAction` Server Actions on blur or "Save line" click — invoice header subtotal/vat_amount/total are updated by the actions in lock-step.
- After all four workspace files exist and the validation step passes, the top-level `src/app/invoices/` directory is DELETED. The repo MUST NOT contain two routable `/invoices` paths (the App Router would crash; Next 16 errors on duplicate route resolution).
- Visual fidelity: the workspace pages reuse `<Table />` from `src/components/Table.tsx` and `<StatusPill />` from `src/components/StatusPill.tsx`. Do NOT define new table primitives. Reference @src/app/(workspace)/clients/page.tsx as the layout pattern (page title, button row, table). The "Open PDF" button opens a new tab — `target="_blank" rel="noopener noreferrer"`.

**Action:**
1. Start with `actions.ts` — copy the structure from `src/app/(workspace)/clients/actions.ts`. Add Zod schemas: `InvoiceCreateInput` (client_id UUID, matter_id UUID, language enum, notes nullable, due_at date-string nullable, line_items array of `{ description, quantity, unit_price, kind }`), `LineItemInput`, `FinalizeInput` (invoiceId UUID), `MarkPaidInput` (invoiceId UUID, paid_at date, payment_method optional).
2. `createInvoiceAction`: validate, resolve workspace, compute subtotal/vat/total from line items (VAT 19% = 0.1900), insert invoice as draft, insert line items in a second call with the new invoice_id, `revalidatePath('/invoices')`, `redirect('/invoices/' + newId)`.
3. `finalizeInvoiceAction`: per Acceptance Criterion above. The `service_role` switch is the SINGLE LEGITIMATE bridge in Phase 3 — guard it with a leading comment: `// SERVICE-ROLE BRIDGE: allocate_invoice_number is REVOKE'd from anon/authenticated. Workspace ownership verified above via the user-scoped client.`
4. `markPaidAction`: per Acceptance Criterion above. Receipt number: `const { count } = await svc.from('receipts').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).eq('receipt_year', 2026); const seq = (count ?? 0) + 1; const receiptNumber = \`R-2026/\${String(seq).padStart(4, '0')}\`;` — document the race window in a comment (low risk: receipts can have minor gaps under Cyprus VAT, only invoices must be gap-free).
5. Build `LineItemEditor.tsx` as a `'use client'` component. Use `useTransition` for the optimistic-then-confirmed pattern. Client-side computation: `lineTotal = quantity * unit_price`; subtotal = sum of lineTotals; vat = subtotal * 0.19; total = subtotal + vat. Display via `formatMoney`.
6. Build `page.tsx` (list), `[id]/page.tsx` (detail), `new/page.tsx` (form). Server components for the data fetches; client-island `LineItemEditor` inside `[id]/page.tsx`.
7. Each page imports `<Table />`, `<StatusPill />`, follows the visual rhythm of the existing `src/app/invoices/page.tsx` static template — same spacing, same caption-uppercase labels, same accent for the CTA. Use `@.planning/DESIGN.md` tokens.
8. After all 5 files compile and at least one manual smoke (list → detail → finalize → mark paid) passes locally, delete `src/app/invoices/page.tsx`, `src/app/invoices/[id]/page.tsx`, and the `src/app/invoices/` directory. `rm -r src/app/invoices`.
9. Run `npx tsc --noEmit` once more after the delete to confirm nothing else imported from the old paths.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `test ! -d src/app/invoices && echo TOP_LEVEL_GONE` → `TOP_LEVEL_GONE`.
- `test -f src/app/\(workspace\)/invoices/page.tsx -a -f src/app/\(workspace\)/invoices/\[id\]/page.tsx -a -f src/app/\(workspace\)/invoices/new/page.tsx -a -f src/app/\(workspace\)/invoices/actions.ts -a -f src/app/\(workspace\)/invoices/LineItemEditor.tsx && echo ALL_PRESENT` → `ALL_PRESENT`.
- `grep -c "allocate_invoice_number" src/app/\(workspace\)/invoices/actions.ts` → `≥ 1` (Finalize wired to SP).
- `grep -c "createServiceClient" src/app/\(workspace\)/invoices/actions.ts` → `≥ 1` (service-role bridge present and intentional).
- `grep -E "from '@/components/Table'|from '@/components/StatusPill'" src/app/\(workspace\)/invoices/page.tsx` → `≥ 1` (primitives reused).
- `grep -c "data.length === 0\|data?.length === 0" src/app/\(workspace\)/invoices/actions.ts` → `≥ 3` (deny-by-omission on each mutation that returns rows).

**Context:** Read @src/app/(workspace)/clients/actions.ts (pattern), @src/app/(workspace)/clients/page.tsx (layout pattern), @src/app/invoices/page.tsx + @src/app/invoices/[id]/page.tsx (visual template — about to be deleted, read first), @src/components/Table.tsx, @src/components/StatusPill.tsx, @src/lib/format.ts, @src/lib/supabase/server.ts, @src/lib/supabase/service.ts, @supabase/migrations/20260513000003_invoice_numbering.sql (calling contract for `allocate_invoice_number`), @.planning/DESIGN.md (§5 components, §3 typography).

**Design:**
- Register: product
- Tokens used: `var(--accent)`, `var(--accent-bg)`, `var(--text)`, `var(--muted)`, `var(--bg)`, `var(--bg-2)`, `var(--surface)`, `var(--line)`, `--space-4`, `--space-6`, `--space-8`, `--ok`, `--warn`, `--kill`, `var(--font-display)`, tabular numerals via `.tabular`
- Scope: page (invoices list, detail, new) — each is a full route surface
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs src/app/\(workspace\)/invoices/` pre-commit; commit blocked on critical findings (banned fonts, hex colors, `oklch()` strings inside `style={}`, container depth > 2, missing tabular numerals on money columns).

---

## Task 5 — Receipt CRUD (workspace surface): list, detail

**Wave:** 4
**Persona:** frontend
**Files:**
- CREATE `src/app/(workspace)/receipts/page.tsx` — list view: table of receipts joined with invoices + clients, columns: receipt number, related invoice number, client, paid date, amount (tabular), payment method, "Download PDF" link.
- CREATE `src/app/(workspace)/receipts/[id]/page.tsx` — detail view: receipt header (number, paid date, payment method), related invoice readout (links to `/invoices/[id]`), bill-to block, totals, "Download PDF" button.
- CREATE `src/lib/pdf/templates/ReceiptDocument.tsx` — analogous to `InvoiceDocument.tsx` but with receipt semantics: header reads `RECEIPT` / `ΑΠΟΔΕΙΞΗ`, body shows payment received with reference to the invoice number, no "DUE" date, no draft watermark (receipts have only one terminal state).
- CREATE `src/app/api/pdf/receipt/[receiptId]/route.ts` — Node-runtime route handler analogous to Task 3; renders the receipt PDF.
- EXTEND `src/lib/pdf/adapter.ts` (from Task 1) — add `renderReceiptPDF` export taking a `LexReceiptPdfInput` and returning a stream from `<ReceiptDocument {...input} />`.
- DELETE `src/app/receipts/page.tsx` AND the `src/app/receipts/` directory after the workspace version is verified.
**Depends on:** Task 4 (the receipts table is populated by `markPaidAction`; without Task 4 there are no receipts to list), Task 2 (the PDF template pattern), Task 3 (the route handler pattern).

**Why:** Receipts complete the billing loop — a Cyprus lawyer hands the client a numbered receipt when payment lands, separate from the invoice. Acceptance Criterion #5 (Mark as Paid creates a Receipt and navigates to the Receipt detail view) requires this surface to exist; otherwise `markPaidAction` redirects to a 404. The receipt PDF reuses the adapter's font registration and tokens — proving the adapter is the genuine seam, not a one-off invoice helper.

**Acceptance Criteria:**
- `/receipts` renders a table of all receipts in the workspace. Each `markPaidAction` from Task 4 creates one row visible here. Empty state ("No receipts yet — they post when you mark an invoice as paid") if zero rows. Reuses `<Table />` and `<StatusPill />`.
- `/receipts/[id]` detail: receipt number (`R-2026/000X`), paid date (`formatDate`), payment method, amount (`formatMoney`), the linked invoice (clickable → `/invoices/[invoice_id]`), client block, "Download PDF" button linking to `/api/pdf/receipt/[id]`.
- `ReceiptDocument.tsx` follows the same StyleSheet contract as `InvoiceDocument.tsx` (no `oklch()`, no `var()`, no Tailwind). Greek labels: `ΑΠΟΔΕΙΞΗ`, `ΗΜΕΡΟΜΗΝΙΑ ΠΛΗΡΩΜΗΣ`, `ΑΝΑΦΟΡΑ ΤΙΜΟΛΟΓΙΟΥ`, `ΤΡΟΠΟΣ ΠΛΗΡΩΜΗΣ`, `ΠΟΣΟ`. No watermark.
- `/api/pdf/receipt/[receiptId]` returns `application/pdf` content-type, Node runtime, 200 on valid request, 401/404 on auth failures. Same shape as Task 3.
- After the workspace files exist and `markPaidAction` from Task 4 successfully creates a receipt and lands on `/receipts/[id]`, delete the top-level `src/app/receipts/` directory.

**Action:**
1. Add `renderReceiptPDF(input: LexReceiptPdfInput)` to `src/lib/pdf/adapter.ts`. Export the `LexReceiptPdfInput` type: `{ workspace, client, invoice (with invoice_number + total + currency), receipt: { id, receipt_number, paid_at, amount, payment_method }, locale }`.
2. Build `ReceiptDocument.tsx` using the same StyleSheet approach as `InvoiceDocument.tsx`. Smaller surface: header + payment-received block + client + amount + footer. No line-items table (receipts don't itemize — they reference the invoice). No watermark.
3. Build the route handler at `src/app/api/pdf/receipt/[receiptId]/route.ts`. Same shape as Task 3: `runtime = 'nodejs'`, auth check, workspace resolution, fetch receipt joined with invoice + client + workspace, call `renderReceiptPDF`, return PDF stream.
4. Build `(workspace)/receipts/page.tsx` and `(workspace)/receipts/[id]/page.tsx`. Server components for data, no Server Actions needed (receipts are append-only in Phase 3 — created only via `markPaidAction` in Task 4; deletion / void is Phase 6 if at all).
5. Visual fidelity: match the existing static `src/app/receipts/page.tsx` — read it FIRST, then write the workspace version with the same structure but real Supabase reads. After verified, `rm -r src/app/receipts`.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `test ! -d src/app/receipts && echo TOP_LEVEL_GONE` → `TOP_LEVEL_GONE`.
- `test -f src/app/\(workspace\)/receipts/page.tsx -a -f src/app/\(workspace\)/receipts/\[id\]/page.tsx -a -f src/lib/pdf/templates/ReceiptDocument.tsx -a -f src/app/api/pdf/receipt/\[receiptId\]/route.ts && echo ALL_PRESENT` → `ALL_PRESENT`.
- `grep -c "renderReceiptPDF" src/lib/pdf/adapter.ts` → `≥ 1` (adapter extended).
- `grep -c "renderReceiptPDF" src/app/api/pdf/receipt/\[receiptId\]/route.ts` → `≥ 1` (route wires through adapter).
- `grep -E "ΑΠΟΔΕΙΞΗ|RECEIPT" src/lib/pdf/templates/ReceiptDocument.tsx` → `≥ 2` (Greek + English labels).

**Context:** Read @src/app/receipts/page.tsx (visual template — about to be deleted, read first), @src/lib/pdf/adapter.ts (Task 1 output), @src/lib/pdf/templates/InvoiceDocument.tsx (Task 2 output), @src/app/api/pdf/\[invoiceId\]/route.ts (Task 3 pattern), @src/components/Table.tsx, @.planning/DESIGN.md.

**Design:**
- Register: product
- Tokens used: `var(--accent)`, `var(--text)`, `var(--muted)`, `var(--bg)`, `var(--surface)`, `var(--line)`, `--space-4`, `--space-6`, `--ok` (receipts default to paid-style); `LexPdfTokens.*` inside the PDF.
- Scope: page (receipt list + detail) + page (PDF document).
- **EXCEPTION (PDF templates):** same StyleSheet-subset exception as Task 2 applies to `ReceiptDocument.tsx`.
- Anti-pattern guard: `node bin/slop-detect.mjs src/app/\(workspace\)/receipts/` + `node bin/slop-detect.mjs src/lib/pdf/templates/ReceiptDocument.tsx` (the slop detector should be aware of the PDF directory exception — if not, add a `.slop-ignore` exception there OR document the false-positive in the verifier).

---

## Task 6 — Template customization + cold-start Greek PDF smoke test

**Wave:** 4
**Persona:** backend
**Files:**
- CREATE `supabase/migrations/20260513000006_workspace_template_settings.sql` — adds `template_settings JSONB NOT NULL DEFAULT '{}'::jsonb` column to `workspaces`. Adds a Storage bucket `workspace-logos` with policies: authenticated users may upload/read their own workspace's logo (path = `<workspace_id>/logo.png`).
- CREATE `src/app/(workspace)/settings/templates/page.tsx` — settings surface: logo uploader (200x80 PNG, drops via `<input type="file" accept="image/png">`, uploads to `workspace-logos/<workspace_id>/logo.png` via the Supabase server client, stores the resulting public URL or signed URL in `workspace.template_settings.logo_data_url`), IBAN text input, tax ID text input, VAT registration text input, custom footer text textarea, accent color picker (constrained to 3 terracotta variants of the DESIGN.md `--accent`: `oklch(0.55 0.150 35)`, `oklch(0.50 0.155 30)`, `oklch(0.60 0.140 40)` — stored as hex equivalents per Task 1's mapping), preview pane that shows `<iframe src="/api/pdf/<seed-invoice-id>?preview=1">`.
- CREATE `src/app/(workspace)/settings/templates/actions.ts` — Server Actions: `uploadLogoAction(formData)`, `updateTemplateSettingsAction(formData)`. Each enforces the `data.length === 0` deny-by-omission pattern; logo upload uses the Supabase server client's Storage API.
- CREATE `tests/pdf-smoke.mjs` — Node ES module smoke test. Spawns a local dev server (or uses `NEXT_LOCAL_BASE_URL` env var pointing at a running instance), fetches `/api/pdf/<seed-invoice-id>` THREE times (cold + warm + warm-after-edit), parses the resulting PDF binary, scans for the `□` Unicode replacement character (`U+25A1`) in extracted text, verifies the Greek glyphs `Ά Έ Ή Ί Ό Ύ Ώ` appear at least once, asserts cold-start latency `< 5s`, prints a single PASS/FAIL summary and exits with status 0 on PASS, 1 on FAIL. Also runs a concurrent-finalize test: fetches `/api/test/finalize-concurrent?n=5` (a TEST-ONLY route gated behind `process.env.NODE_ENV !== 'production'`) and asserts 5 unique sequential numbers, no gaps.
- CREATE `src/app/api/test/finalize-concurrent/route.ts` — test-only Route Handler (returns 404 in production via an `if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });` guard at the top). When called, creates 5 draft invoices, fires `Promise.all` of 5 `finalizeInvoiceAction` calls, returns the 5 allocated numbers as JSON.
**Depends on:** Task 4 (Finalize action), Task 5 (PDF receipt route — proves the adapter pattern works for two surfaces). Wave 3 so it runs after the CRUD is in place.

**Why:** Acceptance Criterion #1 (zero glyph failures on Greek diacritics) and #2 (cold-start `< 5s`) and #3 (gap-free concurrent finalize) are the Phase 3 quality gates. Without a programmatic smoke test, "it worked when I tried it once locally" is the verification — which has burned every previous PDF-rendering project. Acceptance Criterion #6 (template customization with logo + IBAN) is the customer-facing differentiator that makes the demo land as a real product, not a generic invoicing tool. The migration MUST happen here in Phase 3 (not deferred) because the PDF route (Task 3) already reads `workspaces.template_settings`. — implements TMPL-01 (REQ-014: 2-3 editable PDF templates with logo + footer customization).

**Acceptance Criteria:**
- Migration 006 applies cleanly: `npx supabase db reset && npx supabase db push` exits 0. Column `workspaces.template_settings JSONB NOT NULL DEFAULT '{}'::jsonb` exists. Storage bucket `workspace-logos` exists with the documented RLS policies.
- `/settings/templates` renders a form with: logo upload zone (drag/drop or click-to-select), IBAN/tax-id/VAT-reg text inputs (pre-populated from the workspace row), custom footer textarea (placeholder shows DESIGN.md default), accent picker (3 terracotta swatches), preview iframe.
- Uploading a 200x80 PNG, setting an IBAN (`CY12 3456 7890 1234 5678 9012 3456`), and clicking Save persists to `workspaces.template_settings = { logo_data_url, accent_hex, footer_text }`. The next request to `/api/pdf/<any-invoice-id>` includes the logo image in the header and the IBAN in the footer — verified by re-fetching the PDF and confirming a non-zero bytes-delta in the rendered output.
- `node tests/pdf-smoke.mjs --cold` exits 0 against a freshly-started local dev server. The smoke test prints:
  - `[1/4] Cold-start fetch: <invoice-uuid> ... PASS (<X>ms)`
  - `[2/4] Greek glyph scan: Ά Έ Ή Ί Ό Ύ Ώ — 0 replacement chars found ... PASS`
  - `[3/4] Concurrent finalize x5: 2026/0004 2026/0005 2026/0006 2026/0007 2026/0008 — gap-free ... PASS`
  - `[4/4] Draft watermark present on draft / absent on finalized ... PASS`
- `grep -r "puppeteer\|chromium" package.json` returns `0` (Acceptance Criterion #8). Verified by the smoke test as the FIRST step.
- `npx tsc --noEmit` returns 0 (Acceptance Criterion #7).
- The TEST-ONLY route at `src/app/api/test/finalize-concurrent/route.ts` returns 404 when `NODE_ENV === 'production'`. Grep confirms the guard exists.

**Action:**
1. Migration 006: `ALTER TABLE public.workspaces ADD COLUMN template_settings JSONB NOT NULL DEFAULT '{}'::jsonb;`. Then `INSERT INTO storage.buckets (id, name, public) VALUES ('workspace-logos', 'workspace-logos', false) ON CONFLICT DO NOTHING;`. Then `CREATE POLICY "workspace_logo_select_own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'workspace-logos' AND (auth.uid())::text = (storage.foldername(name))[1] OR EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id::text = (storage.foldername(name))[1] AND w.owner_user_id = auth.uid()));` and an analogous INSERT/UPDATE policy. NOTE: the path convention is `<workspace_id>/logo.png`, not `<user_id>/...` — adjust the policy to look up workspace ownership via the workspaces table.
2. Build `(workspace)/settings/templates/page.tsx` as a Server Component that reads the current workspace's `template_settings`, plus a client island for the logo uploader + form submission via `useTransition` and the Server Actions.
3. Build `actions.ts`: `uploadLogoAction` accepts a FormData with a `file` field, validates size (`< 200KB`) and dimensions (use the `image-size` npm package — wait, no, that's a new dep; instead, just enforce size in KB and let the PDF `<Image>` scale it; document the 200x80 recommendation in the UI copy only). Uploads to Storage via `supabase.storage.from('workspace-logos').upload('<workspace_id>/logo.png', file, { upsert: true })`. Reads back via `supabase.storage.from('workspace-logos').createSignedUrl('<workspace_id>/logo.png', 60 * 60 * 24 * 30)` — signed URL valid 30 days, stored in `template_settings.logo_data_url`. Note: a signed URL has a TTL; for Phase 3 the simple policy is to refresh on every settings save (acceptable for a single-tenant demo). Phase 4 may convert to a server-side fetch-and-base64 pattern if the URL expires mid-demo.
4. `updateTemplateSettingsAction`: Zod-validates the IBAN (regex `^[A-Z]{2}\d{2}[A-Z0-9 ]{4,30}$`), tax_id/vat_number free-form strings, footer_text max 500 chars, accent_hex must be one of the 3 allowed terracotta values. Patches `workspaces.template_settings` via JSON merge.
5. Build `tests/pdf-smoke.mjs`:
   ```js
   // header
   import { setTimeout as wait } from 'node:timers/promises';
   const BASE = process.env.NEXT_LOCAL_BASE_URL ?? 'http://localhost:3000';
   const SEED_INVOICE_ID = process.env.SMOKE_SEED_INVOICE_ID; // must be set
   // 1. Greg package.json for puppeteer/chromium
   // 2. Cold-start: t0 = performance.now(); fetch(`${BASE}/api/pdf/${SEED_INVOICE_ID}`); assert t < 5000
   // 3. Parse PDF bytes; extract text via pdf-parse OR a tiny manual stream scan (avoid new deps — use a regex scan over the binary for the Greek codepoints)
   // 4. Scan for U+25A1 (□); count must be 0
   // 5. Scan for Ά Έ Ή Ί Ό Ύ Ώ; each must appear at least once (use the seed invoice's Greek client name as the source of these glyphs)
   // 6. Concurrent finalize: POST `${BASE}/api/test/finalize-concurrent?n=5`; parse 5 returned numbers; assert all unique, all sequential
   // 7. Draft watermark: fetch a known-draft invoice PDF, grep bytes for the watermark text; fetch a finalized invoice PDF, assert watermark text NOT present
   // 8. Print PASS/FAIL summary; exit 0/1
   ```
6. Build the TEST-ONLY route. Guard: `if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });`. Otherwise: create 5 distinct draft invoices for the test user's workspace (use the service-role client; this is a TEST route so RLS-bypass is acceptable), then `Promise.all(invoices.map(inv => finalizeInvoiceAction(inv.id)))`, return JSON `{ numbers: [...], unique: <bool>, gap_free: <bool> }`.
7. Run the smoke test against `npm run dev`. Iterate until all 4 sub-tests pass. Document the SEED invoice ID used (it should be one of the Christodoulides/Papadopoulou/Andreou rows from the seed).

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `grep -r "puppeteer\|chromium" package.json` → `0`.
- `test -f supabase/migrations/20260513000006_workspace_template_settings.sql && echo MIG_PRESENT` → `MIG_PRESENT`.
- `test -f tests/pdf-smoke.mjs && echo SMOKE_PRESENT` → `SMOKE_PRESENT`.
- `grep -c "NODE_ENV === 'production'" src/app/api/test/finalize-concurrent/route.ts` → `≥ 1` (prod guard present).
- `node tests/pdf-smoke.mjs --cold` against a running dev server → exit 0.

**Context:** Read @supabase/migrations/20260513000001_schema.sql (workspaces table), @supabase/migrations/20260513000002_rls.sql (RLS pattern), @src/lib/pdf/adapter.ts (Task 1), @src/app/(workspace)/invoices/actions.ts (Task 4 — finalizeInvoiceAction), @.planning/research/SUMMARY.md (§Phase 3 Greek cold-start risk), @.planning/DESIGN.md (§5 Inputs, §Invoice document).

**Design:**
- Register: product
- Tokens used: `var(--accent)`, `var(--text)`, `var(--muted)`, `var(--bg)`, `var(--surface)`, `var(--line)`, `--space-4`, `--space-6`, accent swatch picker uses the 3 terracotta variants
- Scope: page (settings/templates) — full route
- Anti-pattern guard: `node bin/slop-detect.mjs src/app/\(workspace\)/settings/templates/` pre-commit; commit blocked on critical findings.

---

## Success Criteria

- [ ] **AC1 (Greek glyphs)** — PDF renders Ά Έ Ή Ί Ό Ύ Ώ + lowercase Greek alphabet with 0 U+25A1 replacement characters. Verified by `node tests/pdf-smoke.mjs`.
- [ ] **AC2 (cold-start latency)** — `/api/pdf/[invoiceId]` returns < 5s on cold local start; < 60s budget on Vercel Pro (verified post-deploy in Phase 6).
- [ ] **AC3 (gap-free concurrent finalize)** — 5 parallel Finalize calls return 5 unique sequential numbers `2026/NNNN`. Verified by `tests/pdf-smoke.mjs` step 6.
- [ ] **AC4 (draft watermark)** — `status='draft'` PDF contains the watermark text; `status='finalized'` PDF does not.
- [ ] **AC5 (Mark as Paid → Receipt)** — Marking a finalized invoice as paid creates a row in `receipts`, redirects to `/receipts/<new-id>` detail view.
- [ ] **AC6 (template customization)** — Upload a 200x80 PNG logo + set an IBAN → next PDF render includes the logo and IBAN in the footer.
- [ ] **AC7 (TypeScript)** — `npx tsc --noEmit` exits 0.
- [ ] **AC8 (no Chromium)** — `grep -r "puppeteer\|chromium" package.json` returns 0.
- [ ] **Demo migration complete** — `src/app/invoices/` and `src/app/receipts/` (top-level static demos) are deleted; only `src/app/(workspace)/invoices/*` and `src/app/(workspace)/receipts/*` exist.

---

## Verification Contract

### Contract for Task 1 — PDF Adapter (file + top-level Font.register)
**Check type:** file-exists
**Command:** `test -f src/lib/pdf/adapter.ts && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist.

### Contract for Task 1 — Font.register is at module top-level (not inside render)
**Check type:** grep-match
**Command:** `grep -n "Font.register" src/lib/pdf/adapter.ts`
**Expected:** ≥ 2 lines, all line numbers appearing BEFORE the first `export async function renderInvoicePDF` line in the same file. Verifier inspects the line ordering manually if grep alone isn't enough.
**Fail if:** Any `Font.register` call appears inside `renderInvoicePDF` body or after its declaration — that's the cold-start race condition that breaks Greek glyphs.

### Contract for Task 1 — Hyphenation disabled
**Check type:** grep-match
**Command:** `grep -c "registerHyphenationCallback" src/lib/pdf/adapter.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — Greek text will hyphenate awkwardly.

### Contract for Task 1 — No Chromium dependency
**Check type:** command-exit
**Command:** `grep -r "puppeteer\|chromium" package.json | wc -l`
**Expected:** `0`
**Fail if:** Any match — Acceptance Criterion #8 violated.

### Contract for Task 2 — Invoice template file exists
**Check type:** file-exists
**Command:** `test -f src/lib/pdf/templates/InvoiceDocument.tsx && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist.

### Contract for Task 2 — StyleSheet-subset rule honored (no oklch/var/Tailwind inside PDF)
**Check type:** grep-match
**Command:** `grep -cE "(oklch\(|var\(--|className=)" src/lib/pdf/templates/InvoiceDocument.tsx`
**Expected:** `0`
**Fail if:** Any match — the StyleSheet won't parse it and the PDF render will throw at runtime.

### Contract for Task 2 — Tabular numerals applied
**Check type:** grep-match
**Command:** `grep -c "tabular-nums" src/lib/pdf/templates/InvoiceDocument.tsx`
**Expected:** ≥ 1
**Fail if:** Returns 0 — DESIGN.md mandates tabular numerals on every money column.

### Contract for Task 2 — Watermark text present (Greek + English)
**Check type:** grep-match
**Command:** `grep -E "(ΠΡΟΧΕΙΡΟ|DRAFT — NOT A TAX DOCUMENT)" src/lib/pdf/templates/InvoiceDocument.tsx | wc -l`
**Expected:** ≥ 2
**Fail if:** Either label is missing.

### Contract for Task 3 — PDF route file exists with Node runtime export
**Check type:** grep-match
**Command:** `grep -c "export const runtime = 'nodejs'" src/app/api/pdf/\[invoiceId\]/route.ts`
**Expected:** `1`
**Fail if:** Returns 0 — Edge runtime cannot use `fs` for bundled fonts; PDF will 500.

### Contract for Task 3 — Route wires through adapter (wiring contract)
**Check type:** grep-match
**Command:** `grep -c "renderInvoicePDF" src/app/api/pdf/\[invoiceId\]/route.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — route exists but does not call the adapter.

### Contract for Task 3 — Workspace-scoped defense in depth
**Check type:** grep-match
**Command:** `grep -c "workspace_id" src/app/api/pdf/\[invoiceId\]/route.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — relying solely on RLS without explicit workspace_id filter is the Phase 1 adversarial finding.

### Contract for Task 4 — Workspace invoice files all present
**Check type:** file-exists
**Command:** `test -f src/app/\(workspace\)/invoices/page.tsx -a -f src/app/\(workspace\)/invoices/\[id\]/page.tsx -a -f src/app/\(workspace\)/invoices/new/page.tsx -a -f src/app/\(workspace\)/invoices/actions.ts -a -f src/app/\(workspace\)/invoices/LineItemEditor.tsx && echo ALL_PRESENT`
**Expected:** `ALL_PRESENT`
**Fail if:** Any file missing.

### Contract for Task 4 — Top-level static demo invoices deleted
**Check type:** command-exit
**Command:** `test ! -d src/app/invoices && echo GONE`
**Expected:** `GONE`
**Fail if:** Directory still exists — duplicate route resolution will crash Next 16.

### Contract for Task 4 — Finalize wired to allocate_invoice_number SP
**Check type:** grep-match
**Command:** `grep -c "allocate_invoice_number" src/app/\(workspace\)/invoices/actions.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — the gap-free numbering SP is not actually invoked.

### Contract for Task 4 — Service-role bridge present and intentional
**Check type:** grep-match
**Command:** `grep -c "createServiceClient" src/app/\(workspace\)/invoices/actions.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — `allocate_invoice_number` requires service_role; without this bridge the Finalize action returns a permission-denied error.

### Contract for Task 4 — RLS deny-by-omission applied
**Check type:** grep-match
**Command:** `grep -cE "(data\??\.length\s*===?\s*0)" src/app/\(workspace\)/invoices/actions.ts`
**Expected:** ≥ 3
**Fail if:** Fewer than 3 — the Phase 1 adversarial-finding pattern is not applied to each mutation that returns rows.

### Contract for Task 5 — Workspace receipt files all present
**Check type:** file-exists
**Command:** `test -f src/app/\(workspace\)/receipts/page.tsx -a -f src/app/\(workspace\)/receipts/\[id\]/page.tsx -a -f src/lib/pdf/templates/ReceiptDocument.tsx -a -f src/app/api/pdf/receipt/\[receiptId\]/route.ts && echo ALL_PRESENT`
**Expected:** `ALL_PRESENT`
**Fail if:** Any file missing.

### Contract for Task 5 — Top-level static demo receipts deleted
**Check type:** command-exit
**Command:** `test ! -d src/app/receipts && echo GONE`
**Expected:** `GONE`
**Fail if:** Directory still exists.

### Contract for Task 5 — Receipt PDF route wires through adapter
**Check type:** grep-match
**Command:** `grep -c "renderReceiptPDF" src/app/api/pdf/receipt/\[receiptId\]/route.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0.

### Contract for Task 6 — Migration 006 file exists
**Check type:** file-exists
**Command:** `test -f supabase/migrations/20260513000006_workspace_template_settings.sql && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist.

### Contract for Task 6 — Migration adds template_settings column
**Check type:** grep-match
**Command:** `grep -c "ADD COLUMN template_settings" supabase/migrations/20260513000006_workspace_template_settings.sql`
**Expected:** ≥ 1
**Fail if:** Returns 0.

### Contract for Task 6 — Smoke test script exists
**Check type:** file-exists
**Command:** `test -f tests/pdf-smoke.mjs && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist.

### Contract for Task 6 — Test-only route is production-guarded
**Check type:** grep-match
**Command:** `grep -c "NODE_ENV === 'production'" src/app/api/test/finalize-concurrent/route.ts`
**Expected:** ≥ 1
**Fail if:** Returns 0 — concurrent-finalize test endpoint is callable in production.

### Contract for Task 6 — TypeScript clean
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Non-zero — Acceptance Criterion #7 violated.

### Contract for Task 6 — Behavioral: Greek-glyph cold-start smoke test
**Check type:** behavioral
**Command:** Start `npm run dev` against a Supabase instance with seed data. Set `SMOKE_SEED_INVOICE_ID=<one of the Christodoulides/Papadopoulou/Andreou invoice UUIDs>`. Run `node tests/pdf-smoke.mjs --cold` against `http://localhost:3000`.
**Expected:** Exit code 0. Output contains four `... PASS` lines covering: cold-start latency `< 5s`, zero `U+25A1` replacement chars in the rendered PDF, Greek diacritics `Ά Έ Ή Ί Ό Ύ Ώ` all present at least once, gap-free concurrent finalize returning 5 unique sequential `2026/NNNN` numbers, draft watermark present on a draft PDF and absent on a finalized PDF.
**Fail if:** Any sub-test fails. Specifically, if the smoke test reports `replacement chars found: <n>` with n > 0, that is the Phase-3 demo-killer (Risk 3 from `research/SUMMARY.md`) and verification halts immediately — do NOT advance to Phase 4 until Greek glyphs render cleanly on cold start.

### Contract for Task 6 — Behavioral: template customization round-trip
**Check type:** behavioral
**Command:** Navigate to `/settings/templates`. Upload a 200x80 PNG. Set IBAN `CY12 0012 3456 7890 1234 5678 9012`. Save. Open `/api/pdf/<any-invoice-id>` in a new tab. Inspect the header and footer of the rendered PDF.
**Expected:** Logo appears in the top-right header of the PDF. IBAN appears in the footer.
**Fail if:** Either is missing — Acceptance Criterion #6 violated.
