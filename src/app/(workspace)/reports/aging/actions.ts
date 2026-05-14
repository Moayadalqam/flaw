"use server";

/**
 * Server Actions for the Aging report's "Draft Reminders" surface
 * (Phase 6 Task 4 / REQ-016 / REP-02).
 *
 * Two actions:
 *
 *   draftReminderAction(invoiceId)
 *       Auth + workspace + RLS fetch invoice + 5 guard rails. On all
 *       guard rails passing, calls the OpenRouter adapter in `kind:
 *       'reminder'` mode to produce a subject + body in the client's
 *       preferred language. The AI never proposes amounts / VAT /
 *       invoice numbers — `ReminderResponseSchema.strict()` in
 *       `src/lib/openrouter/client.ts` enforces this at parse time.
 *
 *   sendReminderAction(invoiceId, subject, body_html)
 *       Re-validates ALL guard rails (state may have changed between
 *       drafting and sending), Zod-validates the editable subject + body
 *       inputs, sanitises HTML to defang `<script>` + `on*=` handlers
 *       even though the AI never produces them (a user could paste one
 *       into the textarea), then forwards to the Resend adapter
 *       `sendReminderEmail`. On success, transitions the invoice
 *       `status` to `'sent'` so the existing `audit_invoices` AFTER
 *       UPDATE trigger captures the send event with full before/after
 *       JSON.
 *
 * ─── Trust-isolation invariant ────────────────────────────────────────
 *
 * The aging surface queries `invoices` ONLY. This actions file consumes
 * `getOverdueInvoices` from `./queries.ts` (which is the same single
 * table) and writes back to `invoices` only. No fiduciary-ledger or
 * client-funds reference anywhere — the builder verifier greps this
 * directory and hard-blocks the commit on any such reference.
 *
 * ─── Audit-log strategy ───────────────────────────────────────────────
 *
 * `audit_log` has NO INSERT RLS policy for `authenticated` (Migration
 * 002 lines 408-412: SELECT-only by design — even the workspace owner
 * cannot tamper with their own audit trail). The only legal write path
 * is via the SECURITY DEFINER `audit_trigger()` function attached to
 * the audited tables (Migration 004 lines 104-126). To capture a
 * reminder-send event we therefore UPDATE the invoice's `status` from
 * `'finalized'` → `'sent'` (or set `'sent'` → `'sent'` for repeats —
 * Postgres fires the AFTER UPDATE trigger regardless), which causes
 * `audit_invoices` to insert an audit row with `before_json` + `after_json`
 * + actor identity automatically. We then RETURN the Resend send-id to
 * the caller for the UI's success state. The resend_id is NOT persisted
 * separately — the audit trail proves the send happened; the id is for
 * the lawyer's reference only.
 *
 * No service-role client import in this file. No fiduciary-ledger
 * reference. RLS auto-scopes every query.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { callOpenRouter } from "@/lib/openrouter/client";
import { sendReminderEmail } from "@/lib/resend/client";
import type {
  ReminderClientCtx,
  ReminderContext,
} from "@/lib/openrouter/types";
import type {
  ClientRow,
  InvoiceRow,
  InvoiceStatus,
  MatterRow,
  PreferredLanguage,
} from "@/lib/types";

// Permissive UUID-shape regex (any version). Seed uses deterministic
// non-v4 placeholder UUIDs like `00000000-0000-0000-0000-0000000b0001`,
// which strict `z.uuid()` would reject. Mirrors `invoices/actions.ts:65`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Result types — typed error tags 1-1 mapped to `reminders.error*` i18n keys.
// ---------------------------------------------------------------------------

export type DraftReminderError =
  | "unauthorized"
  | "no_workspace"
  | "invalid_input"
  | "not_found"
  | "not_eligible" // status not in ('finalized','sent')
  | "no_invoice_number"
  | "not_overdue"
  | "no_email"
  | "refusal"
  | "parse_failed"
  | "rate_limited"
  | "network"
  | "model_error"
  | "no_api_key";

export type DraftReminderResult =
  | {
      ok: true;
      subject: string;
      body_html: string;
      body_text: string;
      to: string;
    }
  | { ok: false; error: DraftReminderError; message?: string };

export type SendReminderError =
  | "unauthorized"
  | "no_workspace"
  | "invalid_input"
  | "not_found"
  | "not_eligible"
  | "no_invoice_number"
  | "not_overdue"
  | "no_email"
  | "rate_limited"
  | "invalid_email"
  | "network"
  | "provider_error"
  | "no_api_key"
  | "update_failed";

export type SendReminderResult =
  | { ok: true; id: string }
  | { ok: false; error: SendReminderError; message?: string };

// ---------------------------------------------------------------------------
// Zod input schemas — minimal, strict.
// ---------------------------------------------------------------------------

const DraftInput = z.string().regex(UUID_RE);

const SendInput = z.object({
  invoiceId: z.string().regex(UUID_RE),
  subject: z.string().trim().min(1).max(200),
  body_html: z.string().trim().min(1).max(8000),
});

// ---------------------------------------------------------------------------
// Shared row shape — the RLS-scoped invoice fetch (with joined client +
// matter) used by BOTH actions. Re-doing this fetch in the send path is
// load-bearing: state could have changed between drafting and sending
// (the lawyer paid the invoice via another tab, the client's email got
// nulled out, etc.) and the user-edited subject/body must NEVER be sent
// against an invoice that no longer meets the guard rails.
// ---------------------------------------------------------------------------

interface InvoiceForReminder
  extends Pick<
    InvoiceRow,
    | "id"
    | "invoice_number"
    | "status"
    | "due_at"
    | "total"
    | "currency"
    | "workspace_id"
  > {
  clients: Pick<
    ClientRow,
    "name_el" | "name_en" | "email" | "preferred_language"
  > | null;
  matters: Pick<MatterRow, "title"> | null;
}

type GuardError =
  | "not_found"
  | "not_eligible"
  | "no_invoice_number"
  | "not_overdue"
  | "no_email";

interface GuardOk {
  ok: true;
  invoice: InvoiceForReminder & {
    invoice_number: string;
    due_at: string;
    clients: NonNullable<InvoiceForReminder["clients"]> & { email: string };
    matters: NonNullable<InvoiceForReminder["matters"]>;
  };
  daysOverdue: number;
}

/**
 * Centralised guard-rail enforcement — both `draftReminderAction` and
 * `sendReminderAction` route through here so the rules cannot drift
 * between the two surfaces. Returns a typed error tag mapping 1-1 to
 * the `reminders.error*` i18n namespace.
 */
