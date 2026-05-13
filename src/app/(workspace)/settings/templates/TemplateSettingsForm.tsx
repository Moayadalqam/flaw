"use client";

/**
 * Settings → Templates form (client island).
 *
 * Two visually-related but operationally separate panels:
 *   1. Logo uploader — drag/drop OR click `<input type="file" accept="image/png,image/jpeg">`.
 *      Submits via `uploadLogoAction` independently of the rest of the form,
 *      so a successful upload survives even if the user later mistypes an IBAN.
 *
 *   2. Workspace branding form — IBAN / tax ID / VAT registration / footer
 *      text / accent picker (3 terracotta swatches). Submits via
 *      `updateTemplateSettingsAction`. Validation errors surface inline.
 *
 * Preview panel: an `<iframe>` pointing at `/api/pdf/<previewInvoiceId>?preview=1`
 * with a cache-bust query string that refreshes whenever the panel renders
 * fresh server state (the parent server component re-renders after each
 * `revalidatePath`, which remounts this component and bumps the iframe URL).
 *
 * Why a single client component for both panels: the form fields share visual
 * grouping and live in the same React tree as the iframe so we can re-key the
 * iframe on save. Keeping the logo uploader inside the same module lets it
 * sit visually next to the rest of the customisation without a second route.
 */

import { useState, useTransition } from "react";
import {
  uploadLogoAction,
  updateTemplateSettingsAction,
  type LogoUploadResult,
  type TemplateSettingsResult,
} from "@/app/(workspace)/settings/templates/actions";

interface TemplateSettingsValues {
  iban: string | null;
  tax_id: string | null;
  vat_number: string | null;
  footer_text: string | null;
  accent_hex: string | null;
  logo_data_url: string | null;
}

interface Props {
  initial: TemplateSettingsValues;
  previewInvoiceId: string | null;
}

type FieldErrors = Partial<
  Record<"iban" | "tax_id" | "vat_number" | "footer_text" | "accent_hex", string[]>
>;

const ACCENT_SWATCHES: { hex: string; label: string }[] = [
  { hex: "#b85730", label: "Cyprus terracotta" },
  { hex: "#a04826", label: "Deep terracotta" },
  { hex: "#c3683e", label: "Warm terracotta" },
];

const LOGO_ACCEPT = "image/png,image/jpeg";
const MAX_LOGO_KB = 200;

