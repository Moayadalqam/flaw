"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DEMO_EMAIL = "fotini@kandri.law";

/**
 * Access-code sign-in. The pitch-demo gate: the lawyer types a 6-digit
 * code; on match, we sign them in as the seeded workspace user using the
 * Admin API + verifyOtp (no email round-trip, no rate limit).
 *
 * Code source of truth: env var LEX_ACCESS_CODE. If unset, falls back to
 * the documented demo default so a fresh clone "just works".
 */
const FALLBACK_ACCESS_CODE = "516278";

export async function accessCodeSignInAction(formData: FormData): Promise<{
  ok: false;
  error: "invalid_code" | "server";
}> {
  const submitted = (formData.get("code") ?? "").toString().trim();
  const expected = (process.env.LEX_ACCESS_CODE ?? FALLBACK_ACCESS_CODE).trim();

  if (!submitted || submitted !== expected) {
    return { ok: false, error: "invalid_code" };
  }

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
  });
  if (error || !data?.properties?.hashed_token) {
    return { ok: false, error: "server" };
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyErr) {
    return { ok: false, error: "server" };
  }

  redirect("/dashboard");
}
