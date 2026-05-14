import { NextResponse } from "next/server";
import { z } from "zod";
import { locales } from "@/i18n/routing";

const Body = z.object({
  locale: z.enum(locales),
});

export async function POST(request: Request) {
  // Defense-in-depth CSRF guard. The locale cookie is non-session, but a
  // cross-site form POST could still flip a logged-in user's display
  // language mid-session. `sameSite: 'lax'` blocks most cases; an explicit
  // Origin check covers the rest.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    const originHost = (() => {
      try {
        return new URL(origin).host;
      } catch {
        return null;
      }
    })();
    if (!originHost || originHost !== host) {
      return NextResponse.json({ error: "bad_origin" }, { status: 403 });
    }
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set("NEXT_LOCALE", parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
