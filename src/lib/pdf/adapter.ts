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
