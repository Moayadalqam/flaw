"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseInvoiceRequest, eur, type DraftSuggestion } from "@/lib/demo-data";

type Result =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "draft"; draft: DraftSuggestion }
  | { kind: "error"; reason: string };

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const close = useCallback(() => {
    setOpen(false);
    setInput("");
    setResult({ kind: "idle" });
  }, []);

  // ⌘K / Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const submit = useCallback(async () => {
    if (!input.trim()) return;
    setResult({ kind: "thinking" });
    // Simulate AI latency — 600ms feels deliberate, not buggy.
    await new Promise((r) => setTimeout(r, 600));
    const parsed = parseInvoiceRequest(input);
    if (parsed.ok) {
      setResult({ kind: "draft", draft: parsed.draft });
    } else {
      setResult({ kind: "error", reason: parsed.reason });
    }
  }, [input]);

  const placeholder = useMemo(
    () =>
      "Invoice Andreou for the divorce filing, €450, due in 14 days",
    [],
  );

  if (!open) {
    return <CommandLauncher onOpen={() => setOpen(true)} />;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "oklch(0.18 0.012 50 / 0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="w-full max-w-2xl bg-[var(--bg)] border border-[var(--line)] rounded-lg overflow-hidden"
        style={{ boxShadow: "0 24px 64px oklch(0.18 0.020 50 / 0.30)" }}
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
            className="flex-1 bg-transparent outline-none text-[var(--text)] text-base placeholder:text-[var(--dim)]"
          />
          <kbd className="hidden sm:block text-[10px] font-mono px-2 py-1 rounded bg-[var(--bg-2)] text-[var(--dim)] uppercase tracking-widest">
            ⏎
          </kbd>
        </form>

        <div className="px-5 py-4">
          {result.kind === "idle" && (
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Lex parses your sentence, picks the client + matter from your
              workspace, computes Cyprus VAT, and prepares a draft invoice. The
              AI never allocates the invoice number — you click Finalize.
            </p>
          )}

          {result.kind === "thinking" && (
            <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "var(--accent)" }}
              />
              Drafting…
            </div>
          )}

          {result.kind === "error" && (
            <div
              className="text-sm px-4 py-3 rounded border-l-2"
              style={{
                color: "var(--kill)",
                borderColor: "var(--kill)",
                background: "oklch(0.52 0.180 25 / 0.06)",
              }}
            >
              {result.reason}
            </div>
          )}

          {result.kind === "draft" && <DraftPreview draft={result.draft} />}

          <div className="mt-4 pt-3 border-t border-[var(--line-soft)] flex items-center justify-between text-[10px] tracking-widest uppercase text-[var(--dim)]">
            <span>
              <kbd className="font-mono normal-case px-1.5 py-0.5 rounded bg-[var(--bg-2)] mr-1">
                Esc
              </kbd>{" "}
              to close
            </span>
            <span>OpenRouter · Zod-validated</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftPreview({ draft }: { draft: DraftSuggestion }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest text-[var(--accent)] font-medium">
          Draft invoice — pending finalize
        </span>
        <span className="text-[10px] uppercase tracking-widest text-[var(--dim)] tabular">
          Number assigned on Finalize
        </span>
      </div>
      <div className="border border-[var(--line)] rounded-md p-4 bg-[var(--bg-2)]">
        <div className="grid sm:grid-cols-2 gap-4 mb-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
              Client
            </div>
            <div className="text-[var(--text)] font-medium">
              {draft.client.nameEl}
            </div>
            <div className="text-xs text-[var(--muted)]">
              {draft.client.nameEn}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--dim)]">
              Matter
            </div>
            <div className="text-[var(--text)] font-medium">
              {draft.matter.titleEl}
            </div>
            <div className="text-xs text-[var(--muted)] tabular">
              {draft.matter.number}
            </div>
          </div>
        </div>
        <table className="w-full text-sm tabular mt-2">
          <tbody>
            <tr className="border-b border-[var(--line-soft)]">
              <td className="py-2 text-[var(--text)]">{draft.description}</td>
              <td className="py-2 text-right text-[var(--text)]">
                {eur.format(draft.amount)}
              </td>
            </tr>
            <tr className="text-[var(--muted)]">
              <td className="py-2">VAT 19% (server-computed)</td>
              <td className="py-2 text-right">{eur.format(draft.vatAmount)}</td>
            </tr>
            <tr className="font-semibold text-[var(--text)] border-t border-[var(--line)]">
              <td className="py-2">Total</td>
              <td className="py-2 text-right font-display">
                {eur.format(draft.total)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="text-xs text-[var(--muted)] mt-3 tabular">
          Due in {draft.dueDays} days
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-4">
        <button
          type="button"
          className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]"
        >
          Discard
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ background: "var(--accent)" }}
        >
          Finalize → allocate 2026/0004
        </button>
      </div>
    </div>
  );
}

function CommandLauncher({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open command bar"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)] transition-colors"
      style={{ boxShadow: "0 8px 24px oklch(0.18 0.020 50 / 0.14)" }}
    >
      <span
        className="font-display text-sm"
        style={{ color: "var(--accent)" }}
      >
        Ask Lex
      </span>
      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-2)] text-[var(--dim)]">
        ⌘K
      </kbd>
    </button>
  );
}
