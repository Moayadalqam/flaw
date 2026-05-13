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

export type Receipt = {
  id: string;
  number: string;
  invoiceId: string;
  paidAt: string;
  amount: number;
  method: string;
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
