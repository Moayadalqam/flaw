"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type FormState = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (err) {
      setError(err.message);
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
          Email
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
          placeholder="you@firm.cy"
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
          Check your inbox. The magic link will land within 30 seconds.
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
          {state === "sending" ? "Sending…" : "Email me the magic link"}
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
    </form>
  );
}
