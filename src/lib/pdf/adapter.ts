/**
 * Lex PDF adapter — server-side PDF rendering for invoices (and, via the same
 * surface in future phases, receipts, quotations, retainers, reports).
 *
 * Three locked invariants live in this file. Future agents: read these before
 * you touch anything below.
 *
 *   1. `Font.register` runs at MODULE TOP-LEVEL — never inside a function,
 *      component, effect, or request handler. The first cold-start render on
 *      Vercel races the font loader; if registration is deferred to render
 *      time, Greek glyphs fall back to a face with no Greek subset and the
 *      whole document renders as `□` boxes. (See `.planning/research/SUMMARY.md`
 *      §Phase 3 PDF + Risk 3.) `registerLexFonts()` is idempotent via the
 *      module-scoped `registered` flag and is also called eagerly below, so
 *      simply importing this module is enough to immunize the runtime.
 *
 *   2. Hyphenation is DISABLED globally for every face we register. PDFKit's
 *      default hyphenator does not know Greek morphology — it inserts soft
 *      hyphens inside Greek case endings, which looks broken on the page.
 *      The registered callback returns each word as a single un-hyphenable
 *      unit. Do not remove or guard the registration call below.
 *
 *   3. `StyleSheet.create` accepts only the CSS SUBSET that PDFKit understands.
 *      No wide-gamut color functions, no CSS custom-property lookups, no
 *      Tailwind class names, no `calc()` with units PDFKit can't resolve.
 *      Every color in this module is a literal hex string in `LexPdfTokens`,
 *      perceptually matched to the design tokens in `globals.css`
 *      (DESIGN.md §2). The browser surface and the PDF surface MUST stay in
 *      lock-step — when a token changes in DESIGN.md, update both
 *      `globals.css` AND this file.
 *
 * Everything else (templates, layout, fonts in use) is consumer concern and
 * may evolve freely. The three invariants above are the load-bearing contract.
 */

import { Font, renderToStream } from "@react-pdf/renderer";
import path from "node:path";
import { createElement, type ComponentType, type ReactElement } from "react";
import type { LexLocale } from "@/lib/format";

// -----------------------------------------------------------------------------
// Design tokens — hex equivalents of the design tokens in DESIGN.md §2.
//
// PDFKit's StyleSheet engine cannot parse wide-gamut color functions or CSS
// custom-property lookups. These constants ARE the colors the PDF will
// render — keep them perceptually in sync with `src/app/globals.css` (target
// ΔE < 3 against the design-token source).
// -----------------------------------------------------------------------------

export const LexPdfTokens = {
  text:     "#231f1c", // DESIGN.md §2 --text
  muted:    "#5e574f", // DESIGN.md §2 --muted
  dim:      "#867f76", // DESIGN.md §2 --dim
  bg:       "#fdfaf6", // DESIGN.md §2 --bg
  bg2:      "#f8f3eb", // DESIGN.md §2 --bg-2
  surface:  "#f1ebe1", // DESIGN.md §2 --surface
  line:     "#d7cdbd", // DESIGN.md §2 --line
  lineSoft: "#e8ddcc", // DESIGN.md §2 --line-soft
  accent:   "#b85730", // DESIGN.md §2 --accent
  accent2:  "#a04826", // DESIGN.md §2 --accent-2
  ok:       "#3c8a4b", // DESIGN.md §2 --ok
  warn:     "#b88a1f", // DESIGN.md §2 --warn
  kill:     "#b3331c", // DESIGN.md §2 --kill
  trust:    "#5d7a64", // DESIGN.md §2 --trust
} as const;

export type LexPdfTokenKey = keyof typeof LexPdfTokens;

// -----------------------------------------------------------------------------
// Font registration — invariant #1.
//
// Font files are TTF variable fonts under `public/fonts/`. We resolve them
// via `process.cwd()` (Vercel and Node both anchor cwd at the project root
// at boot), NOT via remote URL — remote `fetch()` at PDF render time has
// killed cold-starts in the past with EAI_AGAIN / 503s.
// -----------------------------------------------------------------------------

const CRIMSON_PRO_SRC = path.join(
  process.cwd(),
  "public/fonts/CrimsonPro-Variable.ttf",
);
const NOTO_SANS_SRC = path.join(
  process.cwd(),
  "public/fonts/NotoSans-Variable.ttf",
);

let registered = false;

/**
 * Register the two Lex PDF font families with `@react-pdf/renderer`'s font
 * store. Idempotent — safe to call from any number of consumers (tests, the
 * adapter module itself, alternative render paths). Real-world side effect
 * only fires on first call.
 *
 * Exported for tests; otherwise unnecessary to call directly — importing this
 * module triggers registration as a side effect.
 */
