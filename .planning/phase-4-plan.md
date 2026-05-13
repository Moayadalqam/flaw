---
phase: 4
goal: "Quotation + Retainer + Billable-Hours Timer + Trust Ledger views — the three remaining document types, the timer, and the visually-separated trust ledger that proves client funds are never mixed with revenue."
tasks: 4
waves: 2
---

# Phase 4: Quotation + Retainer + Billable-Hours Timer + Trust Ledger Views

**Goal:** When this phase is verified, Fotini can: open `/quotations`, create a quotation with line items, hit "Accept & Convert to Invoice" and watch a draft invoice appear pre-populated; open `/retainers`, create a retainer with a €2,000 deposit and see the trust ledger record one debit entry while the revenue summary stays at €0; open `/trust`, see a sage-olive surface with the banner "Trust ledger — Client funds. Not lawyer revenue." in her active locale, with every ledger entry tabular and append-only; click a matter on `/timer`, hit "Start", watch the elapsed time tick, hit "Stop" → a `time_entries` row is created, click "Bill these hours" → a new draft invoice opens with the description / hours / rate already filled in.

**Why this phase:** Phase 4 closes the document-type loop (invoice, receipt, quotation, retainer) AND ships the trust-ledger / billable-hours features that are Lex's two disbarment-grade differentiators. The trust-ledger visual contract (sage-olive `--trust`, NEVER on revenue surfaces) is the single feature Fotini will check first at the pitch — it's the credibility wedge. The timer + "Bill these hours" handoff is the workflow paralegal Elena lives in every morning. Both must work end-to-end on real Supabase data with RLS deny-by-omission, not on the static demo arrays.

**Banned in this plan:** `v1`, `v2`, `simplified version`, `static for now`, `hardcoded for now`, `placeholder`, `basic version`, `minimal implementation`, `will be wired later`, `dynamic in future phase`, `skip for now`, `stub`, `mock for now`, `we can improve this later`, `quick win for now`. Every task delivers the locked decision verbatim — RLS-scoped Server Actions, real ledger reads, the verbatim Greek + English banner, the gap-free conversion to a real draft invoice with the matter linked. If a task slips, it slips by a phase, not by being watered down.

---

## Task 1 — Quotations: `(workspace)/quotations/*` + actions.ts + Accept & Convert action

