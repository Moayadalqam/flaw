"use server";

/**
 * Server Actions for the Lex AI command bar.
 *
 * Two entry points:
 *
 *   `aiDispatchAction(text)` — the single seam called from CommandBar. It
 *     classifies the user's input ('draft' | 'query') and routes:
 *       - 'draft' → `draftFromAIAction` (Task 2) which builds an invoice
 *         draft row server-side (workspace-scoped, VAT/totals computed in
 *         `lib/totals.ts`, invoice_number stays NULL until Finalize).
 *       - 'query' → `aiQueryAction` which builds a workspace summary and
 *         hands it to OpenRouter for a prose answer.
 *     Returns a tagged discriminated union so the caller renders one of
 *     three result shapes (redirect to draft, render prose, render error).
 *
 *   `aiQueryAction(text)` — exposed separately for callers that want the
 *     query path directly (e.g. tests). Does auth + workspace check,
 *     pulls an RLS-scoped supabase client, delegates to
 *     `answerWorkspaceQuestion`.
 *
 * Phase 5 hard rules enforced here:
 *   1. No service-role import. Both paths use `createClient()` from
 *      `@/lib/supabase/server` which is user-scoped via the SSR cookie
 *      session. RLS owns workspace isolation.
 *   2. The query path never touches the fiduciary ledger or retainer
 *      balances — it only reads `invoices` (see `queries.ts`).
 *   3. Intent classification is conservative — false positives prefer the
 *      safer Draft → Review path (see `intent.ts`).
 */

import { createClient } from "@/lib/supabase/server";
import { answerWorkspaceQuestion } from "@/lib/openrouter/queries";
import { classifyIntent } from "@/lib/openrouter/intent";
import type { OpenRouterError } from "@/lib/openrouter/types";
// Task 2 (parallel sibling) appends `draftFromAIAction` to the Invoices
// actions module. Both files live in `src/app/(workspace)/invoices/`; the
// wave-ordering contract is that Task 2's export is on disk by the time
// `aiDispatchAction` is invoked at runtime.
import { draftFromAIAction } from "@/app/(workspace)/invoices/actions";

// ---------------------------------------------------------------------------
// Result shapes — discriminated union on `kind`.
// ---------------------------------------------------------------------------

export type AIDispatchResult =
  | { kind: "draft"; id: string }
  | { kind: "query"; text: string }
  | { kind: "error"; error: OpenRouterError | string };

export type AIQueryResult =
  | { ok: true; text: string }
  | { ok: false; error: OpenRouterError | "no_workspace"; message?: string };

// ---------------------------------------------------------------------------
// aiQueryAction — natural-language question against workspace aggregates.
// ---------------------------------------------------------------------------

export async function aiQueryAction(text: string): Promise<AIQueryResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "parse_failed" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "no_workspace" };
  }

  // Workspace ownership — RLS will filter the underlying SELECTs anyway,
  // but we surface a typed error if the user has no workspace at all
  // (instead of returning an empty summary the AI would dutifully answer
  // questions about).
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!ws) {
    return { ok: false, error: "no_workspace" };
  }

  const result = await answerWorkspaceQuestion(trimmed, supabase);
  if (result.ok) {
    return { ok: true, text: result.text };
  }
  return { ok: false, error: result.error, message: result.message };
}

// ---------------------------------------------------------------------------
// aiDispatchAction — classify + route, return tagged union.
// ---------------------------------------------------------------------------

export async function aiDispatchAction(
  text: string,
): Promise<AIDispatchResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { kind: "error", error: "parse_failed" };
  }

  const intent = classifyIntent(trimmed);

  if (intent === "draft") {
    const result = await draftFromAIAction(trimmed);
    if (result.ok) {
      return { kind: "draft", id: result.id };
    }
    return { kind: "error", error: result.error };
  }

  const result = await aiQueryAction(trimmed);
  if (result.ok) {
    return { kind: "query", text: result.text };
  }
  return { kind: "error", error: result.error };
}
