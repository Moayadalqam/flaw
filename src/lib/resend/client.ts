/**
 * Resend adapter — the single seam through which Lex sends transactional
 * reminder emails. Phase 6 wires this into the aging-report "send
 * reminder" flow (Task 4); this file is Task 1.
 *
 * ─── DEMO_CACHE gate ──────────────────────────────────────────────────
 *
 * Set `DEMO_CACHE=true` to short-circuit the network and return a
 * deterministic `demo-cached-<sha256-prefix>` ID derived from
 * `to|subject|html`. Mirrors the OpenRouter adapter pattern (see
 * `src/lib/openrouter/client.ts` Phase 5 docblock) — the cache exists
 * because the pitch demo runs on an unreliable network and a wifi-drop
 * should not torpedo the conversion moment. It is NOT a "mock for now"
 * stub; it ships as a load-bearing deterministic fallback.
 *
 * ─── In-process rate limit ────────────────────────────────────────────
 *
 * A rolling 60-second window with a 10-per-minute ceiling guards the
 * Resend free-tier quota (100/day; 2/sec burst). The 11th call within
 * 60s returns `{ ok: false, error: 'rate_limited' }` immediately,
 * before any HTTP work. See `./rate-limiter.ts`.
 *
 * ─── Typed error union ────────────────────────────────────────────────
 *
 *   no_api_key      RESEND_API_KEY unset and DEMO_CACHE not enabled
 *   rate_limited    10/min ceiling tripped
 *   invalid_email   `to` failed the email-shape regex
 *   network         fetch threw (DNS, TLS, timeout)
 *   provider_error  Resend returned an error envelope
 *
 * Each maps 1-1 to an i18n key under `reminders.error*` for UI display.
 *
 * ─── No retry policy ──────────────────────────────────────────────────
 *
 * Resend reminder sends are user-initiated (the lawyer clicks "Send"
 * after reviewing the AI-drafted body). Resend's idempotency-key support
 * is not enabled on the free tier, so a blind retry on transient failure
 * risks duplicate-delivery. We surface the error to the user and let
 * them retry deliberately. This is the right default for a single-tenant
 * lawyer demo; revisit when bulk-send volumes grow past dozens/day.
 *
 * ─── Security invariants ──────────────────────────────────────────────
 *
 * No elevated-key import anywhere in this directory. No fiduciary-
 * ledger reference. The adapter receives plain string fields and
 * forwards them to Resend — it does not query the database.
 * Workspace-scoped auth + RLS happen one layer up in the Server Action
 * that builds the payload.
 */

import { createHash } from "node:crypto";
import { Resend } from "resend";
import { tryAcquire } from "./rate-limiter";
import type {
  ResendSendArgs,
  ResendSendResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default sender. Resend's `onboarding@resend.dev` sandbox accepts mail
 * with no DNS verification — works out-of-the-box for the demo. Task 6
 * documents the production swap to `lex@<verified-domain>`.
 */
const DEFAULT_FROM = "Lex <onboarding@resend.dev>";

/**
 * RFC-5322-compatible-enough email regex. Not a full parser — we accept
 * `user@host.tld` shapes and reject anything obviously malformed before
 * burning a Resend API call (which costs both quota and rate-limit
 * window). Mirrors the regex in `src/app/(auth)/login/actions.ts`.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a stable demo-mode message ID from the message contents. The
 * hash makes the cached return-value deterministic per (to, subject,
 * html) triple so tests can assert exact IDs without faking time. The
 * 16-char prefix is enough entropy for human eyeballs to distinguish
 * cached IDs across logged invocations.
 */
function deterministicId(args: ResendSendArgs): string {
  const fingerprint = `${args.to}|${args.subject}|${args.html}`;
  const digest = createHash("sha256").update(fingerprint).digest("hex");
  return `demo-cached-${digest.slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Public entry — sendReminderEmail
// ---------------------------------------------------------------------------

/**
 * Send a transactional reminder email through Resend.
 *
 * Order of operations (each gate fails fast):
 *
 *   1. Email-shape validation. Cheapest check; runs before rate limit so
 *      a typo'd recipient does not consume the 10/min budget.
 *   2. Rate-limit acquire. `tryAcquire()` is pure; on failure we return
 *      immediately with `rate_limited` — no HTTP work.
 *   3. DEMO_CACHE gate. If `process.env.DEMO_CACHE === 'true'` we
 *      synthesize a deterministic ID and return success without touching
 *      the network. This is the offline-pitch fallback.
 *   4. API-key gate. If `RESEND_API_KEY` is unset we return `no_api_key`
 *      — never a silent stub.
 *   5. Live Resend call. Errors map to `provider_error` (the SDK's
 *      `{ error: { message } }` envelope) or `network` (a thrown fetch).
 *
 * No retry. See file docblock.
 */
export async function sendReminderEmail(
  args: ResendSendArgs,
): Promise<ResendSendResult> {
  // ─── 1. Email-shape validation ────────────────────────────────────
  if (!EMAIL_RE.test(args.to)) {
    return { ok: false, error: "invalid_email" };
  }

  // ─── 2. Rate-limit acquire ────────────────────────────────────────
  if (!tryAcquire()) {
    return { ok: false, error: "rate_limited" };
  }

  // ─── 3. DEMO_CACHE gate ───────────────────────────────────────────
  if (process.env.DEMO_CACHE === "true") {
    return { ok: true, id: deterministicId(args) };
  }

  // ─── 4. API-key gate ──────────────────────────────────────────────
  const key = process.env.RESEND_API_KEY;
  if (!key || key.length === 0) {
    return { ok: false, error: "no_api_key" };
  }

  // ─── 5. Live call ─────────────────────────────────────────────────
  try {
    const { data, error } = await new Resend(key).emails.send({
      from: args.from ?? DEFAULT_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments: args.attachments,
    });

    if (error) {
      return {
        ok: false,
        error: "provider_error",
        message: error.message,
      };
    }

    if (!data?.id) {
      return {
        ok: false,
        error: "provider_error",
        message: "no_id_in_response",
      };
    }

    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      error: "network",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Re-exports for sibling tasks
// ---------------------------------------------------------------------------

export type {
  ReminderEmailPayload,
  ResendError,
  ResendSendArgs,
  ResendSendResult,
} from "./types";
