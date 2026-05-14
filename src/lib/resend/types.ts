/**
 * Types for the Resend transactional-email adapter.
 *
 * This file is intentionally pure — no runtime imports, no SDK pulls. The
 * adapter (`client.ts`) is the only file in this directory that imports
 * the `resend` package. Downstream consumers (the aging-report reminder
 * send flow in Wave 2) import types from here and call `sendReminderEmail`
 * from `client.ts`.
 *
 * Hard rule (Phase 6):
 *   The Resend adapter has no business touching the fiduciary ledger or
 *   the service-role bridge. Reminders describe existing finalized
 *   invoices — the AI prompt enforces it, the Zod reminder schema
 *   enforces it, and this types module imports neither the ledger
 *   relation nor the elevated-key path.
 */
import type { PreferredLanguage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Adapter call shape — what upstream passes to `sendReminderEmail`
// ---------------------------------------------------------------------------

/**
 * Arguments accepted by `sendReminderEmail`. `from` is optional; when
 * unset the adapter defaults to Resend's sandbox sender
 * (`onboarding@resend.dev`) so the demo works without DNS verification.
 * Task 6 documents the production swap to a verified domain.
 */
export interface ResendSendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer | string }>;
  from?: string;
}

// ---------------------------------------------------------------------------
// Error union — typed, exhaustive, surfaced to the UI as i18n keys
// ---------------------------------------------------------------------------

/**
 * Typed error union for every non-success path.
 *
 *   no_api_key      — neither DEMO_CACHE=true nor RESEND_API_KEY is set
 *   rate_limited    — in-process rolling 60s window (10 sends max)
 *   invalid_email   — `to` failed the email-shape regex
 *   network         — fetch threw (DNS, TLS, timeout)
 *   provider_error  — Resend API returned an error envelope
 *
 * Each maps to one i18n key under `reminders.error*` in messages/.
 */
export type ResendError =
  | "no_api_key"
  | "rate_limited"
  | "invalid_email"
  | "network"
  | "provider_error";

/**
 * Discriminated-union result. `id` on success is either the Resend message
 * ID (live path) or a deterministic `demo-cached-<sha256-prefix>` (cache
 * gate). `message` on failure carries the provider's message text for
 * logging — NOT for end-user display (the UI shows the i18n string keyed
 * on `error`).
 */
export type ResendSendResult =
  | { ok: true; id: string }
  | { ok: false; error: ResendError; message?: string };

// ---------------------------------------------------------------------------
// Reminder payload — what the upstream aging-report flow builds before
// handing it to the adapter. The adapter does NOT decide subject/body
// text — the OpenRouter `kind: 'reminder'` mode + the user's edits in the
// review modal produce this shape, then we pass it straight through to
// `sendReminderEmail`.
// ---------------------------------------------------------------------------

export interface ReminderEmailPayload {
  to: string;
  subject: string;
  body_html: string;
  body_text: string;
  language: PreferredLanguage;
  // Trace fields — useful for logs, never sent over the wire.
  invoice_number: string;
  client_name: string;
}
