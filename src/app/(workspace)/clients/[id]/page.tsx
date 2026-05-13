import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "@/app/(workspace)/clients/ClientForm";
import type { ClientRow } from "@/lib/types";
import type { LexLocale } from "@/lib/format";

export const metadata: Metadata = {
  title: "Client · Lex",
};

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const t = await getTranslations("clients");
  const locale = (await getLocale()) as LexLocale;
  const isGreek = locale === "el-CY";

  // RLS scopes the query — a deny returns 0 rows (not an exception).
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle<ClientRow>();

  if (!client) {
    notFound();
  }

  const primary = isGreek ? client.name_el : client.name_en;
  const secondary = isGreek ? client.name_en : client.name_el;
  const showSecondary = secondary && secondary !== primary;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <Link
        href="/clients"
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
          {t("edit")}
        </p>
        <h1
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {primary}
        </h1>
        {showSecondary ? (
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--muted)" }}
          >
            {secondary}
          </p>
        ) : null}
      </header>

      <div
        className="rounded-md border p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--line)",
        }}
      >
        <ClientForm
          mode="edit"
          initial={{
            id: client.id,
            name_el: client.name_el,
            name_en: client.name_en,
            vat_number: client.vat_number,
            tax_id: client.tax_id,
            email: client.email,
            phone: client.phone,
            address: client.address,
            preferred_language: client.preferred_language,
          }}
        />
      </div>
    </div>
  );
}
