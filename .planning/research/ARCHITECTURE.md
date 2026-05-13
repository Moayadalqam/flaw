# Architecture Research

**Domain:** Single-tenant legal invoicing (Lex) — matters/cases, clients, invoices, line items, retainers, trust ledger, billable hours on Next.js 16 + Supabase (Postgres) + Vercel
**Researched:** 2026-05-13
**Confidence:** MEDIUM-HIGH (HIGH on the three deep-dive questions: invoice numbering, PDF rendering, RLS+AI; MEDIUM on data-model shape — derived from accounting/legal-tech conventions, not from a Lex-specific source)
**Scope:** quick (3/3 external calls used; local sources were empty for this domain)

---

## Standard Architecture

### Component Responsibilities

| Component | Responsibility | Typical Implementation (Lex) |
|-----------|----------------|------------------------------|
| **Routes (`app/`)** | Wiring only — auth, params, render | Next.js 16 RSC pages + server actions |
| **Features (`app/(features)/*`)** | Business logic for a use case (create invoice, log time, post to trust) | Server actions calling services |
| **Services (`lib/services/`)** | Orchestration — combines adapters, transactions, validation | Plain TS functions, no framework deps |
| **Adapters (`lib/{supabase,openrouter,pdf,email}/`)** | Sole talkers to vendors; translate vendor shapes → domain types | One file per vendor seam (see Adapters section) |
| **Domain types (`lib/types/`)** | Pure types: `Money`, `InvoiceStatus`, `TrustEntry` — no IO | TypeScript only |
| **DB (Supabase Postgres)** | Source of truth; RLS + triggers enforce invariants | Migrations in `supabase/migrations/` |
| **Audit trigger** | Append-only row in `audit_log` on every mutation of revenue/trust tables | Postgres trigger + `audit_log` table |
| **Invoice-number SP** | Gap-free numbering under concurrency | Postgres function with `pg_advisory_xact_lock` |

Layering rule: routes → features → services → adapters → DB. Domain types import nothing else. Inverting this order is a bug-in-shape per `rules/architecture.md`.

### Data Flow — Invoice Creation (the canonical flow)

```
[Lawyer clicks "Send Invoice"]
        ↓
[Server Action: createInvoice]
        ↓
[Feature: invoice.create]
        ↓
   ┌─→ [Service: invoiceService.draft] ─→ [Supabase adapter] ─→ INSERT invoice + line_items (txn)
   │           ↓
   │   [SP: next_invoice_number(workspace_id, year)] ── pg_advisory_xact_lock + counter UPDATE
   │           ↓
   ├─→ [Service: pdfService.render]    ─→ [PDF adapter (@react-pdf/renderer)] ─→ Buffer
   │           ↓
   ├─→ [Service: storageService.put]   ─→ [Supabase Storage adapter] ─→ signed URL
   │           ↓
   └─→ [Audit trigger fires on INSERT] ─→ audit_log row (immutable)
                ↓
        [Email adapter] ─→ Resend / SES
                ↓
        [Return invoice URL to lawyer]
```

### Key Flows

