import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard · Lex",
};

export const dynamic = "force-dynamic";

async function loadCounts() {
  const supabase = await createClient();

  // RLS scopes every count to the authenticated user's workspace.
  // `count: 'exact', head: true` returns only the count — no row payload.
  const [clientsRes, mattersRes, invoicesRes] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("matters").select("id", { count: "exact", head: true }),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .neq("status", "draft"),
  ]);

  return {
    clients: clientsRes.count ?? 0,
    cases: mattersRes.count ?? 0,
    invoices: invoicesRes.count ?? 0,
  };
}

export default async function DashboardPage() {
  const [t, counts] = await Promise.all([
    getTranslations("dashboard"),
    loadCounts(),
  ]);

  const cards = [
    {
      key: "clients",
      label: t("clientsLabel"),
      help: t("clientsHelp"),
      value: counts.clients,
    },
    {
      key: "cases",
      label: t("casesLabel"),
      help: t("casesHelp"),
      value: counts.cases,
    },
    {
      key: "invoices",
      label: t("invoicesLabel"),
      help: t("invoicesHelp"),
      value: counts.invoices,
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="mb-10">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--accent)" }}
        >
          Lex
        </p>
        <h1
          className="font-display text-4xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {t("title")}
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--muted)" }}
        >
          {t("subtitle")}
        </p>
      </header>

      <section
        aria-label={t("title")}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((card) => (
          <article
            key={card.key}
            className="rounded-md border p-5"
            style={{
              background: "var(--surface)",
              borderColor: "var(--line)",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--dim)" }}
            >
              {card.label}
            </div>
            <div
              className="font-display tabular mt-3"
              style={{
                color: "var(--text)",
                fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)",
                lineHeight: 1.04,
                letterSpacing: "-0.025em",
              }}
            >
              {card.value}
            </div>
            <div
              className="text-xs mt-2"
              style={{ color: "var(--muted)" }}
            >
              {card.help}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
