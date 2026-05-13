"use client";

/**
 * Action buttons block for the invoice detail view.
 *
 * Buttons surface depending on invoice status:
 *   draft     → Finalize (when ≥1 line item), Delete, Open PDF
 *   finalized → Mark as paid, Open PDF
 *   sent      → Mark as paid, Open PDF
 *   paid      → Open PDF (read-only)
 *   void      → Open PDF (read-only)
 *
 * Finalize and Delete use a confirm() to avoid one-click destruction.
 * Mark-as-paid opens a small inline form for `paid_at` + `payment_method`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeInvoiceAction,
  markPaidAction,
  deleteInvoiceAction,
  type InvoiceActionResult,
} from "@/app/(workspace)/invoices/actions";
import type { InvoiceStatus } from "@/lib/types";

interface Props {
  invoiceId: string;
  status: InvoiceStatus;
  hasLineItems: boolean;
}

export function InvoiceActions({ invoiceId, status, hasLineItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [topError, setTopError] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [paidAt, setPaidAt] = useState(todayIso);
  const [paymentMethod, setPaymentMethod] = useState("");

  function handleResult(res: InvoiceActionResult | void) {
    if (!res) return; // redirect happened
    if ("ok" in res && res.ok) {
      setTopError(null);
      router.refresh();
      return;
    }
    if ("error" in res) {
      setTopError(res.error);
    }
  }

  function onFinalize() {
    if (
      !confirm(
        "Finalize this invoice? An invoice number will be allocated and this cannot be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await finalizeInvoiceAction(invoiceId);
      handleResult(res);
    });
  }

  function onDelete() {
    if (
      !confirm(
        "Delete this draft invoice? This cannot be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteInvoiceAction(invoiceId);
      handleResult(res as InvoiceActionResult);
    });
  }

  function onMarkPaid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("paid_at", paidAt);
    if (paymentMethod.trim().length > 0) {
      fd.set("payment_method", paymentMethod.trim());
    }
    startTransition(async () => {
      const res = await markPaidAction(invoiceId, fd);
      handleResult(res as InvoiceActionResult);
    });
  }

  const canFinalize = status === "draft" && hasLineItems;
  const canDelete = status === "draft";
  const canMarkPaid = status === "finalized" || status === "sent";

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex gap-2 flex-wrap justify-end">
        <a
          href={`/api/pdf/${invoiceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border transition-colors"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            color: "var(--text)",
          }}
        >
          Open PDF
        </a>

        {canFinalize ? (
          <button
            type="button"
            onClick={onFinalize}
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            Finalize
          </button>
        ) : null}

        {canMarkPaid ? (
          <button
            type="button"
            onClick={() => setShowPaid((s) => !s)}
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--ok)",
              color: "oklch(0.985 0.004 60)",
            }}
          >
            Mark as paid
          </button>
        ) : null}

        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--kill)",
              color: "oklch(0.985 0.004 60)",
            }}
          >
            Delete
          </button>
        ) : null}
      </div>

      {showPaid && canMarkPaid ? (
        <form
          onSubmit={onMarkPaid}
          className="border rounded-md p-4 flex flex-wrap gap-3 items-end"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            width: "min(28rem, 100%)",
          }}
        >
          <div className="flex-1 min-w-[10rem]">
            <label
              htmlFor="paid_at"
              className="block text-xs uppercase mb-1"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              Paid at
            </label>
            <input
              id="paid_at"
              name="paid_at"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label
              htmlFor="payment_method"
              className="block text-xs uppercase mb-1"
              style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
            >
              Method
            </label>
            <input
              id="payment_method"
              name="payment_method"
              type="text"
              placeholder="Bank transfer"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--ok)",
              color: "oklch(0.985 0.004 60)",
            }}
          >
            Confirm
          </button>
        </form>
      ) : null}

      {topError ? (
        <div
          role="alert"
          className="text-sm rounded-md border px-4 py-3 max-w-md"
          style={{
            background: "oklch(0.52 0.180 25 / 0.08)",
            borderColor: "var(--kill)",
            color: "var(--kill)",
          }}
        >
          {topError === "no_line_items"
            ? "Add at least one line item before finalizing."
            : topError === "already_finalized"
              ? "This invoice has already been finalized."
              : topError === "not_finalized"
                ? "Only finalized invoices can be marked as paid."
                : topError === "not_found"
                  ? "Invoice not found."
                  : "Something went wrong. Please try again."}
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  borderRadius: "4px",
  padding: "0.45rem 0.65rem",
  width: "100%",
  minHeight: "40px",
};