function applyGuardRails(
  invoice: InvoiceForReminder | null,
): GuardOk | { ok: false; error: GuardError } {
  if (!invoice) return { ok: false, error: "not_found" };

  const eligibleStatuses: InvoiceStatus[] = ["finalized", "sent"];
  if (!eligibleStatuses.includes(invoice.status)) {
    return { ok: false, error: "not_eligible" };
  }
  if (!invoice.invoice_number) {
    return { ok: false, error: "no_invoice_number" };
  }
  if (!invoice.due_at) {
    // Defence-in-depth: a non-draft invoice with NULL due_at can't be
    // reasonably "overdue". Treat as not-overdue rather than not-found.
    return { ok: false, error: "not_overdue" };
  }

  // Day-precision overdue: compare DATE strings to today's DATE.
  const today = new Date().toISOString().slice(0, 10);
  if (invoice.due_at >= today) {
    return { ok: false, error: "not_overdue" };
  }

  if (!invoice.clients?.email) {
    return { ok: false, error: "no_email" };
  }
  if (!invoice.matters) {
    // A non-draft invoice with a NULL matter join would mean the FK
    // pointed at a deleted row. The schema CASCADE-protects this via
    // `ON DELETE RESTRICT` (Migration 001:115), so this branch is
    // effectively unreachable; surface as not_found for safety.
    return { ok: false, error: "not_found" };
  }

  const daysOverdue = Math.floor(
    (Date.now() - new Date(invoice.due_at).getTime()) / 86_400_000,
  );

  return {
    ok: true,
    invoice: invoice as GuardOk["invoice"],
    daysOverdue,
  };
}

