"use client";

/**
 * NewRetainerForm — client component.
 *
 * Collects client_id (required), matter_id (optional, filtered to picked
 * client), deposit_amount (decimal, required), signed_at (date, defaults to
 * today), and terms (textarea, optional). Submits via the SECURITY DEFINER
 * SP — `createRetainerAction` calls `create_retainer_with_deposit`, which
 * writes both the `retainers` row AND the matching `trust_ledger` deposit
 * row atomically (Migration 008).
 *
 * Submit button background: `var(--trust)` (sage-olive) per design.
 * Surface Zod validation issues inline.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ClientRow, MatterRow } from "@/lib/types";
import {
  createRetainerAction,
  type RetainerActionResult,
} from "@/app/(workspace)/retainers/actions";

type ClientPick = Pick<ClientRow, "id" | "name_el" | "name_en">;
type MatterPick = Pick<
  MatterRow,
  "id" | "client_id" | "matter_number" | "title"
>;

interface Props {
  clients: ClientPick[];
  matters: MatterPick[];
  isGreek: boolean;
}

type FieldErrors = Partial<
  Record<
    "client_id" | "matter_id" | "deposit_amount" | "signed_at" | "terms",
    string[]
  >
>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewRetainerForm({ clients, matters, isGreek }: Props) {
  const router = useRouter();
  const t = useTranslations("retainers");
  const tActions = useTranslations("actions");
  const tError = useTranslations("error");
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topError, setTopError] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [signedAt, setSignedAt] = useState(todayISO());
  const [terms, setTerms] = useState("");

  const filteredMatters = useMemo(
    () => matters.filter((m) => !clientId || m.client_id === clientId),
    [matters, clientId],
  );

  function handleResult(res: RetainerActionResult | void) {
    if (!res) return; // redirect happened
    if ("ok" in res && res.ok) {
      setErrors({});
      setTopError(null);
      return;
    }
    if ("error" in res) {
      if (res.error === "validation") {
        setErrors((res.issues.fieldErrors ?? {}) as FieldErrors);
        setTopError(null);
      } else {
        setErrors({});
        setTopError(res.error);
      }
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("client_id", clientId);
    if (matterId) fd.set("matter_id", matterId);
    fd.set("deposit_amount", depositAmount.trim());
    fd.set("signed_at", signedAt);
    if (terms.trim()) fd.set("terms", terms.trim());
    startTransition(async () => {
      const res = await createRetainerAction(fd);
      handleResult(res);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
          {tError("generic")}
          <span className="block text-xs mt-1 opacity-80">{topError}</span>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <FieldWrap
          label={t("client")}
          htmlFor="field-client_id"
          required
          errors={errors.client_id}
        >
          <select
            id="field-client_id"
            name="client_id"
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setMatterId("");
            }}
            required
            style={inputStyle}
          >
            <option value="" disabled>
              {t("client")}…
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

        <FieldWrap
          label={t("matter")}
          htmlFor="field-matter_id"
          errors={errors.matter_id}
        >
          <select
            id="field-matter_id"
            name="matter_id"
            value={matterId}
            onChange={(e) => setMatterId(e.target.value)}
            disabled={!clientId}
            style={{
              ...inputStyle,
              opacity: clientId ? 1 : 0.6,
            }}
          >
            <option value="">—</option>
            {filteredMatters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matter_number} — {m.title}
              </option>
            ))}
          </select>
        </FieldWrap>

        <FieldWrap
          label={t("deposit") + " (€)"}
          htmlFor="field-deposit_amount"
          required
          errors={errors.deposit_amount}
        >
          <input
            id="field-deposit_amount"
            name="deposit_amount"
            type="text"
            inputMode="decimal"
            placeholder="2000.00"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            required
            style={{ ...inputStyle, textAlign: "right" }}
            className="tabular"
          />
        </FieldWrap>

        <FieldWrap
          label={t("signed")}
          htmlFor="field-signed_at"
          required
          errors={errors.signed_at}
        >
          <input
            id="field-signed_at"
            name="signed_at"
            type="date"
            value={signedAt}
            onChange={(e) => setSignedAt(e.target.value)}
            required
            style={inputStyle}
          />
        </FieldWrap>

        <div className="md:col-span-2">
          <FieldWrap
            label={t("terms")}
            htmlFor="field-terms"
            errors={errors.terms}
          >
            <textarea
              id="field-terms"
              name="terms"
              rows={4}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              style={{
                ...inputStyle,
                minHeight: "6.5rem",
                resize: "vertical",
              }}
            />
          </FieldWrap>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 flex-wrap">
        <button
          type="submit"
          disabled={
            isPending ||
            !clientId ||
            !depositAmount.trim() ||
            !signedAt
          }
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
          style={{
            background: "var(--trust)",
            color: "var(--bg)",
          }}
        >
          {tActions("save")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => router.push("/retainers")}
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm border transition-colors disabled:opacity-60"
          style={{
            background: "var(--bg)",
            borderColor: "var(--line)",
            color: "var(--text)",
          }}
        >
          {tActions("cancel")}
        </button>
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

function FieldWrap({
  label,
  htmlFor,
  required,
  errors,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  errors?: string[];
  children: React.ReactNode;
}) {
  const hasError = errors && errors.length > 0;
  const errorId = `${htmlFor}-error`;
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--text)" }}
      >
        {label}
        {required ? (
          <span style={{ color: "var(--trust)", marginLeft: "4px" }}>*</span>
        ) : null}
      </label>
      {children}
      {hasError ? (
        <p
          id={errorId}
          className="text-xs mt-1"
          style={{ color: "var(--kill)" }}
        >
          {errors!.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
