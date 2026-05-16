"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DEMO_EMAIL = "fotini.placeholder@lex.local";

/**
 * Demo-mode sign-in. Bypasses email entirely:
 *
 *   1. service_role calls `auth.admin.generateLink({type: 'magiclink'})`
 *      which returns a `hashed_token`. No email is sent.
 *   2. The SSR-cookie-aware client calls `auth.verifyOtp({token_hash,
 *      type: 'magiclink'})`, which exchanges the token for a session
 *      and writes the auth cookies on the response.
 *   3. We `redirect('/dashboard')` — Next.js converts this throw into
 *      a 303 the browser follows; cookies are already in place.
 *
 * We never hand control back to Supabase's verify endpoint, so the
 * project's Site URL / Redirect URL config doesn't matter (which is
 * why the previous redirect-through-Supabase flow ended up at
 * localhost:3000 — that's the project default Site URL).
 *
 * Gated by DEMO_CACHE=true so this surface vanishes the moment we
 * graduate from demo mode.
 */
export async function demoSignInAction(): Promise<{
  ok: false;
  error: string;
}> {
  if (process.env.DEMO_CACHE?.trim() !== "true") {
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
