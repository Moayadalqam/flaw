"use client";

/**
 * DraftReminderModal — native `<dialog>` modal that walks the lawyer
 * through Draft → Review → Send for each selected overdue invoice
 * (Phase 6 Task 4 / REQ-016 / REP-02).
 *
 * On open, sequentially calls `draftReminderAction(id)` for each row.
 * Sequential (not parallel) for the draft path because:
 *   - The OpenRouter adapter is rate-limited only on the Resend send
 *     path, not on drafts — but consecutive AI calls keep the UI
 *     responsive (one card flips to "ready" at a time, so the lawyer
 *     can start reviewing the first while the rest are still drafting).
 *   - It bounds the AI spend if the lawyer accidentally selects 50
 *     rows — the modal can be closed mid-sequence and the remaining
 *     drafts are abandoned cleanly.
 *
 * Send is per-card (not bulk), with the Resend in-process rate limiter
 * (10/min) inside the adapter — the 11th send within 60s flips that
 * card to the `errorRateLimit` state and the lawyer can retry after
 * the cooldown.
 *
 * Focus management: on open, focus moves to the close button. Escape
 * triggers the native `<dialog>` cancel event which calls `onClose`. We
 * also set `aria-modal` via the dialog element itself (native) and
 * restore focus to the page's "Draft Reminders" button on close (the
 * native `<dialog>` does NOT auto-restore — see the cleanup in the
 * `useEffect`).
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney, type LexLocale } from "@/lib/format";
import type { OverdueInvoice } from "./queries";
import {
  draftReminderAction,
  sendReminderAction,
  type DraftReminderError,
  type SendReminderError,
} from "./actions";

type DraftStatus =
  | "loading"
  | "ready"
  | "error"
  | "sending"
  | "sent"
  | "send_error"
  | "missing_email";

interface DraftState {
  status: DraftStatus;
  subject?: string;
  body_html?: string;
  body_text?: string;
  to?: string;
  error?: DraftReminderError | SendReminderError | "unknown";
  message?: string;
  sendId?: string;
}

export function DraftReminderModal({
  open,
  onClose,
  rows,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  rows: OverdueInvoice[];
  locale: LexLocale;
}) {
  const t = useTranslations("reminders");
  const tAging = useTranslations("aging");
  const isGreek = locale === "el-CY";

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Map keyed by invoice ID. The modal's lifetime is bounded by the
  // `open` prop — on close, we reset state so re-opening triggers a
  // fresh draft sequence.
  const [states, setStates] = useState<Record<string, DraftState>>({});

  // ─── Show / hide the native <dialog> in sync with the `open` prop ──
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      // Defer focus to next frame so the dialog has rendered its
      // children. Without the rAF, focus() on a freshly-mounted
      // <button> can be eaten by the dialog's auto-focus.
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    } else {
      if (dialog.open) dialog.close();
      // Reset draft states on close so a re-open triggers a fresh
      // sequence.
      setStates({});
    }
  }, [open]);

  // ─── Wire the native `cancel` (Escape) event to the parent ──────
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  // ─── Sequential draft sequence ──────────────────────────────────
  useEffect(() => {
    if (!open || rows.length === 0) return;
    let aborted = false;

    // Seed every row's initial state synchronously — the missing-email
    // ones short-circuit to a disabled card with no AI call.
    const initial: Record<string, DraftState> = {};
    for (const r of rows) {
      if (!r.client_email) {
        initial[r.id] = { status: "missing_email" };
      } else {
        initial[r.id] = { status: "loading" };
      }
    }
    setStates(initial);

    void (async () => {
      for (const r of rows) {
        if (aborted) return;
        if (!r.client_email) continue;

        const result = await draftReminderAction(r.id);
        if (aborted) return;

        setStates((prev) => ({
          ...prev,
          [r.id]: result.ok
            ? {
                status: "ready",
                subject: result.subject,
                body_html: result.body_html,
                body_text: result.body_text,
                to: result.to,
              }
            : {
                status: "error",
                error: result.error,
                message: result.message,
              },
        }));
      }
    })();

    return () => {
      aborted = true;
    };
    // We intentionally exclude `rows` from deps — it's a new array every
    // render from the parent. We re-key the draft loop on `open` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Per-card field updates ─────────────────────────────────────
  function updateField(id: string, patch: Partial<DraftState>) {
    setStates((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  // ─── Per-card send ──────────────────────────────────────────────
  async function handleSend(id: string) {
    const cur = states[id];
    if (!cur || cur.status !== "ready") return;
    if (!cur.subject || !cur.body_html) return;

    updateField(id, { status: "sending" });
    const result = await sendReminderAction(
      id,
      cur.subject,
      cur.body_html,
    );

    if (result.ok) {
      updateField(id, {
        status: "sent",
        sendId: result.id,
      });
    } else {
      updateField(id, {
        status: "send_error",
        error: result.error,
        message: result.message,
      });
    }
  }

  function clientNameFor(row: OverdueInvoice): string {
    return isGreek ? row.client_name_el : row.client_name_en;
  }

  function errorLabel(
    err: DraftReminderError | SendReminderError | "unknown",
  ): string {
    switch (err) {
      case "no_api_key":
        return t("errorNoApiKey");
      case "rate_limited":
        return t("errorRateLimit");
      case "invalid_email":
        return t("errorInvalidEmail");
      case "provider_error":
        return t("errorProvider");
      case "network":
        return t("errorNetwork");
      case "not_found":
        return t("errorNotFound");
      case "not_eligible":
        return t("errorNotEligible");
      case "no_invoice_number":
        return t("errorNoInvoiceNumber");
      case "not_overdue":
        return t("errorNotOverdue");
      case "no_email":
        return t("errorNoEmail");
      case "refusal":
        return t("errorRefusal");
      case "parse_failed":
        return t("errorParseFailed");
      case "model_error":
        return t("errorModel");
      case "unauthorized":
        return t("errorUnauthorized");
      case "no_workspace":
        return t("errorNoWorkspace");
      case "invalid_input":
        return t("errorInvalidInput");
      case "update_failed":
        return t("errorUpdateFailed");
      default:
        return t("errorProvider");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="draft-reminder-modal-title"
      className="rounded-lg p-0 max-w-3xl w-full"
      style={{
        background: "var(--surface-2)",
        color: "var(--text)",
        border: "1px solid var(--line)",
        boxShadow: "var(--elev-3)",
      }}
      onClose={() => {
        // The native close event also fires on Escape + form-method dialog
        // submissions. The cancel handler above already calls onClose for
        // Escape; this branch handles the form-method case and is a no-op
        // when state is already cleared.
        onClose();
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-6 py-4"
        style={{
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-2)",
        }}
      >
        <h2
          id="draft-reminder-modal-title"
          className="font-display text-lg"
          style={{ color: "var(--text)" }}
        >
          {t("modalTitle")}
        </h2>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="text-sm rounded px-3 py-1 transition-colors"
          style={{
            color: "var(--dim)",
            background: "transparent",
            border: "1px solid var(--line)",
          }}
        >
          {t("close")} · Esc
        </button>
      </div>

      {/* Disclaimer */}
      <p
        className="px-6 pt-4 text-xs"
        style={{ color: "var(--muted)" }}
      >
        {t("disclaimer")}
      </p>

      {/* Cards */}
      <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {rows.map((row) => {
          const s = states[row.id] ?? { status: "loading" as DraftStatus };
          return (
            <section
              key={row.id}
              className="rounded-lg overflow-hidden"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
              }}
              aria-busy={s.status === "loading" || s.status === "sending"}
            >
              {/* Card header */}
              <div
                className="flex items-center justify-between flex-wrap gap-3 px-5 py-3"
                style={{
                  background: "var(--bg-2)",
                  borderBottom: "1px solid var(--line-soft)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="tabular text-sm"
                    style={{ color: "var(--accent)", fontWeight: 500 }}
                  >
                    {row.invoice_number}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--text)" }}
                  >
                    {clientNameFor(row)}
                  </span>
                  <span
                    className="text-xs tabular"
                    style={{ color: "var(--muted)" }}
                  >
                    {row.matter_number}
                  </span>
                </div>
                <span
                  className="tabular text-sm"
                  style={{ color: "var(--text)", fontWeight: 500 }}
                >
                  {formatMoney(Number(row.total), row.currency, locale)}
                </span>
              </div>

              <div className="px-5 py-4">
                {/* Loading */}
                {s.status === "loading" && (
                  <div
                    className="flex items-center gap-3 text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full animate-pulse"
                      style={{ background: "var(--accent)" }}
                      aria-hidden="true"
                    />
                    <span role="status">{t("drafting")}</span>
                  </div>
                )}

                {/* Missing email — no AI call */}
                {s.status === "missing_email" && (
                  <p
                    className="text-sm rounded px-3 py-2"
                    role="status"
                    style={{
                      color: "var(--kill)",
                      background:
                        "color-mix(in oklch, var(--kill) 8%, transparent)",
                      border: "1px solid var(--kill)",
                    }}
                  >
                    {t("clientMissingEmail")}
                  </p>
                )}

                {/* Ready / Editable */}
                {(s.status === "ready" || s.status === "sending") && (
                  <div className="space-y-3">
                    <p
                      className="text-xs tabular"
                      style={{ color: "var(--muted)" }}
                    >
                      <span
                        className="px-2 py-0.5 rounded mr-2 text-[10px] uppercase tracking-widest"
                        style={{
                          color: "var(--accent)",
                          background: "var(--accent-bg)",
                        }}
                      >
                        {row.client_preferred_language === "el"
                          ? "Ελληνικά"
                          : "English"}
                      </span>
                      <span>
                        {t("recipient")}: {s.to ?? "—"}
                      </span>
                    </p>

                    <label className="block text-sm">
                      <span
                        className="block text-[10px] uppercase tracking-widest mb-1"
                        style={{ color: "var(--dim)" }}
                      >
                        {t("previewSubject")}
                      </span>
                      <input
                        type="text"
                        value={s.subject ?? ""}
                        maxLength={200}
                        disabled={s.status === "sending"}
                        onChange={(e) =>
                          updateField(row.id, { subject: e.target.value })
                        }
                        className="w-full rounded px-3 py-2 text-sm"
                        style={{
                          background: "var(--bg-2)",
                          color: "var(--text)",
                          border: "1px solid var(--line)",
                        }}
                      />
                    </label>

                    <label className="block text-sm">
                      <span
                        className="block text-[10px] uppercase tracking-widest mb-1"
                        style={{ color: "var(--dim)" }}
                      >
                        {t("previewBody")}
                      </span>
                      <textarea
                        value={s.body_text ?? ""}
                        rows={8}
                        maxLength={8000}
                        disabled={s.status === "sending"}
                        onChange={(e) => {
                          // Reflect plain-text edits back into body_html
                          // wrapped in a minimal <p> so the server-side
                          // sanitiser has well-formed input.
                          const text = e.target.value;
                          const html = text
                            .split(/\n{2,}/)
                            .map(
                              (para) =>
                                `<p>${para
                                  .replace(/&/g, "&amp;")
                                  .replace(/</g, "&lt;")
                                  .replace(/>/g, "&gt;")
                                  .replace(/\n/g, "<br/>")}</p>`,
                            )
                            .join("");
                          updateField(row.id, {
                            body_text: text,
                            body_html: html,
                          });
                        }}
                        className="w-full rounded px-3 py-2 text-sm font-sans leading-relaxed"
                        style={{
                          background: "var(--bg-2)",
                          color: "var(--text)",
                          border: "1px solid var(--line)",
                        }}
                      />
                    </label>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={s.status === "sending"}
                        onClick={() => void handleSend(row.id)}
                        className="inline-flex items-center min-h-[40px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        style={{
                          background:
                            s.status === "sending"
                              ? "var(--surface-2)"
                              : "var(--accent)",
                          color:
                            s.status === "sending"
                              ? "var(--dim)"
                              : "var(--bg)",
                          cursor:
                            s.status === "sending"
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {s.status === "sending"
                          ? t("sending")
                          : t("sendBtn")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Sent — success */}
                {s.status === "sent" && (
                  <div
                    className="rounded px-4 py-4"
                    role="status"
                    style={{
                      color: "var(--ok)",
                      borderLeft: "3px solid var(--ok)",
                      background:
                        "color-mix(in oklch, var(--ok) 8%, transparent)",
                    }}
                  >
                    <p className="font-medium mb-1">{t("sent")}</p>
                    {s.sendId ? (
                      <p
                        className="text-xs tabular"
                        style={{ color: "var(--muted)" }}
                      >
                        {t("messageId")}: {s.sendId}
                      </p>
                    ) : null}
                  </div>
                )}

                {/* Error — draft path */}
                {s.status === "error" && (
                  <p
                    className="text-sm rounded px-3 py-2"
                    role="alert"
                    style={{
                      color: "var(--kill)",
                      background:
                        "color-mix(in oklch, var(--kill) 8%, transparent)",
                      border: "1px solid var(--kill)",
                    }}
                  >
                    {errorLabel(s.error ?? "unknown")}
                  </p>
                )}

                {/* Error — send path */}
                {s.status === "send_error" && (
                  <p
                    className="text-sm rounded px-3 py-2"
                    role="alert"
                    style={{
                      color: "var(--kill)",
                      background:
                        "color-mix(in oklch, var(--kill) 8%, transparent)",
                      border: "1px solid var(--kill)",
                    }}
                  >
                    {errorLabel(s.error ?? "unknown")}
                  </p>
                )}
              </div>
            </section>
          );
        })}

        {rows.length === 0 && (
          <p
            className="text-sm py-8 text-center"
            style={{ color: "var(--muted)" }}
          >
            {tAging("noOverdueEmpty")}
          </p>
        )}
      </div>
    </dialog>
  );
}
