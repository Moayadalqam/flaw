import type { Metadata } from "next";
import { redirect } from "next/navigation";
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

  return (
    <div>
      <div className="text-center mb-8">
        <div
          className="font-display text-3xl tracking-tight"
          style={{ color: "var(--accent)", letterSpacing: "-0.025em" }}
        >
          Lex
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          Sign in to your workspace.
        </p>
      </div>
      <LoginForm />
      <p
        className="text-xs text-center mt-8"
        style={{ color: "var(--dim)" }}
      >
        A magic link will be emailed to you. No passwords, ever.
      </p>
    </div>
  );
}
