import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  NewInvoiceForm,
  type DraftLine,
} from "@/app/(workspace)/invoices/NewInvoiceForm";
import type {
  ClientRow,
  MatterRow,
  TimeEntryWithRelations,
} from "@/lib/types";
import type { LexLocale } from "@/lib/format";

export const metadata: Metadata = {
  title: "New invoice · Lex",
};

export const dynamic = "force-dynamic";

// Permissive UUID-shape regex — mirrors `(workspace)/invoices/actions.ts`.
// Used here only to gate the `from_time_entry` prefill query.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NewInvoicePageProps {
  searchParams: Promise<{
    from_time_entry?: string | string[];
  }>;
}

export default async function NewInvoicePage({
  searchParams,
}: NewInvoicePageProps) {
  const supabase = await createClient();
  const locale = (await getLocale()) as LexLocale;
  const params = await searchParams;

  // Pull all clients + matters in the workspace; the form filters matters
  // client-side by selected client. Both queries are RLS-scoped.
  const [clientsRes, mattersRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name_el, name_en")
      .order("name_el", { ascending: true })
      .returns<Pick<ClientRow, "id" | "name_el" | "name_en">[]>(),
    supabase
      .from("matters")
      .select("id, client_id, matter_number, title")
      .order("matter_number", { ascending: true })
      .returns<
        Pick<MatterRow, "id" | "client_id" | "matter_number" | "title">[]
      >(),
  ]);

  const clients = clientsRes.data ?? [];
  const matters = mattersRes.data ?? [];

  // ──────────────────────────────────────────────────────────────────────
  // `from_time_entry` prefill (REQ-009 → invoice handoff)
  //
  // When the timer dashboard fires `billHoursAction(id)`, we land here with
  // `?from_time_entry=<uuid>`. We RLS-fetch that entry (joined matter +
  // matter.client) and build a one-row line-item prefill:
  //   description = (entry.description || matter.title) + ' · ' + matter_number
  //   quantity    = round(duration_seconds / 36) / 100        (2dp hours)
  //   unit_price  = entry.hourly_rate
  //   kind        = 'service'
  // Plus pre-selected client + matter on the form.
  //
  // The hidden `from_time_entry` field is then carried through `<form>` to
  // `createInvoiceAction`, which flips the time entry's status to 'billed'
  // post-save (see invoices/actions.ts header).
  // ──────────────────────────────────────────────────────────────────────
  const rawFromTimeEntry = Array.isArray(params.from_time_entry)
    ? params.from_time_entry[0]
    : params.from_time_entry;
  const fromTimeEntryId =
    rawFromTimeEntry && UUID_RE.test(rawFromTimeEntry)
      ? rawFromTimeEntry
      : null;

  let initialLineItems: DraftLine[] | undefined;
  let initialClientId: string | undefined;
  let initialMatterId: string | undefined;

  if (fromTimeEntryId) {
    const { data: entry } = await supabase
      .from("time_entries")
      .select(
        "id, description, started_at, duration_seconds, hourly_rate, status, invoice_id, matter_id, matters!inner(matter_number, title, client_id)",
      )
      .eq("id", fromTimeEntryId)
      .eq("status", "completed")
      .is("invoice_id", null)
      .maybeSingle<
        Pick<
          TimeEntryWithRelations,
          | "id"
          | "description"
          | "started_at"
          | "duration_seconds"
          | "hourly_rate"
          | "status"
          | "invoice_id"
          | "matter_id"
          | "matters"
        >
      >();

    if (entry && entry.matters) {
      const seconds = entry.duration_seconds ?? 0;
      // 5400s → 1.50 hours; the `/36 then /100` preserves 2dp without FP drift.
      const hours = Math.round(seconds / 36) / 100;
      const quantity = hours.toFixed(2);
      const matterNumber = entry.matters.matter_number;
      const descBase = entry.description ?? entry.matters.title;
      const description = `${descBase} · ${matterNumber}`;

      initialLineItems = [
        {
          description,
          quantity,
          unit_price: String(entry.hourly_rate ?? ""),
        },
      ];
      initialClientId = entry.matters.client_id;
      initialMatterId = entry.matter_id;
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Link
        href="/invoices"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← All invoices
      </Link>

      <header className="mt-6 mb-8">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          New
        </p>
        <h1
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          New invoice
        </h1>
      </header>

      <div
        className="rounded-md border p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
        }}
      >
        <NewInvoiceForm
          clients={clients}
          matters={matters}
          locale={locale}
          initialLineItems={initialLineItems}
          initialClientId={initialClientId}
          initialMatterId={initialMatterId}
          fromTimeEntryId={fromTimeEntryId ?? undefined}
        />
      </div>
    </div>
  );
}
