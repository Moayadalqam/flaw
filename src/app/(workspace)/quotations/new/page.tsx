import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewQuotationForm } from "@/app/(workspace)/quotations/NewQuotationForm";
import type { ClientRow, MatterRow } from "@/lib/types";
import type { LexLocale } from "@/lib/format";

export const metadata: Metadata = {
  title: "New quotation · Lex",
};

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const supabase = await createClient();
  const locale = (await getLocale()) as LexLocale;

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

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Link
        href="/quotations"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← All quotations
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
          New quotation
        </h1>
      </header>

      <div
        className="rounded-md border p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
        }}
      >
        <NewQuotationForm clients={clients} matters={matters} locale={locale} />
      </div>
    </div>
  );
}
