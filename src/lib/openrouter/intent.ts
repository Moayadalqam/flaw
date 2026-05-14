/**
 * Intent classifier for Lex's command bar.
 *
 * Conservative — false positives prefer the safer Draft → Review path; user
 * can discard with no number consumed. The cost of a wrong "draft" guess is
 * one throw-away preview the lawyer dismisses. The cost of a wrong "query"
 * guess is the lawyer typing "invoice X €450" and getting prose back about
 * the workspace instead of a draft to review — far more friction.
 *
 * Heuristic: any verb that strongly implies "make an invoice" (invoice,
 * draft, bill, charge, create) → draft. Everything else → query. The
 * pattern is intentionally simple so it is auditable by reading one line.
 *
 * Pure function, no I/O, fully unit-testable.
 */

export type Intent = "draft" | "query";

const DRAFT_KEYWORDS = /\b(invoice|draft|bill|charge|create)\b/;

export function classifyIntent(text: string): Intent {
  return DRAFT_KEYWORDS.test(text.toLowerCase()) ? "draft" : "query";
}
