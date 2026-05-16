/**
 * OpenRouter adapter — the single seam through which Lex's AI features
 * (NL → invoice draft, NL workspace queries) talk to a language model.
 * Phase 5 wires this into `draftFromAIAction` (Task 2) and
 * `aiQueryAction` (Task 3); this file is Task 1.
 *
 * ─── EU routing strategy ──────────────────────────────────────────────
 *
 * Primary model:   `mistralai/mistral-large-2512`
 *                  Selected because OpenRouter EU-routes Mistral by
 *                  default and Mistral's structured-output mode honours
 *                  JSON Schema. Acceptable latency + EU data residency.
 * Fallback model:  `anthropic/claude-3.5-haiku`
 *                  Tried ONCE if the primary returns HTTP 5xx. We do
 *                  NOT fall back on 4xx (those are our bugs — bad JSON
 *                  schema, malformed request) and we do NOT fall back
 *                  on `refusal` (the model deliberately declined; a
 *                  second model would just refuse again or, worse,
 *                  comply with an unsafe prompt).
 *
 * ─── Refusal is terminal ──────────────────────────────────────────────
 *
 * If `choices[0].message.refusal` is non-null (OpenAI-compatible
 * structured-output spec), we return `{ ok: false, error: 'refusal' }`
 * immediately with NO retry and NO fallback. Refusals are a deliberate
 * safety signal from the model — retrying defeats the point.
 *
 * ─── DEMO_CACHE gate ──────────────────────────────────────────────────
 *
 * Set `DEMO_CACHE=true` to short-circuit the network and return a
 * pre-baked response from `demo-cache.json`. This is the production
 * fallback for the pitch demo (zero API spend, deterministic latency,
 * survives an offline laptop). It is NOT a mock-for-now stub — it ships
 * because demos run in unreliable network conditions and a single
 * wifi-drop should not torpedo the conversion moment.
 *
 * If `DEMO_CACHE=true` AND the normalized prompt matches a cache entry,
 * we return the cached value. Otherwise we fall through to the live API
 * path (whether DEMO_CACHE is set or not).
 *
 * If neither path is available (`DEMO_CACHE` off OR no cache hit, AND
 * `OPENROUTER_API_KEY` unset), we return `{ ok: false, error: 'no_api_key' }`
 * — never a silent failure, never a stub response.
 *
 * ─── Write-guard contract (THE Phase 5 hard rule) ─────────────────────
 *
 * The AI proposes a DRAFT. It does not allocate invoice numbers, does
 * not compute VAT, does not write to the fiduciary ledger. Enforcement:
 *
 *   1. `InvoiceDraftSchema` is declared with `.strict()`. Any payload
 *      containing `vat_rate`, `vat_amount`, `total`, `invoice_number`,
 *      or any other unknown key fails `safeParse`. The schema returns
 *      `parse_failed`; no row is ever inserted.
 *   2. The system prompt (see `prompts.ts → buildDraftSystemPrompt`)
 *      states the rule in plain English so the model does not even
 *      propose those fields. Defense in depth — the strict schema is
 *      the contract; the prompt is a reminder.
 *   3. Task 2's `draftFromAIAction` recomputes totals server-side via
 *      `lib/totals.ts::computeTotalsFromItems`. Even if some future
 *      refactor accidentally relaxed `.strict()`, the action would
 *      overwrite any AI-supplied total before INSERT.
 *
 * No service-role import here. No fiduciary-ledger reference anywhere
 * in this directory. Verified by Phase 5 grep contracts (this adapter
 * is pure — Server Actions in Task 2 are the only DB-write seam).
 */

import { z } from "zod";
import demoCacheRaw from "./demo-cache.json" with { type: "json" };
import type {
  CallArgs,
  CallResult,
  ClientCtx,
  DemoCache,
  DemoCacheEntry,
  InvoiceDraftInput,
  MatterCtx,
  OpenRouterError,
  ReminderClientCtx,
  ReminderContext,
  WorkspaceSummary,
} from "./types";
import {
  buildDraftSystemPrompt,
  buildQuerySystemPrompt,
  buildReminderSystemPrompt,
} from "./prompts";

// ---------------------------------------------------------------------------
// Constants — model IDs, endpoints, headers
// ---------------------------------------------------------------------------

const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";

// Primary: Mistral Large (EU-routed by OpenRouter, structured-output capable).
const PRIMARY_MODEL = "mistralai/mistral-large-2512";

// Fallback: Claude Haiku — tried ONCE on a 5xx from Mistral, never on 4xx,
// never on refusal.
const FALLBACK_MODEL = "anthropic/claude-3.5-haiku";

// OpenRouter requires `HTTP-Referer` + `X-Title` headers to attribute the
// request. We fill `HTTP-Referer` from the Vercel URL in production, and
// fall back to localhost for local dev.
const REFERER =
  process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

