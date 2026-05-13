/**
 * Lex Invoice — `@react-pdf/renderer` template.
 *
 * This is the artifact Fotini hands a client. It is the highest-trust surface
 * in the product: a recipient looking at this page decides whether the firm is
 * competent. Every typographic / spacing / color choice flows from
 * `.planning/DESIGN.md §Invoice document` and is locked.
 *
 * Rules this file MUST keep (mirrored from `../adapter.ts`):
 *
 *   1. Colors come from `LexPdfTokens` ONLY. No literal hex, no wide-gamut
 *      color functions, no CSS custom properties, no Tailwind class names.
 *      The PDF runtime cannot parse any of those — silently falls back to
 *      black.
 *   2. Styles live in a single `StyleSheet.create({...})` block. No inline
 *      `style={{ color: '#xxx' }}` objects scattered through the JSX —
 *      everything must be auditable in one place.
 *   3. Greek text MUST render through Crimson Pro / Noto Sans (both
 *      registered at module top-level in `../adapter.ts`). Do not introduce
 *      a third font family without adding it to `Font.register` first or
 *      the glyphs render as `□` boxes.
 *
 * EXCEPTION (PDF templates only): money is formatted inline with
 * `Intl.NumberFormat`, NOT via `src/lib/format.ts`. The format.ts seam caches
 * `Intl.NumberFormat` instances at module scope, which is the right call for
 * the browser/server UI surface but is wasted state for a PDF render that
 * runs once and discards. Inline construction also keeps the PDF deterministic
 * + cache-friendly for the future Phase 4 PDF preview tooling.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { LexPdfTokens, type LexPdfInput } from "../adapter";

// -----------------------------------------------------------------------------
// Locale-aware labels.
//
// Greek text is embedded as literal UTF-8 strings — the registered Noto Sans
// and Crimson Pro variable fonts both ship full Greek subsets including the
// polytonic diacritics we need (Ά, Έ, Ή, Ί, Ό, Ύ, Ώ + lowercase pair).
// -----------------------------------------------------------------------------

type LocaleKey = "el-CY" | "en-CY";

interface InvoiceLabels {
  invoice: string;
  issued: string;
  due: string;
  billTo: string;
  description: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  subtotal: string;
  vat: string;
  total: string;
  draftBadge: string;
  watermark: string;
  taxId: string;
  vatNumber: string;
  iban: string;
  page: string;
}

const LABELS: Record<LocaleKey, InvoiceLabels> = {
  "el-CY": {
    invoice: "ΤΙΜΟΛΟΓΙΟ",
    issued: "ΗΜΕΡ.",
    due: "ΟΦΕΙΛΕΤΑΙ",
    billTo: "ΠΡΟΣ",
    description: "ΠΕΡΙΓΡΑΦΗ",
    qty: "ΠΟΣΟΤΗΤΑ",
    unitPrice: "ΤΙΜΗ",
    lineTotal: "ΣΥΝΟΛΟ",
    subtotal: "ΥΠΟΣΥΝΟΛΟ",
    vat: "ΦΠΑ 19%",
    total: "ΣΥΝΟΛΟ",
    draftBadge: "ΠΡΟΧΕΙΡΟ",
    watermark: "ΠΡΟΧΕΙΡΟ — ΟΧΙ ΦΟΡΟΛΟΓΙΚΟ ΕΓΓΡΑΦΟ",
    taxId: "Α.Φ.Μ.",
    vatNumber: "ΦΠΑ",
    iban: "IBAN",
    page: "Σελ.",
  },
  "en-CY": {
    invoice: "INVOICE",
    issued: "ISSUED",
    due: "DUE",
    billTo: "BILL TO",
    description: "DESCRIPTION",
    qty: "QTY",
    unitPrice: "UNIT PRICE",
    lineTotal: "LINE TOTAL",
    subtotal: "SUBTOTAL",
    vat: "VAT 19%",
    total: "TOTAL",
    draftBadge: "DRAFT",
    watermark: "DRAFT — NOT A TAX DOCUMENT",
    taxId: "TAX ID",
    vatNumber: "VAT",
    iban: "IBAN",
    page: "Page",
  },
};

// -----------------------------------------------------------------------------
// Stylesheet — every color references `LexPdfTokens`, every size is in pt.
// PDFKit's coordinate system is points (72pt = 1in = 25.4mm). Margins use
// the `mm` shorthand which the StyleSheet engine resolves for us.
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    backgroundColor: LexPdfTokens.bg,
    color: LexPdfTokens.text,
    fontFamily: "Noto Sans",
    fontSize: 10,
    lineHeight: 1.4,
    padding: "24mm 18mm 20mm 18mm",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  headerLeft: {
    flexDirection: "column",
    maxWidth: "60%",
  },
  firmName: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 24,
    color: LexPdfTokens.text,
    marginBottom: 6,
  },
  firmTagline: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 9,
    color: LexPdfTokens.muted,
  },
  logoBlock: {
    width: 100,
    height: 40,
  },
  logoImage: {
    width: 100,
    height: 40,
    objectFit: "contain",
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  invoiceCaption: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 24,
    color: LexPdfTokens.accent,
    marginBottom: 12,
  },
  invoiceMeta: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  metaLabel: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
    marginRight: 8,
  },
  metaValue: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 10,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
  },
  billTo: {
    flexDirection: "column",
    marginBottom: 28,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: LexPdfTokens.lineSoft,
  },
  billToLabel: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
    marginBottom: 6,
  },
  billToName: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 14,
    color: LexPdfTokens.text,
    marginBottom: 4,
  },
  billToDetail: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 9,
    color: LexPdfTokens.muted,
  },
  lineItemTable: {
    flexDirection: "column",
    marginBottom: 20,
  },
  lineItemHeaderRow: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: LexPdfTokens.line,
    marginBottom: 4,
  },
  lineItemHeader: {
    fontFamily: "Noto Sans",
    fontWeight: 600,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
  },
  lineItemRow: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: LexPdfTokens.lineSoft,
  },
  lineItemCellDesc: {
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 10,
    color: LexPdfTokens.text,
    paddingRight: 12,
  },
  lineItemCellQty: {
    width: 60,
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 10,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  lineItemCellPrice: {
    width: 90,
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 10,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  lineItemCellTotal: {
    width: 90,
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 10,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  totalsBlock: {
    flexDirection: "column",
    alignSelf: "flex-end",
    width: 240,
    marginTop: 16,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 4,
  },
  totalsLabel: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 10,
    color: LexPdfTokens.muted,
  },
  totalsValue: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 10,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
  },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: LexPdfTokens.text,
  },
  totalsLabelFinal: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 14,
    color: LexPdfTokens.text,
  },
  totalsValueFinal: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 14,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
  },
  notes: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: LexPdfTokens.lineSoft,
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 9,
    color: LexPdfTokens.muted,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: "12mm",
    left: "18mm",
    right: "18mm",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: LexPdfTokens.lineSoft,
  },
  footerCol: {
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
  },
  footerLine: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 8,
    color: LexPdfTokens.muted,
  },
  footerCustom: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 8,
    color: LexPdfTokens.muted,
    marginTop: 6,
    maxWidth: "70%",
  },
  pageIndicator: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    color: LexPdfTokens.dim,
    fontVariant: ["tabular-nums"],
  },
  watermark: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    transform: "rotate(-30deg)",
    opacity: 0.1,
  },
  watermarkText: {
    fontFamily: "Crimson Pro",
    fontWeight: 700,
    fontSize: 72,
    color: LexPdfTokens.kill,
    textAlign: "center",
  },
});

// -----------------------------------------------------------------------------
// Helpers — local, deterministic, no module-scoped caches.
// -----------------------------------------------------------------------------

/**
 * EXCEPTION: format.ts seam not used — see DESIGN/StyleSheet-subset note.
 * The PDF runtime needs to stay free of module-scoped Intl caches (those are
 * a browser-surface optimization). A fresh formatter per call is cheap at
 * PDF-render scale and keeps the rendered output deterministic.
 */
