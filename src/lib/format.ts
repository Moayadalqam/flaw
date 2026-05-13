/**
 * Canonical Intl formatting seam for Lex.
 *
 * Every consumer of currency, date, or number formatting must route through
 * this module. No `Intl.NumberFormat` or `Intl.DateTimeFormat` constructor
 * call may appear anywhere else in the project — that drift breaks the
 * Greek demo (some calls fall back to `en-US` and the bilingual surface
 * cracks).
 *
 * Default locale is `el-CY`. Pass a `LexLocale` (e.g. from `getLocale()`)
 * to force a specific locale:
 *   - `el-CY` — currency `1.234,56 €`, dates `DD/MM/YYYY`, `.`-thousands
 *   - `en-CY` — currency `€1,234.56`, dates `DD/MM/YYYY`, `,`-thousands
 *
 * Both Cyprus locales render dates as `DD/MM/YYYY` (Cyprus convention).
 */

export type LexLocale = "el-CY" | "en-CY";
const DEFAULT_LOCALE: LexLocale = "el-CY";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(locale: LexLocale, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter;
}

const dateFormatters = new Map<LexLocale, Intl.DateTimeFormat>();

function dateFormatter(locale: LexLocale): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    dateFormatters.set(locale, formatter);
  }
  return formatter;
}

const numberFormatters = new Map<LexLocale, Intl.NumberFormat>();

function numberFormatter(locale: LexLocale): Intl.NumberFormat {
  let formatter = numberFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale);
    numberFormatters.set(locale, formatter);
  }
  return formatter;
}

export function formatMoney(
  amount: number,
  currency: string = "EUR",
  locale: LexLocale = DEFAULT_LOCALE,
): string {
  return moneyFormatter(locale, currency).format(amount);
}

export function formatDate(
  input: Date | string,
  locale: LexLocale = DEFAULT_LOCALE,
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return dateFormatter(locale).format(d);
}

export function formatNumber(
  n: number,
  locale: LexLocale = DEFAULT_LOCALE,
): string {
  return numberFormatter(locale).format(n);
}