export function TemplateSettingsForm({ initial, previewInvoiceId }: Props) {
  const [isFormPending, startFormTransition] = useTransition();
  const [isLogoPending, startLogoTransition] = useTransition();
  const [iban, setIban] = useState(initial.iban ?? "");
  const [taxId, setTaxId] = useState(initial.tax_id ?? "");
  const [vatNumber, setVatNumber] = useState(initial.vat_number ?? "");
  const [footerText, setFooterText] = useState(initial.footer_text ?? "");
  const [accentHex, setAccentHex] = useState<string>(
    initial.accent_hex ?? ACCENT_SWATCHES[0].hex,
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logo_data_url);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formStatus, setFormStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [logoStatus, setLogoStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  // Used to cache-bust the preview iframe each time settings change.
  const [previewBuster, setPreviewBuster] = useState(() => Date.now());

  function handleFormResult(res: TemplateSettingsResult) {
    if ("ok" in res) {
      setErrors({});
      setFormStatus("saved");
      setPreviewBuster(Date.now());
      return;
    }
    if (res.error === "validation") {
      setErrors((res.issues.fieldErrors ?? {}) as FieldErrors);
      setFormStatus("error");
    } else {
      setErrors({});
      setFormStatus("error");
    }
  }

  function handleLogoResult(res: LogoUploadResult) {
    if ("ok" in res) {
      setLogoUrl(res.signed_url);
      setLogoStatus({ kind: "ok" });
      setPreviewBuster(Date.now());
      return;
    }
    const messages: Record<string, string> = {
      no_file: "Please choose a PNG or JPEG file.",
      invalid_type: "Only PNG and JPEG are accepted.",
      too_large: `File too large — keep it under ${MAX_LOGO_KB} KB.`,
      upload_failed: "Upload failed. Try again.",
      sign_failed: "Upload succeeded but signing the URL failed.",
      update_failed: "Could not save the logo URL.",
      not_found: "Workspace not found.",
      no_workspace: "Workspace not found.",
    };
    setLogoStatus({
      kind: "error",
      message: messages[res.error] ?? "Upload failed.",
    });
  }

  function submitFile(file: File) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setLogoStatus({ kind: "idle" });
    startLogoTransition(async () => {
      const res = await uploadLogoAction(fd);
      handleLogoResult(res);
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) submitFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) submitFile(file);
  }

  async function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("iban", iban);
    fd.set("tax_id", taxId);
    fd.set("vat_number", vatNumber);
    fd.set("footer_text", footerText);
    fd.set("accent_hex", accentHex);
    setFormStatus("idle");
    startFormTransition(async () => {
      const res = await updateTemplateSettingsAction(fd);
      handleFormResult(res);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] items-start">
      {/* Left column — uploader + form */}
      <div className="space-y-8">
        {/* Logo uploader */}
        <section
          className="border rounded-md p-6"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div
            className="text-[10px] uppercase tracking-widest mb-4"
            style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
          >
            Logo
          </div>

          {logoUrl ? (
            <div
              className="mb-4 flex items-center gap-3 p-3 rounded-md border"
              style={{
                borderColor: "var(--line-soft)",
                background: "var(--bg)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Current workspace logo"
                style={{
                  maxHeight: "60px",
                  maxWidth: "200px",
                  objectFit: "contain",
                }}
              />
              <span
                className="text-xs"
                style={{ color: "var(--muted)" }}
              >
                Current logo
              </span>
            </div>
          ) : null}

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            htmlFor="logo-upload-input"
            className="flex flex-col items-center justify-center text-center cursor-pointer rounded-md border-2 border-dashed p-8 transition-colors min-h-[140px]"
            style={{
              borderColor: dragOver ? "var(--accent)" : "var(--line)",
              background: dragOver ? "var(--accent-bg)" : "var(--bg)",
              color: "var(--muted)",
            }}
          >
            <input
              id="logo-upload-input"
              name="file"
              type="file"
              accept={LOGO_ACCEPT}
              className="sr-only"
              onChange={onFileChange}
              disabled={isLogoPending}
            />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text)" }}
            >
              {isLogoPending
                ? "Uploading…"
                : "Drop a PNG or JPEG here, or click to choose"}
            </span>
            <span
              className="text-xs mt-2"
              style={{ color: "var(--dim)" }}
            >
              Recommended 200×80 px · max {MAX_LOGO_KB} KB
            </span>
          </label>

          {logoStatus.kind === "ok" ? (
            <div
              role="status"
              className="mt-3 text-xs"
              style={{ color: "var(--ok)" }}
            >
              Logo saved.
            </div>
          ) : null}
          {logoStatus.kind === "error" ? (
            <div
              role="alert"
              className="mt-3 text-xs"
              style={{ color: "var(--kill)" }}
            >
              {logoStatus.message}
            </div>
          ) : null}
        </section>

        {/* Branding form */}
        <form
          onSubmit={onFormSubmit}
          className="space-y-6 border rounded-md p-6"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          <div
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
          >
            Workspace branding
          </div>

          <FieldWrap
            label="IBAN"
            htmlFor="field-iban"
            error={errors.iban?.[0]}
            hint="Format: country code + check digits + account (spaces allowed)."
          >
            <input
              id="field-iban"
              name="iban"
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="CY12 3456 7890 1234 5678 9012 3456"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </FieldWrap>

          <div className="grid gap-5 md:grid-cols-2">
            <FieldWrap
              label="Tax ID"
              htmlFor="field-tax_id"
              error={errors.tax_id?.[0]}
            >
              <input
                id="field-tax_id"
                name="tax_id"
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="CY-TAX-FK-001"
                autoComplete="off"
                style={inputStyle}
              />
            </FieldWrap>

            <FieldWrap
              label="VAT number"
              htmlFor="field-vat_number"
              error={errors.vat_number?.[0]}
            >
              <input
                id="field-vat_number"
                name="vat_number"
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="CY10000001A"
                autoComplete="off"
                style={inputStyle}
              />
            </FieldWrap>
          </div>

          <FieldWrap
            label="Footer text"
            htmlFor="field-footer_text"
            error={errors.footer_text?.[0]}
            hint="Shown above the page number on every PDF. Max 500 characters."
          >
            <textarea
              id="field-footer_text"
              name="footer_text"
              rows={3}
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Thank you for your business."
              style={{ ...inputStyle, minHeight: "5.5rem", resize: "vertical" }}
            />
          </FieldWrap>

          <FieldWrap
            label="Accent colour"
            htmlFor="field-accent_hex"
            error={errors.accent_hex?.[0]}
            hint="Used for headings, totals, and the document accent strip."
          >
            <div role="radiogroup" aria-label="Accent colour" className="flex gap-3">
              {ACCENT_SWATCHES.map((swatch) => {
                const selected = accentHex.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={swatch.label}
                    onClick={() => setAccentHex(swatch.hex)}
                    className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-md border transition-colors"
                    style={{
                      background: "var(--bg)",
                      borderColor: selected
                        ? "var(--text)"
                        : "var(--line)",
                      color: "var(--text)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block rounded-full"
                      style={{
                        width: "20px",
                        height: "20px",
                        background: swatch.hex,
                        border: "1px solid var(--line)",
                      }}
                    />
                    <span className="text-sm">{swatch.label}</span>
                  </button>
                );
              })}
            </div>
            <input
              type="hidden"
              name="accent_hex"
              value={accentHex}
              readOnly
            />
          </FieldWrap>

          {formStatus === "saved" ? (
            <div
              role="status"
              className="text-sm rounded-md border px-4 py-3"
              style={{
                background: "oklch(0.85 0.05 145 / 0.18)",
                borderColor: "var(--ok)",
                color: "var(--ok)",
              }}
            >
              Settings saved.
            </div>
          ) : null}
          {formStatus === "error" && Object.keys(errors).length === 0 ? (
            <div
              role="alert"
              className="text-sm rounded-md border px-4 py-3"
              style={{
                background: "oklch(0.52 0.180 25 / 0.08)",
                borderColor: "var(--kill)",
                color: "var(--kill)",
              }}
            >
              Could not save settings. Please try again.
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isFormPending}
              className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
              }}
            >
              {isFormPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </div>

      {/* Right column — preview */}
      <aside className="lg:sticky lg:top-6">
        <div
          className="text-[10px] uppercase tracking-widest mb-3"
          style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          Preview
        </div>
        {previewInvoiceId ? (
          <iframe
            key={previewBuster}
            title="Invoice PDF preview"
            src={`/api/pdf/${previewInvoiceId}?preview=1&v=${previewBuster}`}
            className="w-full rounded-md border"
            style={{
              borderColor: "var(--line)",
              background: "var(--bg)",
              height: "720px",
            }}
          />
        ) : (
          <div
            className="rounded-md border px-6 py-12 text-center text-sm"
            style={{
              borderColor: "var(--line)",
              background: "var(--surface)",
              color: "var(--muted)",
            }}
          >
            Finalize an invoice to preview the template here.
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

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
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
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
      </label>
      {children}
      {hint && !error ? (
        <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--kill)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