async function fetchInvoiceForReminder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  workspaceId: string,
): Promise<InvoiceForReminder | null> {
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, due_at, total, currency, workspace_id, clients!inner(name_el, name_en, email, preferred_language), matters!inner(title)",
    )
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .maybeSingle<InvoiceForReminder>();
  return data ?? null;
}

async function getAuthedWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: "unauthorized" | "no_workspace" }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!ws) return { ok: false, error: "no_workspace" };

  return { ok: true, workspaceId: ws.id };
}

// ---------------------------------------------------------------------------
// draftReminderAction — AI seam, no DB writes
// ---------------------------------------------------------------------------

/**
 * Generate the AI-drafted reminder for a single overdue invoice.
 *
 * This action is READ-ONLY against the DB — it inspects the invoice +
 * client + matter via the user-scoped Supabase client (RLS auto-scopes),
 * builds the read-only `ReminderContext` + `ReminderClientCtx` for the
 * prompt, and asks OpenRouter for a subject + body. The return shape
 * carries the recipient email so the UI does not have to re-fetch.
 *
 * The AI is given the invoice's existing total / currency / VAT-inclusive
 * amount as READ-ONLY context — `ReminderResponseSchema.strict()` rejects
 * any payload containing amount overrides, new VAT, or invoice-number
 * proposals. The server never INSERTs anything based on the AI output.
 */