1. **Invoice numbering (gap-free):** Server action opens transaction → `SELECT pg_advisory_xact_lock(hashtext('inv:' || workspace_id || ':' || year))` → `UPDATE invoice_counters SET last_number = last_number + 1 ... RETURNING last_number` → INSERT invoice with that number → COMMIT releases the lock. Concurrent callers queue; no gaps because the number is only consumed on COMMIT. — [Source: WebSearch "postgres gap-free sequential invoice number concurrency advisory lock vs row lock 2025" → https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/ and https://appmaster.io/blog/postgresql-advisory-locks-double-processing]

2. **AI drafts an invoice:** OpenRouter adapter → returns structured JSON → server validates with Zod → writes to `invoices` with `status = 'draft'` and `created_by_ai = true` → returns preview URL. Lawyer reviews → server action `invoice.finalize` is the ONLY path that consumes a real invoice number via the advisory-lock SP. Drafts never get a number; numbers are reserved for the human-confirmed mutation.

3. **Trust ledger entry (client money in/out):** Server action → `trustService.recordEntry` → INSERT into `trust_ledger` (append-only) with `debit_account`, `credit_account`, `amount`, `client_id`, `matter_id` → trigger checks invariant `SUM(debits) = SUM(credits)` per matter on COMMIT → audit row written.

4. **Billable-hours timer:** Client-side `setInterval` ticks UI every 1s. Server persists a `time_entries` row with `started_at` and `running = true`. On stop, server updates `ended_at` and `duration_seconds = ended_at - started_at`. Multi-device sync: poll `/api/timer/current?workspace_id=...` every 10–15s OR use Supabase Realtime subscription on `time_entries WHERE running=true`. Never trust client-reported duration — recompute from server timestamps on stop.

---

## Recommended Project Structure

```
lex/
├── app/
│   ├── (auth)/                  # login, signup
│   ├── (workspace)/             # everything below is workspace-scoped
│   │   ├── clients/             # CRUD + list
│   │   ├── matters/             # case-level views, time entries nested
│   │   ├── invoices/            # draft → finalize → send → paid
│   │   ├── trust/               # ledger view, deposits, transfers
│   │   └── ai/                  # AI assistant chat surface
│   └── api/
│       ├── invoices/[id]/pdf/   # PDF render endpoint
│       └── timer/current/       # multi-device timer poll
├── lib/
│   ├── supabase/
│   │   ├── server.ts            # SSR client (user JWT) — for RLS-protected reads
│   │   ├── client.ts            # browser client
│   │   └── service-role.ts      # SEPARATE service-role client — for AI write path only
│   ├── openrouter/client.ts     # OpenRouter adapter
│   ├── pdf/render.ts            # @react-pdf/renderer adapter
│   ├── email/send.ts            # Resend or SES adapter
│   ├── services/
│   │   ├── invoiceService.ts
│   │   ├── trustService.ts
│   │   ├── timeService.ts
│   │   └── auditService.ts      # read audit log (writes are trigger-driven)
│   └── types/                   # Money, InvoiceStatus, TrustEntry, etc.
└── supabase/
    └── migrations/
        ├── 001_schema.sql
        ├── 002_rls.sql
        ├── 003_invoice_numbering.sql   # the SP + counter table
        └── 004_audit_triggers.sql
```

**Structure rationale:**
- **`app/(workspace)/`:** Single route group makes "you must be in a workspace" enforceable in one layout. Single-tenant = workspace is implicit from `auth.uid()`, but the boundary stays explicit in routing.
- **`lib/supabase/service-role.ts` is a SEPARATE file:** Critical — SSR clients share user session from cookies and the user session overrides the service_role Authorization header. — [Source: WebSearch "supabase RLS service role bypass workspace_id ai assistant write pattern 2025" → https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z]
- **`supabase/migrations/` numbered:** Audit-defensible — every schema change has a date and a diff.

---

## Data Model (Postgres)

Specifically answering question 1: **single schema, with trust as a separate ledger table, not a flag column.**

```sql
-- core identity
workspaces (id, owner_user_id, name, vat_number, created_at)
-- one row per user; auth.uid() → workspace_id resolved via SECURITY DEFINER function

clients (id, workspace_id, name, vat_number, email, address, created_at)
matters (id, workspace_id, client_id, title, opened_at, closed_at, default_hourly_rate)

-- revenue side
invoices (
  id, workspace_id, client_id, matter_id,
  number,            -- assigned only on finalize, gap-free per (workspace, year)
  number_year,
  status,            -- 'draft' | 'finalized' | 'sent' | 'paid' | 'void'
  issued_at, due_at,
  subtotal, vat_amount, total,   -- stored cents (BIGINT), never float
  currency,                       -- 'EUR' default; FX is Tier-2
  created_by_ai BOOLEAN,
  finalized_at, finalized_by_user_id
)
invoice_line_items (id, invoice_id, description, quantity, unit_amount, vat_rate, line_total)

-- gap-free counter
invoice_counters (workspace_id, year, last_number)   -- PK (workspace_id, year)

-- billable hours
time_entries (
  id, workspace_id, matter_id, user_id,
  started_at, ended_at, duration_seconds,
  hourly_rate, billable BOOLEAN, running BOOLEAN,
  invoice_id NULL    -- set when included in an invoice
)

-- trust ledger — SEPARATE from revenue, double-entry style
retainers (id, workspace_id, client_id, matter_id, amount_received, currency, received_at)
trust_ledger (
  id, workspace_id, client_id, matter_id,
  entry_type,        -- 'deposit' | 'fee_transfer' | 'refund' | 'disbursement'
  debit_account,     -- 'trust_cash' | 'client_funds' | 'revenue' | ...
  credit_account,
  amount,            -- always positive; debit/credit columns indicate direction
  related_invoice_id NULL,
  related_retainer_id NULL,
  occurred_at, created_at,
  -- NO update_at, NO deletable — append-only
)

-- audit
audit_log (
  id, workspace_id, actor_user_id, actor_kind,  -- 'human' | 'ai'
  table_name, row_id, operation,                 -- 'INSERT' | 'UPDATE' | 'DELETE'
  old_row JSONB, new_row JSONB,
  occurred_at
)
```

**Why trust is a separate table, not a flag:**
- Legal/accounting rule: client trust money is **not the firm's money**. It cannot be commingled with revenue, even in storage. A separate `trust_ledger` (with its own RLS, separate audit triggers, and an append-only invariant) makes that boundary visible to any future auditor reading the schema.
- "Just a flag column on `transactions`" forces every query to remember the flag — one missed `WHERE is_trust=false` and you've reported trust money as firm revenue. The separation is defensive.
- Double-entry without going full event-store: each `trust_ledger` row records both sides (`debit_account`, `credit_account`). Aggregate balance = `SUM(amount WHERE debit=X) - SUM(amount WHERE credit=X)`. This is "double-entry with row-per-transaction," the common middle ground used by tools like Ledger CLI and Beancount.

Confidence on data model shape: MEDIUM — this reflects standard legal-tech/accounting conventions but I did not find a Lex-specific or Cyprus-bar-specific source in budget. Validate with Fotini or a Cyprus accountant before shipping.

---

## Invoice Numbering — The Critical Decision

**Choice: `pg_advisory_xact_lock` + counter table, NOT Postgres `SEQUENCE`.**

Why not `SEQUENCE`: Postgres sequences are explicitly designed not to be gap-free — a `nextval` is never rolled back, even if the surrounding transaction aborts. Cyprus VAT requires gap-free numbering per year, so sequences fail the requirement by design. — [Source: WebSearch "postgres gap-free sequential invoice number" → https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/]

Why advisory lock over `SELECT ... FOR UPDATE`:
- Both deliver gap-free numbering.
- Advisory locks avoid heap bloat on the hot counter row (the row would be UPDATEd on every invoice; row locks force a full row rewrite each time).
- Advisory locks naturally extend if you later coordinate across other tables (e.g., reserving an invoice number AND a trust ledger entry in one logical unit).
- Transaction-level (`pg_advisory_xact_lock`) auto-releases on COMMIT/ROLLBACK — no leak risk.
— [Source: WebSearch "postgres gap-free sequential invoice number concurrency advisory lock vs row lock 2025" → https://appmaster.io/blog/postgresql-advisory-locks-double-processing]

Canonical implementation:
```sql
CREATE OR REPLACE FUNCTION next_invoice_number(p_workspace UUID, p_year INT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_n INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('inv:' || p_workspace::text || ':' || p_year));
  INSERT INTO invoice_counters (workspace_id, year, last_number) VALUES (p_workspace, p_year, 0)
    ON CONFLICT (workspace_id, year) DO NOTHING;
  UPDATE invoice_counters SET last_number = last_number + 1
    WHERE workspace_id = p_workspace AND year = p_year
    RETURNING last_number INTO v_n;
  RETURN v_n;
END $$;
```

**Scalability ceiling:** This serializes invoice finalization per (workspace, year). Single-tenant Lex = one user = no contention. Acceptable. — [Source: same WebSearch — "Either approach serializes invoice creation per series/tenant"]

**Critical rule:** Only consume a number on **finalize**, never on draft. Drafts must use a temporary identifier (UUID or "DRAFT-{id}") because Cyprus VAT counts numbered invoices as issued.

---

## RLS Pattern — Single-Tenant + AI Service-Role

Single-tenant means `workspace_id = (SELECT id FROM workspaces WHERE owner_user_id = auth.uid())`. Wrap in a `SECURITY DEFINER` function to let Postgres cache the result per statement.

```sql
CREATE OR REPLACE FUNCTION current_workspace_id() RETURNS UUID
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT id FROM workspaces WHERE owner_user_id = auth.uid() LIMIT 1
  $$;

-- Per-operation policies (NOT FOR ALL — split per Supabase guidance)
CREATE POLICY clients_select ON clients FOR SELECT
  USING (workspace_id = (SELECT current_workspace_id()));
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (workspace_id = (SELECT current_workspace_id()));
-- ... same shape for update, delete, and every table
```

Wrapping `current_workspace_id()` in `(SELECT ...)` triggers an initPlan so Postgres evaluates it once per statement, not once per row. — [Source: WebSearch "supabase RLS service role" → https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv]

**AI write boundary — the critical pattern:**

1. AI calls happen server-side only (OpenRouter adapter in `lib/openrouter/client.ts`).
2. The AI **never** holds a service-role key. The user's server action holds it.
3. Server action receives AI output → validates with Zod → opens **dedicated service-role client** (`lib/supabase/service-role.ts`, NOT the SSR client) → writes row.
4. **Before writing**, server action MUST explicitly verify `workspace_id` matches `(SELECT current_workspace_id())` for the authenticated user. Service role bypasses RLS — explicit verification is the only enforcement layer. — [Source: WebSearch "supabase RLS service role" → https://chat2db.ai/resources/blog/secure-supabase-role-key — "Validate the user's workspace membership in application code before inserting"]
5. Adding `service_role` to RLS policies does nothing — it always bypasses. — [Source: same WebSearch → https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z]

**The auth boundary:** The user's authenticated session is the source of truth for `workspace_id`. The AI never gets to specify it. Pattern:

```ts
// in a server action
const user = await getAuthenticatedUser();           // throws if not logged in
const workspaceId = await resolveWorkspaceId(user);  // server-derived, NEVER from AI output
const aiDraft = await openrouter.draftInvoice(...);  // returns line items, etc.
const safeDraft = InvoiceDraftSchema.parse(aiDraft); // Zod strips/validates
await serviceRoleClient.from('invoices').insert({
  ...safeDraft,
  workspace_id: workspaceId,    // overrides anything AI tried to inject
  created_by_ai: true,
  status: 'draft',
});
```

---

## AI Assistant Write Path — Drafts Table or Status Column?

**Choice: same `invoices` table with `status='draft'` and `created_by_ai BOOLEAN`. Not a separate drafts table.**

Reasoning:
- A separate `invoice_drafts` table doubles every query and creates a sync problem on "promote draft to invoice."
- Drafts don't get a real invoice number (numbers consumed only on finalize via the advisory-lock SP), so no Cyprus-VAT compliance risk from holding drafts in the same table.
- `created_by_ai = true` + `status='draft'` is the lawyer's review queue. UI filters on it.

**Rollback/preview pattern lawyers will trust:**
1. AI writes draft → returns draft URL.
2. Lawyer opens draft → sees rendered PDF preview (PDF service renders drafts with a "DRAFT — not a tax document" watermark).
3. Lawyer clicks "Finalize" → server action `invoice.finalize` runs the advisory-lock SP, assigns the number, flips status, writes audit row.
4. "Discard" simply DELETEs the draft row (which fires an audit_log entry — even discards leave a trace).
5. **No silent AI writes.** Every AI-produced row appears in the review queue before becoming a real invoice. — Confidence: MEDIUM (pattern is sound; not citing a specific source — derived from the principle "every irreversible action needs a human confirm").

---

## PDF Generation — The Vercel + Greek Constraint

**Choice: `@react-pdf/renderer` for the demo, with static (non-variable) Noto Sans Greek TTF files.**

Why not Puppeteer + `@sparticuz/chromium`:
- Bundle size near Vercel's 250MB function limit. — [Source: WebSearch "react-pdf vs puppeteer vercel" → https://medium.com/@ubermensch1/running-puppeteer-on-vercel-511dfec154a1]
- Slow cold starts (Chromium binary load).
- Overkill for invoice layouts which are simple, structured documents.

Why `@react-pdf/renderer`:
- No Chromium binary → fast cold starts, fits Vercel easily.
- Greek text supported via `Font.register` with TTF/WOFF.
- **Critical gotcha:** OpenType **variable** fonts (e.g., Noto Sans variable weight) do NOT work — PDF 2.0 spec doesn't support them. Must register separate static TTF files per weight (e.g., `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`). — [Source: WebSearch → https://react-pdf.org/fonts]
- Performance is acceptable for low-medium throughput (which Lex demo is). Custom-font rendering is slower than no-font, but invoice volume is bounded by human typing speed.
— [Source: WebSearch → https://1rps.club/blog/pdf-generators-benchmark-comparison/]

**Implementation guard:** Ship the Greek TTF in `public/fonts/` or load from a CDN with a stable URL. Test render with Greek client name + Greek address line at least once before demo — silent fallback to boxes is the failure mode.

**Fallback if @react-pdf/renderer hits a layout limitation:** Move that one document type to Puppeteer + `@sparticuz/chromium` later. Not in scope for the demo.

---

## Billable-Hours Timer — Multi-Device Sync

**Choice: server-of-record, client computes display only, multi-device sync via Supabase Realtime on `time_entries`.**

Pattern:
- On "Start": INSERT `time_entries (started_at = NOW(), running=true)`. UI starts ticking locally (1s interval, purely visual).
- On "Stop": UPDATE `time_entries SET ended_at = NOW(), running = false, duration_seconds = EXTRACT(EPOCH FROM ended_at - started_at)`. Recompute server-side — never trust client-reported duration.
- Multi-device: subscribe to Realtime channel `time_entries:workspace_id=eq.{ws}` filtered to `running=true`. When the lawyer starts a timer on their phone, their laptop's UI picks it up within ~1s.
- **No "tick to DB" frequency** — the DB stores only `started_at`. The duration is implicit until stop. Saves writes; eliminates "what tick rate?" question.

Confidence: MEDIUM — pattern is sound but I didn't research Supabase Realtime semantics specifically in this budget; validate during build.

---

## Audit Trail

**Choice: append-only `audit_log` table populated by Postgres triggers on every revenue/trust mutation.**

Why not CDC (Change Data Capture / logical replication):
- Overkill for single-tenant demo.
- Triggers run in the same transaction → impossible to commit a mutation without its audit row.
- CDC consumers can lag or fail silently. Triggers can't.

Why not "application-level logging":
- App-level writes can be skipped by a buggy code path. Triggers fire regardless of who wrote (server action, SQL console, future migration script).

```sql
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log (workspace_id, actor_user_id, actor_kind, table_name, row_id, operation, old_row, new_row, occurred_at)
  VALUES (
    COALESCE(NEW.workspace_id, OLD.workspace_id),
    auth.uid(),
    CASE WHEN current_setting('app.actor_kind', true) = 'ai' THEN 'ai' ELSE 'human' END,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    to_jsonb(OLD), to_jsonb(NEW),
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END $$;

-- Apply to invoices, invoice_line_items, trust_ledger, retainers
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
-- ... repeat for each audited table
```

The `app.actor_kind` setting lets server actions tag AI-originated writes: `SET LOCAL app.actor_kind = 'ai'` at the start of an AI-driven transaction.

**RLS on audit_log:** SELECT for workspace owner only; no INSERT/UPDATE/DELETE policy (so even the workspace owner can't tamper — only the trigger writes). Service role bypasses but should NEVER write directly to audit_log; that's the trigger's job.

Confidence: HIGH on the trigger-based approach (standard Postgres pattern); MEDIUM on the actor_kind tagging (specific pattern I'm proposing, not cited).

---

## Adapters at Seams (per rules/architecture.md §3)

| Vendor | Adapter file | Why it's an adapter |
|---|---|---|
| Supabase (user-session) | `lib/supabase/server.ts` | SSR cookie handling; user-bound queries |
| Supabase (service-role) | `lib/supabase/service-role.ts` | **SEPARATE FILE** — bypasses RLS for AI write path only |
| Supabase (browser) | `lib/supabase/client.ts` | Client-side reads |
| OpenRouter | `lib/openrouter/client.ts` | Model selection, retry, structured-output enforcement |
| PDF rendering | `lib/pdf/render.ts` | Wraps `@react-pdf/renderer`; owns font registration; future swap point if we move to Puppeteer |
| Email | `lib/email/send.ts` | Wraps Resend or SES; owns "From" addresses, DKIM concerns |
| Currency/FX (Tier-2) | `lib/fx/rates.ts` | Stub for demo (EUR only); future provider swap (ECB rates, Frankfurter, etc.) |

Direct vendor SDK imports from `app/` or `lib/services/` are a smell and should fail review.

---

## Suggested Build Order

For a single demo milestone shipping today, phases follow this dependency order:

1. **Migrations + RLS scaffolding** — `001_schema.sql`, `002_rls.sql`. Foundation; nothing builds without it.
2. **Supabase adapters (`server.ts`, `client.ts`, `service-role.ts`)** — Depends on 1. Three SEPARATE files; don't merge them. Worth 5 minutes of paranoid testing that service-role really bypasses and user-session really enforces.
3. **Invoice numbering SP + audit triggers** — `003_invoice_numbering.sql`, `004_audit_triggers.sql`. Depends on 1.
4. **Domain types + services (`invoiceService`, `timeService`, `trustService`)** — Pure logic, depends on 2.
5. **Server actions for finalize/draft/timer-start/timer-stop** — Depends on 4.
6. **PDF adapter + render endpoint** — Depends on 4. Test Greek render BEFORE plumbing into UI.
7. **OpenRouter adapter + AI assistant chat surface** — Depends on 4. Last because everything it produces flows through the existing draft pathway.
8. **UI pages (clients, matters, invoices list, trust view)** — Depends on 5–7.

This ordering means: if the demo runs out of time at step 6, you still have a manually-driven, gap-free, audited invoicing system that renders to PDF in Greek. Steps 7–8 are the AI/UX polish on top.

---

## Anti-Patterns

### Trust ledger as a flag column on a unified `transactions` table

**What people do:** One table for revenue and trust; an `is_trust BOOLEAN` flag distinguishes.
**Why it's wrong:** Legal/accounting boundary rule says trust money is NOT firm money. Every query needs to remember the flag. One missed `WHERE is_trust=false` and you've reported trust funds as revenue. Audit becomes a query-comprehension exercise.
**Do this instead:** Separate `trust_ledger` table with its own RLS, its own audit triggers, append-only constraint.

### Postgres SEQUENCE for invoice numbers

**What people do:** `invoice_number SERIAL` or `nextval('invoice_seq')`.
**Why it's wrong:** Postgres sequences are explicitly designed not to be gap-free — `nextval` is never rolled back. Cyprus VAT requires gap-free per year. — [Source: https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/]
**Do this instead:** Counter table + `pg_advisory_xact_lock(hashtext(...))` per (workspace, year). Numbers consumed only on finalize commit.

### Sharing one Supabase client between SSR/auth and service-role

**What people do:** Initialize `createServerClient` once and try to "upgrade to service role" by changing keys.
**Why it's wrong:** SSR clients share user session via cookies. The user session overrides the service_role Authorization header. RLS still applies; AI writes mysteriously fail. — [Source: https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z]
**Do this instead:** Two separate files. `lib/supabase/server.ts` (SSR, user JWT, RLS-protected). `lib/supabase/service-role.ts` (raw `createClient` with service_role key, used ONLY in server actions that have already verified workspace ownership).

### Adding `service_role` to RLS policies

**What people do:** `CREATE POLICY ... USING (auth.role() = 'service_role' OR workspace_id = ...)`.
**Why it's wrong:** Service role bypasses RLS unconditionally. The clause is meaningless. — [Source: https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z]
**Do this instead:** Don't try to "let service role through RLS." Verify workspace membership in application code before the service-role write. RLS protects against non-service-role traffic only.

### AI directly writing finalized invoices

**What people do:** "The AI knows the lawyer's intent; let it write final invoices and skip the draft step."
**Why it's wrong:** AI hallucinations on invoice amounts ship as tax documents. Cyprus VAT auditor doesn't accept "the AI did it" as an explanation. Voiding invoices leaves audit traces.
**Do this instead:** AI writes ONLY `status='draft'` rows. The advisory-lock SP that assigns a real number is only callable from `invoice.finalize`, which requires an explicit human server action.

### Variable-weight Google Fonts in @react-pdf/renderer

**What people do:** Copy the modern Google Fonts URL (variable axis) for Noto Sans.
**Why it's wrong:** PDF 2.0 spec doesn't support variable fonts; Greek glyphs silently render as boxes. — [Source: https://react-pdf.org/fonts]
**Do this instead:** Download static TTFs (Regular, Bold, etc.) for Noto Sans Greek subset; register each separately via `Font.register`.

### Client-reported timer duration

**What people do:** Trust the browser's `Date.now() - startedAt` and POST that to the server.
**Why it's wrong:** Clock skew, paused tabs, accidental refreshes. Lawyer's billable hours become a fiction.
**Do this instead:** Server records `started_at` only. On stop, server computes `NOW() - started_at`. Client UI ticks for visual feedback only.

---

## Integration Points

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase (DB + Auth + Storage + Realtime) | CLI for migrations; supabase-js for runtime | Always three adapter files. RLS on every table. — [Source: rules/infrastructure.md] |
| OpenRouter | REST via `lib/openrouter/client.ts`; structured-output mode | Never call OpenAI/Anthropic SDKs directly. — [Source: rules/infrastructure.md] |
| Vercel | `vercel --prod` from CLI; auto-deploy disabled | Function timeout 60s on Pro is hard limit for PDF render. — [Source: rules/infrastructure.md + WebSearch on Puppeteer/Vercel] |
| Resend (or SES) | `lib/email/send.ts` adapter | SPF/DKIM/DMARC required before invoice emails go out — Gmail will route to spam otherwise. (Confidence: MEDIUM — not researched in budget, standard email-deliverability knowledge.) |
| PDF render | `lib/pdf/render.ts` wrapping `@react-pdf/renderer` | Greek font as static TTF in `public/fonts/`. Watermark drafts. |

---

## Sources

- WebSearch "postgres gap-free sequential invoice number concurrency advisory lock vs row lock 2025":
  - https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/ (HIGH — Cybertec is a Postgres-specialist consultancy)
  - https://www.postgresql.org/docs/current/explicit-locking.html (HIGH — official Postgres docs)
  - https://appmaster.io/blog/postgresql-advisory-locks-double-processing (MEDIUM)
  - https://dev.to/yugabyte/no-gap-sequence-in-postgresql-and-yugabytedb-3feo (MEDIUM)
  - https://dteather.com/blogs/postgres-advisory-locks/ (MEDIUM)
- WebSearch "react-pdf vs puppeteer vercel serverless Greek unicode font 2025":
  - https://react-pdf.org/fonts (HIGH — official @react-pdf/renderer docs)
  - https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel (HIGH — official Vercel guidance)
  - https://1rps.club/blog/pdf-generators-benchmark-comparison/ (MEDIUM — comparative benchmark)
  - https://www.nutrient.io/blog/javascript-pdf-libraries/ (MEDIUM)
  - https://medium.com/@ubermensch1/running-puppeteer-on-vercel-511dfec154a1 (MEDIUM)
- WebSearch "supabase RLS service role bypass workspace_id ai assistant write pattern 2025":
  - https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z (HIGH — official Supabase troubleshooting)
  - https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv (HIGH — official Supabase performance guidance)
  - https://supabase.com/docs/guides/getting-started/ai-prompts/database-rls-policies (HIGH — official Supabase AI prompt for RLS)
  - https://makerkit.dev/blog/tutorials/supabase-rls-best-practices (MEDIUM — well-regarded SaaS-on-Supabase boilerplate vendor)
  - https://chat2db.ai/resources/blog/secure-supabase-role-key (MEDIUM)
- rules/architecture.md (HIGH — Qualia internal canon on adapter seams, layered service boundaries)
- rules/infrastructure.md (HIGH — Qualia internal canon on Supabase/OpenRouter/Vercel)

**Local sources exhausted before external calls:** knowledge.js searches for `invoice numbering sequential gap-free postgres`, `supabase RLS single-tenant workspace`, `trust ledger accounting double entry`, `audit trail postgres trigger`, `PDF generation Vercel react-pdf`, `Cyprus VAT invoicing` — all returned zero matches. `~/qualia-memory/` does not exist on this machine. No prior architecture research found.

---
*Architecture research for: Single-tenant legal invoicing (Lex) on Next.js 16 + Supabase + Vercel — demo milestone, 2026-05-13*