const APP_TITLE = "Lex";

// Permissive UUID-shape regex. The seed corpus uses deterministic
// non-v4 placeholder UUIDs like `00000000-0000-0000-0000-0000000a0001`
// — strict `z.uuid()` (v4-only) would reject them. Mirrors the regex
// used in `src/app/(workspace)/invoices/actions.ts`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Zod schema — the strict boundary that makes AI-proposed VAT impossible
// ---------------------------------------------------------------------------

/**
 * The shape the AI is permitted to propose. `.strict()` is LOAD-BEARING
 * — without it, the AI could append `vat_rate: 0.1` and the parse would
 * silently succeed. With it, ANY extra key (vat_rate, vat_amount,
 * invoice_number, total, currency, etc.) triggers a Zod failure that
 * the adapter surfaces as `{ ok: false, error: 'parse_failed' }`.
 *
 * The line-item bounds (1-20 items, description 1-512 chars, positive
 * quantity/unit_price, due_days 0-365) bound the worst case so a
 * runaway model cannot inject a billion-line invoice.
 */
export const InvoiceDraftSchema = z
  .object({
    client_id: z.string().regex(UUID_RE, { message: "invalid_client_id" }),
    matter_id: z.string().regex(UUID_RE, { message: "invalid_matter_id" }),
    line_items: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(512),
            quantity: z.number().positive(),
            unit_price: z.number().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    due_days: z.number().int().min(0).max(365),
  })
  .strict();

// ---------------------------------------------------------------------------
// JSON-schema hand-translation (for OpenRouter's `response_format`)
// ---------------------------------------------------------------------------

/**
 * Hand-rolled JSON Schema mirror of `InvoiceDraftSchema`. We could pull
 * `zod-to-json-schema` as a dep, but for one schema that fits in 30
 * lines it is simpler to inline — fewer moving parts at the seam, no
 * runtime cost on every adapter call, no dep-skew risk if zod-to-json
 * stops tracking Zod v4. If the Zod schema above changes, update this
 * function in the same commit.
 *
 * `additionalProperties: false` at every object level is the JSON-Schema
 * equivalent of Zod's `.strict()` — OpenRouter forwards this to the
 * model's structured-output enforcement so the model is told "do not
 * emit extra keys" at decode time, not just at our parse time.
 */
function zodToJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["client_id", "matter_id", "line_items", "due_days"],
    properties: {
      client_id: { type: "string", pattern: UUID_RE.source },
      matter_id: { type: "string", pattern: UUID_RE.source },
      line_items: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "quantity", "unit_price"],
          properties: {
            description: { type: "string", minLength: 1, maxLength: 512 },
            quantity: { type: "number", exclusiveMinimum: 0 },
            unit_price: { type: "number", exclusiveMinimum: 0 },
          },
        },
      },
      due_days: { type: "integer", minimum: 0, maximum: 365 },
    },
  };
}

// ---------------------------------------------------------------------------
// Reminder schema (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Strict Zod schema for the reminder response. Mirrors the
 * `InvoiceDraftSchema.strict()` defense-in-depth pattern: any extra key
 * (amount_override, new_total, vat_rate, invoice_number, etc.) fails
 * `safeParse` and the adapter returns `{ ok: false, error:
 * 'parse_failed' }`. The bounds (subject ≤ 200, body ≤ 8000) bound the
 * worst case so a runaway model cannot inject a megabyte of HTML.
 */
export const ReminderResponseSchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    body_html: z.string().trim().min(1).max(8000),
    body_text: z.string().trim().min(1).max(8000),
  })
  .strict();

/**
 * Hand-rolled JSON Schema mirror of `ReminderResponseSchema`. Same
 * argument as `zodToJsonSchema`: one schema, 25 lines, no dep-skew risk
 * from zod-to-json-schema chasing Zod v4. `additionalProperties: false`
 * is the JSON-Schema equivalent of `.strict()` and is forwarded to the
 * model's structured-output enforcement at decode time.
 */
function reminderJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["subject", "body_html", "body_text"],
    properties: {
      subject: { type: "string", minLength: 1, maxLength: 200 },
      body_html: { type: "string", minLength: 1, maxLength: 8000 },
      body_text: { type: "string", minLength: 1, maxLength: 8000 },
    },
  };
}

// ---------------------------------------------------------------------------
// Demo cache helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a free-text prompt to a cache-lookup key. Aggressive on
 * punctuation + casing + whitespace so the demo cache survives the
 * typical typing variations on the pitch laptop — `who's overdue?`,
 * `Who is overdue`, `who is overdue ?` all collapse to the same key.
 */
