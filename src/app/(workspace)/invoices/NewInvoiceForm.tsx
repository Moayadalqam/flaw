"use client";

/**
 * Create-invoice form.
 *
 * Combines a client picker, a matter picker filtered by selected client,
 * language toggle, due-at, notes, and a local-only line-item array. The
 * line items are serialised to a hidden `line_items` JSON field on submit
 * and consumed by `createInvoiceAction`.
 *
 * Why local-only line items (not Server Actions per row): the invoice does
 * not exist yet — there is nothing to PATCH against. The full editor
 * (LineItemEditor.tsx, calls Server Actions per row) only mounts on the
 * detail page after the draft has been created.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClientRow, MatterRow, PreferredLanguage } from "@/lib/types";
import {
  createInvoiceAction,
  type InvoiceActionResult,
} from "@/app/(workspace)/invoices/actions";
import { formatMoney, type LexLocale } from "@/lib/format";

type MatterPick = Pick<
  MatterRow,
  "id" | "client_id" | "matter_number" | "title"
>;

type ClientPick = Pick<ClientRow, "id" | "name_el" | "name_en">;

interface DraftLine {
  description: string;
  quantity: string;
  unit_price: string;
}

interface Props {
  clients: ClientPick[];
  matters: MatterPick[];
  locale: LexLocale;
}

const VAT_RATE = 0.19;

function toNumber(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function NewInvoiceForm({ clients, matters, locale }: Props) {
  const router = useRouter();
  const isGreek = locale === "el-CY";
  const [isPending, startTransition] = useTransition();
  const [topError, setTopError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [language, setLanguage] = useState<PreferredLanguage>("el");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", quantity: "1", unit_price: "" },
  ]);

  const filteredMatters = useMemo(
    () => matters.filter((m) => !clientId || m.client_id === clientId),
    [matters, clientId],
  );

  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { description: "", quantity: "1", unit_price: "" },
    ]);
  }

  function removeLine(i: number) {
    setLines((current) =>
      current.length <= 1 ? current : current.filter((_, idx) => idx !== i),
    );
  }

  const previewLineTotals = lines.map((l) =>
    roundCents(toNumber(l.quantity) * toNumber(l.unit_price)),
  );
  const previewSubtotal = roundCents(
    previewLineTotals.reduce((a, b) => a + b, 0),
  );
  const previewVat = roundCents(previewSubtotal * VAT_RATE);
  const previewTotal = roundCents(previewSubtotal + previewVat);

  function handleResult(res: InvoiceActionResult | void) {
    if (!res) return; // redirect happened
    if ("ok" in res && res.ok) {
      setTopError(null);
      return;
    }
    if ("error" in res) {
      setTopError(res.error);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanLines = lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity.trim() || "0",
        unit_price: l.unit_price.trim() || "0",
        kind: "service" as const,
      }))
      .filter((l) => l.description.length > 0);
    if (cleanLines.length === 0) {
      setTopError("validation");
      return;
    }
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("matter_id", matterId);
    fd.set("language", language);
    if (dueAt) fd.set("due_at", dueAt);
    if (notes) fd.set("notes", notes);
    fd.set("line_items", JSON.stringify(cleanLines));
    startTransition(async () => {
      const res = await createInvoiceAction(fd);
      handleResult(res as InvoiceActionResult);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {topError ? (
        <div
          role="alert"
          className="text-sm rounded-md border px-4 py-3"
          style={{
            background: "oklch(0.52 0.180 25 / 0.08)",
            borderColor: "var(--kill)",
            color: "var(--kill)",
          }}
        >
          {topError === "validation"
            ? "Check the form — at least one line item with a description is required."
            : "Something went wrong. Please try again."}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <FieldWrap label="Client" htmlFor="field-client_id" required>
          <select
            id="field-client_id"
            name="client_id"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setMatterId(""); // reset matter when client changes
            }}
            required
            style={selectStyle}
          >
            <option value="" disabled>
              Select a client
            </option>
            {clients.map((c) => {
              const primary = isGreek ? c.name_el : c.name_en;
              const secondary = isGreek ? c.name_en : c.name_el;
              const label =
                secondary && secondary !== primary
                  ? `${primary} — ${secondary}`
                  : primary;
              return (
                <option key={c.id} value={c.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </FieldWrap>

        <FieldWrap label="Case · Υπόθεση" htmlFor="field-matter_id" required>
          <select
            id="field-matter_id"
            name="matter_id"
            value={matterId}
            onChange={(e) => setMatterId(e.target.value)}
            required
            disabled={!clientId}
            style={{
              ...selectStyle,
              opacity: clientId ? 1 : 0.6,
            }}
          >
            <option value="" disabled>
              {clientId
                ? "Select a case"
                : "Select a client first"}
            </option>
            {filteredMatters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matter_number} — {m.title}
              </option>
            ))}
          </select>
        </FieldWrap>

        <FieldWrap label="Language" htmlFor="field-language" required>
          <div className="flex gap-3">
            {(["el", "en"] as PreferredLanguage[]).map((lang) => (
              <label
                key={lang}
                className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] px-3 rounded-md border"
                style={{
                  borderColor: "var(--line)",
                  background: "var(--bg)",
                }}
              >
                <input
                  type="radio"
                  name="language"
                  value={lang}
                  checked={language === lang}
                  onChange={() => setLanguage(lang)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ color: "var(--text)" }}>
                  {lang === "el" ? "Ελληνικά" : "English"}
                </span>
              </label>
            ))}
          </div>
        </FieldWrap>

        <FieldWrap label="Due date" htmlFor="field-due_at">
          <input
            id="field-due_at"
            name="due_at"
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            style={inputStyle}
          />
        </FieldWrap>

        <div className="md:col-span-2">
          <FieldWrap label="Notes" htmlFor="field-notes">
            <textarea
              id="field-notes"
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                ...inputStyle,
                minHeight: "5.5rem",
                resize: "vertical",
              }}
            />
          </FieldWrap>
        </div>
      </div>

      <section
        className="border rounded-md p-5"
        style={{
          borderColor: "var(--line)",
          background: "var(--bg)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-widest mb-4"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          Line items · Στοιχεία τιμολογίου
        </div>

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div
              key={i}
              className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_8rem_auto] items-start"
            >
              <input
                aria-label={`Description ${i + 1}`}
                placeholder="Description"
                value={line.description}
                onChange={(e) =>
                  updateLine(i, { description: e.target.value })
                }
                style={inputStyle}
              />
              <input
                aria-label={`Quantity ${i + 1}`}
                type="text"
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) =>
                  updateLine(i, { quantity: e.target.value })
                }
                style={{ ...inputStyle, textAlign: "right" }}
              />
              <input
                aria-label={`Unit price ${i + 1}`}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={line.unit_price}
                onChange={(e) =>
                  updateLine(i, { unit_price: e.target.value })
                }
                style={{ ...inputStyle, textAlign: "right" }}
              />
              <div
                className="self-center text-right tabular text-sm"
                style={{ color: "var(--text)" }}
              >
                {formatMoney(previewLineTotals[i], "EUR", locale)}
              </div>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
                aria-label={`Remove line ${i + 1}`}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md disabled:opacity-40 transition-colors"
                style={{ color: "var(--kill)", background: "transparent" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="mt-4 inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border transition-colors"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            color: "var(--text)",
          }}
        >
          + Add line
        </button>

        <div className="ml-auto max-w-sm tabular text-sm mt-6 space-y-2">
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
      </section>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending || !clientId || !matterId}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            Create draft
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => router.push("/invoices")}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm border transition-colors disabled:opacity-60"
            style={{
              background: "var(--bg)",
              borderColor: "var(--line)",
              color: "var(--text)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  borderRadius: "4px",
  padding: "0.55rem 0.75rem",
  width: "100%",
  minHeight: "44px",
};

const selectStyle: React.CSSProperties = inputStyle;

function FieldWrap({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--text)" }}
      >
        {label}
        {required ? (
          <span style={{ color: "var(--accent)", marginLeft: "4px" }}>*</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
