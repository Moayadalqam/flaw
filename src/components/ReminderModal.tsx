"use client";

import { useCallback, useEffect, useState } from "react";
import { draftReminderEmail, getClient, eur, type Invoice } from "@/lib/demo-data";

type State =
  | { kind: "idle" }
  | { kind: "drafting" }
  | { kind: "ready"; subject: string; body: string; to: string | null; language: "el" | "en" }
  | { kind: "sent" }
  | { kind: "error"; reason: string };

export function ReminderButton({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  const close = useCallback(() => {
    setOpen(false);
    setState({ kind: "idle" });
  }, []);

  const draft = useCallback(async () => {
    setState({ kind: "drafting" });
    // Try a real API call first; fall back to deterministic mock.
    try {
      const res = await fetch("/api/ai/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setState({
          kind: "ready",
          subject: data.subject,
          body: data.body,
          to: data.to ?? null,
          language: data.language ?? "en",
        });
        return;
      }
    } catch {
      // fall through to local mock
    }
    const d = draftReminderEmail(invoice);
    setState({
      kind: "ready",
      subject: d.subject,
      body: d.body,
      to: d.to,
      language: d.language,
    });
  }, [invoice]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, close]);

  const openAndDraft = useCallback(() => {
    setOpen(true);
    void draft();
  }, [draft]);

  return (
    <>
      <button
        type="button"
        onClick={openAndDraft}
        className="text-xs font-medium px-3 py-1.5 rounded transition-colors"
        style={{ color: "var(--accent)", background: "var(--accent-bg)" }}
      >
        Draft reminder
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          style={{ background: "oklch(0.18 0.012 50 / 0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="w-full max-w-2xl bg-[var(--bg)] border border-[var(--line)] rounded-lg overflow-hidden"
            style={{ boxShadow: "0 24px 64px oklch(0.18 0.020 50 / 0.30)" }}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--line-soft)]">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--accent)] mb-0.5">
                  AI-drafted payment reminder
                </div>
                <div className="text-sm text-[var(--text)] tabular">
                  Invoice {invoice.number} · {eur.format(invoice.total)} ·{" "}
                  {getClient(invoice.clientId)?.nameEl}
                </div>
              </div>
              <button
                onClick={close}
                className="text-[var(--dim)] hover:text-[var(--text)] text-xs"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-5">
              {state.kind === "drafting" && (
                <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
                  <span
                    className="inline-block w-2 h-2 rounded-full animate-pulse"
                    style={{ background: "var(--accent)" }}
                  />
                  Drafting in {state ? "client's preferred language" : ""}…
                </div>
              )}

              {state.kind === "ready" && (
                <div className="space-y-4">
                  <div className="text-xs text-[var(--muted)] tabular flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] uppercase tracking-widest"
                      style={{
                        color: "var(--accent)",
                        background: "var(--accent-bg)",
                      }}
                    >
                      {state.language === "el" ? "Ελληνικά" : "English"}
                    </span>
                    <span>To: {state.to ?? "—"}</span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mb-1">
                      Subject
                    </div>
                    <div className="text-[var(--text)] text-sm">
                      {state.subject}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--dim)] mb-1">
                      Body
                    </div>
                    <pre className="text-[var(--text)] text-sm whitespace-pre-wrap font-sans leading-relaxed border border-[var(--line-soft)] rounded p-4 bg-[var(--bg-2)] max-h-96 overflow-auto">
                      {state.body}
                    </pre>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line-soft)]">
                    <button
                      type="button"
                      onClick={close}
                      className="px-4 py-2 rounded-md text-sm font-medium border border-[var(--line)] text-[var(--text)] hover:bg-[var(--bg-2)]"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => setState({ kind: "sent" })}
                      className="px-4 py-2 rounded-md text-sm font-medium text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      Send via Resend
                    </button>
                  </div>
                </div>
              )}

              {state.kind === "sent" && (
                <div
                  className="rounded-md px-4 py-6 text-center border"
                  style={{
                    color: "var(--ok)",
                    borderColor: "var(--ok)",
                    background: "oklch(0.55 0.130 150 / 0.06)",
                  }}
                >
                  <div className="font-medium mb-1">Queued for sending</div>
                  <div className="text-sm">
                    Resend API would deliver this in production. Throttle: 10 / min.
                  </div>
                </div>
              )}

              {state.kind === "error" && (
                <div
                  className="text-sm px-4 py-3 rounded border-l-2"
                  style={{
                    color: "var(--kill)",
                    borderColor: "var(--kill)",
                    background: "oklch(0.52 0.180 25 / 0.06)",
                  }}
                >
                  {state.reason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