function normalizePrompt(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B'`]/g, "")
    .replace(/[?.!,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Re-key cache entries through the same normalizer so the JSON file can
// keep human-readable keys (with apostrophes and question marks) while
// the lookup tolerates variation.
const demoCache: DemoCache = Object.fromEntries(
  Object.entries(demoCacheRaw as DemoCache).map(([k, v]) => [
    normalizePrompt(k),
    v,
  ]),
) as DemoCache;

function lookupCache(text: string): DemoCacheEntry | undefined {
  return demoCache[normalizePrompt(text)];
}

// ---------------------------------------------------------------------------
// OpenRouter HTTP call (single attempt for one model)
// ---------------------------------------------------------------------------

interface OpenRouterChoice {
  message: {
    content?: string | null;
    refusal?: string | null;
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
}

interface SingleCallResult {
  status: number;
  body: OpenRouterResponse | null;
  refusal: string | null;
  content: string | null;
  networkError: boolean;
}

async function callModelOnce(
  model: string,
  systemPrompt: string,
  userText: string,
  apiKey: string,
  responseFormat: Record<string, unknown> | undefined,
): Promise<SingleCallResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "X-Title": APP_TITLE,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });
  } catch {
    return {
      status: 0,
      body: null,
      refusal: null,
      content: null,
      networkError: true,
    };
  }

  let body: OpenRouterResponse | null = null;
  try {
    body = (await response.json()) as OpenRouterResponse;
  } catch {
    body = null;
  }

  const choice = body?.choices?.[0]?.message;
  const refusal =
    typeof choice?.refusal === "string" && choice.refusal.length > 0
      ? choice.refusal
      : null;
  const content =
    typeof choice?.content === "string" && choice.content.length > 0
      ? choice.content
      : null;

  return {
    status: response.status,
    body,
    refusal,
    content,
    networkError: false,
  };
}

// ---------------------------------------------------------------------------
// Public entry — callOpenRouter<K>
// ---------------------------------------------------------------------------

/**
 * Call the OpenRouter chat-completions endpoint with the appropriate
 * system prompt + response format for the given kind ('draft' | 'query').
 *
 * Order of operations:
 *   1. Normalize the prompt.
 *   2. If `DEMO_CACHE=true` AND cache has the prompt, return cached
 *      entry (translated to `CallResult<K>`).
 *   3. If no API key is set, return `{ ok: false, error: 'no_api_key' }`.
 *   4. POST to OpenRouter with the primary model.
 *   5. If refusal: return `'refusal'` with NO retry.
 *   6. If 5xx: retry ONCE with the fallback model. If that also fails,
 *      return `'model_error'`.
 *   7. If 429: return `'rate_limited'`.
 *   8. If 4xx (other): return `'model_error'`.
 *   9. If network error: return `'network'`.
 *   10. Parse the content as JSON, run through `InvoiceDraftSchema`
 *       (draft path) or return as text (query path). On parse failure,
 *       return `'parse_failed'`.
 */
export async function callOpenRouter<
  K extends "draft" | "query" | "reminder",
