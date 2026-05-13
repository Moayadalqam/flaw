/**
 * Lex Receipt — `@react-pdf/renderer` template.
 *
 * Companion to `InvoiceDocument.tsx`. A receipt is the artifact the firm hands
 * a client after payment lands — Cyprus VAT law treats it as a separately
 * numbered document that REFERENCES an invoice, never replaces it. The visual
 * language matches the invoice (same fonts, same tokens, same letterhead and
 * footer) so a recipient looking at both pages reads them as one document
 * family.
 *
 * What this template explicitly does NOT show (and why):
 *   - No VAT line. Tax is itemized on the invoice the receipt references;
 *     duplicating it here would risk a double-claim audit trail.
 *   - No line items. A receipt acknowledges PAYMENT, not the work billed.
 *   - No watermark / DRAFT state. `markPaidAction` (invoices/actions.ts) only
 *     inserts a receipt when payment is committed; there is no draft receipt
 *     in the data model. The unique number is allocated at insert time.
 *
 * Rules this file MUST keep (mirrored from `../adapter.ts`):
 *
 *   1. Colors come from `LexPdfTokens` ONLY. No literal hex, no wide-gamut
 *      color functions, no CSS custom properties, no Tailwind class names —
 *      the PDF runtime silently falls back to black for any of those.
 *   2. Styles live in a single `StyleSheet.create({...})` block.
 *   3. Greek text MUST render through Crimson Pro / Noto Sans (registered at
 *      module top-level in `../adapter.ts`).
 *
 * EXCEPTION (PDF templates only): money + dates are formatted inline with
 * `Intl.NumberFormat` / `Intl.DateTimeFormat`, NOT via `src/lib/format.ts`.
 * The format.ts seam caches `Intl` instances at module scope, which is the
 * right call for the browser/server UI surface but wasted state for a PDF
 * render that runs once and discards. Inline construction also keeps the
 * rendered output deterministic + cache-friendly for the Phase 4 preview tool.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  Image,
} from "@react-pdf/renderer";
import { LexPdfTokens, type LexReceiptPdfInput } from "../adapter";

// -----------------------------------------------------------------------------
// Locale-aware labels.
//
// Greek text is embedded as literal UTF-8 — the registered Noto Sans + Crimson
// Pro variable fonts both ship full Greek subsets. ΑΠΟΔΕΙΞΗ is the formal term
// for "receipt" in Cyprus invoicing language; ΕΛΗΦΘΗ Η ΠΛΗΡΩΜΗ ("payment
// received") is the standard acknowledgement banner.
// -----------------------------------------------------------------------------

type LocaleKey = "el-CY" | "en-CY";

interface ReceiptLabels {
  receipt: string;
  paymentReceived: string;
  paidAt: string;
  forInvoice: string;
  paymentMethod: string;
  amount: string;
  billTo: string;
  taxId: string;
  vatNumber: string;
  iban: string;
  page: string;
}

const LABELS: Record<LocaleKey, ReceiptLabels> = {
  "el-CY": {
    receipt: "ΑΠΟΔΕΙΞΗ",
    paymentReceived: "ΕΛΗΦΘΗ Η ΠΛΗΡΩΜΗ",
    paidAt: "ΗΜΕΡΟΜΗΝΙΑ ΠΛΗΡΩΜΗΣ",
    forInvoice: "ΑΝΑΦΟΡΑ ΤΙΜΟΛΟΓΙΟΥ",
    paymentMethod: "ΤΡΟΠΟΣ ΠΛΗΡΩΜΗΣ",
    amount: "ΠΟΣΟ",
    billTo: "ΠΡΟΣ",
    taxId: "Α.Φ.Μ.",
    vatNumber: "ΦΠΑ",
    iban: "IBAN",
    page: "Σελ.",
  },
  "en-CY": {
    receipt: "RECEIPT",
    paymentReceived: "PAYMENT RECEIVED",
    paidAt: "PAID ON",
    forInvoice: "FOR INVOICE",
    paymentMethod: "PAYMENT METHOD",
    amount: "AMOUNT",
    billTo: "BILL TO",
    taxId: "TAX ID",
    vatNumber: "VAT",
    iban: "IBAN",
    page: "Page",
  },
};

// -----------------------------------------------------------------------------
// Stylesheet — same vocabulary as InvoiceDocument.tsx. Sizes in pt (72pt = 1in
// = 25.4mm). Margins use the `mm` shorthand which PDFKit's StyleSheet engine
// resolves natively.
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
  receiptCaption: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
    marginBottom: 4,
  },
  receiptNumber: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 24,
    // Receipts default to the success colour — a paid receipt is the terminal
    // state of an invoice, so the type takes on the `ok` token instead of the
    // accent terracotta. Matches the StatusPill "paid" tone in the workspace.
    color: LexPdfTokens.ok,
    marginBottom: 12,
  },
  receiptMeta: {
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
  // "Payment received" banner — the load-bearing acknowledgement. Sets the
  // semantic tone of the page; rendered as a single horizontal strip on
  // `LexPdfTokens.surface` with the success-tinted left edge.
  paymentBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
    marginBottom: 28,
    backgroundColor: LexPdfTokens.surface,
    borderLeftWidth: 3,
    borderLeftColor: LexPdfTokens.ok,
  },
  paymentBannerLabel: {
    fontFamily: "Noto Sans",
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: 0.8,
    color: LexPdfTokens.ok,
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
  // Body grid — left column is the invoice reference + payment method, right
  // column is the amount block. Side-by-side reads as one statement of fact.
  body: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 24,
  },
  bodyCol: {
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  detailRow: {
    flexDirection: "column",
    marginBottom: 14,
  },
  detailLabel: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
    marginBottom: 4,
  },
  detailValue: {
    fontFamily: "Noto Sans",
    fontWeight: 400,
    fontSize: 11,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
  },
  invoiceRefValue: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 14,
    color: LexPdfTokens.accent,
    fontVariant: ["tabular-nums"],
  },
  // Amount block — right-aligned, large, in Crimson Pro 600. Mirrors the
  // invoice TOTAL row so the eye lands on it the same way.
  amountBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: LexPdfTokens.text,
  },
  amountLabel: {
    fontFamily: "Noto Sans",
    fontWeight: 500,
    fontSize: 8,
    letterSpacing: 0.8,
    color: LexPdfTokens.muted,
    marginBottom: 4,
  },
  amountValue: {
    fontFamily: "Crimson Pro",
    fontWeight: 600,
    fontSize: 24,
    color: LexPdfTokens.text,
    fontVariant: ["tabular-nums"],
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

// -----------------------------------------------------------------------------
// Helpers — local, deterministic, no module-scoped caches.
// -----------------------------------------------------------------------------

/**
 * EXCEPTION: format.ts seam not used — see header comment. PDF render path
 * stays free of module-scoped Intl caches; a fresh formatter per call is
 * cheap at PDF-render scale and keeps output deterministic.
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

function formatDateForPdf(iso: string | null, locale: LocaleKey): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function pickClientName(
  client: LexReceiptPdfInput["client"],
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

const ReceiptDocument: React.FC<LexReceiptPdfInput> = ({
  workspace,
  client,
  invoice,
  receipt,
  locale,
}) => {
  const labels = LABELS[locale];
  const currency = invoice.currency || "EUR";
  const clientName = pickClientName(client, locale);
  const documentTitle = `${labels.receipt} ${receipt.receipt_number}`;

  return (
    <Document title={documentTitle} author={workspace.name} producer="Lex">
      <Page size="A4" style={styles.page}>
        {/* Header — firm block left, receipt meta right. */}
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
            <Text style={styles.receiptCaption}>{labels.receipt}</Text>
            <Text style={styles.receiptNumber}>{receipt.receipt_number}</Text>
            <View style={styles.receiptMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{labels.paidAt}</Text>
                <Text style={styles.metaValue}>
                  {formatDateForPdf(receipt.paid_at, locale)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment-received banner. */}
        <View style={styles.paymentBanner}>
          <Text style={styles.paymentBannerLabel}>{labels.paymentReceived}</Text>
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

        {/* Body — invoice reference + payment method on the left, amount on
            the right. The right column anchors the eye on the paid figure. */}
        <View style={styles.body}>
          <View style={styles.bodyCol}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{labels.forInvoice}</Text>
              <Text style={styles.invoiceRefValue}>{invoice.invoice_number}</Text>
            </View>
            {receipt.payment_method ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{labels.paymentMethod}</Text>
                <Text style={styles.detailValue}>{receipt.payment_method}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.bodyCol}>
            <View style={styles.amountBlock}>
              <Text style={styles.amountLabel}>{labels.amount}</Text>
              <Text style={styles.amountValue}>
                {formatMoneyForPdf(receipt.amount, currency, locale)}
              </Text>
            </View>
          </View>
        </View>

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
      </Page>
    </Document>
  );
};

export default ReceiptDocument;