export function registerLexFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: "Crimson Pro",
    fonts: [
      { src: CRIMSON_PRO_SRC, fontWeight: 400 },
      { src: CRIMSON_PRO_SRC, fontWeight: 600 },
      { src: CRIMSON_PRO_SRC, fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: NOTO_SANS_SRC, fontWeight: 400 },
      { src: NOTO_SANS_SRC, fontWeight: 500 },
      { src: NOTO_SANS_SRC, fontWeight: 600 },
    ],
  });
}

// Side-effect: register on module load. This is invariant #1 — DO NOT move
// this call inside a function, a React component, or a request handler.
registerLexFonts();

// Invariant #2: disable hyphenation globally. Greek hyphenates awkwardly
// otherwise, and PDFKit has no Greek-aware hyphenator.
Font.registerHyphenationCallback((word: string) => [word]);

// -----------------------------------------------------------------------------
// Public types for the renderer surface.
//
// `LexPdfInput` is the typed contract every PDF caller (route handler, server
// action, AI tool-call) must satisfy. The shape mirrors the persisted rows
// (`workspaces`, `clients`, `invoices`, `invoice_line_items` — see
// `supabase/migrations/20260513000001_schema.sql`) but is intentionally a
// thin data type rather than a DB row import: the adapter does not depend on
// Supabase, the template, or any consumer module. That keeps the seam testable.
// -----------------------------------------------------------------------------

export type LexFontFamily = "Crimson Pro" | "Noto Sans";

export interface LexPdfWorkspace {
  name: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
  /** Hex accent color (per-workspace branding override of `LexPdfTokens.accent`). */
  accent_hex: string | null;
  /** Inline data URL for the firm logo (`data:image/...;base64,...`). Null = no logo. */
  logo_data_url: string | null;
  /** Optional custom footer text rendered above the page indicator. */
  footer_text: string | null;
}

export interface LexPdfClient {
  name_el: string;
  name_en: string;
  vat_number: string | null;
  tax_id: string | null;
  address: string | null;
  email: string | null;
  preferred_language: "el" | "en";
}

export interface LexPdfInvoice {
  /** Allocated number (`"2026/0007"`) or null when `draft === true`. */
  invoice_number: string | null;
  invoice_year: number | null;
  issued_at: string | null;
  due_at: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  language: "el" | "en";
}

export interface LexPdfLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  vat_rate: number;
  position: number;
  kind: string;
}

export interface LexPdfInput {
  workspace: LexPdfWorkspace;
  client: LexPdfClient;
  invoice: LexPdfInvoice;
  lineItems: LexPdfLineItem[];
  locale: LexLocale;
  /** When true, render the watermark overlay and skip the allocated number. */
  draft: boolean;
}

// -----------------------------------------------------------------------------
// Receipt input contract.
//
// A receipt is a thin acknowledgement that an invoice has been paid — Cyprus
// VAT law treats it as a separate numbered document but does NOT require it to
// itemize tax (tax is already itemized on the invoice it references). The
// adapter therefore consumes a smaller shape than `LexPdfInput`: no line
// items, no VAT breakdown, no draft state (receipts are issued once when
// `markPaidAction` succeeds, never as drafts). The reference to the paid
// invoice is the load-bearing field — auditors trace a receipt back to its
// invoice by `invoice_number`, not by FK.
// -----------------------------------------------------------------------------

export interface LexPdfReceipt {
  /** Allocated receipt number e.g. `R-2026/0001`. Always present (no drafts). */
  receipt_number: string;
  receipt_year: number;
  /** ISO date string (YYYY-MM-DD) — when the payment landed. */
  paid_at: string;
  /** Receipt amount = invoice.total (paid in full). NUMERIC → number. */
  amount: number;
  /** Free-text payment method (e.g. "Bank transfer", "Cash"). Null = unspecified. */
  payment_method: string | null;
}

/** The minimum invoice context a receipt PDF needs to reference its source. */
export interface LexPdfReceiptInvoice {
  /** Allocated number — receipts cannot reference a draft invoice. */
  invoice_number: string;
  invoice_year: number | null;
  total: number;
  currency: string;
}

export interface LexReceiptPdfInput {
  workspace: LexPdfWorkspace;
  client: LexPdfClient;
  invoice: LexPdfReceiptInvoice;
  receipt: LexPdfReceipt;
  locale: LexLocale;
}

// -----------------------------------------------------------------------------
// Render entry point — the SOLE export route handlers and server actions call.
// -----------------------------------------------------------------------------

/**
 * Render an invoice to a Node `ReadableStream` of PDF bytes.
 *
 * The template (`./templates/InvoiceDocument`) is imported lazily so this
 * adapter compiles and type-checks ahead of Wave 2 landing the template file.
 * Once Task 2 ships, the import resolves at first call and is cached by the
 * Node module loader for every subsequent render.
 *
 * Pure data in, stream out — this function never touches Supabase, never
 * reads env vars, never speaks to the network. The caller is responsible for
 * loading the invoice + line items + workspace + client and authorizing the
 * request before invoking `renderInvoicePDF`.
 */
