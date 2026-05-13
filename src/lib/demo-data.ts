// Hardcoded demo data — matches supabase/seed.sql exactly.
// Used by the demo pages so the URL deploys statically to Vercel and Fotini
// sees the same numbers in the browser that the database has.

export type Client = {
  id: string;
  nameEl: string;
  nameEn: string;
  vat: string | null;
  email: string | null;
  language: "el" | "en";
  matters: string[];
};

export type Matter = {
  id: string;
  number: string;
  title: string;
  titleEl: string;
  type: string;
  status: "open" | "closed";
  clientId: string;
  hourlyRate: number;
};

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Invoice = {
  id: string;
  number: string;
  status: "draft" | "finalized" | "paid";
  clientId: string;
  matterId: string;
  issuedAt: string;
  dueAt: string;
  language: "el" | "en";
  lineItems: LineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
};

export type Quotation = {
  id: string;
  number: string;
  status: "draft" | "sent" | "accepted" | "declined";
  clientId: string;
  matterId: string;
  issuedAt: string;
  validUntil: string;
  language: "el" | "en";
  lineItems: LineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  convertedInvoiceId?: string;
};

export type Receipt = {
  id: string;
  number: string;
  invoiceId: string;
  paidAt: string;
  amount: number;
  method: string;
};

export type Retainer = {
  id: string;
  number: string;
  clientId: string;
  matterId: string | null;
  deposit: number;
  status: "active" | "depleted" | "closed";
  signedAt: string;
  terms: string;
  termsEl: string;
};

export type TrustEntry = {
  id: string;
  clientId: string;
  kind: "deposit" | "fee_transfer" | "refund";
  debit: number;
  credit: number;
  description: string;
  occurredAt: string;
};

export const CLIENTS: Client[] = [
  { id: "c01", nameEl: "Νικόλας Χριστοδουλίδης", nameEn: "Nikolas Christodoulides", vat: "CY11111111A", email: "nikolas@example.cy", language: "el", matters: ["m01"] },
  { id: "c02", nameEl: "Ελένη Παπαδοπούλου", nameEn: "Eleni Papadopoulou", vat: "CY22222222B", email: "eleni@example.cy", language: "el", matters: ["m02"] },
  { id: "c03", nameEl: "Ανδρέας Ανδρέου", nameEn: "Andreas Andreou", vat: "CY33333333C", email: "andreas@example.cy", language: "el", matters: ["m03"] },
  { id: "c04", nameEl: "Μαρία Κωνσταντίνου", nameEn: "Maria Konstantinou", vat: "CY44444444D", email: "maria@example.cy", language: "el", matters: ["m04"] },
  { id: "c05", nameEl: "Γεώργιος Δημητρίου", nameEn: "Georgios Demetriou", vat: "CY55555555E", email: "georgios@example.cy", language: "el", matters: ["m05"] },
  { id: "c06", nameEl: "Helena Smith", nameEn: "Helena Smith", vat: null, email: "helena@example.com", language: "en", matters: [] },
  { id: "c07", nameEl: "John O'Connor", nameEn: "John O'Connor", vat: null, email: "john@example.com", language: "en", matters: [] },
  { id: "c08", nameEl: "Σταυρούλα Λοΐζου", nameEn: "Stavroula Loizou", vat: "CY66666666F", email: "stavroula@example.cy", language: "el", matters: [] },
  { id: "c09", nameEl: "Πέτρος Ιωάννου", nameEn: "Petros Ioannou", vat: "CY77777777G", email: "petros@example.cy", language: "el", matters: [] },
  { id: "c10", nameEl: "Trust-Only Test Client", nameEn: "Trust-Only Test Client", vat: null, email: null, language: "en", matters: [] },
];