export async function draftReminderAction(
  invoiceId: string,
): Promise<DraftReminderResult> {
  // 1. Input validation.
  const inputParse = DraftInput.safeParse(invoiceId);
  if (!inputParse.success) {
    return { ok: false, error: "invalid_input" };
  }

  // 2. Auth + workspace.
  const supabase = await createClient();
  const authRes = await getAuthedWorkspace(supabase);
  if (!authRes.ok) {
    return { ok: false, error: authRes.error };
  }

  // 3. RLS-scoped invoice fetch (workspace_id additionally filtered for
  // defence in depth — RLS already enforces this).
  const invoice = await fetchInvoiceForReminder(
    supabase,
    inputParse.data,
    authRes.workspaceId,
  );

  // 4. Guard rails.
  const guard = applyGuardRails(invoice);
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  // 5. Build the prompt context. ReminderContext is READ-ONLY — the AI
  // gets the existing total/currency/days_overdue but never proposes its
  // own numbers (schema enforces).
  const reminderCtx: ReminderContext = {
    invoice_number: guard.invoice.invoice_number,
    total: guard.invoice.total,
    currency: guard.invoice.currency,
    due_at: guard.invoice.due_at,
    days_overdue: guard.daysOverdue,
    matter_title: guard.invoice.matters.title,
  };

  const clientCtx: ReminderClientCtx = {
    name_el: guard.invoice.clients.name_el,
    name_en: guard.invoice.clients.name_en,
    email: guard.invoice.clients.email,
    preferred_language: guard.invoice.clients.preferred_language,
  };

  // 6. Cache-lookup key shape (mirrors `demo-cache.json` entries). The
  // normalized form is `reminder for <invoice_number> <first_name_lowercase>
  // <language>` — `normalizePrompt()` in the adapter trims+lowercases+
  // collapses whitespace, so we lowercase the first name here to match.
  const language: PreferredLanguage = guard.invoice.clients.preferred_language;
  const nameForKey =
    language === "el"
      ? guard.invoice.clients.name_el
      : guard.invoice.clients.name_en;
  const firstName = nameForKey.trim().toLowerCase().split(/\s+/).pop() ?? "";
  const text =
    "reminder for " +
    guard.invoice.invoice_number +
    " " +
    firstName +
    " " +
    language;

  // 7. Call the OpenRouter adapter in `kind: 'reminder'` mode. The
  // adapter handles DEMO_CACHE, refusal, parse_failed, no_api_key,
  // rate_limited, model_error, network — we just map to our typed
  // error union.
  const result = await callOpenRouter({
    kind: "reminder",
    text,
    contextData: {
      invoice: reminderCtx,
      client: clientCtx,
      language,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      message: result.message,
    };
  }

  return {
    ok: true,
    subject: result.subject,
    body_html: result.body_html,
    body_text: result.body_text,
    to: guard.invoice.clients.email,
  };
}

// ---------------------------------------------------------------------------
// sendReminderAction — the Resend seam, with re-validated guard rails
// ---------------------------------------------------------------------------

/**
 * Send the user-reviewed reminder email through the Resend adapter.
 *
 * Re-validates every guard rail from the draft path because state could
 * have changed between drafting and sending (the lawyer paid the
 * invoice via another tab, the client's email got nulled out, the
 * invoice got voided, etc.). A user-edited subject/body that no longer
 * has a valid recipient must NEVER hit Resend.
 *
 * After the Resend call returns success, transitions the invoice
 * `status` from `'finalized'` to `'sent'` (or no-op-updates a row
 * already in `'sent'`) so the existing `audit_invoices` AFTER UPDATE
 * trigger captures the send event in `audit_log` with full before/after
 * JSON. The Resend message ID is returned to the UI for the success
 * state; it is not persisted separately — the audit trail proves the
 * send happened, and the message ID is for the lawyer's eyeballs only.
 */
export async function sendReminderAction(
  invoiceId: string,
  subject: string,
  body_html: string,
): Promise<SendReminderResult> {
  // 1. Input validation — bound subject + body before burning a Resend
  // call slot.
  const parsed = SendInput.safeParse({ invoiceId, subject, body_html });
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  // 2. Auth + workspace.
  const supabase = await createClient();
  const authRes = await getAuthedWorkspace(supabase);
  if (!authRes.ok) {
    return { ok: false, error: authRes.error };
  }

  // 3. RLS-scoped invoice fetch — re-fetch so the guard rails see
  // current state, not the state the modal was opened with.
  const invoice = await fetchInvoiceForReminder(
    supabase,
    parsed.data.invoiceId,
    authRes.workspaceId,
  );

  // 4. Re-apply ALL guard rails.
  const guard = applyGuardRails(invoice);
  if (!guard.ok) {
    return { ok: false, error: guard.error };
  }

  // 5. HTML sanitisation — strip <script>...</script> and neutralise any
  // `on*=` event handlers. The AI never produces these (the system
  // prompt + strict schema ensure clean HTML), but a user could paste
  // one into the textarea — defence-in-depth. We do NOT pull a full DOM
  // sanitiser dependency: the body is forwarded to Resend, which renders
  // it in the recipient's email client where <script> is inert anyway,
  // and `on*=` handlers don't fire in most clients. This regex pair is
  // the belt-and-braces for paranoid review.
  const sanitisedHtml = parsed.data.body_html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+=/gi, " data-removed=");

  // 6. Plain-text fallback derived from the sanitised HTML — strip all
  // tags, collapse whitespace.
  const body_text = sanitisedHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 7. Forward to Resend. The adapter enforces the 10/min in-process
  // rate limit, email-shape validation, DEMO_CACHE gate, and typed
  // error union. We map each error to our union.
  const sendResult = await sendReminderEmail({
    to: guard.invoice.clients.email,
    subject: parsed.data.subject,
    html: sanitisedHtml,
    text: body_text,
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      error: sendResult.error,
      message: sendResult.message,
    };
  }

  // 8. Transition `status` → 'sent' so the existing `audit_invoices`
  // AFTER UPDATE trigger (Migration 004:104) captures the send event in
  // `audit_log`. If the invoice is already `'sent'` we still update so
  // the trigger fires regardless. The `.in('status', [...])` guard
  // defends against a concurrent state change between guard-rail check
  // and update (the row could have been paid/voided in the gap).
  const { data: updated, error: updErr } = await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", guard.invoice.id)
    .in("status", ["finalized", "sent"])
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (updErr || !updated || updated.length === 0) {
    // The email already went out — surface as update_failed so the UI
    // can warn the lawyer the audit row may not have been written even
    // though Resend accepted the send. Non-blocking for the demo path
    // because DEMO_CACHE returns a deterministic id without a real
    // network send, but the audit gap is worth flagging.
    return {
      ok: false,
      error: "update_failed",
      message: sendResult.id,
    };
  }

  return { ok: true, id: sendResult.id };
}
