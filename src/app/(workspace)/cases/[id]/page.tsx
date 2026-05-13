import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MatterForm } from "@/app/(workspace)/cases/MatterForm";
import type { ClientRow, MatterRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Case · Lex",
};

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("cases");

  const [matterRes, clientsRes] = await Promise.all([
    supabase
      .from("matters")
      .select("*")
      .eq("id", id)
      .maybeSingle<MatterRow>(),
    supabase
      .from("clients")
      .select("id, name_el, name_en")
      .order("name_el", { ascending: true })
      .returns<Pick<ClientRow, "id" | "name_el" | "name_en">[]>(),
  ]);

  const matter = matterRes.data;
  const clients = clientsRes.data ?? [];

  if (!matter) {
    notFound();
  }

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
          className="text-[10px] uppercase tracking-widest mb-2 tabular"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {matter.matter_number}
        </p>
        <h1
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {matter.title}
        </h1>
      </header>

      <div
        className="rounded-md border p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
        }}
      >
        <MatterForm
          mode="edit"
          initial={{
            id: matter.id,
            client_id: matter.client_id,
            matter_number: matter.matter_number,
            title: matter.title,
            matter_type: matter.matter_type,
            status: matter.status,
            default_hourly_rate: matter.default_hourly_rate,
          }}
          clients={clients}
        />
      </div>
    </div>
  );
}
