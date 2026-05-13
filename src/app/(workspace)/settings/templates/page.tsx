import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplateSettingsForm } from "@/app/(workspace)/settings/templates/TemplateSettingsForm";
import type { InvoiceRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Template settings · Lex",
};

export const dynamic = "force-dynamic";

/**
 * Settings → Templates page.
 *
 * Server component — fetches the current workspace row (top-level columns +
 * `template_settings` JSONB) plus the first finalized invoice in the workspace
 * to use as the PDF preview seed. Hands typed values to the client-island
 * `TemplateSettingsForm`.
 *
 * Auth gating is enforced by `(workspace)/layout.tsx` (redirects to /login on
 * no-user). We still guard against the no-workspace edge case here — a
 * signed-in user without a workspace row (chicken-and-egg pre-onboarding)
 * gets redirected to /dashboard, which is where workspace bootstrapping lives.
 */

interface WorkspaceWithSettings {
  id: string;
  vat_number: string | null;
  tax_id: string | null;
  iban: string | null;
  template_settings: {
    logo_data_url?: string | null;
    accent_hex?: string | null;
    footer_text?: string | null;
  } | null;
}

export default async function TemplateSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Defensive — the workspace layout already redirected, but tsc cannot
    // see through that.
    redirect("/login");
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, vat_number, tax_id, iban, template_settings")
    .eq("owner_user_id", user.id)
    .maybeSingle<WorkspaceWithSettings>();

  if (!workspace) {
    redirect("/dashboard");
  }

  // Pull the first finalized invoice — preview iframe targets this. A
  // workspace with no finalized invoices yet renders an empty-state placeholder
  // instead of a broken iframe.
  const { data: previewInvoice } = await supabase
    .from("invoices")
    .select("id")
    .eq("status", "finalized")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<Pick<InvoiceRow, "id">>();

  const settings = workspace.template_settings ?? {};

  return (
    <div className="w-full max-w-6xl mx-auto">
      <Link
        href="/dashboard"
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
      >
        ← Back to dashboard
      </Link>

      <header className="mt-6 mb-10">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
        >
          Settings
        </p>
        <h1
          className="font-display text-4xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          Template settings
        </h1>
        <p
          className="text-sm mt-3 max-w-xl"
          style={{ color: "var(--muted)" }}
        >
          Customise how invoices and receipts render. Changes take effect on
          the next document opened.
        </p>
      </header>

      <TemplateSettingsForm
        initial={{
          iban: workspace.iban,
          tax_id: workspace.tax_id,
          vat_number: workspace.vat_number,
          footer_text: settings.footer_text ?? null,
          accent_hex: settings.accent_hex ?? null,
          logo_data_url: settings.logo_data_url ?? null,
        }}
        previewInvoiceId={previewInvoice?.id ?? null}
      />
    </div>
  );
}
