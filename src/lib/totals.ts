/**
 * Money/totals helpers shared by invoice + quotation Server Actions.
 *
 * Both surfaces — `(workspace)/invoices/actions.ts` and
 * `(workspace)/quotations/actions.ts` — need to compute the Cyprus-VAT-19%
 * triple (subtotal, vat_amount, total) from a list of line items expressed
 * as decimal strings. Postgres stores `NUMERIC(12,2)` and the PostgREST
 * driver returns them as strings to preserve precision. We round to two
 * decimal places at every boundary so the server-side ground truth matches
 * the client-side preview formatter.
 *
 * VAT_RATE is the Cyprus standard rate (19%, stored DB-side as
 * NUMERIC(5,4) = 0.1900). Keep the constant here in one place — if Cyprus
 * ever raises the rate (last move: 2014 → 19%), this is the single edit
 * point for application code (the DB column default is independent).
 */

export const VAT_RATE = 0.19;

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Format a number as a NUMERIC(12,2)-compatible decimal string for the JS
 * Supabase driver. Two decimal places, period separator. Use this for every
 * insert/update of `subtotal`, `vat_amount`, `total`, `line_total`,
 * `unit_price`, `quantity` columns.
 */
export function toMoney(n: number): string {
  return roundCents(n).toFixed(2);
}

export interface LineItemTotalsInput {
  quantity: string;
  unit_price: string;
}

export interface ComputedTotals {
  subtotal: number;
  vatAmount: number;
  total: number;
  lineTotals: number[];
}

/**
 * Compute (subtotal, vatAmount, total, perLineTotals) from a list of line
 * items expressed as decimal strings. Rounds at each boundary — never
 * accumulates fractional cents.
 *
 * Used by:
 *   - invoices/actions.ts (createInvoiceAction, recomputeInvoiceTotals)
 *   - quotations/actions.ts (createQuotationAction, updateQuotationAction)
 *   - convert_quotation_to_invoice SP (delegates to this function via the
 *     server-side recompute in acceptQuotationAction's fallback path)
 */
export function computeTotalsFromItems(
  items: LineItemTotalsInput[],
): ComputedTotals {
  const lineTotals = items.map((li) =>
    roundCents(parseFloat(li.quantity) * parseFloat(li.unit_price)),
  );
  const subtotal = roundCents(lineTotals.reduce((a, b) => a + b, 0));
  const vatAmount = roundCents(subtotal * VAT_RATE);
  const total = roundCents(subtotal + vatAmount);
  return { subtotal, vatAmount, total, lineTotals };
}