export const MATTERS: Matter[] = [
  { id: "m01", number: "2026-M-0001", title: "Divorce filing", titleEl: "Αίτηση διαζυγίου", type: "divorce", status: "open", clientId: "c01", hourlyRate: 180 },
  { id: "m02", number: "2026-M-0002", title: "Permanent residence application", titleEl: "Αίτηση μόνιμης διαμονής", type: "immigration", status: "open", clientId: "c02", hourlyRate: 220 },
  { id: "m03", number: "2026-M-0003", title: "Property title transfer", titleEl: "Μεταβίβαση τίτλου ιδιοκτησίας", type: "property", status: "open", clientId: "c03", hourlyRate: 200 },
  { id: "m04", number: "2026-M-0004", title: "Custody modification", titleEl: "Τροποποίηση επιμέλειας", type: "divorce", status: "open", clientId: "c04", hourlyRate: 190 },
  { id: "m05", number: "2026-M-0005", title: "Corporate restructuring", titleEl: "Εταιρική αναδιάρθρωση", type: "commercial", status: "open", clientId: "c05", hourlyRate: 250 },
];

export const INVOICES: Invoice[] = [
  {
    id: "i01",
    number: "2026/0001",
    status: "finalized",
    clientId: "c01",
    matterId: "m01",
    issuedAt: "2026-04-08",
    dueAt: "2026-05-08",
    language: "el",
    lineItems: [
      { description: "Initial consultation", quantity: 2, unitPrice: 180, total: 360 },
      { description: "Drafting petition", quantity: 4, unitPrice: 180, total: 720 },
    ],
    subtotal: 1080,
    vatRate: 0.19,
    vatAmount: 205.2,
    total: 1285.2,
  },
  {
    id: "i02",
    number: "2026/0002",
    status: "finalized",
    clientId: "c02",
    matterId: "m02",
    issuedAt: "2026-04-15",
    dueAt: "2026-05-15",
    language: "el",
    lineItems: [
      { description: "Permanent residence application", quantity: 1, unitPrice: 1500, total: 1500 },
    ],
    subtotal: 1500,
    vatRate: 0.19,
    vatAmount: 285,
    total: 1785,
  },
  {
    id: "i03",
    number: "2026/0003",
    status: "finalized",
    clientId: "c03",
    matterId: "m03",
    issuedAt: "2026-04-22",
    dueAt: "2026-05-22",
    language: "el",
    lineItems: [
      { description: "Title search", quantity: 3, unitPrice: 200, total: 600 },
      { description: "Contract review", quantity: 5, unitPrice: 200, total: 1000 },
    ],
    subtotal: 1600,
    vatRate: 0.19,
    vatAmount: 304,
    total: 1904,
  },
];

export const QUOTATIONS: Quotation[] = [
  {
    id: "q01",
    number: "2026/Q-0001",
    status: "sent",
    clientId: "c04",
    matterId: "m04",
    issuedAt: "2026-05-02",
    validUntil: "2026-06-02",
    language: "el",
    lineItems: [
      { description: "Custody modification — drafting", quantity: 6, unitPrice: 190, total: 1140 },
      { description: "Court appearance estimate", quantity: 3, unitPrice: 190, total: 570 },
    ],
    subtotal: 1710,
    vatAmount: 324.9,
    total: 2034.9,
  },
  {
    id: "q02",
    number: "2026/Q-0002",
    status: "accepted",
    clientId: "c05",
    matterId: "m05",
    issuedAt: "2026-04-28",
    validUntil: "2026-05-28",
    language: "en",
    lineItems: [
      { description: "Corporate restructuring — diligence", quantity: 8, unitPrice: 250, total: 2000 },
      { description: "Restructuring agreement drafting", quantity: 10, unitPrice: 250, total: 2500 },
    ],
    subtotal: 4500,
    vatAmount: 855,
    total: 5355,
  },
  {
    id: "q03",
    number: "2026/Q-0003",
    status: "draft",
    clientId: "c08",
    matterId: "m04",
    issuedAt: "2026-05-10",
    validUntil: "2026-06-10",
    language: "el",
    lineItems: [
      { description: "Initial consultation", quantity: 2, unitPrice: 200, total: 400 },
    ],
    subtotal: 400,
    vatAmount: 76,
    total: 476,
  },
];

