/**
 * Types shared across the OpenRouter adapter (`client.ts`), prompts
 * (`prompts.ts`), and downstream consumers (Server Actions, Task 2/3/4).
 *
 * This file is intentionally pure — no runtime code, no imports of any
 * runtime module. The Zod schema lives in `client.ts`; this file only
 * surfaces the inferred types and the typed error union the adapter
 * returns.
 *
 * Hard rule (Phase 5):
 *   The AI never proposes `vat_rate`, `vat_amount`, `total`, or
 *   `invoice_number`. Those fields are SERVER-COMPUTED in
 *   `draftFromAIAction` (Task 2) via `computeTotalsFromItems` from
 *   `lib/totals.ts`. The Zod schema in `client.ts` rejects any payload
 *   that contains those keys via `.strict()` — defense in depth on top of
 *   the prompt instructions.
 */

import type { PreferredLanguage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Error union — returned by `callOpenRouter` on any non-success path.
// ---------------------------------------------------------------------------

export type OpenRouterError =
  | "no_api_key" // OPENROUTER_API_KEY missing AND no cache hit
  | "refusal" // model returned a populated `refusal` field (no retry)
  | "parse_failed" // model returned content that fails InvoiceDraftSchema
  | "rate_limited" // HTTP 429 from OpenRouter
  | "network" // fetch threw (DNS, timeout, TLS, etc.)
  | "model_error"; // 4xx/5xx after fallback exhausted

// ---------------------------------------------------------------------------
// Draft input — the shape the AI is permitted to propose. Mirrors the
// Zod `InvoiceDraftSchema` in `client.ts`. Crucially NO vat_*, total, or
// invoice_number keys — Zod `.strict()` rejects those.
// ---------------------------------------------------------------------------

export interface InvoiceDraftLineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceDraftInput {
  client_id: string;
  matter_id: string;
  line_items: InvoiceDraftLineItem[];
  due_days: number;
}

// ---------------------------------------------------------------------------
// Query path — the AI receives a pre-aggregated workspace summary and
// answers in natural language only. No SQL is generated.
// ---------------------------------------------------------------------------

export interface AIQueryAnswer {
  text: string;
}

// ---------------------------------------------------------------------------
// Context shapes passed into the prompt builders. Kept narrow so we do
// not leak unrelated workspace data to the model.
// ---------------------------------------------------------------------------

export interface ClientCtx {
  id: string;
  name_el: string;
  name_en: string;
  preferred_language?: PreferredLanguage;
}

export interface MatterCtx {
  id: string;
  client_id: string;
  matter_number: string;
  title: string;
}

/**
 * Workspace summary for the query path. Pre-aggregated server-side via
 * RLS-scoped SELECTs in `queries.ts` (Task 3). The model receives ONLY
 * these aggregates — never raw rows, never client-funds data.
 */
export interface WorkspaceSummary {
  counts_by_status: {
    draft: number;
    finalized: number;
    sent: number;
    paid: number;
    void: number;
  };
  totals_by_status: {
    draft: string;
    finalized: string;
    sent: string;
    paid: string;
    void: string;
  };
  recent_invoices: Array<{
    invoice_number: string | null;
    client_name: string;
    total: string;
    status: string;
    issued_at: string | null;
    due_at: string | null;
    days_overdue: number;
  }>;
}

// ---------------------------------------------------------------------------
// Call args + result. `CallResult<K>` is a discriminated union on success
// vs failure; on success the payload differs by `kind`.
// ---------------------------------------------------------------------------

export interface DraftCallArgs {
  kind: "draft";
  text: string;
  contextData: {
    clients: ClientCtx[];
    matters: MatterCtx[];
  };
}

export interface QueryCallArgs {
  kind: "query";
  text: string;
  contextData: {
    workspaceSummary: WorkspaceSummary;
  };
}

export type CallArgs = DraftCallArgs | QueryCallArgs;

export type CallResult<K extends "draft" | "query"> = K extends "draft"
  ?
      | { ok: true; draft: InvoiceDraftInput }
      | { ok: false; error: OpenRouterError; message?: string }
  :
      | { ok: true; text: string }
      | { ok: false; error: OpenRouterError; message?: string };

// ---------------------------------------------------------------------------
// Demo cache shape — the JSON map keyed by normalized prompt. Three
// entry kinds: a cached draft success, a cached query answer, or a
// cached refusal (used by Task 4's adversarial corpus).
// ---------------------------------------------------------------------------

export type DemoCacheEntry =
  | { kind: "draft"; draft: InvoiceDraftInput }
  | { kind: "query"; text: string }
  | { kind: "refusal"; message: string };

export type DemoCache = Record<string, DemoCacheEntry>;
