/**
 * Canonical Intl formatting seam for Lex.
 *
 * Every consumer of currency, date, or number formatting must route through
 * this module. No `Intl.NumberFormat` or `Intl.DateTimeFormat` constructor
 * call may appear anywhere else in the project — that drift breaks the
 * Greek demo (some calls fall back to `en-US` and the bilingual surface
 * cracks).
 *
 * Locale is `el-CY` everywhere:
 *   - currency renders as `1.234,56 €`
 *   - dates render as `DD/MM/YYYY`
 *   - numbers render with `.` thousands and `,` decimal.
 */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string): Intl.NumberFormat {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("el-CY", {
      style: "currency",
      currency,
    });
    moneyFormatters.set(currency, formatter);
  }
  return formatter;
}

const dateFormatter = new Intl.DateTimeFormat("el-CY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const numberFormatter = new Intl.NumberFormat("el-CY");

export function formatMoney(amount: number, currency: string = "EUR"): string {
  return moneyFormatter(currency).format(amount);
}

export function formatDate(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return dateFormatter.format(d);
}

export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}
