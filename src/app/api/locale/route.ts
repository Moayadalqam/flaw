import { NextResponse } from "next/server";
import { z } from "zod";
import { locales } from "@/i18n/routing";

const Body = z.object({
  locale: z.enum(locales),
});

export async function POST(request: Request) {
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
