"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import type { ClientRow, MatterRow, MatterStatus } from "@/lib/types";
import {
  createMatterAction,
  updateMatterAction,
  deleteMatterAction,
  type MatterActionResult,
} from "@/app/(workspace)/cases/actions";

interface Props {
  mode: "create" | "edit";
  initial?: Pick<
    MatterRow,
    | "id"
    | "client_id"
    | "matter_number"
    | "title"
    | "matter_type"
    | "status"
    | "default_hourly_rate"
  >;
  clients: Pick<ClientRow, "id" | "name_el" | "name_en">[];
}

type FieldErrors = Partial<
  Record<
    | "client_id"
    | "matter_number"
    | "title"
    | "matter_type"
    | "status"
    | "default_hourly_rate",
    string[]
  >
>;

const STATUSES: MatterStatus[] = ["open", "on_hold", "closed"];

export function MatterForm({ mode, initial, clients }: Props) {
  const t = useTranslations("cases");
  const tForm = useTranslations("cases.form");
  const tActions = useTranslations("actions");
  const tError = useTranslations("error");
  const router = useRouter();
  const locale = useLocale();
  const isGreek = locale === "el-CY";
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topError, setTopError] = useState<string | null>(null);

  const handleResult = (res: MatterActionResult | void) => {
    if (!res) return;
    if ("ok" in res && res.ok) {
      setErrors({});
      setTopError(null);
      router.refresh();
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
  };

  async function onSubmit(formData: FormData) {
    if (mode === "edit" && initial) {
      const res = await updateMatterAction(initial.id, formData);
      handleResult(res);
    } else {
      const res = await createMatterAction(formData);
      handleResult(res as MatterActionResult);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const res = await deleteMatterAction(initial.id);
      handleResult(res as MatterActionResult);
    });
  }

  const statusLabel = (s: MatterStatus): string => {
    switch (s) {
      case "open":
        return t("statusOpen");
      case "on_hold":
        return t("statusOnHold");
      case "closed":
        return t("statusClosed");
    }
  };

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="space-y-6"
    >
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
          label={tForm("client")}
          errors={errors.client_id}
          required
          htmlFor="field-client_id"
        >
          <select
            id="field-client_id"
            name="client_id"
            defaultValue={initial?.client_id ?? ""}
            required
            className="focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={selectStyle}
          >
            <option value="" disabled>
              {tForm("clientSelect")}
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

        <FieldInput
          name="matter_number"
          label={t("matterNumber")}
          placeholder={tForm("matterNumberPlaceholder")}
          defaultValue={initial?.matter_number ?? ""}
          errors={errors.matter_number}
          required
        />

        <div className="md:col-span-2">
          <FieldInput
            name="title"
            label={tForm("title")}
            placeholder={tForm("titlePlaceholder")}
            defaultValue={initial?.title ?? ""}
            errors={errors.title}
            required
          />
        </div>

        <FieldInput
          name="matter_type"
          label={tForm("matterType")}
          placeholder={tForm("matterTypePlaceholder")}
          defaultValue={initial?.matter_type ?? ""}
          errors={errors.matter_type}
          required
        />

        <FieldWrap
          label={tForm("status")}
          errors={errors.status}
          required
          htmlFor="field-status"
        >
          <select
            id="field-status"
            name="status"
            defaultValue={initial?.status ?? "open"}
            className="focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={selectStyle}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </FieldWrap>

        <FieldInput
          name="default_hourly_rate"
          label={tForm("hourlyRate")}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="250.00"
          defaultValue={initial?.default_hourly_rate ?? ""}
          errors={errors.default_hourly_rate}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
            }}
          >
            {tActions("save")}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => router.push("/cases")}
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
        {mode === "edit" && initial ? (
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
            {tActions("delete")}
          </button>
        ) : null}
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
  errors,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  const hasError = errors && errors.length > 0;
  const errorId = `error-${htmlFor}`;
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

function FieldInput({
  name,
  label,
  type = "text",
  inputMode,
  step,
  min,
  placeholder,
  defaultValue,
  errors,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text";
  step?: string;
  min?: string;
  placeholder?: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
}) {
  const fieldId = `field-${name}`;
  const errorId = `error-${name}`;
  const hasError = errors && errors.length > 0;
  return (
    <div>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--text)" }}
      >
        {label}
        {required ? (
          <span style={{ color: "var(--accent)", marginLeft: "4px" }}>*</span>
        ) : null}
      </label>
      <input
        id={fieldId}
        name={name}
        type={type}
        inputMode={inputMode}
        step={step}
        min={min}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        required={required}
        className="focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={inputStyle}
      />
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
