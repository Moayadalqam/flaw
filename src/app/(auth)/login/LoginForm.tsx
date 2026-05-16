"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { demoSignInAction } from "./actions";

type FormState = "idle" | "sending" | "sent" | "error";

export function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const isGreek = useLocale() === "el-CY";
  const t = useTranslations("login");
  const emailSchema = z
    .string()
    .min(5)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "invalid email" });
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [demoPending, startDemoTransition] = useTransition();

  function handleDemoSignIn() {
    setError(null);
    startDemoTransition(async () => {
      const res = await demoSignInAction();
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      setError(res.error === "demo_disabled" ? t("error") : res.error);
      setState("error");
    });
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t("invalidEmail"));
      setState("error");
      return;
    }
    setState("sending");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (err) {
      setError(err.message || t("error"));
      setState("error");
      return;
    }
    setState("sent");
  }

  const disabled = state === "sending" || state === "sent";

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="email"
          className="block text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {t("emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
          placeholder={t("emailPlaceholder")}
          aria-describedby={state === "error" ? "login-error" : undefined}
          className="w-full px-4 py-3 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)] focus-visible:[border-color:var(--accent)]"
          style={{
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--text)",
            minHeight: "44px",
          }}
        />
      </div>

      {state === "sent" ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md px-4 py-3 text-sm"
          style={{
            color: "var(--ok)",
            background: "oklch(0.55 0.130 150 / 0.10)",
            border: "1px solid oklch(0.55 0.130 150 / 0.25)",
          }}
        >
          {t("checkInbox")}
        </div>
      ) : (
        <button
          type="submit"
          disabled={state === "sending"}
          className="w-full px-4 py-3 rounded-md font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
            minHeight: "44px",
            opacity: state === "sending" ? 0.7 : 1,
            cursor: state === "sending" ? "wait" : "pointer",
          }}
        >
          {state === "sending" ? t("sending") : t("send")}
        </button>
      )}

      {state === "error" && error && (
        <div
          id="login-error"
          role="alert"
          aria-live="assertive"
          className="rounded-md px-4 py-3 text-sm"
          style={{
            color: "var(--kill)",
            background: "oklch(0.52 0.180 25 / 0.06)",
            borderLeft: "2px solid var(--kill)",
          }}
        >
          {error}
        </div>
      )}

      {demoEnabled && state !== "sent" && (
        <>
          <div
            className="relative flex items-center"
            aria-hidden="true"
            style={{ margin: "8px 0" }}
          >
            <div
              className="flex-grow"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            />
            <span
              className="px-3 text-[10px] uppercase tracking-widest"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              {isGreek ? "ή" : "or"}
            </span>
            <div
              className="flex-grow"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            />
          </div>
          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={demoPending}
            className="w-full px-4 py-3 rounded-md font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
            style={{
              border: "1px solid var(--line)",
              background: "var(--bg)",
              color: "var(--text)",
              minHeight: "44px",
              opacity: demoPending ? 0.6 : 1,
              cursor: demoPending ? "wait" : "pointer",
            }}
          >
            {demoPending
              ? isGreek
                ? "Σύνδεση…"
                : "Signing in…"
              : isGreek
                ? "Είσοδος demo (Fotini Kandri)"
                : "Demo sign-in (Fotini Kandri)"}
          </button>
        </>
      )}
    </form>
  );
}
