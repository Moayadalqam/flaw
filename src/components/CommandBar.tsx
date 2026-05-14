"use client";

/**
 * Lex command bar — the ⌘K modal where the lawyer types either:
 *   - a natural-language invoice draft request ("Invoice Andreou for the
 *     divorce filing, €450, due in 14 days"), or
 *   - a natural-language workspace question ("who is overdue?").
 *
 * Wiring (Phase 5):
 *   On submit we call `aiDispatchAction(text)` — a Server Action that
 *   classifies intent ('draft' | 'query') and routes:
 *     - draft  → server creates a draft row (workspace-scoped, VAT
 *                computed in `lib/totals.ts`, invoice_number NULL until
 *                Finalize) and we `router.push('/drafts/{id}')`.
 *     - query  → server pre-aggregates a workspace summary, OpenRouter
 *                writes prose, we render `<AnswerPanel>` inline.
 *     - error  → render the kill banner with the i18n'd reason.
 *
 * The AI never proposes invoice numbers or VAT amounts — those are server
 * computed. The classifier is conservative: ambiguous text routes to the
 * Draft → Review path so the worst-case is one preview the lawyer
 * dismisses (vs. typing "invoice X" and getting prose back).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { aiDispatchAction } from "@/app/(workspace)/assistant/actions";
import type { OpenRouterError } from "@/lib/openrouter/types";

type Result =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "answer"; text: string }
  | { kind: "error"; reason: string };

export function CommandBar() {
  const router = useRouter();
  const t = useTranslations();

  // Placeholder hints — translated once per render; the React compiler
  // memoizes the surrounding work. Initial placeholder is the draft hint
  // (deterministic so SSR + first paint match); each subsequent open
  // re-rolls between draft + query.
  const draftHint = t("ai.placeholderDraft");
  const queryHint = t("ai.placeholderQuery");

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [placeholder, setPlaceholder] = useState<string>(draftHint);

  function close() {
    setOpen(false);
    setInput("");
    setResult({ kind: "idle" });
  }

  function openModal() {
    // Math.random in an event handler is fine — it's not running in render.
    setPlaceholder(Math.random() < 0.5 ? draftHint : queryHint);
    setOpen(true);
  }

  // ⌘K / Ctrl+K toggles open/close. Esc closes. Opening re-rolls the
  // placeholder so each session offers a fresh hint.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) {
          openModal();
        } else {
          close();
        }
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `openModal`/`close` are stable per render under React 19's compiler;
    // listing them produces "preserve-manual-memoization" noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftHint, queryHint]);

  // Map an OpenRouter error code to a localized string. Cases include
  // `unknown_client` and `unknown_matter` which the Draft path can return
  // (see invoices/actions.ts:DraftFromAIResult) even though they aren't in
  // `OpenRouterError` itself — hence the helper accepts the broader
  // `OpenRouterError | string` type.
  function errorMessageFor(err: OpenRouterError | string): string {
    switch (err) {
      case "no_api_key":
        return t("ai.errors.noApiKey");
      case "refusal":
        return t("ai.errors.refusal");
      case "parse_failed":
        return t("ai.errors.parseFailed");
      case "unknown_client":
        return t("ai.errors.unknownClient");
      case "unknown_matter":
        return t("ai.errors.unknownMatter");
      case "rate_limited":
        return t("ai.errors.rateLimit");
      case "network":
        return t("ai.errors.networkError");
      case "model_error":
        return t("ai.errors.networkError");
      case "insert_failed":
        return t("ai.errors.parseFailed");
      case "no_workspace":
        return t("ai.errors.parseFailed");
      case "invalid_input":
        return t("ai.errors.parseFailed");
      default:
        return t("ai.errors.parseFailed");
    }
  }

  async function submit() {
    if (!input.trim()) return;
    setResult({ kind: "thinking" });
    try {
      const dispatched = await aiDispatchAction(input);
      if (dispatched.kind === "draft") {
        router.push(`/drafts/${dispatched.id}`);
        close();
      } else if (dispatched.kind === "query") {
        setResult({ kind: "answer", text: dispatched.text });
      } else {
        setResult({
          kind: "error",
          reason: errorMessageFor(dispatched.error),
        });
      }
    } catch {
      setResult({
        kind: "error",
        reason: errorMessageFor("network"),
      });
    }
  }

  if (!open) {
    return <CommandLauncher onOpen={openModal} />;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "color-mix(in oklch, var(--text) 45%, transparent)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-2xl bg-[var(--bg)] border border-[var(--line)] rounded-lg overflow-hidden"
        style={{ boxShadow: "var(--elev-3)" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-3 px-5 py-4 border-b border-[var(--line-soft)]"
        >
          <span
            className="font-display text-base"
            style={{ color: "var(--accent)" }}
            aria-hidden="true"
          >
            Lex
          </span>
          <input
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            aria-label={t("ai.inputLabel")}
            className="flex-1 bg-transparent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)] text-[var(--text)] text-base placeholder:text-[var(--dim)]"
          />
          <kbd className="hidden sm:block text-[10px] font-mono px-2 py-1 rounded bg-[var(--bg-2)] text-[var(--dim)] uppercase tracking-widest">
            ⏎
          </kbd>
        </form>

        <div className="px-5 py-4">
          {result.kind === "idle" && (
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              {t("ai.idleHint")}
            </p>
          )}

          {result.kind === "thinking" && (
            <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <span
                className="inline-block w-2 h-2 rounded-full motion-safe:animate-pulse"
                style={{ background: "var(--accent)" }}
              />
              {t("ai.thinking")}
            </div>
          )}

          {result.kind === "answer" && <AnswerPanel text={result.text} />}

          {result.kind === "error" && (
            <div
              className="text-sm px-4 py-3 rounded border"
              style={{
                color: "var(--kill)",
                borderColor: "var(--kill)",
                background: "color-mix(in oklch, var(--kill) 6%, transparent)",
              }}
            >
              {result.reason}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[var(--line-soft)] flex items-center justify-between text-[10px] tracking-widest uppercase text-[var(--dim)]">
            <span>
              <kbd className="font-mono normal-case px-1.5 py-0.5 rounded bg-[var(--bg-2)] mr-1">
                Esc
              </kbd>{" "}
              {t("ai.toClose")}
            </span>
            <span>OpenRouter · Zod-validated</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The query-result panel. Renders the model's prose with preserved line
 * breaks and tabular numerals so the "€1,234.56" amounts the model
 * produces line up vertically across multiple lines.
 */
function AnswerPanel({ text }: { text: string }) {
  const t = useTranslations();
  return (
    <div
      className="text-sm font-mono tabular whitespace-pre-line border border-[var(--line)] rounded-md"
      style={{
        color: "var(--text)",
        background: "var(--bg)",
        padding: "var(--space-4)",
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-medium mb-2 font-sans not-tabular">
        {t("ai.answerLabel")}
      </div>
      {text}
    </div>
  );
}

function CommandLauncher({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("ai.launcherLabel")}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] transition-colors"
      style={{ boxShadow: "var(--elev-2)" }}
    >
      <span
        className="font-display text-sm"
        style={{ color: "var(--accent)" }}
      >
        {t("ai.launcherCta")}
      </span>
      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-2)] text-[var(--dim)]">
        ⌘K
      </kbd>
    </button>
  );
}