export const RECEIPTS: Receipt[] = [
  {
    id: "r01",
    number: "2026/R-0001",
    invoiceId: "i01",
    paidAt: "2026-04-25",
    amount: 1285.2,
    method: "Bank transfer",
  },
];

export const RETAINERS: Retainer[] = [
  {
    id: "ret01",
    number: "2026-R-0001",
    clientId: "c01",
    matterId: "m01",
    deposit: 2000,
    status: "active",
    signedAt: "2026-04-01",
    terms: "Retainer for divorce matter — drawn down as billed.",
    termsEl: "Καταπιστευτικό ποσό για υπόθεση διαζυγίου — αναλώνεται κατά τη χρέωση.",
  },
  {
    id: "ret02",
    number: "2026-R-0002",
    clientId: "c10",
    matterId: null,
    deposit: 5000,
    status: "active",
    signedAt: "2026-04-05",
    terms: "Initial deposit, no matter yet — trust-only.",
    termsEl: "Αρχική κατάθεση, χωρίς υπόθεση ακόμα.",
  },
];

export const TRUST_LEDGER: TrustEntry[] = [
  {
    id: "t01",
    clientId: "c01",
    kind: "deposit",
    debit: 2000,
    credit: 0,
    description: "Retainer deposit — divorce matter (Christodoulides)",
    occurredAt: "2026-04-01",
  },
  {
    id: "t02",
    clientId: "c10",
    kind: "deposit",
    debit: 5000,
    credit: 0,
    description: "Initial deposit — Trust-Only Test Client",
    occurredAt: "2026-04-05",
  },
];

// Formatters — el-CY locale produces 1.234,56 € and DD/MM/YYYY.
export const eur = new Intl.NumberFormat("el-CY", {
  style: "currency",
  currency: "EUR",
});

export const date = new Intl.DateTimeFormat("el-CY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function getClient(id: string): Client | undefined {
  return CLIENTS.find((c) => c.id === id);
}

export function getMatter(id: string): Matter | undefined {
  return MATTERS.find((m) => m.id === id);
}

export function getInvoice(id: string): Invoice | undefined {
  return INVOICES.find((i) => i.id === id);
}

export function getQuotation(id: string): Quotation | undefined {
  return QUOTATIONS.find((q) => q.id === id);
}

export function getRetainer(id: string): Retainer | undefined {
  return RETAINERS.find((r) => r.id === id);
}

/**
 * Mock AI-drafted bilingual reminder. If OpenRouter is wired (Phase 5),
 * `/api/ai/reminder` replaces this with a real call.
 */
