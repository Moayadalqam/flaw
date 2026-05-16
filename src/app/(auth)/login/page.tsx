import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in · Lex",
  description: "Sign in to your Lex workspace via magic link.",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }
  const t = await getTranslations("login");

  return (
    <div>
      <div className="text-center mb-8">
        <div
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--accent)", letterSpacing: "-0.025em" }}
        >
          {t("title")}
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          {t("subtitle")}
        </p>
      </div>
      <LoginForm demoEnabled={process.env.DEMO_CACHE === "true"} />
      <p
        className="text-xs text-center mt-8"
        style={{ color: "var(--dim)" }}
      >
        {t("disclaimer")}
      </p>
    </div>
  );
}
