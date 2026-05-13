/**
 * Lex Quotation — `@react-pdf/renderer` template.
 *
 * Twin of `InvoiceDocument.tsx`. Same rules apply:
 *
 *   1. Colors come from `LexPdfTokens` ONLY. No literal hex, no wide-gamut
 *      color functions, no CSS custom properties, no Tailwind class names.
 *   2. Styles live in a single `StyleSheet.create({...})` block.
 *   3. Greek text MUST render through Crimson Pro / Noto Sans (registered at
 *      module top-level in `../adapter.ts`).
 *
 * Differences vs. InvoiceDocument:
 *   - Header caption is "QUOTATION — NOT A TAX INVOICE" (or Greek
 *     equivalent). Color = LexPdfTokens.muted (NOT kill — this is a normal
 *     document, not an error state).
 *   - "Valid until" replaces "Due" in the right-hand meta block.
 *   - Footer prints the verbatim "Quotation only — not a tax invoice.
 *     Becomes a draft invoice on acceptance." string per locale.
 *   - No watermark overlay (quotations are not draft tax documents — the
 *     header caption is the disclaimer).
 *
 * EXCEPTION (PDF templates only): money is formatted inline with
 * `Intl.NumberFormat`, NOT via `src/lib/format.ts`. Per the existing
 * InvoiceDocument pattern — fresh formatter per call is cheap at PDF-render
 * scale and keeps the output deterministic.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { LexPdfTokens, type LexQuotationPdfInput } from "../adapter";

type LocaleKey = "el-CY" | "en-CY";

interface QuotationLabels {
  quotation: string;
  headerCaption: string;
  issued: string;
  validUntil: string;
  quotedTo: string;
  description: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  subtotal: string;
  vat: string;
  total: string;
  draftBadge: string;
  taxId: string;
  vatNumber: string;
  iban: string;
  footerNotice: string;
}

const LABELS: Record<LocaleKey, QuotationLabels> = {
  "el-CY": {
    quotation: "ΠΡΟΣΦΟΡΑ",
    headerCaption: "ΠΡΟΣΦΟΡΑ — ΔΕΝ ΕΙΝΑΙ ΦΟΡΟΛΟΓΙΚΟ ΤΙΜΟΛΟΓΙΟ",
    issued: "ΗΜΕΡ.",
    validUntil: "ΙΣΧΥΕΙ ΕΩΣ",
    quotedTo: "ΠΡΟΣ",
    description: "ΠΕΡΙΓΡΑΦΗ",
    qty: "ΠΟΣΟΤΗΤΑ",
    unitPrice: "ΤΙΜΗ",
    lineTotal: "ΣΥΝΟΛΟ",
    subtotal: "ΥΠΟΣΥΝΟΛΟ",
    vat: "ΦΠΑ 19%",
    total: "ΣΥΝΟΛΟ",
    draftBadge: "ΠΡΟΧΕΙΡΟ",
    taxId: "Α.Φ.Μ.",
    vatNumber: "ΦΠΑ",
    iban: "IBAN",
    footerNotice:
      "Προσφορά — δεν είναι φορολογικό τιμολόγιο. Μετατρέπεται σε πρόχειρο τιμολόγιο με την αποδοχή.",
  },
  "en-CY": {
    quotation: "QUOTATION",
    headerCaption: "QUOTATION — NOT A TAX INVOICE",
    issued: "ISSUED",
    validUntil: "VALID UNTIL",
    quotedTo: "QUOTED TO",
    description: "DESCRIPTION",
    qty: "QTY",
    unitPrice: "UNIT PRICE",
    lineTotal: "LINE TOTAL",
    subtotal: "SUBTOTAL",
    vat: "VAT 19%",
    total: "TOTAL",
    draftBadge: "DRAFT",
    taxId: "TAX ID",
    vatNumber: "VAT",
    iban: "IBAN",
    footerNotice:
      "Quotation only — not a tax invoice. Becomes a draft invoice on acceptance.",
  },
};

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
  // The "QUOTATION — NOT A TAX INVOICE" caption. Crimson Pro 700, muted color
  // (NOT kill — the design rubric is clear that this is a normal document,
  // not an error state).
  quotationCaption: {
    fontFamily: "Crimson Pro",
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: 0.9,
    color: LexPdfTokens.muted,
    marginBottom: 4,
    textAlign: "right",
  },
  quotationNumber: {
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
  notTaxInvoice: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: LexPdfTokens.lineSoft,
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 9,
    color: LexPdfTokens.muted,
    fontStyle: "italic",
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
});

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

function formatDateForPdf(iso: string | null, locale: LocaleKey): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function pickClientName(
  client: LexQuotationPdfInput["client"],
  locale: LocaleKey,
): string {
  if (locale === "el-CY") {
    return client.name_el || client.name_en;
  }
  return client.name_en || client.name_el;
}

const QuotationDocument: React.FC<LexQuotationPdfInput> = ({
  workspace,
  client,
  quotation,
  lineItems,
  locale,
}) => {
  const labels = LABELS[locale];
  const currency = quotation.currency || "EUR";
  const sortedItems = [...lineItems].sort((a, b) => a.position - b.position);
  const clientName = pickClientName(client, locale);
  const displayNumber = quotation.quotation_number ?? labels.draftBadge;
  const documentTitle = `${labels.quotation} ${displayNumber}`;

  return (
    <Document title={documentTitle} author={workspace.name} producer="Lex">
      <Page size="A4" style={styles.page}>
        {/* Header — firm block left, quotation meta right. */}
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
                <Image
                  src={workspace.logo_data_url}
                  style={styles.logoImage}
                />
              </View>
            ) : null}
            {/* Verbatim disclosure caption — Crimson Pro 700, muted color. */}
            <Text style={styles.quotationCaption}>{labels.headerCaption}</Text>
            <Text style={styles.quotationNumber}>{displayNumber}</Text>
            <View style={styles.invoiceMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{labels.issued}</Text>
                <Text style={styles.metaValue}>
                  {formatDateForPdf(quotation.issued_at, locale)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{labels.validUntil}</Text>
                <Text style={styles.metaValue}>
                  {formatDateForPdf(quotation.valid_until, locale)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quoted-to block. */}
        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>{labels.quotedTo}</Text>
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

        {/* Totals — right-aligned, TOTAL in Crimson Pro 600 14pt. */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{labels.subtotal}</Text>
            <Text style={styles.totalsValue}>
              {formatMoneyForPdf(quotation.subtotal, currency, locale)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{labels.vat}</Text>
            <Text style={styles.totalsValue}>
              {formatMoneyForPdf(quotation.vat_amount, currency, locale)}
            </Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text style={styles.totalsLabelFinal}>{labels.total}</Text>
            <Text style={styles.totalsValueFinal}>
              {formatMoneyForPdf(quotation.total, currency, locale)}
            </Text>
          </View>
        </View>

        {/* Optional notes. */}
        {quotation.notes ? (
          <Text style={styles.notes}>{quotation.notes}</Text>
        ) : null}

        {/* "Not a tax invoice" footer — verbatim string per locale. */}
        <Text style={styles.notTaxInvoice}>{labels.footerNotice}</Text>

        {/* Page footer — tax IDs + page indicator. No receipt/payment block. */}
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
      </Page>
    </Document>
  );
};

export default QuotationDocument;
