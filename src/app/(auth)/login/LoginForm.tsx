"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { demoSignInAction, passwordSignInAction } from "./actions";

type FormState = "idle" | "submitting" | "error";

export function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const t = useTranslations("login");
  const emailSchema = z
    .string()
    .min(5)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmitTransition] = useTransition();
  const [demoPending, startDemoTransition] = useTransition();

  function handleDemoSignIn() {
    setError(null);
    startDemoTransition(async () => {
      const res = await demoSignInAction();
      setError(res.error === "demo_disabled" ? t("error") : t("error"));
      setState("error");
    });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!emailSchema.safeParse(email).success) {
      setError(t("invalidEmail"));
      setState("error");
      return;
    }
    if (password.length < 6) {
      setError(t("invalidPassword"));
      setState("error");
      return;
    }

    setError(null);
    setState("submitting");
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);

    startSubmitTransition(async () => {
      const res = await passwordSignInAction(fd);
      if (res.error === "invalid_credentials") {
        setError(t("invalidCredentials"));
      } else if (res.error === "invalid_input") {
        setError(t("invalidEmail"));
      } else {
        setError(res.error || t("error"));
      }
      setState("error");
    });
  }

  const inputsDisabled = submitting || demoPending;

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
          disabled={inputsDisabled}
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

      <div>
        <label
          htmlFor="password"
          className="block text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {t("passwordLabel")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={inputsDisabled}
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

      <button
        type="submit"
        disabled={submitting || demoPending}
        className="w-full px-4 py-3 rounded-md font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
        style={{
          background: "var(--accent)",
          color: "var(--bg)",
          minHeight: "44px",
          opacity: submitting ? 0.7 : 1,
          cursor: submitting ? "wait" : "pointer",
        }}
      >
        {submitting ? t("sending") : t("send")}
      </button>

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

      {demoEnabled && (
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
              {t("demoOr")}
            </span>
            <div
              className="flex-grow"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            />
          </div>
          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={submitting || demoPending}
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
            {demoPending ? t("sending") : t("demoSignIn")}
          </button>
        </>
      )}
    </form>
  );
}
