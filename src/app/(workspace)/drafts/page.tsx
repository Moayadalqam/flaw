import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type { InvoiceRow, InvoiceWithRelations } from "@/lib/types";

/**
 * AI Drafts review queue (Phase 5 Task 2).
 *
 * Lists every invoice in the user's workspace with
 * `status='draft' AND created_by_ai=true`. The list is the human-in-the-loop
 * gate the lawyer sees before any invoice number is allocated — finalize
 * happens from `/drafts/[id]`, which routes through the existing
 * finalizeInvoiceAction (the sole service-role bridge).
 *
 * RLS scopes the query — no `.eq('workspace_id', …)` needed at the call
 * site. Defense in depth: the table reads ONLY `status='draft'` rows so
 * even a hypothetical RLS regression cannot expose finalized data here.
 *
 * Strings are hardcoded bilingually (matches Phase 3 invoices/page.tsx
 * voice). The `drafts.*` i18n namespace is owned by Task 4 (parallel build);
 * Task 4 will swap these literals for `t('drafts.…')` calls in its commit.
 * i18n: drafts.* pending Task 4
 */

export const metadata: Metadata = {
  title: "AI Drafts · Lex",
};

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const supabase = await createClient();
  const tInvoices = await getTranslations("invoices");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  const { data: draftsData } = await supabase
    .from("invoices")
    .select(
      "*, clients!inner(name_el, name_en), matters!inner(matter_number, title)",
    )
    .eq("status", "draft")
    .eq("created_by_ai", true)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<InvoiceWithRelations[]>();
  const drafts: InvoiceWithRelations[] = draftsData ?? [];

  const titleLabel = isGreek ? "Πρόχειρα AI" : "AI Drafts";
  const subtitleLabel = isGreek
    ? "Προτεινόμενα τιμολόγια — προς έλεγχο πριν την οριστικοποίηση."
    : "Proposed invoices — review before finalizing.";
  const emptyLabel = isGreek
    ? "Κανένα πρόχειρο ακόμα — άνοιξε ⌘K και περίγραψε ένα τιμολόγιο."
    : "No AI drafts yet — open ⌘K and describe an invoice.";
  const pendingLabel = isGreek ? "Πρόχειρο" : "DRAFT";
  const captionLabel = isGreek ? "Φάση 5 · Βοηθός AI" : "Phase 5 · Assistant";

  const columns: Column<InvoiceWithRelations>[] = [
    {
      key: "client",
      header: tInvoices("client"),
      render: (row: InvoiceWithRelations) => {
        if (!row.clients) {
          return <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>;
        }
        const primary = isGreek ? row.clients.name_el : row.clients.name_en;
        return <span style={{ color: "var(--text)" }}>{primary}</span>;
      },
    },
    {
      key: "matter",
      header: tInvoices("matter"),
      render: (row: InvoiceWithRelations) => (
        <span
          className="tabular text-xs"
          style={{ color: "var(--muted)" }}
        >
          {row.matters?.matter_number ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "issued",
      header: tInvoices("issued"),
      numeric: true,
      render: (row: InvoiceRow) =>
        row.issued_at ? (
          <span style={{ color: "var(--muted)" }}>
            {formatDate(row.issued_at, locale)}
          </span>
        ) : (
          <span style={{ color: "var(--dim)" }}>{"\u2014"}</span>
        ),
    },
    {
      key: "total",
      header: tInvoices("total"),
      numeric: true,
      render: (row: InvoiceRow) => (
        <span style={{ color: "var(--text)", fontWeight: 500 }}>
          {formatMoney(Number(row.total), row.currency, locale)}
        </span>
      ),
    },
    {
      key: "status",
      header: tInvoices("status"),
      align: "center",
      render: () => (
        <StatusPill tone="muted">{pendingLabel}</StatusPill>
      ),
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="mb-10">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
        >
          {captionLabel}
        </p>
        <h1
          className="font-display text-4xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {titleLabel}
        </h1>
        <p
          className="text-sm mt-3 max-w-xl"
          style={{ color: "var(--muted)" }}
        >
          {subtitleLabel}
        </p>
      </header>

      <Table<InvoiceWithRelations>
        columns={columns}
        rows={drafts}
        emptyLabel={emptyLabel}
        rowHref={(row) => `/drafts/${row.id}`}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
