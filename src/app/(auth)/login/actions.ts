"use server";

import { createServiceClient } from "@/lib/supabase/service";

const DEMO_EMAIL = "fotini.placeholder@lex.local";

/**
 * Demo-mode bypass for Supabase's shared-SMTP rate limit.
 *
 * `fotini.placeholder@lex.local` is a placeholder seed user with no real
 * mailbox — magic-link emails sent to it go nowhere AND the project's
 * shared-SMTP rate limit (2/hr default) blocks repeat attempts during a
 * pitch demo. This action uses the Admin API to generate a magic-link
 * server-side and returns the action_link, which the client navigates to
 * directly. Supabase's /auth/v1/verify endpoint then redirects through
 * our /auth/callback, which exchanges the code for a session cookie.
 *
 * Only available when DEMO_CACHE=true (the same flag that gates AI cache
 * mode for the pitch). In normal operation the magic-link form is the
 * canonical sign-in path.
 */
export async function demoSignInAction(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  if (process.env.DEMO_CACHE?.trim() !== "true") {
    return { ok: false, error: "demo_disabled" };
  }

  const supabase = createServiceClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback`;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    return { ok: false, error: error?.message ?? "generate_link_failed" };
  }

  return { ok: true, url: data.properties.action_link };
}
