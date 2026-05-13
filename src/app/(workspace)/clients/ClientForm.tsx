"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ClientRow, PreferredLanguage } from "@/lib/types";
import {
  createClientAction,
  updateClientAction,
  deleteClientAction,
  type ClientActionResult,
} from "@/app/(workspace)/clients/actions";

interface Props {
  mode: "create" | "edit";
  initial?: Pick<
    ClientRow,
    | "id"
    | "name_el"
    | "name_en"
    | "vat_number"
    | "tax_id"
    | "email"
    | "phone"
    | "address"
    | "preferred_language"
  >;
}

type FieldErrors = Partial<
  Record<
    | "name_el"
    | "name_en"
    | "vat_number"
    | "tax_id"
    | "email"
    | "phone"
    | "address"
    | "preferred_language",
    string[]
  >
>;

export function ClientForm({ mode, initial }: Props) {
  const t = useTranslations("clients");
  const tForm = useTranslations("clients.form");
  const tActions = useTranslations("actions");
  const tError = useTranslations("error");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topError, setTopError] = useState<string | null>(null);

  const handleResult = (res: ClientActionResult | void) => {
    if (!res) return; // redirect happened
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
      const res = await updateClientAction(initial.id, formData);
      handleResult(res);
    } else {
      const res = await createClientAction(formData);
      handleResult(res as ClientActionResult);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      const res = await deleteClientAction(initial.id);
      handleResult(res as ClientActionResult);
    });
  }

  const preferred: PreferredLanguage = initial?.preferred_language ?? "el";

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
        <Field
          name="name_el"
          label={tForm("nameEl")}
          placeholder={tForm("nameElPlaceholder")}
          defaultValue={initial?.name_el ?? ""}
          errors={errors.name_el}
          required
        />
        <Field
          name="name_en"
          label={tForm("nameEn")}
          placeholder={tForm("nameEnPlaceholder")}
          defaultValue={initial?.name_en ?? ""}
          errors={errors.name_en}
          required
        />
        <Field
          name="vat_number"
          label={tForm("vatNumber")}
          placeholder={tForm("vatPlaceholder")}
          defaultValue={initial?.vat_number ?? ""}
          errors={errors.vat_number}
        />
        <Field
          name="tax_id"
          label={tForm("taxId")}
          defaultValue={initial?.tax_id ?? ""}
          errors={errors.tax_id}
        />
        <Field
          name="email"
          label={tForm("email")}
          type="email"
          placeholder={tForm("emailPlaceholder")}
          defaultValue={initial?.email ?? ""}
          errors={errors.email}
        />
        <Field
          name="phone"
          label={tForm("phone")}
          type="tel"
          defaultValue={initial?.phone ?? ""}
          errors={errors.phone}
        />
        <div className="md:col-span-2">
          <Field
            name="address"
            label={tForm("address")}
            defaultValue={initial?.address ?? ""}
            errors={errors.address}
            as="textarea"
          />
        </div>
        <div className="md:col-span-2">
          <fieldset>
            <legend
              className="text-sm font-medium mb-2"
              style={{ color: "var(--text)" }}
            >
              {tForm("preferredLanguage")}
            </legend>
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
                    name="preferred_language"
                    value={lang}
                    defaultChecked={preferred === lang}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ color: "var(--text)" }}>
                    {lang === "el"
                      ? tForm("languageEl")
                      : tForm("languageEn")}
                  </span>
                </label>
              ))}
            </div>
            {errors.preferred_language ? (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--kill)" }}
              >
                {errors.preferred_language.join(", ")}
              </p>
            ) : null}
          </fieldset>
        </div>
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
            onClick={() => router.push("/clients")}
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

function Field({
  name,
  label,
  type = "text",
  placeholder,
  defaultValue,
  errors,
  required,
  as = "input",
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
  as?: "input" | "textarea";
}) {
  const fieldId = `field-${name}`;
  const errorId = `error-${name}`;
  const hasError = errors && errors.length > 0;
  const commonStyles = {
    background: "var(--bg)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    borderRadius: "4px",
    padding: "0.55rem 0.75rem",
    width: "100%",
    minHeight: "44px",
  } as const;

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
      {as === "textarea" ? (
        <textarea
          id={fieldId}
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          rows={3}
          style={{
            ...commonStyles,
            minHeight: "5.5rem",
            resize: "vertical",
          }}
          className="focus:outline-none focus:ring-2 focus:ring-offset-2"
        />
      ) : (
        <input
          id={fieldId}
          name={name}
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          style={commonStyles}
          className="focus:outline-none focus:ring-2 focus:ring-offset-2"
        />
      )}
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
