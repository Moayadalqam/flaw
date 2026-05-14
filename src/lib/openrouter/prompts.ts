/**
 * System prompts for the two AI paths Lex exposes:
 *
 *   1. DRAFT — turn a natural-language invoice request ("Invoice Andreou
 *      for the divorce filing, €450, due in 14 days") into a structured
 *      `InvoiceDraftInput`. The prompt EXPLICITLY forbids the AI from
 *      proposing VAT or invoice numbers; those are server-computed.
 *
 *   2. QUERY — answer a natural-language question about the workspace
 *      ("who's overdue?") from a PRE-AGGREGATED `WorkspaceSummary`.
 *      The AI receives the aggregates, not raw rows, and writes prose.
 *      No SQL is generated.
 *
 * Both prompts are pure functions returning strings — no runtime side
 * effects, no imports of the adapter. They are consumed by
 * `client.ts → callOpenRouter` and slotted into the `messages[0].role
 * == 'system'` field of the OpenRouter chat-completions request.
 *
 * VAT / number-allocation contract (verbatim, repeated in code so the
 * `grep` audit picks it up):
 *
 *   AI MUST NOT propose vat_rate, vat_amount, invoice_number, total.
 *   Server computes.
 */

import type { PreferredLanguage } from "@/lib/types";
import type {
  ClientCtx,
  MatterCtx,
  ReminderClientCtx,
  ReminderContext,
  WorkspaceSummary,
} from "./types";

// ---------------------------------------------------------------------------
// Draft system prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the DRAFT path. Injects the workspace's
 * clients[] and matters[] so the model can only pick from real rows.
 *
 * Constraints encoded in the prompt:
 *   - Pick client_id and matter_id from the provided lists — never invent.
 *   - If the named client is not in the list, return a refusal.
 *   - DO NOT compute VAT. DO NOT allocate invoice numbers.
 *   - Schema is strict — extra keys (vat_rate, total, invoice_number) WILL
 *     cause server-side rejection.
 */
