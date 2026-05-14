#!/usr/bin/env node
/**
 * tests/smoke-helpers.mjs — Shared helpers for the Phase 6 smoke suite.
 *
 * Exports:
 *   assert(cond, msg)               — throw on falsy; print pass/fail.
 *   fetchHtml(url, opts)            — fetch + return {status, headers, text}.
 *   fetchJson(url, opts)            — fetch + parse JSON; throw on non-200.
 *   newCookieJar()                  — minimal in-memory cookie jar.
 *   loginViaMailpit(email, baseUrl, jar)
 *                                   — drives OTP request → Mailpit poll →
 *                                     verifyOtp via supabase-js, then
 *                                     synthesizes the @supabase/ssr cookie
 *                                     the middleware expects.
 *   signedSupabaseClient()          — service-role client for direct DB
 *                                     queries (helpers only; smoke.mjs is
 *                                     the only file in Phase 6 outside the
 *                                     trust UI permitted to reference
 *                                     `trust_ledger`).
 *
 * Notes on email transport: Supabase's local stack ships **Mailpit** (not
 * Inbucket) on port 54424. The API is `/api/v1/messages` (list) and
 * `/api/v1/message/<id>` (body). Both differ from the Inbucket shape the
 * phase plan references — adapter rewritten accordingly.
 *
 * Login flow (post-investigation, see phase-6 task-5 commit message for the
 * full rationale):
 *   1. Spot-check Mailpit reachability (no email sent — preserves the
 *      `email_sent = 2/hour` rate-limit budget for production probes).
 *   2. (service-role) Idempotently provision the smoke user with a
 *      deterministic password via `auth.admin.{listUsers,createUser,
 *      updateUserById}`. Bypasses the email transport entirely.
 *   3. (anon) `auth.signInWithPassword` returns a full Session.
 *   4. Hand-roll the `sb-<host-prefix>-auth-token` cookie value that
 *      `@supabase/ssr` writes (cookieEncoding `base64url`, prefix `base64-`,
 *      payload is JSON.stringify(session)). Insert into the jar so every
 *      subsequent fetch carries a logged-in session.
 *   5. (service-role) Reassign `workspaces.owner_user_id` to the smoke
 *      user — mirrors OPERATOR.md §4's post-cloud-link procedure so RLS
 *      reveals the seed corpus to this session.
 *
 * Why not magic-link/OTP via email: Supabase's `auth/v1/verify` redirects
 * with tokens in the URL **fragment** (implicit flow), not a `?code=`
 * query — fragments never reach the server, so the app's `/auth/callback`
 * never sees a code to exchange. The OTP `verifyOtp` code path does work
 * but burns one of the 2 hourly email quota slots, which breaks repeated
 * dev-loop smoke runs. Password auth + service-role provisioning is the
 * stable substitute.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

// Load .env.local for SUPABASE_SERVICE_ROLE_KEY etc.
try {
  process.loadEnvFile(join(REPO_ROOT, ".env.local"));
} catch {
  /* absent or unreadable; npm script must export the required vars */
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54421";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const MAILPIT_BASE = process.env.MAILPIT_URL ?? "http://localhost:54424";

// ---------------------------------------------------------------------------
// Tiny assert
// ---------------------------------------------------------------------------

export function assert(cond, msg) {
  if (!cond) {
    console.error("    FAIL:", msg);
    throw new Error(msg);
  }
  console.log("    pass:", msg);
}

// ---------------------------------------------------------------------------
// Cookie jar — a Map<name, value> plus a render helper
// ---------------------------------------------------------------------------

export function newCookieJar() {
  return new Map();
}

