import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClientForm } from "@/app/(workspace)/clients/ClientForm";

export const metadata: Metadata = {
  title: "New client · Lex",
};

export default async function NewClientPage() {
  const t = await getTranslations("clients");
  const tActions = await getTranslations("actions");

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
        <ClientForm mode="create" />
      </div>
    </div>
  );
}