export async function renderInvoicePDF(
  input: LexPdfInput,
): Promise<NodeJS.ReadableStream> {
  // The template module is loaded lazily so the adapter stays cheap to import
  // from non-render code paths (e.g. tests that only need `LexPdfTokens`). The
  // dynamic import shape is the public contract Task 2 satisfies: a default
  // export of type `ComponentType<LexPdfInput>`.
  const mod = (await import("./templates/InvoiceDocument")) as {
    default: ComponentType<LexPdfInput>;
  };
  const InvoiceDocument = mod.default;
  const element: ReactElement = createElement(InvoiceDocument, input);
  // `renderToStream` requires `ReactElement<DocumentProps>` from the
  // `@react-pdf/renderer` namespace; `InvoiceDocument` always returns
  // `<Document>...</Document>` as its root, so the cast is sound.
  return renderToStream(element as Parameters<typeof renderToStream>[0]);
}

// -----------------------------------------------------------------------------
// Quotation input contract.
//
// A quotation is a pre-engagement estimate that converts to a draft invoice
// on acceptance (see `convert_quotation_to_invoice` SP in
// `supabase/migrations/20260513000007_convert_quotation_to_invoice.sql`).
// Renders like an invoice — same firm letterhead, same line-items table,
// same totals block — but with three visible deltas the recipient must
// recognise:
//
//   1. Header caption: "QUOTATION — NOT A TAX INVOICE" (or Greek
//      equivalent) in Crimson Pro 700, color LexPdfTokens.muted (NOT kill —
//      this is a normal document, not an error state).
//   2. Right-rail meta swaps "Due" for "Valid until".
//   3. Footer prints the verbatim "Quotation only — not a tax invoice.
//      Becomes a draft invoice on acceptance." string per locale (mirrored
//      from messages/{el,en}-CY.json quotations.notTaxInvoice).
//
// `quotation_number` is null on drafts (allocated on `markSentAction` as
// `Q-YYYY/NNNN`). The template renders "DRAFT" in that case — no watermark
// overlay, since the QUOTATION caption itself is the disclosure.
// -----------------------------------------------------------------------------

export interface LexPdfQuotation {
  quotation_number: string | null;
  quotation_year: number | null;
  issued_at: string | null;
  valid_until: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  language: "el" | "en";
}

export interface LexQuotationPdfInput {
  workspace: LexPdfWorkspace;
  client: LexPdfClient;
  quotation: LexPdfQuotation;
  lineItems: LexPdfLineItem[];
  locale: LexLocale;
}

/**
 * Render a receipt to a Node `ReadableStream` of PDF bytes.
 *
 * Same seam discipline as `renderInvoicePDF`: pure data in, stream out, no
 * Supabase, no env, no network. The fonts registered at module load (invariant
 * #1) are reused — every Greek glyph on a receipt PDF rides the same Noto Sans
 * subset Cyprus invoices use, so a single cold start warms both surfaces.
 *
 * The template module is imported lazily to keep this adapter cheap for any
 * code path that imports `LexPdfTokens` or types but doesn't render. Cached by
 * the Node loader on first call.
 */
export async function renderReceiptPDF(
  input: LexReceiptPdfInput,
): Promise<NodeJS.ReadableStream> {
  const mod = (await import("./templates/ReceiptDocument")) as {
    default: ComponentType<LexReceiptPdfInput>;
  };
  const ReceiptDocument = mod.default;
  const element: ReactElement = createElement(ReceiptDocument, input);
  return renderToStream(element as Parameters<typeof renderToStream>[0]);
}

/**
 * Render a quotation to a Node `ReadableStream` of PDF bytes.
 *
 * Same seam discipline as `renderInvoicePDF` and `renderReceiptPDF`: pure
 * data in, stream out, no Supabase, no env, no network. The fonts
 * registered at module load (invariant #1) are reused — every Greek glyph
 * on a quotation PDF rides the same Noto Sans subset Cyprus invoices use,
 * so a single cold start warms all three surfaces.
 *
 * The template module (`./templates/QuotationDocument`) is imported lazily
 * to keep this adapter cheap for code paths that import `LexPdfTokens` or
 * types but don't render. Cached by the Node loader on first call.
 */
export async function renderQuotationPDF(
  input: LexQuotationPdfInput,
): Promise<NodeJS.ReadableStream> {
  const mod = (await import("./templates/QuotationDocument")) as {
    default: ComponentType<LexQuotationPdfInput>;
  };
  const QuotationDocument = mod.default;
  const element: ReactElement = createElement(QuotationDocument, input);
  return renderToStream(element as Parameters<typeof renderToStream>[0]);
}
