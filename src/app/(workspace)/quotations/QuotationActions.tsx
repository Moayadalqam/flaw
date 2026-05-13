"use client";

/**
 * Action buttons block for the quotation detail view.
 *
 * Buttons surface depending on quotation status:
 *   draft     → Mark Sent, Delete, Open PDF
 *   sent      → Accept & Convert to invoice, Open PDF
 *   accepted  → Open PDF (read-only — points to converted invoice)
 *   declined  → Open PDF (read-only)
 *   expired   → Open PDF (read-only)
 *
 * Accept & Convert uses a confirm() to avoid one-click destruction (it
 * creates a real draft invoice and marks the source accepted). Delete also
 * confirms — drafts can be undone simply by re-creating, but the click cost
 * should match the intent.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  acceptQuotationAction,
  deleteQuotationAction,
  markSentAction,
  type QuotationActionResult,
} from "@/app/(workspace)/quotations/actions";
import type { QuotationStatus } from "@/lib/types";

interface Props {
  quotationId: string;
  status: QuotationStatus;
  hasLineItems: boolean;
}

export function QuotationActions({
  quotationId,
  status,
  hasLineItems,
}: Props) {
  const router = useRouter();
  const t = useTranslations("quotations");
  const [isPending, startTransition] = useTransition();
  const [topError, setTopError] = useState<string | null>(null);

  function handleResult(res: QuotationActionResult | void) {
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

  function onMarkSent() {
    if (!confirm("Mark this quotation as sent? A quotation number will be allocated.")) {
      return;
    }
    startTransition(async () => {
      const res = await markSentAction(quotationId);
      handleResult(res as QuotationActionResult);
    });
  }

  function onAccept() {
    if (!confirm(t("acceptConfirm"))) {
      return;
    }
    startTransition(async () => {
      const res = await acceptQuotationAction(quotationId);
      handleResult(res as QuotationActionResult);
    });
  }

  function onDelete() {
    if (!confirm("Delete this draft quotation? This cannot be undone.")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteQuotationAction(quotationId);
      handleResult(res as QuotationActionResult);
    });
  }

  const canMarkSent = status === "draft" && hasLineItems;
  const canAccept = status === "sent";
  const canDelete = status === "draft";

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex gap-2 flex-wrap justify-end">
        <a
          href={`/api/quotations/${quotationId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border transition-colors"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            color: "var(--text)",
          }}
        >
          Download PDF
        </a>

        {canMarkSent ? (
          <button
            type="button"
            onClick={onMarkSent}
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-60"
            style={{
              background: "var(--bg)",
              borderColor: "var(--accent)",
              color: "var(--accent)",
            }}
          >
            Mark as sent
          </button>
        ) : null}

        {canAccept ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            {t("accept")}
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
              color: "var(--bg)",
            }}
          >
            Delete
          </button>
        ) : null}
      </div>

      {topError ? (
        <div
          role="alert"
          className="text-sm rounded-md border px-4 py-3 max-w-md"
          style={{
            background: "color-mix(in oklch, var(--kill) 8%, transparent)",
            borderColor: "var(--kill)",
            color: "var(--kill)",
          }}
        >
          {topError === "not_sent"
            ? "Only sent quotations can be accepted."
            : topError === "not_draft"
              ? "This quotation is no longer a draft."
              : topError === "not_found"
                ? "Quotation not found."
                : topError === "numbering_collision"
                  ? "Numbering collision. Please retry."
                  : topError === "sp_failed"
                    ? "Conversion failed. Please retry."
                    : "Something went wrong. Please try again."}
        </div>
      ) : null}
    </div>
  );
}
