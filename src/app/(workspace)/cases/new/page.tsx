import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MatterForm } from "@/app/(workspace)/cases/MatterForm";
import type { ClientRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "New case · Lex",
};

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const supabase = await createClient();
  const t = await getTranslations("cases");
  const tActions = await getTranslations("actions");

  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name_el, name_en")
    .order("name_el", { ascending: true })
    .returns<Pick<ClientRow, "id" | "name_el" | "name_en">[]>();
  const clients = clientsData ?? [];

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Link
        href="/cases"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← {t("back")}
      </Link>

      <header className="mt-6 mb-8">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {tActions("new")}
        </p>
        <h1
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {t("new")}
        </h1>
      </header>

      <div
        className="rounded-md border p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
        }}
      >
        <MatterForm mode="create" clients={clients} />
      </div>
    </div>
  );
}