>(args: CallArgs & { kind: K }): Promise<CallResult<K>> {
  // ─── 1. Cache check ───────────────────────────────────────────────
  const cached = lookupCache(args.text);
  if (process.env.DEMO_CACHE === "true" && cached) {
    return translateCacheEntry<K>(args.kind, cached);
  }

  // ─── 2. API-key check ─────────────────────────────────────────────
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return {
      ok: false,
      error: "no_api_key",
    } as CallResult<K>;
  }

  // ─── 3. Build prompt + response_format for the kind ───────────────
  let systemPrompt: string;
  let responseFormat: Record<string, unknown> | undefined;

  if (args.kind === "draft") {
    const draftArgs = args as CallArgs & { kind: "draft" };
    systemPrompt = buildDraftSystemPrompt(
      draftArgs.contextData.clients,
      draftArgs.contextData.matters,
    );
    responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "InvoiceDraft",
        strict: true,
        schema: zodToJsonSchema(),
      },
    };
  } else if (args.kind === "reminder") {
    const reminderArgs = args as CallArgs & { kind: "reminder" };
    systemPrompt = buildReminderSystemPrompt(
      reminderArgs.contextData.invoice,
      reminderArgs.contextData.client,
      reminderArgs.contextData.language,
    );
    responseFormat = {
      type: "json_schema",
      json_schema: {
        name: "ReminderResponse",
        strict: true,
        schema: reminderJsonSchema(),
      },
    };
  } else {
    const queryArgs = args as CallArgs & { kind: "query" };
    systemPrompt = buildQuerySystemPrompt(
      queryArgs.contextData.workspaceSummary,
    );
    // Query path returns prose — no structured-output enforcement.
    responseFormat = undefined;
  }

  // ─── 4. Primary call (Mistral) ────────────────────────────────────
  let attempt = await callModelOnce(
    PRIMARY_MODEL,
    systemPrompt,
    args.text,
    apiKey,
    responseFormat,
  );

  // ─── 5. Refusal — terminal, no retry, no fallback ─────────────────
  if (attempt.refusal) {
    return {
      ok: false,
      error: "refusal",
      message: attempt.refusal,
    } as CallResult<K>;
  }

  // ─── 6. Fallback on 5xx ONLY ──────────────────────────────────────
  if (attempt.status >= 500 && attempt.status < 600) {
    attempt = await callModelOnce(
      FALLBACK_MODEL,
      systemPrompt,
      args.text,
      apiKey,
      responseFormat,
    );

    // Re-check refusal on the fallback (still no retry past this).
    if (attempt.refusal) {
      return {
        ok: false,
        error: "refusal",
        message: attempt.refusal,
      } as CallResult<K>;
    }
  }

  // ─── 7. Network error (covers both attempts) ──────────────────────
  if (attempt.networkError) {
    return {
      ok: false,
      error: "network",
    } as CallResult<K>;
  }

  // ─── 8. HTTP error classification ─────────────────────────────────
  if (attempt.status === 429) {
    return {
      ok: false,
      error: "rate_limited",
    } as CallResult<K>;
  }
  if (attempt.status < 200 || attempt.status >= 300) {
    return {
      ok: false,
      error: "model_error",
    } as CallResult<K>;
  }

  // ─── 9. Empty content → parse_failed ──────────────────────────────
  if (!attempt.content) {
    return {
      ok: false,
      error: "parse_failed",
    } as CallResult<K>;
  }

  // ─── 10. Kind-specific decode ─────────────────────────────────────
  if (args.kind === "draft") {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(attempt.content);
    } catch {
      return {
        ok: false,
        error: "parse_failed",
      } as CallResult<K>;
    }

    const safe = InvoiceDraftSchema.safeParse(parsedJson);
    if (!safe.success) {
      return {
        ok: false,
        error: "parse_failed",
      } as CallResult<K>;
    }

    return {
      ok: true,
      draft: safe.data,
    } as CallResult<K>;
  }

  if (args.kind === "reminder") {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(attempt.content);
    } catch {
      return {
        ok: false,
        error: "parse_failed",
      } as CallResult<K>;
    }

    const safe = ReminderResponseSchema.safeParse(parsedJson);
    if (!safe.success) {
      return {
        ok: false,
        error: "parse_failed",
      } as CallResult<K>;
    }

    return {
      ok: true,
      subject: safe.data.subject,
      body_html: safe.data.body_html,
      body_text: safe.data.body_text,
    } as CallResult<K>;
  }

  // Query path — prose response.
  return {
    ok: true,
    text: attempt.content,
  } as CallResult<K>;
}

// ---------------------------------------------------------------------------
// Cache entry translation
// ---------------------------------------------------------------------------

function translateCacheEntry<K extends "draft" | "query" | "reminder">(
  kind: K,
  entry: DemoCacheEntry,
): CallResult<K> {
  if (entry.kind === "refusal") {
    return {
      ok: false,
      error: "refusal",
      message: entry.message,
    } as CallResult<K>;
  }

  if (kind === "draft" && entry.kind === "draft") {
    // Run through Zod just like the live path — same guarantees apply.
    const safe = InvoiceDraftSchema.safeParse(entry.draft);
    if (!safe.success) {
      return {
        ok: false,
        error: "parse_failed",
      } as CallResult<K>;
    }
    return {
      ok: true,
      draft: safe.data,
    } as CallResult<K>;
  }

  if (kind === "query" && entry.kind === "query") {
    return {
      ok: true,
      text: entry.text,
    } as CallResult<K>;
  }

  if (kind === "reminder" && entry.kind === "reminder") {
    // Same defense-in-depth as the live reminder path — the cache file
    // is hand-edited, so the strict schema also guards against
    // hand-written extra keys creeping into demo-cache.json.
    const safe = ReminderResponseSchema.safeParse({
      subject: entry.subject,
      body_html: entry.body_html,
      body_text: entry.body_text,
    });
    if (!safe.success) {
      return {
        ok: false,
        error: "parse_failed",
      } as CallResult<K>;
    }
    return {
      ok: true,
      subject: safe.data.subject,
      body_html: safe.data.body_html,
      body_text: safe.data.body_text,
    } as CallResult<K>;
  }

  // Cache shape mismatched the requested kind — surface as parse_failed.
  return {
    ok: false,
    error: "parse_failed",
  } as CallResult<K>;
}

// ---------------------------------------------------------------------------
// Re-exports for sibling tasks (Wave 2)
// ---------------------------------------------------------------------------

export { normalizePrompt };
export type {
  CallArgs,
  CallResult,
  ClientCtx,
  InvoiceDraftInput,
  MatterCtx,
  OpenRouterError,
  ReminderClientCtx,
  ReminderContext,
  WorkspaceSummary,
};