function formatMoneyForPdf(
  amount: number,
  currency: string,
  locale: LocaleKey,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDateForPdf(
  iso: string | null,
  locale: LocaleKey,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function pickClientName(
  client: LexPdfInput["client"],
  locale: LocaleKey,
): string {
  if (locale === "el-CY") {
    return client.name_el || client.name_en;
  }
  return client.name_en || client.name_el;
}

// -----------------------------------------------------------------------------
// Component.
// -----------------------------------------------------------------------------

const InvoiceDocument: React.FC<LexPdfInput> = ({
  workspace,
  client,
  invoice,
  lineItems,
  locale,
  draft,
}) => {
  const labels = LABELS[locale];
  const currency = invoice.currency || "EUR";
  const sortedItems = [...lineItems].sort((a, b) => a.position - b.position);
  const clientName = pickClientName(client, locale);
  const displayNumber = draft || !invoice.invoice_number
    ? labels.draftBadge
    : invoice.invoice_number;
  const documentTitle = `${labels.invoice} ${
    invoice.invoice_number ?? labels.draftBadge
  }`;

  return (
    <Document title={documentTitle} author={workspace.name} producer="Lex">
      <Page size="A4" style={styles.page}>
        {/* Header — firm block left, invoice meta right. */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.firmName}>{workspace.name}</Text>
            {workspace.vat_number ? (
              <Text style={styles.firmTagline}>
                {labels.vatNumber} {workspace.vat_number}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerRight}>
            {workspace.logo_data_url ? (
              <View style={styles.logoBlock}>
                <Image src={workspace.logo_data_url} style={styles.logoImage} />
              </View>
            ) : null}
            <Text style={styles.invoiceCaption}>{labels.invoice}</Text>
            <Text style={styles.invoiceNumber}>{displayNumber}</Text>
            <View style={styles.invoiceMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{labels.issued}</Text>
                <Text style={styles.metaValue}>
                  {formatDateForPdf(invoice.issued_at, locale)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{labels.due}</Text>
                <Text style={styles.metaValue}>
                  {formatDateForPdf(invoice.due_at, locale)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bill-to block. */}
        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>{labels.billTo}</Text>
          <Text style={styles.billToName}>{clientName}</Text>
          {client.address ? (
            <Text style={styles.billToDetail}>{client.address}</Text>
          ) : null}
          {client.vat_number ? (
            <Text style={styles.billToDetail}>
              {labels.vatNumber} {client.vat_number}
            </Text>
          ) : null}
          {client.tax_id ? (
            <Text style={styles.billToDetail}>
              {labels.taxId} {client.tax_id}
            </Text>
          ) : null}
        </View>

        {/* Line-items table. */}
        <View style={styles.lineItemTable}>
          <View style={styles.lineItemHeaderRow}>
            <Text style={[styles.lineItemHeader, styles.lineItemCellDesc]}>
              {labels.description}
            </Text>
            <Text style={[styles.lineItemHeader, styles.lineItemCellQty]}>
              {labels.qty}
            </Text>
            <Text style={[styles.lineItemHeader, styles.lineItemCellPrice]}>
              {labels.unitPrice}
            </Text>
            <Text style={[styles.lineItemHeader, styles.lineItemCellTotal]}>
              {labels.lineTotal}
            </Text>
          </View>
          {sortedItems.map((item) => (
            <View
              key={`${item.position}-${item.description.slice(0, 24)}`}
              style={styles.lineItemRow}
              wrap={false}
            >
              <Text style={styles.lineItemCellDesc}>{item.description}</Text>
              <Text style={styles.lineItemCellQty}>
                {new Intl.NumberFormat(locale, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                }).format(item.quantity)}
              </Text>
              <Text style={styles.lineItemCellPrice}>
                {formatMoneyForPdf(item.unit_price, currency, locale)}
              </Text>
              <Text style={styles.lineItemCellTotal}>
                {formatMoneyForPdf(item.line_total, currency, locale)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals block — right-aligned, TOTAL row in Crimson Pro 600 14pt. */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{labels.subtotal}</Text>
            <Text style={styles.totalsValue}>
              {formatMoneyForPdf(invoice.subtotal, currency, locale)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{labels.vat}</Text>
            <Text style={styles.totalsValue}>
              {formatMoneyForPdf(invoice.vat_amount, currency, locale)}
            </Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text style={styles.totalsLabelFinal}>{labels.total}</Text>
            <Text style={styles.totalsValueFinal}>
              {formatMoneyForPdf(invoice.total, currency, locale)}
            </Text>
          </View>
        </View>

        {/* Optional client-facing notes. */}
        {invoice.notes ? (
          <Text style={styles.notes}>{invoice.notes}</Text>
        ) : null}

        {/* Footer — tax ID, VAT, IBAN, optional footer text, page indicator. */}
        <View style={styles.footer} fixed>
          <View style={styles.footerCol}>
            {workspace.tax_id ? (
              <Text style={styles.footerLine}>
                {labels.taxId} {workspace.tax_id}
              </Text>
            ) : null}
            {workspace.vat_number ? (
              <Text style={styles.footerLine}>
                {labels.vatNumber} {workspace.vat_number}
              </Text>
            ) : null}
            {workspace.iban ? (
              <Text style={styles.footerLine}>
                {labels.iban} {workspace.iban}
              </Text>
            ) : null}
            {workspace.footer_text ? (
              <Text style={styles.footerCustom}>{workspace.footer_text}</Text>
            ) : null}
          </View>
          <Text style={styles.pageIndicator}>1 / 1</Text>
        </View>

        {/* Draft watermark — LAST so it paints over the document content. */}
        {draft ? (
          <View style={styles.watermark} fixed>
            <Text style={styles.watermarkText}>{labels.watermark}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
};

export default InvoiceDocument;