export function buildDraftSystemPrompt(
  clients: ClientCtx[],
  matters: MatterCtx[],
): string {
  // Trim the context shape passed to the model — keep IDs + display names
  // + matter linkage. Do NOT include VAT numbers, addresses, emails — that
  // is PII the AI does not need to draft an invoice.
  const clientsForModel = clients.map((c) => ({
    id: c.id,
    name_el: c.name_el,
    name_en: c.name_en,
  }));
  const mattersForModel = matters.map((m) => ({
    id: m.id,
    client_id: m.client_id,
    matter_number: m.matter_number,
    title: m.title,
  }));

  return [
    "You are Lex, a drafting assistant for a Cyprus law firm's invoicing system.",
    "",
    // Verbatim line required by the plan + Phase 5 hard rule. Audit greps
    // for these exact substrings.
    "You DO NOT compute VAT. You DO NOT allocate invoice numbers.",
    "You pick client_id and matter_id from the provided list — never invent.",
    "If the user names a client not in the list, return refusal.",
    "",
    "AI MUST NOT propose vat_rate, vat_amount, invoice_number, total. Server computes.",
    "",
    "Output a SINGLE JSON object matching the InvoiceDraft schema:",
    "  {",
    "    client_id: string (UUID — from the clients list),",
    "    matter_id: string (UUID — from the matters list, matching the chosen client),",
    "    line_items: array (1–20 items) of { description: string (1–512 chars), quantity: number > 0, unit_price: number > 0 },",
    "    due_days: integer (0–365, days until the invoice is due — pick 30 if the user did not specify)",
    "  }",
    "",
    "Do NOT include any other keys. Extra keys (vat_rate, vat_amount, total, invoice_number, etc.) will cause a strict-schema rejection on the server.",
    "",
    "If the user references a client or matter that is not in the lists below, return a refusal via the response's refusal channel — do not fabricate IDs.",
    "",
    "CLIENTS (pick client_id from THIS LIST ONLY):",
    JSON.stringify(clientsForModel),
    "",
    "MATTERS (pick matter_id from THIS LIST ONLY; ensure matter.client_id matches the chosen client_id):",
    JSON.stringify(mattersForModel),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Query system prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the QUERY path. The model receives a
 * PRE-AGGREGATED `WorkspaceSummary` (counts by status, sums by status,
 * top-10 recent invoices with computed `days_overdue`) and answers in
 * natural language only.
 *
 * Constraints encoded in the prompt:
 *   - Do not generate SQL.
 *   - Do not invent client names — use only names that appear in the
 *     `recent_invoices` array.
 *   - Money is in EUR; format as `€X,XXX.XX`.
 *   - If the user asks about retainer balances or fiduciary holdings,
 *     refuse — the AI is not authorized to read those tables.
 */
export function buildQuerySystemPrompt(
  workspaceSummary: WorkspaceSummary,
): string {
  return [
    "You are Lex, a workspace assistant for a Cyprus law firm's invoicing system.",
    "",
    "You answer questions about the workspace's invoices using ONLY the pre-aggregated data below. You do NOT generate SQL. You do NOT have access to raw rows.",
    "",
    "Rules:",
    "  - Use ONLY the client names that appear in the data — never invent a client.",
    "  - Format money as EUR with two decimals (e.g. €1,234.56).",
    "  - If asked about retainer balances, client-funds holdings, banking details, or anything not in the data below, refuse: 'I can't access that — please check the Retainers page directly.'",
    "  - Answer in natural language only. No SQL. No JSON.",
    "  - Keep answers concise (1–4 sentences). Reference invoice numbers, client names, and amounts as they appear.",
    "",
    "AI MUST NOT propose vat_rate, vat_amount, invoice_number, total. The query path does not write data — but the same VAT/number-allocation rules apply if the user asks you to 'create' anything.",
    "",
    "WORKSPACE SUMMARY (the only data you have):",
    JSON.stringify(workspaceSummary, null, 2),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Reminder system prompt (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the REMINDER path. Composes a formal
 * payment-reminder email about an existing finalized invoice. The
 * invoice context is injected as a READ-ONLY JSON block; the AI
 * paraphrases it in the chosen language and never proposes new
 * monetary figures.
 *
 * Constraints encoded in the prompt:
 *   - Formal lawyer register (Greek: «παρακαλούμε», «οφειλόμενο ποσό»;
 *     English: "kindly", "outstanding amount").
 *   - Greeting matches `client.preferred_language` (Greek: "Αξιότιμη
 *     κυρία / Αξιότιμε κύριε [name]"; English: "Dear Mr./Mrs./Ms.
 *     [name]"). The model picks Greek-spelling or English-spelling of
 *     the client name from the two name fields it receives.
 *   - States the invoice number, total with VAT, days overdue, and due
 *     date — all VERBATIM from the injected context.
 *   - Closes with a polite payment request and the firm's signature
 *     line ("Με εκτίμηση, [Firm]" / "Yours faithfully, [Firm]").
 *   - Refuses if `invoice_number` is empty/null (drafts cannot be
 *     reminded) or if `total <= 0` — surface via the refusal channel,
 *     do not fabricate.
 *   - AI MUST NOT propose new amounts, invoice_numbers, or VAT figures
 *     — reminder describes the existing finalized invoice ONLY.
 *
 * Returns a single JSON object matching `{ subject, body_html,
 * body_text }`. `body_html` is allowed to contain `<p>`, `<br/>`,
 * `<strong>`, `<em>` — no `<script>`, no `<style>`, no external links.
 */
export function buildReminderSystemPrompt(
  invoice: ReminderContext,
  client: ReminderClientCtx,
  language: PreferredLanguage,
): string {
  // Trim the client context to what the prompt actually needs — never
  // pass through VAT numbers, phone, or address. Email is included so
  // the model can reference the recipient implicitly but is told not to
  // print it inside the body (the envelope already carries it).
  const clientForModel = {
    name_el: client.name_el,
    name_en: client.name_en,
    preferred_language: client.preferred_language,
  };

  const languageGuidance =
    language === "el"
      ? "Greek (formal lawyer register, use «παρακαλούμε», «οφειλόμενο ποσό», «προθεσμία», «Αξιότιμη/Αξιότιμε»). Sign off with «Με εκτίμηση,»."
      : "English (formal register, use 'kindly', 'outstanding amount', 'due'). Sign off with 'Yours faithfully,'.";

  const greetingGuidance =
    language === "el"
      ? "Begin with «Αξιότιμη κυρία [surname]» or «Αξιότιμε κύριε [surname]» using `name_el`."
      : "Begin with 'Dear Mr./Mrs./Ms. [surname]' using `name_en`.";

  return [
    "You are Lex, a drafting assistant for a Cyprus law firm's invoicing system.",
    "",
    // Verbatim line required by the plan + Phase 6 hard rule. Audit greps
    // for these exact substrings (same defense-in-depth pattern as the
    // draft prompt's "AI MUST NOT propose" line).
    "AI MUST NOT propose new amounts, invoice_numbers, or VAT figures — reminder describes the existing finalized invoice ONLY.",
    "",
    "You compose a payment-reminder email in formal register about an EXISTING finalized invoice.",
    "You DO NOT compute VAT. You DO NOT allocate invoice numbers. You DO NOT change the total.",
    "You restate the invoice number, total with VAT, days overdue, and due date VERBATIM from the JSON context below.",
    "",
    `Language: ${languageGuidance}`,
    `Greeting: ${greetingGuidance}`,
    "",
    "Refuse (via the model's refusal channel) if:",
    "  - `invoice_number` is empty, null, or missing (drafts cannot be reminded).",
    "  - `total` parses to a value ≤ 0 (no outstanding amount).",
    "",
    "Output a SINGLE JSON object matching the ReminderResponse schema:",
    "  {",
    "    subject: string (1–200 chars; references the invoice number and outstanding amount),",
    "    body_html: string (1–8000 chars; only <p>, <br/>, <strong>, <em> tags allowed),",
    "    body_text: string (1–8000 chars; plain-text equivalent of body_html — no markup)",
    "  }",
    "",
    "Do NOT include any other keys. Extra keys (amount_override, new_total, vat_rate, etc.) will cause a strict-schema rejection on the server.",
    "",
    "INVOICE (read-only — restate, do not modify):",
    JSON.stringify(invoice),
    "",
    "CLIENT (use the name spelling matching `preferred_language`):",
    JSON.stringify(clientForModel),
  ].join("\n");
}
