"use client";

/**
 * Action buttons for the AI Draft detail view (Phase 5 Task 2).
 *
 * Two buttons:
 *   - Finalize: routes through the existing finalizeInvoiceAction (the
 *     SOLE service-role bridge — Phase 3 Migration 003). On success the
 *     server allocates an invoice number via allocate_invoice_number()
 *     and we navigate to /invoices/[id] where the lawyer sees the
 *     finalized document with its allocated YYYY/NNNN number.
 *   - Discard: routes through the existing deleteInvoiceAction. That
 *     action issues `redirect("/invoices")` on success, so the user
 *     lands on the invoices list (the closest sibling surface). The
 *     redirect is owned by deleteInvoiceAction; we accept its
 *     destination rather than fork the action signature.
 *
 * Both buttons are useTransition-wrapped so pending state disables them
 * and surfaces a "…" affordance. Errors surface via an inline kill
 * banner — no toast, no silent failure.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeInvoiceAction,
  deleteInvoiceAction,
  type InvoiceActionResult,
} from "@/app/(workspace)/invoices/actions";

interface Props {
  invoiceId: string;
  hasLineItems: boolean;
}

const DISCARD_CONFIRM_EL =
  "Διαγραφή αυτού του πρόχειρου AI; Δεν χρησιμοποιείται αριθμός τιμολογίου.";
const DISCARD_CONFIRM_EN =
  "Discard this AI draft? No invoice number is consumed.";
const FINALIZE_CONFIRM_EL =
  "Οριστικοποίηση τιμολογίου; Θα εκχωρηθεί αριθμός και η ενέργεια δεν αναιρείται.";
const FINALIZE_CONFIRM_EN =
  "Finalize this invoice? A number will be allocated and this cannot be undone.";

export function DraftActions({ invoiceId, hasLineItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [topError, setTopError] = useState<string | null>(null);

  // Pick the confirm copy from the document locale — read at render time
  // off the cookie via document.documentElement.lang (set by the
  // workspace layout). Falls back to EN if missing.
  const isGreek =
    typeof document !== "undefined" && document.documentElement.lang === "el";
  const finalizeLabel = isGreek ? "Οριστικοποίηση" : "Finalize";
  const discardLabel = isGreek ? "Απόρριψη" : "Discard";
  const finalizingLabel = isGreek ? "Οριστικοποίηση…" : "Finalizing…";
  const discardingLabel = isGreek ? "Διαγραφή…" : "Discarding…";

  function onFinalize() {
    const ok = window.confirm(
      isGreek ? FINALIZE_CONFIRM_EL : FINALIZE_CONFIRM_EN,
    );
    if (!ok) return;
    startTransition(async () => {
      const res: (InvoiceActionResult & { invoiceNumber?: string }) | void =
        await finalizeInvoiceAction(invoiceId);
      if (!res) return; // Next.js redirect — unreachable here, kept for safety.
      if ("ok" in res && res.ok && res.invoiceNumber) {
        setTopError(null);
        router.push(`/invoices/${invoiceId}`);
        return;
      }
      if ("error" in res) {
        setTopError(res.error);
      }
    });
  }

  function onDiscard() {
    const ok = window.confirm(
      isGreek ? DISCARD_CONFIRM_EL : DISCARD_CONFIRM_EN,
    );
    if (!ok) return;
    startTransition(async () => {
      // deleteInvoiceAction calls `redirect("/invoices")` on success, which
      // Next.js intercepts on the server side. The promise resolves to
      // `undefined` from the client perspective — we never see an `ok`
      // payload on the happy path. Only the error path returns a result.
      const res = (await deleteInvoiceAction(invoiceId)) as
        | InvoiceActionResult
        | undefined;
      if (!res) return;
      if ("ok" in res && res.ok) {
        // Defensive — current deleteInvoiceAction always redirects, but if
        // that ever changes we still want the user on /drafts.
        router.push("/drafts");
        return;
      }
      if ("error" in res) {
        setTopError(res.error);
      }
    });
  }

  const errorCopy = (code: string): string => {
    if (code === "no_line_items") {
      return isGreek
        ? "Προσθέστε τουλάχιστον μία γραμμή πριν την οριστικοποίηση."
        : "Add at least one line item before finalizing.";
    }
    if (code === "already_finalized") {
      return isGreek
        ? "Αυτό το τιμολόγιο έχει ήδη οριστικοποιηθεί."
        : "This invoice has already been finalized.";
    }
    if (code === "not_found") {
      return isGreek ? "Το πρόχειρο δεν βρέθηκε." : "Draft not found.";
    }
    return isGreek
      ? "Κάτι πήγε στραβά. Παρακαλώ δοκιμάστε ξανά."
      : "Something went wrong. Please try again.";
  };

  return (
    <div className="flex flex-col items-stretch gap-3">
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={onFinalize}
          disabled={isPending || !hasLineItems}
          aria-label={finalizeLabel}
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          {isPending ? finalizingLabel : finalizeLabel}
        </button>

        <button
          type="button"
          onClick={onDiscard}
          disabled={isPending}
          aria-label={discardLabel}
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
          style={{
            background: "var(--kill)",
            color: "var(--bg)",
          }}
        >
          {isPending ? discardingLabel : discardLabel}
        </button>
      </div>

      {topError ? (
        <div
          role="alert"
          className="text-sm rounded-md border px-4 py-3"
          style={{
            background: "color-mix(in oklch, var(--kill) 8%, transparent)",
            borderColor: "var(--kill)",
            color: "var(--kill)",
          }}
        >
          {errorCopy(topError)}
        </div>
      ) : null}
    </div>
  );
}