export function draftReminderEmail(invoice: Invoice): {
  to: string | null;
  subject: string;
  body: string;
  language: "el" | "en";
} {
  const client = getClient(invoice.clientId);
  const matter = getMatter(invoice.matterId);
  const lang = client?.language ?? "en";
  const due = new Date(invoice.dueAt);
  const today = new Date("2026-05-13");
  const daysLate = Math.floor(
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (lang === "el") {
    return {
      to: client?.email ?? null,
      subject: `Υπενθύμιση πληρωμής — Τιμολόγιο ${invoice.number}`,
      body: `Αγαπητέ/ή ${client?.nameEl ?? ""},

Σας υπενθυμίζουμε ότι το τιμολόγιο ${invoice.number} με ημερομηνία λήξης ${due.toLocaleDateString("el-CY")} (${matter?.titleEl ?? ""}) παραμένει ανεξόφλητο.

Συνολικό ποσό: ${eur.format(invoice.total)}
Καθυστέρηση: ${daysLate} ημέρες

Παρακαλούμε εξοφλήστε στον τραπεζικό λογαριασμό:
IBAN CY17 0020 0128 0000 0012 0052 7600

Είμαστε στη διάθεσή σας για οποιαδήποτε ερώτηση.

Με εκτίμηση,
Δικηγορικό γραφείο Φωτεινής Κάντρη`,
      language: "el",
    };
  }
  return {
    to: client?.email ?? null,
    subject: `Payment reminder — Invoice ${invoice.number}`,
    body: `Dear ${client?.nameEn ?? ""},

This is a friendly reminder that invoice ${invoice.number} dated ${due.toLocaleDateString("en-GB")} (${matter?.title ?? ""}) remains unpaid.

Amount due: ${eur.format(invoice.total)}
Days overdue: ${daysLate}

Please settle to:
IBAN CY17 0020 0128 0000 0012 0052 7600

I'm available for any questions.

Best regards,
Fotini Kandri Law Office`,
    language: "en",
  };
}

/**
 * Fake AI parse — keyword/regex match on a natural-language invoice request.
 * Returns a draft invoice shape if recognisable, or an error string.
 * Real Lex hits OpenRouter with structured-output mode and Zod validation.
 */
export type DraftSuggestion = {
  client: Client;
  matter: Matter;
  description: string;
  amount: number;
  dueDays: number;
  subtotal: number;
  vatAmount: number;
  total: number;
};

export function parseInvoiceRequest(
  input: string,
): { ok: true; draft: DraftSuggestion } | { ok: false; reason: string } {
  const text = input.trim();
  if (text.length < 10) {
    return { ok: false, reason: "Tell me which client, what amount, and the due date." };
  }

  // Try to find a client — match any seed surname (Greek or English).
  const haystack = text.toLowerCase();
  const client =
    CLIENTS.find((c) => {
      const surnameEn = c.nameEn.split(" ").pop()?.toLowerCase() ?? "";
      const fullEn = c.nameEn.toLowerCase();
      const surnameEl = c.nameEl.split(" ").pop()?.toLowerCase() ?? "";
      const fullEl = c.nameEl.toLowerCase();
      return (
        (surnameEn.length > 3 && haystack.includes(surnameEn)) ||
        (fullEn.length > 4 && haystack.includes(fullEn)) ||
        (surnameEl.length > 3 && haystack.includes(surnameEl)) ||
        (fullEl.length > 4 && haystack.includes(fullEl))
      );
    }) ?? null;

  if (!client) {
    return {
      ok: false,
      reason:
        "I couldn't pick a client from your list. Try: \"Invoice Andreou for the divorce filing, €450, due in 14 days\".",
    };
  }

  // Amount — match €XX or EUR XX or "XX euros" or just a number.
  const amountMatch =
    text.match(/€\s*([\d.,]+)/) ||
    text.match(/EUR\s*([\d.,]+)/i) ||
    text.match(/([\d.,]+)\s*€/) ||
    text.match(/([\d.,]+)\s*eur(?:os)?/i) ||
    text.match(/\b(\d{2,5}(?:[.,]\d{2})?)\b/);
  if (!amountMatch) {
    return {
      ok: false,
      reason: "I see the client, but no amount. Add something like \"€450\".",
    };
  }
  const amount = parseFloat(amountMatch[1].replace(/[.,](\d{2})$/, ".$1").replace(/[,.](?=\d{3})/g, ""));
  if (Number.isNaN(amount) || amount <= 0) {
    return { ok: false, reason: "I couldn't parse the amount." };
  }

  // Due days — "due in N days" / "in N days" / "N days"
  const dueMatch =
    text.match(/due\s+in\s+(\d+)\s*days?/i) ||
    text.match(/in\s+(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*days?/i);
  const dueDays = dueMatch ? parseInt(dueMatch[1], 10) : 14;

  // Description — try to lift the "for X" clause.
  const forMatch = text.match(/for\s+the\s+([^,€.]+?)(?:\s*[,€]|$)/i) || text.match(/for\s+([^,€.]+?)(?:\s*[,€]|$)/i);
  const description = forMatch ? forMatch[1].trim() : "Legal services";

  // Match a matter belonging to this client if possible.
  const matter =
    MATTERS.find((m) => m.clientId === client.id) ??
    MATTERS[0];

  const vatAmount = +(amount * 0.19).toFixed(2);
  return {
    ok: true,
    draft: {
      client,
      matter,
      description: description.charAt(0).toUpperCase() + description.slice(1),
      amount,
      dueDays,
      subtotal: amount,
      vatAmount,
      total: +(amount + vatAmount).toFixed(2),
    },
  };
}
