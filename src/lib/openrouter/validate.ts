/**
 * Pure validation pipeline for AI-proposed invoice drafts.
 *
 * Extracted from `src/app/(workspace)/invoices/actions.ts → draftFromAIAction`
 * (Phase 5 gap closure cycle 1) so that:
 *
 *   1. The `tests/ai-injection.mjs` adversarial sweep can exercise the
 *      validator directly — without spinning up the Server Action's
 *      HTTP boundary (`'use server'`), auth, Supabase client, or cookies.
 *      The action wraps this validator with IO; the validator itself is
 *      referentially transparent.
 *   2. Behavior is identical to the inline pipeline that previously lived
 *      in `draftFromAIAction` lines 961–1000 (verified prior to extraction).
 *      Six guards in this order:
 *         (a) FORBIDDEN_DRAFT_KEYS — outer object
 *         (b) FORBIDDEN_DRAFT_KEYS — per line item
 *         (c) `InvoiceDraftSchema.safeParse` reparse (defense-in-depth)
 *         (d) client lookup (client_id ∈ provided clients)
 *         (e) matter lookup (matter_id ∈ provided matters)
 *         (f) cross-client pairing (matter.client_id === draft.client_id)
 *   3. The Server Action remains thin: it does auth + workspace lookup,
 *      fetches the RLS-scoped clients/matters, calls `callOpenRouter`,
 *      then delegates the entire validation step to this function.
 *
 * This mirrors the Phase 4 `lib/totals.ts` extraction pattern — pure
 * functions live next to the strict Zod boundary; Server Actions wrap
 * them with IO. Same architectural primitive, same payoff (testability).
 *
 * No I/O. No Supabase client. No `cookies()`. No environment reads.
 * Adding any of those to this file is a bug.
 */

import { InvoiceDraftSchema } from "./client";
import type { InvoiceDraftInput } from "./types";

/**
 * Keys the AI is NEVER permitted to propose. The Zod schema in
 * `client.ts` is `.strict()`, which already rejects unknown keys — this
 * list is the defense-in-depth assertion the action used to perform
 * inline. We keep it as a separate guard so a future refactor that
 * accidentally relaxes `.strict()` is still caught here before any
 * INSERT touches the database.
 */
const FORBIDDEN_DRAFT_KEYS: ReadonlyArray<string> = [
  "vat_rate",
  "vat_amount",
  "total",
  "invoice_number",
];

/**
 * Minimum shape the validator needs from a client row. Narrow on purpose
 * — the validator does not care about names, language preferences, VAT
 * numbers, or any other client column. Server Actions pass the full row
 * shape they fetched; structural typing makes it compatible.
 */
export interface ClientRow {
  id: string;
}

/**
 * Minimum shape the validator needs from a matter row. We require
 * `client_id` so the cross-client pairing guard (matter.client_id !==
 * draft.client_id → unknown_matter) can run without an extra DB hop.
 */
export interface MatterRow {
  id: string;
  client_id: string;
}

/**
 * The discriminated union returned by `validateAIDraftCandidate`. The
 * error codes are the exact subset of `DraftFromAIResult` codes that
 * the inline validation block could produce — `parse_failed`,
 * `unknown_client`, `unknown_matter`. Other action-level codes
 * (`refusal`, `no_api_key`, `insert_failed`, `no_workspace`,
 * `invalid_input`) are produced by the Server Action wrapper, never by
 * this pure function.
 */
export type ValidateResult =
  | { ok: true; draft: InvoiceDraftInput }
  | {
      ok: false;
      error: "parse_failed" | "unknown_client" | "unknown_matter";
    };

/**
 * Validate an AI-proposed draft candidate against the strict schema and
 * the caller-supplied workspace context. Pure function.
 *
 * Order of guards is significant and matches the prior inline block:
 *   1. Outer FORBIDDEN_DRAFT_KEYS — reject any leaked write-protected key.
 *   2. Per-line-item FORBIDDEN_DRAFT_KEYS — same rule, applied inside.
 *   3. `InvoiceDraftSchema.safeParse` — re-validate via the canonical
 *      Zod schema. Cache-path and live-path payloads both go through
 *      `safeParse` upstream in `callOpenRouter`; this is a third pass to
 *      catch drift between the adapter and the action.
 *   4. Client lookup — the AI's `client_id` must reference a known
 *      client in this workspace (RLS already scoped the list).
 *   5. Matter lookup — same rule for `matter_id`.
 *   6. Cross-client pairing — the matter must belong to the proposed
 *      client. This is the guard that catches the AI proposing
 *      Andreou + Konstantinou's matter (or any other cross-client
 *      payload) BEFORE we insert.
 */
export function validateAIDraftCandidate(
  parsed: unknown,
  clients: ReadonlyArray<ClientRow>,
  matters: ReadonlyArray<MatterRow>,
): ValidateResult {
  // Guard 1 — outer forbidden keys. Reject `vat_rate`, `vat_amount`,
  // `total`, `invoice_number` at the top level.
  if (parsed !== null && typeof parsed === "object") {
    for (const key of FORBIDDEN_DRAFT_KEYS) {
      if (
        Object.prototype.hasOwnProperty.call(
          parsed as Record<string, unknown>,
          key,
        )
      ) {
        return { ok: false, error: "parse_failed" };
      }
    }
  }

  // Guard 2 — per-line-item forbidden keys. Mirror the outer assertion
  // at the line-item level. The schema already rejects unknown keys on
  // items via inner .strict(), so this is again defense in depth.
  const maybeItems = (parsed as { line_items?: unknown } | null)?.line_items;
  if (Array.isArray(maybeItems)) {
    for (const item of maybeItems) {
      if (item !== null && typeof item === "object") {
        for (const key of FORBIDDEN_DRAFT_KEYS) {
          if (
            Object.prototype.hasOwnProperty.call(
              item as Record<string, unknown>,
              key,
            )
          ) {
            return { ok: false, error: "parse_failed" };
          }
        }
      }
    }
  }

  // Guard 3 — canonical Zod reparse. Any drift between adapter + action
  // surfaces as parse_failed rather than corrupting an INSERT.
  const reparse = InvoiceDraftSchema.safeParse(parsed);
  if (!reparse.success) {
    return { ok: false, error: "parse_failed" };
  }
  const draft = reparse.data;

  // Guard 4 — client_id must be a known client in this workspace.
  const matchedClient = clients.find((c) => c.id === draft.client_id);
  if (!matchedClient) {
    return { ok: false, error: "unknown_client" };
  }

  // Guard 5 — matter_id must be a known matter in this workspace.
  const matchedMatter = matters.find((m) => m.id === draft.matter_id);
  if (!matchedMatter) {
    return { ok: false, error: "unknown_matter" };
  }

  // Guard 6 — cross-client pairing. The matter must belong to the
  // proposed client. Different code, same error bucket as Guard 5 —
  // the user-facing "unknown_matter" message covers both cases.
  if (matchedMatter.client_id !== draft.client_id) {
    return { ok: false, error: "unknown_matter" };
  }

  return { ok: true, draft };
}
