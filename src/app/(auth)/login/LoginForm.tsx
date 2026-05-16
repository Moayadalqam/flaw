"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent, ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { accessCodeSignInAction } from "./actions";

const CODE_LENGTH = 6;

export function LoginForm() {
  const t = useTranslations("login");
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length: CODE_LENGTH }, () => ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const filled = digits.every((d) => d.length === 1);
  const code = digits.join("");

  function setDigit(i: number, value: string) {
    setDigits((current) => {
      const next = [...current];
      next[i] = value.slice(-1);
      return next;
    });
  }

  function handleChange(i: number, e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length === 0) {
      setDigit(i, "");
      return;
    }
    if (raw.length === 1) {
      setDigit(i, raw);
      if (i < CODE_LENGTH - 1) {
        inputsRef.current[i + 1]?.focus();
      }
      return;
    }
    // Multi-character: treat as a paste — distribute across cells from i.
    setDigits((current) => {
      const next = [...current];
      for (let k = 0; k < raw.length && i + k < CODE_LENGTH; k++) {
        next[i + k] = raw[k]!;
      }
      return next;
    });
    const lastIdx = Math.min(i + raw.length - 1, CODE_LENGTH - 1);
    inputsRef.current[lastIdx]?.focus();
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[i]) {
        setDigit(i, "");
        return;
      }
      if (i > 0) {
        inputsRef.current[i - 1]?.focus();
        setDigit(i - 1, "");
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) {
      inputsRef.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      inputsRef.current[i + 1]?.focus();
      e.preventDefault();
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!filled) {
      setError(t("invalidCode"));
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("code", code);
    startTransition(async () => {
      const res = await accessCodeSignInAction(fd);
      // Success → server redirected; only error cases return.
      setError(
        res.error === "invalid_code" ? t("invalidCode") : t("error"),
      );
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      inputsRef.current[0]?.focus();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div
        className="flex flex-col items-center text-center gap-3"
        style={{ marginBottom: "var(--space-2)" }}
      >
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-full"
          style={{
            background: "color-mix(in oklch, var(--accent) 12%, var(--bg))",
            color: "var(--accent)",
          }}
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 10V8a6 6 0 1 1 12 0v2M5 10h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p
            className="font-display text-xl"
            style={{ color: "var(--text)", letterSpacing: "-0.01em" }}
          >
            {t("accessCodeTitle")}
          </p>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--muted)" }}
          >
            {t("accessCodeSubtitle")}
          </p>
        </div>
      </div>

      <div className="flex justify-center gap-2 sm:gap-3" role="group" aria-label={t("accessCodeTitle")}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            pattern="\d*"
            maxLength={CODE_LENGTH}
            value={d}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            disabled={pending}
            aria-label={`${t("accessCodeTitle")} ${i + 1} / ${CODE_LENGTH}`}
            className="w-10 h-12 sm:w-12 sm:h-14 text-center font-display text-xl rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
            style={{
              border: "1px solid var(--line)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        ))}
      </div>

      <button
        type="submit"
        disabled={!filled || pending}
        className="w-full px-4 py-3 rounded-md font-medium transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
        style={{
          background:
            !filled || pending ? "var(--bg-2)" : "var(--accent)",
          color: !filled || pending ? "var(--muted)" : "var(--bg)",
          minHeight: "44px",
          cursor: !filled || pending ? "not-allowed" : "pointer",
          border:
            !filled || pending
              ? "1px solid var(--line)"
              : "1px solid var(--accent)",
        }}
      >
        {pending ? t("sending") : t("enter")}
      </button>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md px-4 py-3 text-sm text-center"
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
