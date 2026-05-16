"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DEMO_EMAIL = "fotini@kandri.law";

function isDemoMode(): boolean {
  return process.env.DEMO_CACHE?.trim() === "true";
}

/**
 * Email + password sign-in. The SSR-cookie-aware client handles the
 * session write; on success we redirect to /dashboard. On invalid
 * credentials we return a structured error for the client to render.
 */
export async function passwordSignInAction(formData: FormData): Promise<{
  ok: false;
  error: "invalid_credentials" | "invalid_input" | string;
}> {
  const email = (formData.get("email") ?? "").toString().trim();
  const password = (formData.get("password") ?? "").toString();

  if (!email || !password || password.length < 6) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, error: "invalid_credentials" };
  }

  redirect("/dashboard");
}

/**
 * One-click demo sign-in. Verifies a magic-link token server-side so we
 * never bounce through Supabase's verify endpoint (which would otherwise
 * follow the project's Site URL config). Gated by DEMO_CACHE=true.
 */
export async function demoSignInAction(): Promise<{
  ok: false;
  error: string;
}> {
  if (!isDemoMode()) {
    return { ok: false, error: "demo_disabled" };
  }

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
  });

  if (error || !data?.properties?.hashed_token) {
    return {
      ok: false,
      error: error?.message ?? "generate_link_failed",
    };
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });

  if (verifyErr) {
    return { ok: false, error: verifyErr.message };
  }

  redirect("/dashboard");
}
