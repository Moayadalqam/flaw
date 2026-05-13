import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewRetainerForm } from "@/app/(workspace)/retainers/NewRetainerForm";
import type { ClientRow, MatterRow } from "@/lib/types";
import type { LexLocale } from "@/lib/format";

export const metadata: Metadata = {
  title: "New retainer · Lex",
};

export const dynamic = "force-dynamic";

export default async function NewRetainerPage() {
  const supabase = await createClient();
  const t = await getTranslations("retainers");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // Pull all clients + matters in the workspace; the form filters matters
  // client-side by the picked client. Both queries are RLS-scoped.
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
    <div className="w-full max-w-3xl mx-auto">
      <Link
        href="/retainers"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← {t("title")}
      </Link>

      <header className="mt-6 mb-8">
        <p
          className="tabular"
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--trust)",
            marginBottom: "var(--space-2)",
            fontWeight: 500,
          }}
        >
          {t("new")}
        </p>
        <h1
          className="font-display tracking-tight"
          style={{
            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
            color: "var(--trust)",
            letterSpacing: "-0.018em",
            fontWeight: 600,
          }}
        >
          {t("new")}
        </h1>
      </header>

      <div
        className="rounded-md"
        style={{
          padding: "var(--space-6)",
          background: "var(--surface)",
          border: "1px solid var(--line)",
        }}
      >
        <NewRetainerForm
          clients={clients}
          matters={matters}
          isGreek={isGreek}
        />
      </div>
    </div>
  );
}
