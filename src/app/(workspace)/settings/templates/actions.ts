"use server";

/**
 * Server Actions for the Settings → Templates surface.
 *
 * Two actions:
 *   * `uploadLogoAction(formData)` — accepts a `file` field (PNG or JPEG,
 *     ≤ 200 KB), uploads to the private `workspace-logos` Storage bucket at
 *     path `<workspace_id>/logo.<ext>`, then signs a 30-day URL and persists
 *     the URL into `workspaces.template_settings.logo_data_url`.
 *
 *   * `updateTemplateSettingsAction(formData)` — Zod-validates `{ iban,
 *     tax_id, vat_number, footer_text, accent_hex }` and patches the
 *     corresponding fields on the workspace row (top-level columns for IBAN /
 *     tax_id / vat_number; JSONB merge for footer_text + accent_hex).
 *
 * Locked invariants (same shape as `invoices/actions.ts` and `clients/actions.ts`):
 *   * `data.length === 0` deny-by-omission check on every UPDATE — surfaces
 *     workspace-boundary crosses as `not_found` rather than silent no-op.
 *   * Mutations use the user-scoped server client (RLS enforces ownership).
 *     No service-role client is used here.
 *   * Validation errors return a typed `{ error: 'validation', issues }`
 *     payload the client form unpacks into per-field messages.
 *
 * Why a JSONB merge for `footer_text` / `accent_hex` and top-level columns for
 * IBAN / tax_id / vat_number: those three already exist on the `workspaces`
 * row from Migration 001 and are read elsewhere (PDF route, future invoice
 * export). The template-settings JSONB is the "soft" bag for visual customisation
 * that doesn't surface anywhere else.
 *
 * References:
 *   * supabase/migrations/20260513000001_schema.sql (workspaces.iban etc.)
 *   * supabase/migrations/20260513000006_workspace_template_settings.sql
 *   * src/app/api/pdf/[invoiceId]/route.ts:74-81 (defensive read shape)
 *   * .planning/phase-3-plan.md §Task 6
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LOGO_BYTES = 200 * 1024; // 200 KB
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const BUCKET = "workspace-logos";

// The three allowed accent presets — the three terracotta variants in
// DESIGN.md §2. Stored as hex equivalents (PDFKit cannot consume OKLCH).
// Keep these in lock-step with `LexPdfTokens.accent` and `globals.css`.
const ACCENT_PRESETS = ["#b85730", "#a04826", "#c3683e"] as const;

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

// Cyprus IBAN: starts with 'CY', 2 check digits, then 4–30 alphanumeric chars
// (the IBAN spec permits letters, but Cyprus accounts in practice are digits).
// We accept the general IBAN shape, allowing spaces for readability.
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9 ]{4,30}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TemplateSettingsInput = z.object({
  iban: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : null))
    .refine(
      (v) => v === null || IBAN_RE.test(v),
      { message: "invalid_iban" },
    ),
  tax_id: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  vat_number: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  footer_text: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  accent_hex: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) =>
        v === null ||
        (HEX_RE.test(v) &&
          (ACCENT_PRESETS as readonly string[]).includes(v.toLowerCase())),
      { message: "invalid_accent" },
    ),
});

type TemplateSettingsShape = z.infer<typeof TemplateSettingsInput>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TemplateSettingsResult =
  | { ok: true }
  | {
      error: "validation";
      issues: z.core.$ZodFlattenedError<TemplateSettingsShape>;
    }
  | {
      error:
        | "no_workspace"
        | "update_failed"
        | "not_found";
    };

export type LogoUploadResult =
  | { ok: true; signed_url: string }
  | {
      error:
        | "no_workspace"
        | "no_file"
        | "invalid_type"
        | "too_large"
        | "upload_failed"
        | "sign_failed"
        | "update_failed"
        | "not_found";
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WorkspaceLookupRow {
  id: string;
  template_settings: Record<string, unknown> | null;
}

async function resolveWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<WorkspaceLookupRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("workspaces")
    .select("id, template_settings")
    .eq("owner_user_id", user.id)
    .maybeSingle<WorkspaceLookupRow>();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// uploadLogoAction
// ---------------------------------------------------------------------------

export async function uploadLogoAction(
  formData: FormData,
): Promise<LogoUploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "no_file" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: "invalid_type" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "too_large" };
  }

  const supabase = await createClient();
  const workspace = await resolveWorkspace(supabase);
  if (!workspace) return { error: "no_workspace" };

  const ext = ALLOWED_EXTENSIONS[file.type] ?? "png";
  const objectPath = `${workspace.id}/logo.${ext}`;

  // Storage upload — `upsert: true` overwrites the previous logo at the same
  // path. RLS (Migration 006) gates this insert to objects under the caller's
  // own workspace_id; if RLS denies, the upload returns an error.
  const fileBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, fileBuffer, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) {
    console.error("uploadLogo.upload_failed", uploadError.message);
    return { error: "upload_failed" };
  }

  // Signed URL — 30 days. The bucket is private so a direct URL would 403.
  // Phase 4 may switch to server-side base64 inlining to remove the TTL risk.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    console.error("uploadLogo.sign_failed", signError?.message);
    return { error: "sign_failed" };
  }

  // Merge into template_settings. JSONB merge via spread on the JS side so we
  // don't clobber sibling keys (footer_text / accent_hex) set by the other
  // action. `data.length === 0` deny-by-omission check below.
  const mergedSettings = {
    ...((workspace.template_settings ?? {}) as Record<string, unknown>),
    logo_data_url: signed.signedUrl,
  };
  const { data: updated, error: updateError } = await supabase
    .from("workspaces")
    .update({ template_settings: mergedSettings })
    .eq("id", workspace.id)
    .select("id")
    .returns<{ id: string }[]>();

  if (updateError) {
    console.error("uploadLogo.update_failed", updateError.message);
    return { error: "update_failed" };
  }
  if (!updated || updated.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/settings/templates");
  return { ok: true, signed_url: signed.signedUrl };
}

// ---------------------------------------------------------------------------
// updateTemplateSettingsAction
// ---------------------------------------------------------------------------

export async function updateTemplateSettingsAction(
  formData: FormData,
): Promise<TemplateSettingsResult> {
  const parsed = TemplateSettingsInput.safeParse({
    iban: formData.get("iban"),
    tax_id: formData.get("tax_id"),
    vat_number: formData.get("vat_number"),
    footer_text: formData.get("footer_text"),
    accent_hex: formData.get("accent_hex"),
  });
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const workspace = await resolveWorkspace(supabase);
  if (!workspace) return { error: "no_workspace" };

  // Merge into existing template_settings — preserve any sibling keys
  // (e.g. `logo_data_url` set by uploadLogoAction).
  const existing = (workspace.template_settings ?? {}) as Record<
    string,
    unknown
  >;
  const mergedSettings: Record<string, unknown> = {
    ...existing,
    footer_text: parsed.data.footer_text,
    accent_hex: parsed.data.accent_hex,
  };

  const { data, error } = await supabase
    .from("workspaces")
    .update({
      iban: parsed.data.iban,
      tax_id: parsed.data.tax_id,
      vat_number: parsed.data.vat_number,
      template_settings: mergedSettings,
    })
    .eq("id", workspace.id)
    .select("id")
    .returns<{ id: string }[]>();

  if (error) {
    console.error("updateTemplateSettings.update_failed", error.message);
    return { error: "update_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/settings/templates");
  revalidatePath("/invoices");
  return { ok: true };
}