**Wave:** 1
**Persona:** backend
**Files:**
- CREATE `src/app/(workspace)/quotations/page.tsx` — list view. Server component. RLS-scoped `select('*, clients!inner(name_el, name_en), matters(matter_number, title)')` from `public.quotations` ordered `created_at desc`. Reuses `<Table>` + `<StatusPill>`. Columns: Number (`quotation_number` or "—" for draft, tabular accent), Client (locale-aware name), Matter (number tabular), Issued (`formatDate`), Valid Until, Total (`formatMoney`), Status pill. Header has "+ New quotation" → `/quotations/new` styled `.btn-primary`.
- CREATE `src/app/(workspace)/quotations/new/page.tsx` — create form. Server component fetches `clients` + `matters` lists for the workspace, renders `<NewQuotationForm clients={...} matters={...} />`.
- CREATE `src/app/(workspace)/quotations/NewQuotationForm.tsx` — client component. Mirrors the shape of `(workspace)/invoices/NewInvoiceForm.tsx` (read it for pattern), but submits to `createQuotationAction`. Uses the SAME line-item editor primitive — `import { LineItemEditor } from '@/app/(workspace)/invoices/LineItemEditor'` (do NOT fork; reuse).
- CREATE `src/app/(workspace)/quotations/[id]/page.tsx` — detail view. RLS-scoped fetch of the quotation + its `quotation_line_items` (see schema clarification in Action step 2) + joined client + matter. Renders the letterhead-style document body (mirror visual structure of the OLD demo at `src/app/quotations/[id]/page.tsx`, but swap `eur`/`date` for `formatMoney`/`formatDate` and `getClient`/`getMatter` for the joined data). Header right-rail has TWO buttons: "Download PDF" (links to `/api/quotations/[id]/pdf` — Phase 3's PDF adapter is reused; see Action step 7 for the `quotationPdfInput` shape) and the Accept-action button (form posting to `acceptQuotationAction`). The footer prints the verbatim string "Quotation only — not a tax invoice. Becomes a draft invoice on acceptance." (English) / "Προσφορά — δεν είναι φορολογικό τιμολόγιο. Μετατρέπεται σε πρόχειρο τιμολόγιο με την αποδοχή." (Greek) per `getLocale()`.
- CREATE `src/app/(workspace)/quotations/actions.ts` — Server Actions: `createQuotationAction(FormData)`, `updateQuotationAction(id, FormData)` (header fields only, draft-only), `deleteQuotationAction(id)` (drafts only), `markSentAction(id)` (draft → sent), `acceptQuotationAction(id)` — see Action step 5 for the conversion contract.
- CREATE `src/app/(workspace)/quotations/QuotationActions.tsx` — client component wrapping the action buttons (Mark Sent / Accept & Convert / Delete) with `useTransition` for pending states, mirrors `(workspace)/invoices/InvoiceActions.tsx`.
- CREATE `src/app/api/quotations/[id]/pdf/route.ts` — `GET` route returning `application/pdf` stream from a Phase-3-style PDF adapter call. Reuses `lib/pdf/adapter.ts` infrastructure: imports the existing `renderInvoicePDF` only if a quotation-specific renderer wasn't built in Phase 3 — see Action step 7 for the decision and the QUOTATION header swap.
- DELETE `src/app/quotations/page.tsx` and `src/app/quotations/[id]/page.tsx` (the old top-level demo).
- EXTEND `src/lib/types.ts` — add `QuotationStatus` (`'draft' | 'sent' | 'accepted' | 'declined' | 'expired'`), `QuotationRow` (mirrors the migration's `quotations` table columns), `QuotationLineItemRow` (if a separate `quotation_line_items` table exists per Action step 2; otherwise reuse the `LineItemRow` shape), and `QuotationWithRelations` (joined `clients` + `matters` slices, same pattern as `InvoiceWithRelations`).
- EXTEND `messages/el-CY.json` and `messages/en-CY.json` — add a `quotations` namespace mirroring `invoices`: `title`, `number`, `issued`, `validUntil`, `subtotal`, `vat`, `total`, `client`, `matter`, `status`, `new`, `statusDraft`, `statusSent`, `statusAccepted`, `statusDeclined`, `statusExpired`, `accept`, `acceptConfirm` ("Accept this quotation and create a draft invoice?"), `convertedTo` ("Converted to invoice"), `notTaxInvoice` (the verbatim footer string in each locale).
**Depends on:** none

**Why:** Quotations are the front-half of the engagement-to-invoice funnel — Fotini sends a quotation, the client signs, she clicks one button and the invoice is in draft, ready to finalize. The "Accept & Convert" action is the single feature that proves the data model is unified (same client, same matter, copied line items), not a parallel universe of "quotation-flavored" entities. Implements REQ-007 (INV-03 — Quotation CRUD + convert to Invoice) and acceptance criterion #1 (resulting invoice is draft, all line items copied, matter linked, source quotation marked `accepted`).

**Acceptance Criteria:**
- `/quotations` renders the workspace's quotations (RLS-scoped) with locale-aware client names, tabular numerals on Number/Matter/Issued/Valid-Until/Total, status pills using `<StatusPill>` (tone map: draft→muted, sent→ok, accepted→ok, declined→kill, expired→kill).
- `/quotations/new` accepts client + matter + line items + language + notes + valid_until, calls `createQuotationAction`, redirects to `/quotations/{id}` on success, surfaces Zod validation issues inline (mirror invoice form behavior).
- `/quotations/[id]` renders the letterhead document body with QUOTATION caption + tabular quotation number (or "DRAFT" for unallocated) + dual-language footer with the verbatim "Quotation only — not a tax invoice." string per active locale. Page shows Mark Sent (draft only), Accept & Convert (sent only), Delete (draft only) buttons.
- "Accept & Convert to Invoice" on a `sent` quotation: creates one new row in `public.invoices` with `status='draft'`, `client_id` + `matter_id` + `language` + `currency` + `notes` copied from the quotation, and one row per quotation line item in `public.invoice_line_items` with the EXACT `description` / `quantity` / `unit_price` / `kind` / `position` from the source. The source quotation has its `status` updated to `accepted` and `converted_invoice_id` set to the new invoice's id. ALL writes happen via a single SECURITY DEFINER stored procedure `convert_quotation_to_invoice(p_quotation_id UUID)` invoked through the service client, so atomicity is database-enforced; see Action step 5.
- After accept, the user is redirected to `/invoices/{newDraftId}` (so they land on the draft and can finalize when ready).
- `GET /api/quotations/[id]/pdf` returns `application/pdf` with `Content-Disposition: inline; filename="quotation-{number-or-id}.pdf"`. The PDF header reads "QUOTATION — NOT A TAX INVOICE" (or Greek equivalent) in Crimson Pro 700, color `LexPdfTokens.muted` (not `--kill` — this is a normal document, not an error state).
- RLS deny-by-omission is enforced on every write: every UPDATE/DELETE in `actions.ts` includes `.select('id')` + `data.length === 0` check; cross-workspace acceptance returns `{ error: 'not_found' }` not a 500.
- Top-level `src/app/quotations/*` files are deleted in this same commit (verified by `test ! -d src/app/quotations`).
- `messages/el-CY.json` and `messages/en-CY.json` have identical key sets under `quotations` (key parity invariant).

**Action:**

1. Schema audit. Open `supabase/migrations/20260513000001_schema.sql` and confirm:
   - `public.quotations` exists with the columns listed in lines 181–198 (already confirmed in locked-decision #6).
   - Whether a separate `public.quotation_line_items` table exists. **Open the migration and search for `CREATE TABLE public.quotation_line_items`.** If it exists, use it. If it does NOT exist, the locked decision permits no new migration — instead, store the source line items in `invoice_line_items` keyed by the resulting invoice and skip storing them on the quotation as a separate table. In that fallback case, the create-quotation form must compute the totals server-side and persist them on the quotation row only; the line items will only become real `invoice_line_items` rows when accept-convert fires. **Document the chosen path in a header comment on `actions.ts` so a future agent can audit.**
2. Numbering. Quotations DO use `quotation_number` / `quotation_year` (NULL on draft per the migration). Mirror the invoice rule from Phase 3 — leave the number NULL until `markSentAction`, at which point allocate via a simple COUNT(*)+1 per (workspace, year) formatted `Q-2026/0001` (NOT through `allocate_invoice_number` — Cyprus gap-free numbering applies to invoices only; quotation numbers may have gaps). Use the regular RLS-scoped client; if the UNIQUE constraint fires on a race, surface `error: 'numbering_collision'` and let the user retry. Add `CONSTRAINT quotations_workspace_year_number_uniq UNIQUE (workspace_id, quotation_year, quotation_number)` is NOT in the migration — confirm by reading the schema; if it isn't there, just allocate the number; race is acceptable for the demo.
3. Create the Zod schemas: `QuotationCreateInput` (client_id UUID, matter_id UUID nullable, language enum, notes nullable, valid_until nullable date string, line_items array — mirror `InvoiceCreateInput`). Compute `subtotal` / `vat_amount` / `total` server-side from the line items (same `computeTotalsFromItems` helper from invoice actions — extract to `src/lib/totals.ts` if not already there, OR copy the function and mark it for future deduplication with a comment).
4. Wire `createQuotationAction`, `updateQuotationAction`, `deleteQuotationAction`, `markSentAction` mirroring the invoice action patterns: get user → get workspace → validate → write → `.select('id')` deny-by-omission check → `revalidatePath` → redirect on create, return `{ ok }` on update.
5. The conversion contract — `acceptQuotationAction(id)`:
   - Verify the quotation exists and `status === 'sent'` via the user-scoped client (RLS auto-scopes). If not, return `{ error: 'not_sent' }`.
   - Create a stored procedure `convert_quotation_to_invoice(p_quotation_id UUID)` SECURITY DEFINER that runs inside a single transaction: INSERT the new invoice (draft, NULL number, copied fields, total recomputed from the source line items), INSERT all source line items into `invoice_line_items` (using the line-item source decided in step 1), UPDATE the source quotation `SET status='accepted', converted_invoice_id=<new>`, returning the new invoice id. **This SP requires a NEW migration `supabase/migrations/20260513000007_convert_quotation_to_invoice.sql`.** The locked decision #6 said "no new migrations expected" — this is the one legitimate exception because atomicity across three tables is database-enforced, not application-enforced. **Surface this deviation to the verifier via the deviation log if a stored procedure is genuinely the chosen path. If the team prefers app-side transactions, document why in the action header and use Supabase's PostgREST `rpc` workaround: serial inserts with rollback-on-failure via a try/catch that DELETEs the new invoice + line items on partial failure.**
   - On success, `revalidatePath('/quotations')` + `revalidatePath('/invoices')` + `redirect('/invoices/' + newInvoiceId)`.
6. List page + detail page + new form: mirror the invoice pages (read `src/app/(workspace)/invoices/page.tsx` + `[id]/page.tsx` + `new/page.tsx` + `NewInvoiceForm.tsx`). The visual structure of the detail (letterhead, line-items table, totals block) should mirror the OLD demo at `src/app/quotations/[id]/page.tsx` — preserve the visual template, swap the data source.
7. PDF route: if Phase 3's `renderInvoicePDF` is generic enough, build a `renderQuotationPDF` wrapper that calls the same template with a `documentKind: 'quotation'` flag that swaps the header caption from "INVOICE" to "QUOTATION — NOT A TAX INVOICE" and hides the receipt/payment-method footer. If `renderInvoicePDF` is invoice-specific, create `src/lib/pdf/templates/QuotationDocument.tsx` mirroring the InvoiceDocument shape with the header swap and the "not a tax invoice" footer. The route handler shape is identical to invoices' PDF route — read `src/app/api/invoices/[id]/pdf/route.ts` for the pattern.
8. Delete the old top-level demo in the same commit: `rm -rf src/app/quotations/`. The (workspace) variants now own the `/quotations` URL space via the route-group convention.
9. i18n. Add the `quotations` namespace to both message files. The Greek banner-footer string is "Προσφορά — δεν είναι φορολογικό τιμολόγιο. Μετατρέπεται σε πρόχειρο τιμολόγιο με την αποδοχή." The English is "Quotation only — not a tax invoice. Becomes a draft invoice on acceptance." (The em dash in the design doc is OK in copy — DESIGN.md's anti-pattern bans em dashes in *UI strings* but per the existing acceptance practice in `en-CY.json` the demo accepts them in document footers. Use the en dash `—` as in the existing footer in the demo.)

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `test ! -d src/app/quotations && echo CLEAN` → `CLEAN`.
- `grep -c "data.length === 0" src/app/\(workspace\)/quotations/actions.ts` → `≥ 4` (one per UPDATE / DELETE-style mutation, mirroring invoices/actions.ts pattern).
- `grep -E "useTranslations|getTranslations" src/app/\(workspace\)/quotations/page.tsx` → at least 1 match (no hardcoded English in the list page).
- `node -e "const a=require('./messages/el-CY.json').quotations; const b=require('./messages/en-CY.json').quotations; const ka=Object.keys(a).sort().join(','); const kb=Object.keys(b).sort().join(','); if (ka!==kb) { console.error('KEY MISMATCH'); process.exit(1); } console.log('PARITY OK');"` → `PARITY OK`.
- `grep -c "QUOTATION\|Προσφορά" src/lib/pdf/templates/QuotationDocument.tsx src/lib/pdf/adapter.ts 2>/dev/null` → `≥ 1` (the verbatim header string lives somewhere in the PDF code path).

**Context:** Read @.planning/PROJECT.md, @.planning/PRODUCT.md, @.planning/DESIGN.md (§Invoice document, §Tables, §Trust ledger view — for the trust-color exclusion), @src/app/(workspace)/invoices/page.tsx, @src/app/(workspace)/invoices/actions.ts, @src/app/(workspace)/invoices/NewInvoiceForm.tsx, @src/app/(workspace)/invoices/LineItemEditor.tsx, @src/app/(workspace)/invoices/[id]/page.tsx, @src/app/(workspace)/invoices/InvoiceActions.tsx, @src/app/quotations/page.tsx (visual template — to be deleted), @src/app/quotations/[id]/page.tsx (visual template — to be deleted), @src/lib/types.ts, @src/lib/format.ts, @src/lib/supabase/server.ts, @src/lib/supabase/service.ts, @src/components/Table.tsx, @src/components/StatusPill.tsx, @supabase/migrations/20260513000001_schema.sql (lines 181–198 — quotations), @messages/el-CY.json, @messages/en-CY.json.

**Design:**
- Register: `product`
- Tokens used: `var(--accent)` (CTA / quotation number — same as invoices, the warm terracotta), `var(--text)` (body), `var(--muted)` (helper text), `var(--dim)` (caption labels), `var(--line)`, `var(--line-soft)`, `var(--surface)`, `var(--bg)`, `var(--bg-2)`, `var(--ok)` (accepted), `var(--kill)` (declined / expired); `--space-2/3/4/6/8`, `--pad-x`, `--pad-card`.
- **Forbidden tokens on this surface:** `var(--trust)`, `var(--trust-bg)`. Quotations are revenue-track, never trust-track. Builder runs `grep -E "(--trust|--trust-bg|trust-bg)" src/app/\(workspace\)/quotations/` → must return `0` matches.
- Scope: page + section + components.
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs src/app/\(workspace\)/quotations/` pre-commit; commit blocked on critical findings.

---

## Task 2 — Retainers: `(workspace)/retainers/*` + actions.ts (write retainer + trust deposit atomically) + Trust-balance widget on Client detail

**Wave:** 1
**Persona:** backend
**Files:**
- CREATE `src/app/(workspace)/retainers/page.tsx` — list view. Server component, RLS-scoped `select` from `public.retainers` joined with clients + matters. Visual structure mirrors the OLD demo at `src/app/retainers/page.tsx` (card-per-retainer layout with the sage-olive `--trust` accent border and the deposit-vs-balance right-rail), but: (a) data comes from the real table, (b) running balance comes from a per-client `SUM(debit_amount) - SUM(credit_amount)` on `trust_ledger` (computed server-side either via a single grouped query or one query per client — see Action step 4), (c) the "Trust ledger →" link points to `/trust` (NOT `/trust-ledger`).
- CREATE `src/app/(workspace)/retainers/new/page.tsx` — server component fetching clients + matters, renders `<NewRetainerForm>`.
- CREATE `src/app/(workspace)/retainers/NewRetainerForm.tsx` — client component. Fields: client_id (select), matter_id (select, optional), deposit_amount (decimal input, required), signed_at (date input, defaults to today), terms (textarea, optional). Sage-olive submit button (`background: var(--trust)`). Surfaces Zod validation issues inline.
- CREATE `src/app/(workspace)/retainers/[id]/page.tsx` — detail view. Shows the retainer header (client name, matter, signed date, deposit amount, current balance per the trust ledger), the terms text, and a per-retainer trust-ledger slice (`SELECT * FROM trust_ledger WHERE related_retainer_id = $1 OR client_id = $retainer.client_id ORDER BY occurred_at DESC` — clarify the query in Action step 5).
- CREATE `src/app/(workspace)/retainers/actions.ts` — Server Actions: `createRetainerAction(FormData)` is the centerpiece (writes a `retainers` row AND a `trust_ledger` row in a single SP — see Action step 3), `updateRetainerAction(id, FormData)` (header fields only, no deposit-amount edits — that would require a reversal entry which is Phase 6 scope), `closeRetainerAction(id)` (status `active` → `closed`).
- CREATE `src/app/(workspace)/retainers/RetainerActions.tsx` — client component wrapping action buttons with `useTransition`.
- CREATE `src/components/TrustBalanceCard.tsx` — server component. Takes `clientId` prop. Renders a card with the verbatim caption "Trust balance — client funds" (English) / "Υπόλοιπο καταπιστεύματος — χρήματα πελάτη" (Greek) per locale. Computes the balance server-side via `SUM(debit_amount) - SUM(credit_amount)` over `trust_ledger` filtered to `client_id` and the active workspace (RLS scopes the workspace). Uses `var(--trust)` for the headline number AND `var(--trust-bg)` for the card background tint. Tabular numerals on the balance. If the balance is `0`, render "—" not "€0.00".
- EXTEND `src/app/(workspace)/clients/[id]/page.tsx` — import + render `<TrustBalanceCard clientId={client.id} />` BELOW the `<ClientForm>` block in a separate full-width container, NOT inside the form card (per DESIGN.md container depth ≤ 2).
- CREATE supabase migration `supabase/migrations/20260513000008_retainer_with_trust_deposit.sql` — defines `create_retainer_with_deposit(p_workspace UUID, p_client UUID, p_matter UUID, p_agreement_number TEXT, p_deposit NUMERIC, p_signed_at DATE, p_terms TEXT, p_actor UUID) RETURNS UUID` SECURITY DEFINER. Runs inside one transaction: INSERT retainer → INSERT corresponding `trust_ledger` row with `entry_kind='deposit'`, `debit_amount=p_deposit`, `credit_amount=0`, `related_retainer_id=<new>`, `description='Retainer deposit'`, `created_by_user_id=p_actor` → return the new retainer id. The SP MUST verify `p_workspace` matches the caller's workspace (`auth.uid()` → owner) inside the SP body before writing; this is the disbarment-grade safety net.
- DELETE `src/app/retainers/page.tsx` (the old top-level demo).
- EXTEND `src/lib/types.ts` — add `RetainerStatus` (`'active' | 'depleted' | 'closed'`), `RetainerRow` (mirror columns lines 204–215 of Migration 001), `TrustEntryKind` (the 5-value enum), `TrustLedgerRow`, `RetainerWithRelations` (joined client + matter + computed `balance: string` numeric-as-string from the SUM query).
- EXTEND `messages/el-CY.json` and `messages/en-CY.json` — add a `retainers` namespace: `title`, `new`, `client`, `matter`, `deposit`, `balance`, `signed`, `terms`, `status`, `statusActive`, `statusDepleted`, `statusClosed`, `trustBalanceLabel` ("Trust balance — client funds" / "Υπόλοιπο καταπιστεύματος — χρήματα πελάτη"), `disbarmentNote` ("Every retainer creates one append-only `trust_ledger` entry. Balances never appear on the revenue summary." / Greek equivalent), `close`, `closeConfirm`.
**Depends on:** none

**Why:** Retainers are the entry point for client funds into Lex. The locked decision is that one user-facing action (Create Retainer) MUST produce two database writes atomically: the `retainers` row and the corresponding `trust_ledger` deposit. If those two could ever drift (retainer exists but ledger missing, or vice versa), Fotini's trust accounting is broken and she's at disbarment risk. This is why the create flow goes through a SECURITY DEFINER stored procedure — Postgres transaction semantics are the only safe atomicity primitive. Implements REQ-008 (INV-04 — Retainer agreements with running balance) and acceptance criterion #2 (Create Retainer with €2,000 deposit → trust_ledger has one entry with debit_amount=2000; Client trust-balance widget shows €2,000; revenue summary shows €0).

**Acceptance Criteria:**
- `/retainers` renders a card per retainer with locale-aware client name, the deposit amount, the running balance (computed from `trust_ledger`), the signed date (`formatDate`), the matter (if linked), and a per-retainer "Client →" / "Trust ledger →" link rail. Sage-olive `--trust` accents the border + caption + balance number. Tabular numerals on every money + date column.
- `/retainers/new` accepts client + matter (optional) + deposit_amount + signed_at + terms, calls `createRetainerAction`, redirects to `/retainers/{id}` on success.
- `createRetainerAction` ALWAYS writes both rows or neither. On success, the `trust_ledger` table has exactly one new row with `entry_kind='deposit'`, `debit_amount=<deposit>`, `credit_amount=0`, `related_retainer_id=<new retainer id>`, `created_by_user_id=<auth.uid()>`. On any failure (RLS deny, validation, SP exception), `retainers` and `trust_ledger` are both unchanged.
- `TrustBalanceCard` renders the running balance for any client, using `--trust` color and `--trust-bg` background. The verbatim caption per locale is "Trust balance — client funds" / "Υπόλοιπο καταπιστεύματος — χρήματα πελάτη".
- The trust-balance card appears on `/clients/[id]` BELOW the client form, not inside it.
- Revenue summary (Phase 6, future) WILL NOT include trust balances — verified by the trust isolation assertion test in Task 3.
- The migration `20260513000008_retainer_with_trust_deposit.sql` is checked in and applies cleanly via `npx supabase db reset --local`.
- RLS deny-by-omission on every UPDATE (`updateRetainerAction`, `closeRetainerAction`): `.select('id')` + `data.length === 0` check.
- Top-level `src/app/retainers/*` deleted in the same commit.
- i18n key parity holds for the `retainers` namespace.

**Action:**

1. **Confirm the schema fields:** `public.retainers` has `id`, `workspace_id`, `client_id`, `matter_id` (nullable), `agreement_number` (NOT NULL — needs to be generated), `deposit_amount`, `currency`, `status`, `signed_at`, `terms`, `created_at`. `public.trust_ledger` has the columns at lines 259–280 of Migration 001. The check constraint `trust_ledger_debit_xor_credit` requires `debit_amount > 0 AND credit_amount = 0` (or the inverse) — never both zero. The deposit MUST have `debit_amount > 0`.
2. **agreement_number generation.** Mirror the receipt numbering pattern from `(workspace)/invoices/actions.ts:markPaidAction` — `R-YYYY/NNNN` becomes `RT-YYYY/NNNN`. Pre-fetch `COUNT(*)` on retainers for `(workspace, year(signed_at))`, increment, format `RT-2026/0001`. Race-loss returns `error: 'numbering_collision'`. Acceptable for the demo per the same reasoning as receipts.
3. **The atomic-write SP.** Author migration `20260513000008_retainer_with_trust_deposit.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION public.create_retainer_with_deposit(
     p_workspace UUID, p_client UUID, p_matter UUID,
     p_agreement_number TEXT, p_deposit NUMERIC(12,2),
     p_signed_at DATE, p_terms TEXT, p_currency TEXT, p_actor UUID
   ) RETURNS UUID
   LANGUAGE plpgsql SECURITY DEFINER AS $$
   DECLARE
     v_retainer_id UUID;
     v_workspace_owner UUID;
   BEGIN
     -- Safety: workspace ownership check (defence-in-depth — RLS already
     -- restricts the caller, but the SP runs with elevated privs so we
     -- verify explicitly).
     SELECT owner_user_id INTO v_workspace_owner
       FROM public.workspaces WHERE id = p_workspace;
     IF v_workspace_owner IS NULL OR v_workspace_owner <> p_actor THEN
       RAISE EXCEPTION 'workspace ownership mismatch';
     END IF;

     -- 1) Retainer row
     INSERT INTO public.retainers
       (workspace_id, client_id, matter_id, agreement_number,
        deposit_amount, currency, status, signed_at, terms)
     VALUES
       (p_workspace, p_client, p_matter, p_agreement_number,
        p_deposit, p_currency, 'active', p_signed_at, p_terms)
     RETURNING id INTO v_retainer_id;

     -- 2) Corresponding trust_ledger deposit (debit_amount > 0)
     INSERT INTO public.trust_ledger
       (workspace_id, client_id, matter_id, entry_kind,
        debit_amount, credit_amount, currency, description,
        related_retainer_id, occurred_at, created_by_user_id)
     VALUES
       (p_workspace, p_client, p_matter, 'deposit',
        p_deposit, 0, p_currency, 'Retainer deposit',
        v_retainer_id, p_signed_at, p_actor);

     RETURN v_retainer_id;
   END;
   $$;

   REVOKE ALL ON FUNCTION public.create_retainer_with_deposit FROM PUBLIC, anon;
   GRANT EXECUTE ON FUNCTION public.create_retainer_with_deposit
     TO authenticated, service_role;
   ```
   The function is invoked from `createRetainerAction` via the REGULAR user-scoped client (RLS owns workspace scoping by way of the explicit ownership check in the SP body). Both writes are inside a single statement, so Postgres atomicity is automatic.
4. **List page balance computation.** One query per retainer is acceptable for the demo (≤10 retainers). The cleaner option is a single grouped query: `SELECT client_id, SUM(debit_amount) - SUM(credit_amount) AS balance FROM trust_ledger GROUP BY client_id`. Build a `Map<clientId, balance>` server-side and look up per card. Tabular numerals via `formatMoney`. The header "Total deposits held" stat is `SUM(deposit_amount) FROM retainers WHERE status='active'`.
5. **Detail page ledger slice.** `SELECT tl.* FROM trust_ledger tl WHERE workspace_id = <ws> AND (related_retainer_id = $retainerId OR (related_retainer_id IS NULL AND client_id = $retainer.client_id)) ORDER BY occurred_at DESC, created_at DESC`. The OR catches future fee_transfer / refund entries that don't carry a `related_retainer_id` but DO belong to the same client. Render as a compact table inside a card with the `--trust` accent.
6. **TrustBalanceCard.** Server component, NO client interactivity. The card is rendered server-side so RLS applies to the query, and there's no waterfall (the client-detail page server-renders both the form and the card in one round-trip). The query: `SELECT COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) AS balance FROM trust_ledger WHERE client_id = $1`. (Workspace scoping is implicit via RLS.) Style: rounded card with `background: var(--trust-bg)`, `border: 1px solid var(--trust)`, padding `var(--pad-card)`, the balance number in Crimson Pro `clamp(2rem, 4vw, 2.6rem)` with `color: var(--trust)`, tabular-numerals. Caption above (caption-style: 0.7rem uppercase letter-spacing 0.08em, color `var(--trust)`).
7. **`/clients/[id]` integration.** Open `src/app/(workspace)/clients/[id]/page.tsx`, add the import `import { TrustBalanceCard } from '@/components/TrustBalanceCard'`, and render `<TrustBalanceCard clientId={client.id} />` inside the existing `max-w-3xl mx-auto` container BUT in a separate `<section>` directly under the form card with `margin-top: var(--space-8)`. Do NOT nest it inside the form card (container depth ≤ 2 per DESIGN.md).
8. **Delete top-level demo.** `rm src/app/retainers/page.tsx`. The (workspace) variant now owns the `/retainers` URL via the route group.
9. **i18n.** Add the `retainers` namespace to both locales with identical keys. The disbarment note in Greek: "Κάθε καταπιστευτική συμφωνία δημιουργεί μία append-only εγγραφή στο `trust_ledger`. Τα υπόλοιπα δεν εμφανίζονται ποτέ στη σύνοψη εσόδων." The English mirrors the existing demo string. Update `messages/el-CY.json` `clients.trustBalance` if needed — Greek already has it as "Υπόλοιπο καταπιστεύματος"; English doesn't have it under `clients` yet — add it.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `test ! -f src/app/retainers/page.tsx && echo CLEAN` → `CLEAN`.
- `grep -c "create_retainer_with_deposit" src/app/\(workspace\)/retainers/actions.ts` → `≥ 1`.
- `grep -c "data.length === 0" src/app/\(workspace\)/retainers/actions.ts` → `≥ 2` (one per UPDATE / close action).
- `grep -E "(--trust|--trust-bg)" src/components/TrustBalanceCard.tsx` → `≥ 2` matches.
- `grep -c "TrustBalanceCard" src/app/\(workspace\)/clients/\[id\]/page.tsx` → `≥ 1`.
- `node -e "const a=require('./messages/el-CY.json').retainers; const b=require('./messages/en-CY.json').retainers; const ka=Object.keys(a).sort().join(','); const kb=Object.keys(b).sort().join(','); if (ka!==kb) { console.error('KEY MISMATCH'); process.exit(1); } console.log('PARITY OK');"` → `PARITY OK`.
- `psql $DATABASE_URL -c "\df+ public.create_retainer_with_deposit"` → returns one row with SECURITY DEFINER set.

**Context:** Read @.planning/PROJECT.md, @.planning/PRODUCT.md (§Strategic principles — "Trust ledger is sacred"), @.planning/DESIGN.md (§Color §Trust accent rules, §Cards, §Tables), @src/app/retainers/page.tsx (visual template — to be deleted), @src/app/(workspace)/invoices/actions.ts (numbering pattern, RLS deny pattern), @src/app/(workspace)/clients/[id]/page.tsx (where the widget renders), @src/lib/types.ts, @src/lib/format.ts, @src/lib/supabase/server.ts, @supabase/migrations/20260513000001_schema.sql (lines 204–280 — retainers + trust_ledger), @supabase/migrations/20260513000002_rls.sql (trust_ledger immutability triggers — must not interfere with INSERTs), @messages/el-CY.json, @messages/en-CY.json.

**Design:**
- Register: `product`
- Tokens used: `var(--trust)` (border, caption, balance number — sage-olive, the trust-only accent), `var(--trust-bg)` (card surface tint at ~8% alpha), `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--line)`, `var(--line-soft)`, `var(--bg)`, `var(--surface)`; `--space-2/3/4/6/8`, `--pad-card`, `--pad-x`.
- **Required tokens:** `var(--trust)` and `var(--trust-bg)` must appear on retainer surfaces. Builder verifies `grep -c "var(--trust" src/app/\(workspace\)/retainers/page.tsx` → `≥ 3`.
- **Forbidden tokens on this surface:** `var(--accent)` (terracotta is revenue, not trust). The retainers list page must NOT use `--accent` as a primary visual cue. Headline numbers and the "+ New retainer" button must use `var(--trust)`.
- Scope: page + section + components (the `TrustBalanceCard` is a globally-usable component, used both here and on `/clients/[id]`).
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs src/app/\(workspace\)/retainers/ src/components/TrustBalanceCard.tsx` pre-commit; commit blocked on critical findings.

---

## Task 3 — Trust Ledger view: `(workspace)/trust/page.tsx` + sidebar fix + trust-isolation assertion test

**Wave:** 1
**Persona:** ux
**Files:**
- CREATE `src/app/(workspace)/trust/page.tsx` — server component. RLS-scoped `select` from `public.trust_ledger` joined with clients (locale-aware name) ordered `occurred_at desc, created_at desc`. Whole page surface tinted `var(--trust-bg)` (the sage-olive 8% wash). Banner at top reads VERBATIM the composed string `"<t('trust.title')> — <t('trust.banner')>"`. Renders the ledger as a `<table>` with columns: Date, Client, Description, Kind (entry_kind enum value uppercased), Debit (tabular, right-aligned), Credit (tabular, right-aligned), Balance (running balance per-client OR cumulative — see Action step 3). Right rail: "Total balance" stat = `SUM(debit_amount) - SUM(credit_amount)` across the visible rows.
- EDIT `src/components/SidebarNav.tsx` — change line 47 (the trust ledger item): `{ href: "/trust-ledger", ... }` → `{ href: "/trust", ... }`. Preserve the `trust: true` flag, the `ShieldCheck` icon, and the active-state colorization (sage-olive `var(--trust-bg)` / `var(--trust)` when active). This aligns the sidebar URL with the (workspace) route group's `/trust` path.
- DELETE `src/app/trust-ledger/page.tsx` (the old top-level demo).
- CREATE `supabase/tests/trust_isolation_check.sql` — a stronger version of the existing `revenue_isolation.sql`. Asserts the global invariant: for every workspace, `SUM(debit_amount)` from `trust_ledger` and `SUM(total)` from `invoices` partition the money — no row in either table can appear in the other, no row in `trust_ledger` has a `related_invoice_id` that would make it count as revenue, and the dedicated "Trust-Only Test Client" still has revenue=0 and trust=5000. On the happy path the script emits `PASS:` notice; on failure RAISE EXCEPTION halts. See Action step 4 for the exact query plan.
- ADD to `supabase/tests/run.sh` — invoke `psql $DATABASE_URL -f supabase/tests/trust_isolation_check.sql` in the test run order, AFTER `revenue_isolation.sql` (which is narrower — single-client). Echo `[trust-isolation] PASS` on success.
- EXTEND `messages/el-CY.json` and `messages/en-CY.json` — add a `trust` namespace EXTENSION (the existing keys `title` + `banner` stay): add `entryKind` sub-namespace with `deposit`, `feeTransfer`, `refund`, `disbursement`, `reversal`, plus `tableHeaders` sub-namespace with `date`, `client`, `description`, `kind`, `debit`, `credit`, `balance`, plus `totalBalance`, `noEntries` ("No trust ledger entries yet." / "Δεν υπάρχουν εγγραφές στον λογαριασμό παρακαταθηκών ακόμα."), plus `appendOnlyNote` ("Postgres enforces immutability via `deny_trust_mutation()` row-level trigger and a TRUNCATE guard. Even the database service role cannot UPDATE or DELETE a row here." / Greek equivalent).
**Depends on:** none

**Why:** The trust ledger view is the single screen that makes Lex's strategic claim — "the only invoicing tool that handles a Cyprus lawyer's trust ledger correctly" — visually true. The sage-olive surface tint, the verbatim banner, the absence of any revenue-track navigation, and the append-only contract documented in the page footer are what Fotini will inspect at the pitch. The isolation assertion test is the database-side proof that the visual claim is real: even if a future agent accidentally swaps a column, the test catches it before the demo. Implements REQ-010 (TRUST-01 — Trust ledger view, visually distinct, append-only) and acceptance criteria #4 (banner verbatim per locale, surface uses `--trust-bg`) and #5 (trust isolation assertion test returns PASS).

**Acceptance Criteria:**
- `/trust` renders a page whose `<main>` surface uses `background: var(--trust-bg)` for the WHOLE content area (not just a banner — the sage-olive wash extends edge-to-edge).
- The banner at the top of the page reads the verbatim string `"Trust ledger — Client funds. Not lawyer revenue."` when locale is `en-CY` and `"Λογαριασμός παρακαταθηκών — Πιστωμένα χρήματα πελατών. Όχι έσοδα του δικηγόρου."` when locale is `el-CY`. The dash is an em dash (`—`), composed from `t('trust.title') + ' — ' + t('trust.banner')`.
- The ledger table renders: Date (`formatDate`), Client (locale-aware), Description, Kind (`<StatusPill tone="muted">{t('trust.entryKind.deposit')}</StatusPill>`-style or plain uppercase caption text — pick the muted-caption variant for readability), Debit (tabular right-aligned, `formatMoney` or `—`), Credit (tabular right-aligned, `formatMoney` or `—`), Balance (running per-client OR cumulative — see Action step 3). Headers are caption-styled (0.7rem uppercase, +0.08em letter-spacing, color `var(--dim)`).
- The "Total balance" right-rail stat is the `SUM(debit_amount) - SUM(credit_amount)` across all visible rows, in Crimson Pro `clamp(2rem, 4vw, 2.6rem)` colored `var(--trust)`, tabular-numerals.
- Footer paragraph renders `t('trust.appendOnlyNote')` (the existing demo's append-only Postgres note, now locale-aware).
- NO link or button on this page navigates to a revenue-track view (`/invoices`, `/quotations`, `/reports`). Sidebar links still work, but inside the page body, only `/clients/{id}` links are allowed (drilling into the client's own trust history).
- `SidebarNav.tsx` line 47 points at `/trust` (not `/trust-ledger`); the trust-tinted active-state colorization is preserved.
- Top-level `src/app/trust-ledger/page.tsx` is deleted in the same commit.
- `psql $DATABASE_URL -f supabase/tests/trust_isolation_check.sql` returns `PASS:` notice. The test is invoked from `supabase/tests/run.sh`.
- i18n key parity holds for the `trust` namespace extension.

**Action:**

1. **Build the page surface.** The `(workspace)/layout.tsx` already provides the `<main>` container with `px-[var(--pad-x)] py-[var(--pad-section)]`. The trust page must override the layout's background for its OWN body — wrap the page content in a single root `<div>` with `style={{ background: 'var(--trust-bg)' }}` and `margin: 'calc(-1 * var(--pad-section)) calc(-1 * var(--pad-x))'` to bleed-edge the wash to the layout's edges, plus matching padding inside. OR, simpler: render a sage-olive panel at full content-width via the existing layout padding — this is acceptable if the wash extends across the full readable content area. **Choose the bleed-edge approach** so the sage-olive distinction is unmissable at a glance (per DESIGN.md §Trust ledger view: "Visually distinct from revenue views.").
2. **Banner.** Compose the string in JSX: `<>{t('trust.title')} {'\u2014'} {t('trust.banner')}</>`. The em dash is `\u2014`. Render the banner in a card at the top of the page with `background: var(--bg)` (paper) + `border: 1px solid var(--trust)`, with the caption "Trust ledger" (uppercase, +0.08em, color `var(--trust)`) and the banner body in `var(--text)`. This mirrors the structure of the OLD demo at `src/app/trust-ledger/page.tsx:17-32` — preserve the visual template.
3. **Running balance column.** The simplest correct approach: compute a per-row running balance server-side. SELECT the ordered ledger rows (workspace-scoped), iterate in app code, maintain a `Map<clientId, runningBalance>`, and attach the per-client balance to each row at render time. Render this in the Balance column with `formatMoney`. The right-rail "Total balance" is the SUM over all rows (cross-client). Document the per-client semantics inside the page with a small footnote: "Balance shown is the per-client running balance after this entry." in both locales (add `t('trust.balanceFootnote')` to the i18n namespace).
4. **trust_isolation_check.sql.** The full content of this file:
   ```sql
   -- =============================================================================
   -- Lex — Test: trust ledger ⟂ invoices physical isolation (phase 4)
   -- =============================================================================
   -- Wider than revenue_isolation.sql — that one checks the single trust-only
   -- seed client. This one checks the GLOBAL invariant across every workspace:
   --
   --   (a) No row in trust_ledger has a related_invoice_id pointing at an
   --       invoice whose status='paid' AND total > 0 AND the trust row was
   --       written as 'deposit' (deposit and payment are different events;
   --       fee_transfer is the legitimate cross-table link).
   --   (b) For every workspace, SUM(invoices.total WHERE status IN
   --       ('finalized','sent','paid')) and SUM(trust_ledger.debit_amount)
   --       never share a numeric row — i.e. no audit-log row mutates one
   --       table in lockstep with the other except via the documented
   --       fee_transfer entry_kind.
   --   (c) The dedicated "Trust-Only Test Client" still has revenue=0 and
   --       trust_balance=5000.00 (this is also covered by revenue_isolation.sql;
   --       keeping it here as a redundant guard so this test alone is sufficient).
   --
   -- On the happy path: RAISE NOTICE 'PASS: trust ⟂ invoices invariant holds
   -- for N workspaces';
   -- On failure: RAISE EXCEPTION (psql exits non-zero).
   -- =============================================================================

   \set ON_ERROR_STOP on

   DO $$
   DECLARE
     v_bad_link_count INT;
     v_workspace_count INT;
     v_revenue NUMERIC(12,2);
     v_trust NUMERIC(12,2);
   BEGIN
     -- (a) Bad cross-links: a deposit-kind trust row pointing at an invoice
     --     should not happen — deposits originate from retainers, not invoices.
     SELECT COUNT(*) INTO v_bad_link_count
       FROM public.trust_ledger
      WHERE entry_kind = 'deposit'
        AND related_invoice_id IS NOT NULL;
     IF v_bad_link_count > 0 THEN
       RAISE EXCEPTION
         'FAIL: % trust_ledger deposit row(s) wrongly reference an invoice',
         v_bad_link_count;
     END IF;

     -- (c) Trust-only client revenue=0, trust=5000
     SELECT COALESCE(SUM(i.total), 0) INTO v_revenue
       FROM public.invoices i
       JOIN public.clients c ON c.id = i.client_id
      WHERE c.name_en = 'Trust-Only Test Client';
     SELECT COALESCE(SUM(tl.debit_amount), 0) INTO v_trust
       FROM public.trust_ledger tl
       JOIN public.clients c ON c.id = tl.client_id
      WHERE c.name_en = 'Trust-Only Test Client';
     IF v_revenue <> 0 THEN
       RAISE EXCEPTION 'FAIL: trust-only client has invoices totalling %', v_revenue;
     END IF;
     IF v_trust <> 5000.00 THEN
       RAISE EXCEPTION 'FAIL: trust-only client deposit is % (expected 5000.00)', v_trust;
     END IF;

     -- (b) Per-workspace cross-table independence — proven by the fact that
     --     no `audit_log` row mutates both tables in the same transaction
     --     except via the documented fee_transfer entry_kind. For now we
     --     prove the weaker invariant: every retainer with status='active'
     --     has at least one matching trust_ledger 'deposit' row.
     PERFORM 1
        FROM public.retainers r
       WHERE r.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM public.trust_ledger tl
            WHERE tl.related_retainer_id = r.id
              AND tl.entry_kind = 'deposit'
              AND tl.debit_amount = r.deposit_amount
         );
     GET DIAGNOSTICS v_bad_link_count = ROW_COUNT;
     IF v_bad_link_count > 0 THEN
       RAISE EXCEPTION
         'FAIL: % active retainer(s) missing matching trust deposit', v_bad_link_count;
     END IF;

     SELECT COUNT(DISTINCT workspace_id) INTO v_workspace_count
       FROM public.workspaces;

     RAISE NOTICE 'PASS: trust ⟂ invoices invariant holds for % workspaces',
       v_workspace_count;
   END
   $$;
   ```
   Save under `supabase/tests/trust_isolation_check.sql`. Verify it runs cleanly against the seed.
5. **Hook into `supabase/tests/run.sh`.** Read the existing file; add a new step after `revenue_isolation.sql` that runs the new check. Echo a `[trust-isolation] PASS` line on success.
6. **Sidebar URL fix.** Edit `src/components/SidebarNav.tsx`. The trust nav item at line 47 currently uses `href: "/trust-ledger"`. Change to `href: "/trust"`. Keep the `trust: true` flag and the `ShieldCheck` icon. Verify the active state still triggers (`pathname === '/trust' || pathname.startsWith('/trust/')` already works because of the prefix-startsWith check). The sage-olive active treatment (`activeBg = 'var(--trust-bg)'`, `activeColor = 'var(--trust)'`) is preserved because the `trust: true` flag drives it.
7. **Delete the old top-level demo.** `rm src/app/trust-ledger/page.tsx`. The (workspace) `/trust` route now owns trust-ledger viewing.
8. **No revenue links in the page body.** Manual rule: in the JSX of `(workspace)/trust/page.tsx`, no `<Link href="/invoices...">`, no `<Link href="/quotations...">`, no `<Link href="/reports...">`. Per-row drill-down can link to `/clients/{client_id}` (where the lawyer can see the trust-balance widget plus the client form), but NOT to revenue-track views from this surface.
9. **Empty state.** If the workspace has zero trust_ledger rows, render the `<Table>` empty-state path via the dashed-border container (mirror invoices empty-state), with `t('trust.noEntries')` as the label. Color the dashed border `var(--trust)` to maintain the surface distinction.
10. **i18n.** Add the `trust` namespace extension to both message files with identical keys. The Greek strings: `entryKind.deposit = "Κατάθεση"`, `feeTransfer = "Μεταφορά αμοιβής"`, `refund = "Επιστροφή"`, `disbursement = "Εκταμίευση"`, `reversal = "Αντιλογισμός"`. `tableHeaders.date = "Ημερομηνία"`, `client = "Πελάτης"`, `description = "Περιγραφή"`, `kind = "Είδος"`, `debit = "Χρέωση"`, `credit = "Πίστωση"`, `balance = "Υπόλοιπο"`. `totalBalance = "Συνολικό υπόλοιπο"`. `appendOnlyNote = "Η Postgres επιβάλλει αμετάβλητο αρχείο μέσω του row-level trigger `deny_trust_mutation()` και ενός TRUNCATE guard. Ούτε ο database service role δεν μπορεί να κάνει UPDATE ή DELETE σε εγγραφή εδώ."`.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `test ! -d src/app/trust-ledger && echo CLEAN` → `CLEAN`.
- `grep -n "/trust-ledger" src/components/SidebarNav.tsx` → `0` matches.
- `grep -n "href=\"/trust\"" src/components/SidebarNav.tsx` → `≥ 1` match.
- `grep -E "var\(--trust-bg\)" src/app/\(workspace\)/trust/page.tsx` → `≥ 1` match (the surface wash).
- `grep -E "(href=\"/invoices|href=\"/quotations|href=\"/reports)" src/app/\(workspace\)/trust/page.tsx` → `0` matches (no revenue links from this surface).
- `psql $DATABASE_URL -f supabase/tests/trust_isolation_check.sql 2>&1 | grep -c "^PASS:\|NOTICE:  PASS:"` → `≥ 1`.
- `bash supabase/tests/run.sh 2>&1 | grep -c "\[trust-isolation\] PASS"` → `≥ 1`.
- `node -e "const a=require('./messages/el-CY.json').trust; const b=require('./messages/en-CY.json').trust; function flat(o,p=''){return Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flat(v,p+k+'.'):[p+k]);} const ka=flat(a).sort().join(','); const kb=flat(b).sort().join(','); if (ka!==kb) { console.error('KEY MISMATCH'); process.exit(1); } console.log('PARITY OK');"` → `PARITY OK`.

**Context:** Read @.planning/PROJECT.md, @.planning/PRODUCT.md (§Strategic principles — "Trust ledger is sacred"), @.planning/DESIGN.md (§Trust ledger view, §Color §Trust accent rules), @src/app/trust-ledger/page.tsx (visual template — to be deleted), @src/components/SidebarNav.tsx (the line-47 href change), @src/components/Table.tsx, @src/components/StatusPill.tsx, @src/lib/types.ts, @src/lib/format.ts, @src/lib/supabase/server.ts, @supabase/migrations/20260513000001_schema.sql (lines 259–280 — trust_ledger schema, lines 360–363 — partial unique on time_entries [Task 4 ref]), @supabase/migrations/20260513000002_rls.sql, @supabase/migrations/20260513000005_trust_truncate_guard.sql, @supabase/tests/revenue_isolation.sql, @supabase/tests/run.sh, @supabase/seed.sql, @messages/el-CY.json, @messages/en-CY.json.

**Design:**
- Register: `product`
- Tokens used: `var(--trust)` (border, accents, balance number, banner caption), `var(--trust-bg)` (page surface wash — the load-bearing visual claim), `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--line)`, `var(--line-soft)`, `var(--bg)` (paper card on top of sage wash); `--space-3/4/6/8`, `--pad-card`, `--pad-x`.
- **Required tokens:** `var(--trust-bg)` MUST cover the page main surface. `var(--trust)` MUST appear in the banner caption, the border accents, the headline balance number. Builder verifies `grep -c "var(--trust" src/app/\(workspace\)/trust/page.tsx` → `≥ 4`.
- **Forbidden tokens on this surface:** `var(--accent)`, `var(--accent-2)`, `var(--accent-bg)`. The trust ledger view must NEVER use the terracotta revenue accent. This is the load-bearing disbarment-grade visual contract. Builder verifies `grep -E "var\(--accent[^)]*\)" src/app/\(workspace\)/trust/page.tsx` → `0`.
- Scope: page + section.
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs src/app/\(workspace\)/trust/page.tsx` pre-commit; commit blocked on critical findings.

---

## Task 4 — Billable-hours timer: `(workspace)/timer/*` + ActiveTimerWidget in TopBar + "Bill these hours" handoff

**Wave:** 2
**Persona:** frontend
**Files:**
- CREATE `src/app/(workspace)/timer/page.tsx` — server component. Workspace timer dashboard. Shows: (a) the active timer (if any) — matter name, started_at, live elapsed (uses `<LiveElapsed startedAt>` client component below); (b) the start-timer form (`<StartTimerForm matters={matters}>`) — only rendered when no active timer exists for this user (per the partial unique index); (c) a table of recent completed `time_entries` for this user (last 20, ordered `started_at desc`) with columns: Matter, Started, Duration, Rate, Total (=duration_hours × hourly_rate), Status (active/completed/billed), Actions (Stop button for `active`, "Bill these hours" Link for `completed`).
- CREATE `src/app/(workspace)/timer/StartTimerForm.tsx` — client component. Fields: matter_id (select, populated from server prop), description (text), hourly_rate (decimal input, prefilled with the selected matter's `default_hourly_rate` if non-null). Submit calls `startTimerAction`.
- CREATE `src/app/(workspace)/timer/LiveElapsed.tsx` — client component. Takes `startedAt: string` prop. Uses `useEffect` + `setInterval(1000)` to render the live elapsed time as `HH:MM:SS`. Tabular numerals. Cleans up the interval on unmount. Respects `prefers-reduced-motion` (no flashing — the only change is the digit text).
- CREATE `src/components/ActiveTimerWidget.tsx` — server component. Fetches the active timer for the current user (`time_entries WHERE workspace_id = <ws> AND user_id = <uid> AND status = 'active' LIMIT 1`). If present, renders a small inline pill in the TopBar with the matter number + `<LiveElapsed>` ticker + a Stop button (form posting to `stopTimerAction` with the timer id). If no active timer, renders `<Link href="/timer">` "Start timer" CTA (`btn-ghost` style, accent color). The Stop button uses a small terracotta accent (matters are revenue-track work).
- EDIT `src/components/TopBar.tsx` — import `<ActiveTimerWidget>` and render it inside the existing right-side flex container between the email span and the `<LocaleToggle />` (or to the left of the locale toggle — pick the placement that holds at 768px without wrapping). On mobile (`< md`), the widget collapses to a small icon + ticker; the matter number + Stop button move into the drawer.
- CREATE `src/app/(workspace)/timer/actions.ts` — Server Actions: `startTimerAction(FormData)` (validates matter_id + hourly_rate + description, INSERTs one row with `status='active'`, `started_at=NOW()`, returns `{ ok, id }`; partial-unique-index violation → `error: 'timer_already_active'`); `stopTimerAction(id)` (validates the timer belongs to the user, UPDATE `status='completed'`, `ended_at=NOW()`, `duration_seconds=EXTRACT(EPOCH FROM (NOW() - started_at))::INT`); `deleteTimerAction(id)` (deletes a `completed` entry that hasn't been billed); `billHoursAction(id)` (validates the entry is `completed`, NOT yet billed, redirects the user to `/invoices/new?from_time_entry={id}`).
- EDIT `src/app/(workspace)/invoices/new/page.tsx` and `src/app/(workspace)/invoices/NewInvoiceForm.tsx` — when `searchParams.from_time_entry` is present, fetch the corresponding `time_entries` row server-side (RLS-scoped), and pass an initial line-item prefill `{ description: '<entry.description> · <matter.matter_number>', quantity: <duration_seconds / 3600 rounded to 2dp>, unit_price: <hourly_rate>, kind: 'service' }` to the `<NewInvoiceForm initialLineItems={[...]} initialClientId={matter.client_id} initialMatterId={matter.matter_id}>`. After invoice creation, on success, the `createInvoiceAction` (or a new wrapper) UPDATEs the time_entries row `status='billed'`, `invoice_id=<newInvoiceId>` so the same hours can't be billed twice. **Document this cross-cutting change in the invoices action header.**
- EXTEND `src/lib/types.ts` — add `TimeEntryStatus` (`'active' | 'completed' | 'billed'`), `TimeEntryRow` (mirror Migration 001 lines 225–238), `TimeEntryWithRelations` (joined matter + client slices for the dashboard table).
- EXTEND `messages/el-CY.json` and `messages/en-CY.json` — add a `timer` namespace: `title` ("Billable hours" / "Χρεώσιμες ώρες"), `activeNow` ("Active now" / "Ενεργό τώρα"), `start` ("Start timer" / "Έναρξη χρονομέτρου"), `stop` ("Stop" / "Στοπ"), `matter` ("Case"), `description` ("Description"), `hourlyRate` ("Hourly rate (€)"), `started` ("Started"), `duration` ("Duration"), `rate` ("Rate"), `total` ("Total"), `status` ("Status"), `statusActive`, `statusCompleted`, `statusBilled`, `billTheseHours` ("Bill these hours" / "Χρέωσε αυτές τις ώρες"), `alreadyBilled` ("Already billed on invoice {number}" / Greek equivalent), `emptyState` ("No completed hours yet. Start a timer on a case to begin." / Greek equivalent).
**Depends on:** Task 1 (because `billHoursAction` redirects into `/invoices/new` which Task 1's quotation accept-and-convert flow also uses — they SHARE no files but both rely on `(workspace)/invoices/new/page.tsx` accepting prefill params. We serialize Task 4 to Wave 2 so the invoice prefill plumbing is added once, in this task, AFTER Task 1's quotation conversion is verified — that way there's no merge conflict on the same file. **Note: Task 1 does NOT need to modify `/invoices/new/page.tsx` for its conversion flow — it creates the draft directly via the SP and redirects to `/invoices/{newId}`, NOT to `/invoices/new`. So technically Task 4 only writes to `/invoices/new/page.tsx` and `NewInvoiceForm.tsx`, and there's no Task-1 conflict. We still serialize because Task 4 is the larger task and benefits from Task 1's pattern being settled.**)

**Why:** The timer is the only NEW feature in Phase 4 — there's no demo to migrate. It's also the workflow paralegal Elena Papadopoulou lives in every morning (per PRODUCT.md): she logs billable hours for the partners, then converts those hours into invoices. The DB-row timer state (locked decision #3: `status='active'` row, partial unique index allows exactly one active per workspace+user) is what makes the timer survive page refresh — a localStorage timer would lose state when Elena switches tabs. The "Bill these hours" handoff to `/invoices/new` with prefill is the single feature that proves the time-tracking → billing loop is closed, not two parallel systems. Implements REQ-009 (TIME-01) and acceptance criterion #3 (Start timer → ticks live; Stop → time entry created; "Bill these hours" → invoice line item pre-populated with correct hours and rate, not rounded, not estimated).

**Acceptance Criteria:**
- `/timer` renders: (a) the active timer (if exists) with live `HH:MM:SS` ticker that updates every second, (b) the start-timer form (only when no active timer exists), (c) the recent completed entries table.
- `startTimerAction` inserts one `time_entries` row with `status='active'`, `started_at=NOW()`, `user_id=auth.uid()`. Attempting to start a second timer (while one is active) returns `error: 'timer_already_active'` — surfaced as an inline form error, not a 500.
- `stopTimerAction` UPDATEs the active timer to `status='completed'`, sets `ended_at=NOW()` and `duration_seconds=EXTRACT(EPOCH FROM (NOW() - started_at))::INT`. RLS deny-by-omission applies: `.eq('user_id', user.id).eq('status', 'active').select('id')` + `data.length === 0` check.
- `ActiveTimerWidget` in the TopBar shows the active timer's matter number + live `MM:SS` ticker + a Stop button. The widget is RLS-scoped (only the current user's active timer; never another user's). When no active timer, it shows a `Start timer →` link to `/timer`.
- `billHoursAction` on a `completed`-status entry redirects to `/invoices/new?from_time_entry={id}`. The new-invoice form prefills the line items with the entry's description (suffixed with the matter number), the hours (rounded to 2 decimal places, NOT rounded to the nearest hour or quarter-hour), and the hourly rate. The user can still edit the prefilled values before saving.
- After the invoice is created from the prefill, the source `time_entries.status` updates to `billed` and `invoice_id` is set. The entry can no longer be billed (the dashboard table shows "Already billed on invoice {number}" instead of the action button).
- Live ticker respects `prefers-reduced-motion` (the digits still update — that's content, not motion; but no CSS transition wrappers or flash effects).
- Partial unique index `idx_time_entries_one_active_per_user` (Migration 001 lines 360–362) is the database enforcement layer; the action layer surfaces its violation gracefully.
- i18n key parity holds for the `timer` namespace.

**Action:**

1. **Confirm the schema.** `time_entries` (Migration 001 lines 225–238) has `status time_entry_status NOT NULL DEFAULT 'active'`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ NULL`, `duration_seconds INT NULL`, `hourly_rate NUMERIC(12,2) NOT NULL`, `invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL`. The partial unique index at lines 360–362 enforces "at most one active timer per (workspace, user)". The enum is `('active', 'completed', 'billed')`. NO new migration is needed.
2. **`startTimerAction(FormData)`.** Validate `matter_id` (UUID regex, required), `description` (string, max 512, optional), `hourly_rate` (decimal regex, required, > 0). Get user → get workspace → look up the matter's `default_hourly_rate` as a fallback (so the form can submit `hourly_rate` blank and have it filled in server-side). INSERT with `status='active'`, `started_at=new Date().toISOString()`, `user_id=user.id`. `.select('id')` + `data.length === 0` → `error: 'insert_failed'`. If the partial-unique index fires (Postgres error code `23505`), return `error: 'timer_already_active'`. `revalidatePath('/timer')`, `revalidatePath('/'); /* TopBar re-renders */`, return `{ ok: true, id }` (no redirect — stay on the page so the timer immediately appears).
3. **`stopTimerAction(id)`.** Get user → UPDATE `time_entries` SET `status='completed'`, `ended_at=NOW()`, `duration_seconds=EXTRACT(EPOCH FROM (NOW() - started_at))::INT` WHERE `id = $1 AND user_id = auth.uid() AND status = 'active'`. Postgres expression syntax inside Supabase REST: prefer Supabase RPC for the `EXTRACT` math — define a small SQL function `stop_active_timer(p_id UUID) RETURNS UUID` in a tiny migration `20260513000009_stop_active_timer.sql`, OR compute `duration_seconds` in app code as `Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)` and write that value directly. **Prefer the app-code path** to avoid a new migration — small ±1s drift is acceptable for a billable-hours timer (the lawyer reviews and edits before billing anyway). Document this choice in the action header.
4. **`billHoursAction(id)`.** Validate the entry exists, belongs to the user, status is `completed`, `invoice_id IS NULL`. Redirect to `/invoices/new?from_time_entry={id}`. The redirect is RLS-safe because the prefill in step 6 also RLS-fetches the entry.
5. **`ActiveTimerWidget` placement.** Read `src/components/TopBar.tsx`. Insert `<ActiveTimerWidget />` between the existing email span (lines 63–72) and `<LocaleToggle />` (line 73), inside the same flex container. On widths < md (768px), hide the matter-number text via `className="hidden md:inline"` and keep only the ticker visible. The Stop button is a small square button with `var(--accent)` background and a Lucide `Square` (size 16) icon — terracotta because billable hours are revenue, not trust.
6. **`(workspace)/invoices/new/page.tsx` prefill plumbing.** Read the existing file. When `searchParams.from_time_entry` is a UUID, RLS-fetch the time entry (joined matter + matter.client). Compute `hours = Math.round(duration_seconds / 36) / 100` (e.g. 5400s → 1.50 hours; the `/36` then `/100` preserves 2-decimal precision without floating-point drift). Build `initialLineItems = [{ description: entry.description ?? matter.title, quantity: hours.toFixed(2), unit_price: entry.hourly_rate, kind: 'service' }]`. Pass to `<NewInvoiceForm>` as additional props alongside the existing clients + matters arrays. The form pre-populates the LineItemEditor with these items on mount.
7. **`(workspace)/invoices/NewInvoiceForm.tsx` accept-prefill.** Add a new optional prop `initialLineItems?: LineItemDraft[]` (where `LineItemDraft` mirrors the LineItemEditor's local shape). When non-empty, seed the editor's initial state with these items. Also accept `initialClientId?` and `initialMatterId?` so the client/matter selects render pre-selected.
8. **Mark `time_entries.invoice_id` post-save.** This is the cross-cutting change in `(workspace)/invoices/actions.ts:createInvoiceAction`. After the invoice + line items insert succeeds and BEFORE the `redirect(...)`, check if the FormData contains a hidden `from_time_entry` field (the form must include it). If yes, UPDATE the corresponding time_entries row with `status='billed'`, `invoice_id=<new invoice id>`. RLS auto-scopes; deny-by-omission check the result. If the update fails, log it via `console.warn` but DO NOT roll back the invoice — the lawyer can manually unlink the time entry later. Document this behavior in the action header.
9. **`/timer` page table** uses `<Table>` with the columns listed in the file description. The "Bill these hours" action is a `<form action={billHoursAction.bind(null, entry.id)}>` posting a button. The "Already billed on invoice {number}" replacement renders a `<Link href={'/invoices/' + entry.invoice_id}>` styled `text-sm muted`.
10. **Live elapsed component.** `'use client'`. Inside `useEffect`, `setInterval(() => setNow(Date.now()), 1000)`, cleanup on unmount. Format: `Math.floor((now - new Date(startedAt).getTime()) / 1000)` → split into HH, MM, SS, render as `${HH}:${MM}:${SS}` with `tabular` className. Reduced-motion: the component still updates content each second (content updates aren't motion); just don't wrap the digit changes in any CSS transition.
11. **i18n.** Add the `timer` namespace to both message files with identical keys.

**Validation:**
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.
- `grep -c "from_time_entry" src/app/\(workspace\)/invoices/new/page.tsx src/app/\(workspace\)/invoices/NewInvoiceForm.tsx src/app/\(workspace\)/invoices/actions.ts` → `≥ 3`.
- `grep -c "data.length === 0" src/app/\(workspace\)/timer/actions.ts` → `≥ 2`.
- `grep -c "ActiveTimerWidget" src/components/TopBar.tsx` → `≥ 1`.
- `grep -c "setInterval" src/app/\(workspace\)/timer/LiveElapsed.tsx` → `≥ 1`.
- `grep -c "status: 'billed'\|'billed'" src/app/\(workspace\)/invoices/actions.ts` → `≥ 1` (post-save status flip).
- `node -e "const a=require('./messages/el-CY.json').timer; const b=require('./messages/en-CY.json').timer; const ka=Object.keys(a).sort().join(','); const kb=Object.keys(b).sort().join(','); if (ka!==kb) { console.error('KEY MISMATCH'); process.exit(1); } console.log('PARITY OK');"` → `PARITY OK`.

**Context:** Read @.planning/PROJECT.md, @.planning/PRODUCT.md (§Users — Elena Papadopoulou's morning workflow), @.planning/CONTEXT.md (§Billable hours), @.planning/DESIGN.md (§Tables, §Motion — reduced-motion respect), @src/app/(workspace)/invoices/page.tsx, @src/app/(workspace)/invoices/actions.ts (createInvoiceAction — the post-save status-flip hook lives here), @src/app/(workspace)/invoices/new/page.tsx, @src/app/(workspace)/invoices/NewInvoiceForm.tsx, @src/app/(workspace)/invoices/LineItemEditor.tsx, @src/components/TopBar.tsx (where the widget mounts), @src/components/Table.tsx, @src/components/StatusPill.tsx, @src/lib/types.ts, @src/lib/format.ts, @src/lib/supabase/server.ts, @supabase/migrations/20260513000001_schema.sql (lines 225–238 time_entries, lines 360–362 partial unique index), @messages/el-CY.json, @messages/en-CY.json.

**Design:**
- Register: `product`
- Tokens used: `var(--accent)` (Stop button, "Bill these hours" CTA — billable hours are revenue-track, terracotta accent), `var(--text)`, `var(--muted)`, `var(--dim)`, `var(--line)`, `var(--line-soft)`, `var(--surface)`, `var(--bg)`, `var(--bg-2)`; `--space-2/3/4/6`, `--pad-card`, `--pad-x`.
- **Forbidden tokens on this surface:** `var(--trust)`, `var(--trust-bg)`. Billable hours and the timer are revenue-track work — sage-olive is reserved for the trust ledger context. Builder verifies `grep -E "(--trust|--trust-bg)" src/app/\(workspace\)/timer/ src/components/ActiveTimerWidget.tsx src/components/LiveElapsed.tsx 2>/dev/null` → `0` matches.
- Scope: page + section + components (`ActiveTimerWidget` ships globally in the TopBar; `LiveElapsed` is reused in two places).
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs src/app/\(workspace\)/timer/ src/components/ActiveTimerWidget.tsx` pre-commit; commit blocked on critical findings.

---

## Success Criteria

- [ ] **D-Q1** Accept Quotation → Invoice: the resulting Invoice is in `status='draft'`, has all line items from the quotation, links the same matter, and the original quotation is marked `status='accepted'` with `converted_invoice_id` set.
- [ ] **D-R1** Create Retainer with €2,000 deposit → `trust_ledger` has one entry with `debit_amount=2000` and `entry_kind='deposit'`; Client trust-balance widget shows €2,000; a hypothetical revenue summary across `invoices.total` for the same client shows €0 (uninfluenced).
- [ ] **D-T1** `/timer`: Start timer on a Case → ticker shows elapsed time live; Stop → time entry created with `status='completed'` and accurate `duration_seconds`; "Bill these hours" → Invoice prefill has line item with correct hours (2-dp) and rate (the lawyer's hourly rate, NOT rounded, NOT estimated).
- [ ] **D-L1** `/trust` displays `--trust-bg` sage-olive surface edge-to-edge; the banner reads the verbatim string "Trust ledger — Client funds. Not lawyer revenue." in the active locale, with the em dash.
- [ ] **D-L2** `psql $DATABASE_URL -f supabase/tests/trust_isolation_check.sql` returns `PASS:` notice on the seed dataset.
- [ ] **D-COMP** `npx tsc --noEmit` exits 0.
- [ ] **D-CLEAN** Top-level demo directories deleted: `test ! -d src/app/quotations && test ! -d src/app/retainers && test ! -d src/app/trust-ledger`.
- [ ] **D-SIDEBAR** `src/components/SidebarNav.tsx` points the trust nav item at `/trust` (NOT `/trust-ledger`); the `var(--trust)` active-state colorization is preserved.
- [ ] **D-I18N** i18n key parity holds for the `quotations`, `retainers`, `trust`, and `timer` namespaces across `el-CY.json` and `en-CY.json`.

---

## Verification Contract

### Contract for Task 1 — Quotations (file existence)
**Check type:** file-exists
**Command:** `test -f src/app/\(workspace\)/quotations/page.tsx && test -f src/app/\(workspace\)/quotations/actions.ts && test -f src/app/\(workspace\)/quotations/new/page.tsx && test -f src/app/\(workspace\)/quotations/\[id\]/page.tsx && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any of the four files is missing.

### Contract for Task 1 — Quotations (top-level demo removed)
**Check type:** command-exit
**Command:** `test ! -d src/app/quotations && echo CLEAN`
**Expected:** `CLEAN`
**Fail if:** `src/app/quotations/` still exists (parallel route conflict with `(workspace)/quotations`).

### Contract for Task 1 — Quotations (accept-and-convert action wired)
**Check type:** grep-match
**Command:** `grep -c "acceptQuotationAction\|convert_quotation_to_invoice" src/app/\(workspace\)/quotations/actions.ts src/app/\(workspace\)/quotations/QuotationActions.tsx src/app/\(workspace\)/quotations/\[id\]/page.tsx`
**Expected:** Non-zero (≥ 3 — once per file: action defined, button wired, page imports action)
**Fail if:** Action exists in actions.ts but isn't wired to a button on the detail page.

### Contract for Task 1 — Quotations (RLS deny-by-omission pattern)
**Check type:** grep-match
**Command:** `grep -c "data.length === 0" src/app/\(workspace\)/quotations/actions.ts`
**Expected:** `≥ 4`
**Fail if:** Fewer than 4 — at least one mutation is missing the deny-by-omission check (silent cross-workspace mutation risk).

### Contract for Task 1 — Quotations (i18n key parity)
**Check type:** command-exit
**Command:** `node -e "const a=require('./messages/el-CY.json').quotations; const b=require('./messages/en-CY.json').quotations; const ka=Object.keys(a).sort().join(','); const kb=Object.keys(b).sort().join(','); if (ka!==kb) { console.error('MISMATCH'); process.exit(1); } console.log('PARITY OK');"`
**Expected:** `PARITY OK`
**Fail if:** Greek/English `quotations` namespace key sets differ.

### Contract for Task 2 — Retainers (file existence)
**Check type:** file-exists
**Command:** `test -f src/app/\(workspace\)/retainers/page.tsx && test -f src/app/\(workspace\)/retainers/actions.ts && test -f src/components/TrustBalanceCard.tsx && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any file is missing.

### Contract for Task 2 — Retainers (atomic-write SP migration applied)
**Check type:** command-exit
**Command:** `psql $DATABASE_URL -c "\df+ public.create_retainer_with_deposit" 2>&1 | grep -c "SECURITY DEFINER"`
**Expected:** `≥ 1`
**Fail if:** The stored procedure isn't installed or isn't SECURITY DEFINER.

### Contract for Task 2 — Retainers (TrustBalanceCard wired into client detail)
**Check type:** grep-match
**Command:** `grep -c "TrustBalanceCard" src/app/\(workspace\)/clients/\[id\]/page.tsx`
**Expected:** `≥ 1`
**Fail if:** The widget is built but never imported into the client detail page (the canonical wiring failure).

### Contract for Task 2 — Retainers (trust accent on retainer pages)
**Check type:** grep-match
**Command:** `grep -c "var(--trust" src/app/\(workspace\)/retainers/page.tsx src/components/TrustBalanceCard.tsx`
**Expected:** `≥ 5`
**Fail if:** The sage-olive accent is missing from the retainer / trust-balance surfaces.

### Contract for Task 2 — Retainers (top-level demo removed)
**Check type:** command-exit
**Command:** `test ! -f src/app/retainers/page.tsx && echo CLEAN`
**Expected:** `CLEAN`
**Fail if:** The old demo file remains.

### Contract for Task 2 — Retainers (atomic write — real Postgres test)
**Check type:** behavioral
**Command:** (verifier inserts a test retainer via `psql -c "SELECT public.create_retainer_with_deposit('<ws>','<client>',NULL,'RT-TEST-001',1234.56,CURRENT_DATE,'test terms','EUR','<user>');"` and then SELECTs from both tables)
**Expected:** Exactly one new row in `public.retainers` AND exactly one new row in `public.trust_ledger` with `debit_amount=1234.56`, `entry_kind='deposit'`, `related_retainer_id` pointing at the new retainer.
**Fail if:** Either row is missing, or the trust deposit's debit_amount doesn't match.

### Contract for Task 3 — Trust Ledger (file existence + demo removed)
**Check type:** command-exit
**Command:** `test -f src/app/\(workspace\)/trust/page.tsx && test ! -d src/app/trust-ledger && echo OK`
**Expected:** `OK`
**Fail if:** New `(workspace)/trust/page.tsx` is missing OR the old demo dir remains.

### Contract for Task 3 — Trust Ledger (sidebar href fix)
**Check type:** grep-match
**Command:** `grep -n "href: \"/trust\"" src/components/SidebarNav.tsx && grep -c "/trust-ledger" src/components/SidebarNav.tsx`
**Expected:** First grep finds `href: "/trust"`; second grep returns `0`.
**Fail if:** Sidebar still points at `/trust-ledger` or the new href isn't in the file.

### Contract for Task 3 — Trust Ledger (sage-olive wash on surface)
**Check type:** grep-match
**Command:** `grep -c "var(--trust-bg)" src/app/\(workspace\)/trust/page.tsx`
**Expected:** `≥ 1`
**Fail if:** The page surface lacks the `--trust-bg` tint — disbarment-grade visual contract violated.

### Contract for Task 3 — Trust Ledger (no revenue accent on surface)
**Check type:** grep-match
**Command:** `grep -E -c "var\(--accent[^)]*\)" src/app/\(workspace\)/trust/page.tsx`
**Expected:** `0`
**Fail if:** Revenue terracotta appears on the trust surface — mixing semantics is a hard-block per DESIGN.md §Accent rules.

### Contract for Task 3 — Trust Ledger (no revenue-track links from this surface)
**Check type:** grep-match
**Command:** `grep -E -c "href=\"/invoices|href=\"/quotations|href=\"/reports" src/app/\(workspace\)/trust/page.tsx`
**Expected:** `0`
**Fail if:** Any revenue-track link appears on the trust ledger page (per the locked decision that this view has no navigation path to revenue).

### Contract for Task 3 — Trust isolation assertion test PASSES
**Check type:** command-exit
**Command:** `psql $DATABASE_URL -f supabase/tests/trust_isolation_check.sql 2>&1`
**Expected:** Output contains `PASS:` and psql exits 0.
**Fail if:** Any of the three invariants (no bad cross-link, retainer⇔deposit pairing, trust-only client invariants) is violated.

### Contract for Task 3 — Trust isolation test wired into run.sh
**Check type:** grep-match
**Command:** `grep -c "trust_isolation_check.sql" supabase/tests/run.sh`
**Expected:** `≥ 1`
**Fail if:** The new test file exists but isn't invoked by `run.sh` (silent unrun-test risk).

### Contract for Task 3 — Trust Ledger (i18n key parity)
**Check type:** command-exit
**Command:** `node -e "function flat(o,p=''){return Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flat(v,p+k+'.'):[p+k]);} const a=require('./messages/el-CY.json').trust; const b=require('./messages/en-CY.json').trust; const ka=flat(a).sort().join(','); const kb=flat(b).sort().join(','); if (ka!==kb) { console.error('MISMATCH'); process.exit(1); } console.log('PARITY OK');"`
**Expected:** `PARITY OK`
**Fail if:** Greek/English `trust` namespace key sets differ (nested keys included).

### Contract for Task 4 — Timer (file existence)
**Check type:** file-exists
**Command:** `test -f src/app/\(workspace\)/timer/page.tsx && test -f src/app/\(workspace\)/timer/actions.ts && test -f src/app/\(workspace\)/timer/LiveElapsed.tsx && test -f src/components/ActiveTimerWidget.tsx && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** Any of the four files is missing.

### Contract for Task 4 — Timer (ActiveTimerWidget mounted in TopBar)
**Check type:** grep-match
**Command:** `grep -c "ActiveTimerWidget" src/components/TopBar.tsx`
**Expected:** `≥ 1`
**Fail if:** Widget exists but isn't rendered in the TopBar (canonical wiring failure).

### Contract for Task 4 — Timer (live ticker uses setInterval)
**Check type:** grep-match
**Command:** `grep -c "setInterval" src/app/\(workspace\)/timer/LiveElapsed.tsx`
**Expected:** `≥ 1`
**Fail if:** No setInterval — the ticker isn't actually live.

### Contract for Task 4 — Timer (prefill plumbing wired)
**Check type:** grep-match
**Command:** `grep -c "from_time_entry" src/app/\(workspace\)/invoices/new/page.tsx src/app/\(workspace\)/invoices/NewInvoiceForm.tsx src/app/\(workspace\)/invoices/actions.ts src/app/\(workspace\)/timer/actions.ts`
**Expected:** `≥ 4`
**Fail if:** Any of the four files doesn't reference the prefill query param — the handoff is broken.

### Contract for Task 4 — Timer (post-save status flip to 'billed')
**Check type:** grep-match
**Command:** `grep -E -c "(status: ['\\\"]billed|'billed')" src/app/\(workspace\)/invoices/actions.ts`
**Expected:** `≥ 1`
**Fail if:** The createInvoiceAction never marks the source time_entry as billed — the same hours can be billed twice.

### Contract for Task 4 — Timer (RLS deny-by-omission pattern)
**Check type:** grep-match
**Command:** `grep -c "data.length === 0" src/app/\(workspace\)/timer/actions.ts`
**Expected:** `≥ 2`
**Fail if:** Fewer than 2 — at least one mutation lacks the deny-by-omission check.

### Contract for Task 4 — Timer (no trust tokens on timer surfaces)
**Check type:** grep-match
**Command:** `grep -E -c "(--trust|--trust-bg)" src/app/\(workspace\)/timer/page.tsx src/components/ActiveTimerWidget.tsx 2>/dev/null`
**Expected:** `0`
**Fail if:** Trust sage-olive appears on the timer surface — billable hours are revenue-track, not trust-track.

### Contract for Task 4 — Timer (i18n key parity)
**Check type:** command-exit
**Command:** `node -e "const a=require('./messages/el-CY.json').timer; const b=require('./messages/en-CY.json').timer; const ka=Object.keys(a).sort().join(','); const kb=Object.keys(b).sort().join(','); if (ka!==kb) { console.error('MISMATCH'); process.exit(1); } console.log('PARITY OK');"`
**Expected:** `PARITY OK`
**Fail if:** Greek/English `timer` namespace key sets differ.

### Contract for Phase-level — TypeScript compiles
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Any TypeScript error remains.

### Contract for Phase-level — End-to-end behavioral check (Accept Quotation → Invoice)
**Check type:** behavioral
**Command:** (verifier: sign in, navigate to `/quotations/new`, create a quotation with one line item against a seeded client + matter, click "Mark Sent", then "Accept & Convert to Invoice")
**Expected:** Redirect lands on `/invoices/{newId}` showing a draft invoice with the same client, matter, language, line items, and totals as the source quotation. The source quotation row in DB has `status='accepted'` and `converted_invoice_id` set.
**Fail if:** Draft invoice missing line items, matter not linked, source quotation status didn't update, or the new invoice's `status` is anything other than `draft`.

### Contract for Phase-level — End-to-end behavioral check (Create Retainer atomic)
**Check type:** behavioral
**Command:** (verifier: sign in, navigate to `/retainers/new`, create a retainer for a seeded client with deposit=2000)
**Expected:** Redirect lands on `/retainers/{newId}` showing balance €2,000. The DB has one new `retainers` row AND one new `trust_ledger` row with `debit_amount=2000`, `entry_kind='deposit'`, `related_retainer_id` pointing at the new retainer. The `/clients/{clientId}` page TrustBalanceCard reads €2,000.
**Fail if:** Either row missing, balance widget reads wrong, or revenue summary (if computed) shows non-zero from this retainer.

### Contract for Phase-level — End-to-end behavioral check (Timer → Bill these hours)
**Check type:** behavioral
**Command:** (verifier: sign in, navigate to `/timer`, start a timer on a seeded matter at €120/hr, wait 30 seconds, stop, click "Bill these hours")
**Expected:** Redirect lands on `/invoices/new?from_time_entry={id}` with one line item prefilled: description matches the entry, quantity=0.01 (or appropriate 2-dp rounding of 30s), unit_price=120. After saving the invoice, the source time entry's `status` is `billed` and `invoice_id` is set; the same entry's "Bill these hours" button is no longer shown.
**Fail if:** Prefill doesn't match the entry's hours+rate; the time entry can be billed twice.

### Contract for Phase-level — End-to-end behavioral check (Trust banner verbatim)
**Check type:** behavioral
**Command:** (verifier: sign in, navigate to `/trust`, with locale=en-CY)
**Expected:** Page surface is sage-olive (`--trust-bg`), banner reads VERBATIM "Trust ledger — Client funds. Not lawyer revenue." (with em dash). Switch locale to el-CY → banner reads VERBATIM "Λογαριασμός παρακαταθηκών — Πιστωμένα χρήματα πελατών. Όχι έσοδα του δικηγόρου." No revenue-track link is reachable from this page body.
**Fail if:** Banner string doesn't match per locale, or any revenue link is present in the page body.