function ingestSetCookie(jar, response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  for (const raw of setCookies) {
    // First "name=value" pair only — attributes follow after the first ;
    const firstSemi = raw.indexOf(";");
    const pair = firstSemi === -1 ? raw : raw.slice(0, firstSemi);
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    // RFC 6265: empty value clears the cookie. Mirror that.
    if (value === "" || value === '""') {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

export function renderCookieHeader(jar) {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// fetchHtml / fetchJson — minimal helpers that honour a cookie jar
// ---------------------------------------------------------------------------

export async function fetchHtml(url, opts = {}) {
  const { jar, ...rest } = opts;
  const headers = new Headers(rest.headers ?? {});
  if (jar && jar.size > 0) {
    headers.set("Cookie", renderCookieHeader(jar));
  }
  const res = await fetch(url, {
    ...rest,
    headers,
    redirect: rest.redirect ?? "manual",
  });
  if (jar) ingestSetCookie(jar, res);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, url };
}

export async function fetchJson(url, opts = {}) {
  const { jar, ...rest } = opts;
  const headers = new Headers(rest.headers ?? {});
  if (jar && jar.size > 0) {
    headers.set("Cookie", renderCookieHeader(jar));
  }
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(url, { ...rest, headers });
  if (jar) ingestSetCookie(jar, res);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Mailpit-based OTP login
// ---------------------------------------------------------------------------

async function clearMailpit() {
  try {
    await fetch(`${MAILPIT_BASE}/api/v1/messages`, { method: "DELETE" });
  } catch {
    /* mailpit may not be running; signInWithOtp will surface that */
  }
}

async function verifyMailpitReachable() {
  // Confirm the email transport is alive without burning the
  // `email_sent` rate-limit budget. A simple GET on the messages endpoint
  // returns 200 + `{ messages: [...] }` regardless of inbox state.
  //
  // SKIP_MAILPIT_PROBE=1 short-circuits this check entirely — required for
  // running the smoke suite against a production URL where Mailpit isn't
  // reachable (real SMTP transport instead).
  if (process.env.SKIP_MAILPIT_PROBE === "1") {
    return;
  }
  try {
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages?limit=1`);
    if (!res.ok) {
      throw new Error(`Mailpit /api/v1/messages returned HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `Mailpit unreachable at ${MAILPIT_BASE}: ${err.message ?? err}`,
    );
  }
}

// Kept for callers that need to drive the full magic-link email flow
// (e.g. a future verifier that asserts the inbox actually receives mail).
// eslint-disable-next-line no-unused-vars
async function pollMailpitForOtpCode(email, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  const lower = email.toLowerCase();
  while (Date.now() < deadline) {
    let listRes;
    try {
      listRes = await fetch(`${MAILPIT_BASE}/api/v1/messages?limit=10`);
    } catch (err) {
      throw new Error(`Mailpit unreachable at ${MAILPIT_BASE}: ${err.message}`);
    }
    if (listRes.ok) {
      const list = await listRes.json().catch(() => null);
      const msgs = Array.isArray(list?.messages) ? list.messages : [];
      // Newest first per Mailpit's default ordering.
      for (const m of msgs) {
        const to = Array.isArray(m.To) ? m.To : [];
        const matches = to.some(
          (addr) => String(addr.Address ?? "").toLowerCase() === lower,
        );
        if (!matches) continue;
        const bodyRes = await fetch(
          `${MAILPIT_BASE}/api/v1/message/${m.ID}`,
        );
        if (!bodyRes.ok) continue;
        const body = await bodyRes.json();
        const haystack = `${body.Text ?? ""}\n${body.HTML ?? ""}`;
        // Supabase magic-link emails always include:
        //   "Alternatively, enter the code: NNNNNN"
        const codeMatch = haystack.match(/enter the code:\s*(\d{6})/i);
        if (codeMatch) return codeMatch[1];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `OTP email did not arrive within ${timeoutMs}ms (Mailpit @ ${MAILPIT_BASE})`,
  );
}

function base64UrlEncode(buf) {
  return Buffer.from(buf, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function deriveStorageKey(supabaseUrl) {
  // Match @supabase/supabase-js (index.cjs:369):
  //   `sb-${baseUrl.hostname.split(".")[0]}-auth-token`
  const host = new URL(supabaseUrl).hostname;
  return `sb-${host.split(".")[0]}-auth-token`;
}

function serializeSessionToSsrCookieValue(session) {
  // @supabase/ssr writes base64-prefixed cookies (cookies.js:7-36, 188-194).
  // The payload is the JSON-stringified session object — chunker.js splits
  // it into `key`, `key.0`, `key.1` etc. if it exceeds 3180 chars. The
  // dashboard session for our smoke account stays well under that, so a
  // single cookie suffices.
  const payload = JSON.stringify(session);
  return `base64-${base64UrlEncode(payload)}`;
}

async function ensureUserExists(adminClient, email) {
  // Idempotent: list users (paged at 1000 — plenty for our single-tenant
  // local stack) and create the smoke user if absent. The dev stack's
  // `email_sent` rate limit is 2/hour (config.toml line 189), which would
  // break repeated smoke runs through the magic-link path. Provisioning
  // the user directly + signInWithPassword sidesteps email entirely.
  const SMOKE_PASSWORD = "smoke-test-fixed-password-not-a-secret";
  const { data: list } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existing = list?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!existing) {
    const { error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: SMOKE_PASSWORD,
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`admin.createUser failed: ${createErr.message}`);
    }
  } else {
    // Reset the password each run — guarantees signInWithPassword works
    // even if a prior run rotated it or the user predates this helper.
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      existing.id,
      { password: SMOKE_PASSWORD, email_confirm: true },
    );
    if (updateErr) {
      throw new Error(`admin.updateUserById failed: ${updateErr.message}`);
    }
  }
  return SMOKE_PASSWORD;
}

/**
 * Drive the smoke login:
 *   1. (service-role) Ensure `email` exists as a confirmed auth user with
 *      a deterministic password. Idempotent across runs.
 *   2. (anon) `auth.signInWithPassword({ email, password })` → Session.
 *   3. Format the Session into the SSR cookie the app's middleware reads
 *      (`sb-<host-prefix>-auth-token`, value `base64-<base64url(json)>`).
 *   4. (service-role) Reassign `workspaces.owner_user_id` to the new user
 *      so RLS reveals the seed corpus to this session — mirrors
 *      OPERATOR.md §4's post-cloud-link procedure.
 *
 * The function is still named `loginViaMailpit` for stability of the
 * import surface — the implementation bypasses Mailpit because the dev
 * stack's `email_sent = 2/hour` rate limit (config.toml:189) would make
 * back-to-back smoke runs unreliable. We additionally exercise the
 * Mailpit path in `verifyMailpitReachable` so the email transport is
 * still spot-checked even though it doesn't gate auth.
 *
 * Returns `{ status, url }` from a `/dashboard` probe so callers can
 * assert that the cookie was accepted by the app.
 */
export async function loginViaMailpit(email, baseUrl, jar) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing — cannot drive smoke login",
    );
  }
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — cannot provision smoke user",
    );
  }

  await clearMailpit();
  await verifyMailpitReachable();

  const adminClient = signedSupabaseClient();
  const smokePassword = await ensureUserExists(adminClient, email);

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: signInErr } = await authClient.auth.signInWithPassword({
    email,
    password: smokePassword,
  });
  if (signInErr) {
    throw new Error(`signInWithPassword failed: ${signInErr.message}`);
  }
  if (!data?.session) {
    throw new Error("signInWithPassword returned no session");
  }

  const cookieName = deriveStorageKey(SUPABASE_URL);
  const cookieValue = serializeSessionToSsrCookieValue(data.session);
  jar.set(cookieName, cookieValue);

  // Bind the seed workspace to this user so RLS lets them see seed rows.
  // This mirrors OPERATOR.md §4's post-cloud-link procedure — the seed
  // sets `workspaces.owner_user_id` to a placeholder UUID; production
  // overwrites it with the operator's real auth.users.id after the first
  // magic-link signup. Service-role bypasses RLS for the UPDATE.
  if (SUPABASE_SERVICE_KEY) {
    const admin = signedSupabaseClient();
    const userId = data.session.user?.id;
    if (userId) {
      await admin
        .from("workspaces")
        .update({ owner_user_id: userId })
        .eq("id", WORKSPACE_ID);
    }
  }

  // Sanity-check: hit `/dashboard` with the new cookie and report the
  // landing URL/status so callers can assert against it.
  const headers = new Headers();
  headers.set("Cookie", renderCookieHeader(jar));
  const res = await fetch(`${baseUrl}/dashboard`, {
    headers,
    redirect: "manual",
  });
  ingestSetCookie(jar, res);
  // If middleware refreshed the cookie we keep the refresh; if /dashboard
  // redirected to /login the smoke suite will detect that downstream.
  return { status: res.status, url: `${baseUrl}/dashboard` };
}

// ---------------------------------------------------------------------------
// Service-role Supabase client — for direct DB setup queries
// ---------------------------------------------------------------------------

export function signedSupabaseClient() {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing in env — service-role client unavailable",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Misc constants
// ---------------------------------------------------------------------------

export const TRUST_ONLY_CLIENT_ID =
  "00000000-0000-0000-0000-000000000c10";
export const SEED_FINALIZED_INVOICE_ID =
  "00000000-0000-0000-0000-0000000b0001";
export const WORKSPACE_ID =
  "00000000-0000-0000-0000-000000000001";

export const MAILPIT_URL = MAILPIT_BASE;
export const SUPABASE_URL_RESOLVED = SUPABASE_URL;
