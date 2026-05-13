"use client";

/**
 * Line-item editor for the invoice detail page.
 *
 * Mode A — `editable: false` (finalized / sent / paid / void): read-only
 *   table that preserves the visual rhythm of the draft editor.
 *
 * Mode B — `editable: true` (draft): each line is a row of three inputs
 *   (description, quantity, unit price) plus a delete button. On blur, the
 *   row commits to the server via `updateLineItemAction`. "Add line"
 *   inserts a new row via `addLineItemAction`. After every commit
 *   `router.refresh()` re-pulls the server-truth totals so the totals
 *   block (rendered by the parent server component) stays in lock-step.
 *
 * Optimistic UI: pending state is signalled via `useTransition`; we keep
 * the row visible immediately with `aria-busy` while the server confirms.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, type LexLocale } from "@/lib/format";
import {
  addLineItemAction,
  updateLineItemAction,
  deleteLineItemAction,
  type LineItemActionResult,
} from "@/app/(workspace)/invoices/actions";

const VAT_RATE = 0.19;

export interface EditorLine {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  kind: string;
}

interface Props {
  invoiceId: string;
  lines: EditorLine[];
  editable: boolean;
  locale: LexLocale;
}

interface RowDraft {
  description: string;
  quantity: string;
  unit_price: string;
}

function toNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function LineItemEditor({
  invoiceId,
  lines,
  editable,
  locale,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [topError, setTopError] = useState<string | null>(null);

  // For preview totals we keep a per-row draft state mirroring inputs;
  // the parent server component still owns the persisted totals.
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() => {
    const seed: Record<string, RowDraft> = {};
    for (const l of lines) {
      seed[l.id] = {
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
      };
    }
    return seed;
  });
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("");

  function handleResult(res: LineItemActionResult) {
    if ("ok" in res && res.ok) {
      setTopError(null);
      router.refresh();
      return;
    }
    if ("error" in res) {
      setTopError(res.error);
    }
  }

  function commitRow(line: EditorLine) {
    const draft = drafts[line.id];
    if (!draft) return;
    // Skip if nothing changed.
    if (
      draft.description === line.description &&
      draft.quantity === line.quantity &&
      draft.unit_price === line.unit_price
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("description", draft.description);
    fd.set("quantity", draft.quantity);
    fd.set("unit_price", draft.unit_price);
    fd.set("kind", line.kind);
    startTransition(async () => {
      const res = await updateLineItemAction(invoiceId, line.id, fd);
      handleResult(res);
    });
  }

  function deleteRow(line: EditorLine) {
    startTransition(async () => {
      const res = await deleteLineItemAction(invoiceId, line.id);
      handleResult(res);
    });
  }

  function addRow() {
    if (newDesc.trim().length === 0) {
      setTopError("validation");
      return;
    }
    const fd = new FormData();
    fd.set("description", newDesc.trim());
    fd.set("quantity", newQty);
    fd.set("unit_price", newPrice);
    fd.set("kind", "service");
    startTransition(async () => {
      const res = await addLineItemAction(invoiceId, fd);
      if ("ok" in res && res.ok) {
        setNewDesc("");
        setNewQty("1");
        setNewPrice("");
      }
      handleResult(res);
    });
  }

  // Preview totals — recomputed on every keystroke, client-side.
  const previewLines = lines.map((l) => {
    const draft = drafts[l.id];
    const qty = toNumber(draft?.quantity ?? l.quantity);
    const price = toNumber(draft?.unit_price ?? l.unit_price);
    return roundCents(qty * price);
  });
  const previewSubtotal = roundCents(
    previewLines.reduce((a, b) => a + b, 0),
  );
  const previewVat = roundCents(previewSubtotal * VAT_RATE);
  const previewTotal = roundCents(previewSubtotal + previewVat);

  return (
    <div className="w-full">
      {topError ? (
        <div
          role="alert"
          className="text-sm rounded-md border px-4 py-3 mb-4"
          style={{
            background: "color-mix(in oklch, var(--kill) 8%, transparent)",
            borderColor: "var(--kill)",
            color: "var(--kill)",
          }}
        >
          {topError === "validation"
            ? "Check the inputs and try again."
            : topError === "not_draft"
              ? "Finalized invoices are immutable."
              : "Something went wrong. Please try again."}
        </div>
      ) : null}

      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-[10px] uppercase border-b"
            style={{
              color: "var(--dim)",
              letterSpacing: "0.08em",
              borderColor: "var(--line)",
            }}
          >
            <th className="text-left py-3 font-normal">
              Description · Περιγραφή
            </th>
            <th
              className="text-right py-3 font-normal"
              style={{ width: "6.5rem" }}
            >
              Qty
            </th>
            <th
              className="text-right py-3 font-normal"
              style={{ width: "9rem" }}
            >
              Unit price
            </th>
            <th
              className="text-right py-3 font-normal"
              style={{ width: "9rem" }}
            >
              Line total
            </th>
            {editable ? (
              <th
                aria-label="row actions"
                style={{ width: "3rem" }}
              />
            ) : null}
          </tr>
        </thead>
        <tbody className="tabular">
          {lines.map((line, i) => {
            const draft = drafts[line.id] ?? {
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unit_price,
            };
            const previewTotalLine = previewLines[i];
            return (
              <tr
                key={line.id}
                aria-busy={isPending || undefined}
                className="border-b"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <td className="py-3 pr-3" style={{ color: "var(--text)" }}>
                  {editable ? (
                    <input
                      aria-label="Description"
                      value={draft.description}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [line.id]: {
                            ...draft,
                            description: e.target.value,
                          },
                        }))
                      }
                      onBlur={() => commitRow(line)}
                      style={inputBare}
                    />
                  ) : (
                    line.description
                  )}
                </td>
                <td
                  className="py-3 pr-3 text-right"
                  style={{ color: "var(--muted)" }}
                >
                  {editable ? (
                    <input
                      aria-label="Quantity"
                      type="text"
                      inputMode="decimal"
                      value={draft.quantity}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [line.id]: {
                            ...draft,
                            quantity: e.target.value,
                          },
                        }))
                      }
                      onBlur={() => commitRow(line)}
                      style={{ ...inputBare, textAlign: "right" }}
                    />
                  ) : (
                    line.quantity
                  )}
                </td>
                <td
                  className="py-3 pr-3 text-right"
                  style={{ color: "var(--muted)" }}
                >
                  {editable ? (
                    <input
                      aria-label="Unit price"
                      type="text"
                      inputMode="decimal"
                      value={draft.unit_price}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [line.id]: {
                            ...draft,
                            unit_price: e.target.value,
                          },
                        }))
                      }
                      onBlur={() => commitRow(line)}
                      style={{ ...inputBare, textAlign: "right" }}
                    />
                  ) : (
                    formatMoney(toNumber(line.unit_price), "EUR", locale)
                  )}
                </td>
                <td
                  className="py-3 text-right"
                  style={{ color: "var(--text)" }}
                >
                  {formatMoney(
                    editable ? previewTotalLine : toNumber(line.line_total),
                    "EUR",
                    locale,
                  )}
                </td>
                {editable ? (
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => deleteRow(line)}
                      disabled={isPending}
                      aria-label="Delete line"
                      className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-md text-sm disabled:opacity-60 transition-colors"
                      style={{
                        background: "transparent",
                        color: "var(--kill)",
                      }}
                    >
                      ×
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}

          {lines.length === 0 ? (
            <tr>
              <td
                colSpan={editable ? 5 : 4}
                className="py-6 text-center"
                style={{ color: "var(--dim)" }}
              >
                No line items yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {editable ? (
        <div
          className="mt-5 grid gap-2 sm:grid-cols-[1fr_6rem_8rem_auto] items-start"
        >
          <input
            aria-label="New description"
            placeholder="Description"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            style={inputBordered}
          />
          <input
            aria-label="New quantity"
            type="text"
            inputMode="decimal"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            style={{ ...inputBordered, textAlign: "right" }}
          />
          <input
            aria-label="New unit price"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            style={{ ...inputBordered, textAlign: "right" }}
          />
          <button
            type="button"
            onClick={addRow}
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60 transition-colors"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            + Add line
          </button>
        </div>
      ) : null}

      <div className="ml-auto max-w-sm tabular text-sm mt-8 space-y-2">
        <div
          className="flex justify-between"
          style={{ color: "var(--muted)" }}
        >
          <span>Subtotal · Υποσύνολο</span>
          <span>{formatMoney(previewSubtotal, "EUR", locale)}</span>
        </div>
        <div
          className="flex justify-between"
          style={{ color: "var(--muted)" }}
        >
          <span>VAT 19% · ΦΠΑ 19%</span>
          <span>{formatMoney(previewVat, "EUR", locale)}</span>
        </div>
        <div
          className="flex justify-between font-display text-2xl pt-3 mt-3 border-t"
          style={{ color: "var(--text)", borderColor: "var(--line)" }}
        >
          <span>Total</span>
          <span>{formatMoney(previewTotal, "EUR", locale)}</span>
        </div>
      </div>
    </div>
  );
}

const inputBare: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--line-soft)",
  color: "var(--text)",
  width: "100%",
  padding: "0.25rem 0.25rem",
  minHeight: "32px",
  outline: "none",
};

const inputBordered: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  borderRadius: "4px",
  padding: "0.55rem 0.75rem",
  width: "100%",
  minHeight: "44px",
};
