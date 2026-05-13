"use server";

/**
 * Server Actions for the Retainers surface.
 *
 * Centerpiece: `createRetainerAction` invokes the SECURITY DEFINER stored
 * procedure `create_retainer_with_deposit` (Migration 008), which writes
 * BOTH the `retainers` row AND the matching `trust_ledger` deposit row in a
 * single Postgres statement. Atomicity is automatic — either both rows land
 * or neither. This is the disbarment-grade safety net for REQ-008 / REQ-010
 * (trust ledger separation from revenue, Cyprus Bar exposure).
 *
 * `updateRetainerAction` covers header fields only (signed_at, terms,
 * matter). Editing the deposit amount would require a reversing trust_ledger
 * entry — that is Phase 6 scope; we hard-reject it here.
 *
 * `closeRetainerAction` flips status `active` → `closed` and is the only
 * lifecycle action on this surface for Phase 4. Depletion (active →
 * depleted) is triggered automatically by fee_transfer entries in Phase 6.
 *
 * RLS deny-by-omission on every UPDATE: `.select('id')` + `data.length === 0`
 * check (locked decision #6, mirrors `invoices/actions.ts` and
 * `clients/actions.ts`).
 *
 * Numbering: agreement_number follows `RT-YYYY/NNNN` per (workspace, year)
 * — mirrors the receipt-number pattern in `invoices/actions.ts:markPaidAction`.
 * Race window is acceptable for the demo (≤ 10 retainers) and the UNIQUE
 * column does not exist on `retainers.agreement_number`, so a collision is
 * cosmetic rather than fatal; we still pre-fetch COUNT(*)+1 and surface
 * `numbering_collision` on insert failure so the regression is observable.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { RetainerRow } from "@/lib/types";

// Permissive UUID-shape regex (any version). Seed uses deterministic
// non-v4 placeholder UUIDs like `00000000-0000-0000-0000-0000000b0001`,
// which strict `z.uuid()` would reject. Mirrors the invoices module.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RetainerCreateInput = z.object({
  client_id: z.string().regex(UUID_RE, { message: "invalid_client" }),
  matter_id: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || UUID_RE.test(v), {
      message: "invalid_matter",
    }),
  deposit_amount: z
    .string()
    .trim()
    .regex(DECIMAL_RE, { message: "invalid_deposit_amount" })
    .refine((v) => parseFloat(v) > 0, { message: "deposit_must_be_positive" }),
  signed_at: z
    .string()
    .trim()
    .regex(DATE_RE, { message: "invalid_signed_at" }),
  terms: z
    .string()
    .trim()
    .max(4096)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const RetainerUpdateInput = z.object({
  matter_id: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine((v) => v === null || UUID_RE.test(v), {
      message: "invalid_matter",
    }),
  signed_at: z
    .string()
    .trim()
    .regex(DATE_RE, { message: "invalid_signed_at" }),
  terms: z
    .string()
    .trim()
    .max(4096)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

type RetainerCreateShape = z.infer<typeof RetainerCreateInput>;
type RetainerUpdateShape = z.infer<typeof RetainerUpdateInput>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RetainerActionResult =
  | { ok: true; id?: string }
  | {
      error: "validation";
      issues: z.core.$ZodFlattenedError<RetainerCreateShape>;
    }
  | {
      error:
        | "insert_failed"
        | "update_failed"
        | "not_found"
        | "no_workspace"
        | "numbering_collision"
        | "sp_failed"
        | "not_active";
    };

// ---------------------------------------------------------------------------
// Create — invokes the atomic SP (Migration 008)
// ---------------------------------------------------------------------------

export async function createRetainerAction(
  formData: FormData,
): Promise<RetainerActionResult> {
  const parsed = RetainerCreateInput.safeParse({
    client_id: formData.get("client_id"),
    matter_id: formData.get("matter_id"),
    deposit_amount: formData.get("deposit_amount"),
    signed_at: formData.get("signed_at"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no_workspace" };

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!ws) return { error: "no_workspace" };

  // Pre-fetch COUNT(*) for `agreement_number` generation. Format:
  // `RT-YYYY/NNNN` per (workspace, year(signed_at)) — mirrors the receipt
  // numbering pattern in `invoices/actions.ts:markPaidAction`.
  const year = new Date(parsed.data.signed_at).getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const { count: existingCount } = await supabase
    .from("retainers")
    .select("id", { count: "exact", head: true })
    .gte("signed_at", yearStart)
    .lt("signed_at", yearEnd);
  const seq = (existingCount ?? 0) + 1;
  const agreementNumber = `RT-${year}/${String(seq).padStart(4, "0")}`;

  // Invoke the atomic-write SP via the regular RLS-scoped client. The SP
  // (Migration 008) verifies workspace ownership inside its body and writes
  // both the `retainers` row AND the `trust_ledger` deposit row in one
  // transaction. Postgres atomicity is automatic.
  const { data, error } = await supabase.rpc("create_retainer_with_deposit", {
    p_workspace: ws.id,
    p_client: parsed.data.client_id,
    p_matter: parsed.data.matter_id,
    p_agreement_number: agreementNumber,
    p_deposit: parsed.data.deposit_amount,
    p_signed_at: parsed.data.signed_at,
    p_terms: parsed.data.terms,
    p_currency: "EUR",
    p_actor: user.id,
  });

  if (error) {
    // Unique violation on `agreement_number` would be 23505. Cyprus VAT
    // does not regulate retainer numbers, but we still surface a typed
    // error so a concurrent submit can be retried client-side.
    if (
      typeof error.code === "string" &&
      error.code === "23505"
    ) {
      return { error: "numbering_collision" };
    }
    return { error: "sp_failed" };
  }
  if (typeof data !== "string") {
    return { error: "sp_failed" };
  }

  revalidatePath("/retainers");
  revalidatePath("/trust");
  redirect(`/retainers/${data}`);
}

// ---------------------------------------------------------------------------
// Update — header fields only (deposit edits would require a reversal entry)
// ---------------------------------------------------------------------------

export async function updateRetainerAction(
  id: string,
  formData: FormData,
): Promise<RetainerActionResult> {
  const parsed = RetainerUpdateInput.safeParse({
    matter_id: formData.get("matter_id"),
    signed_at: formData.get("signed_at"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return {
      error: "validation",
      issues: z.flattenError(
        parsed.error,
      ) as unknown as z.core.$ZodFlattenedError<RetainerCreateShape>,
    };
  }

  const supabase = await createClient();
  const update: Partial<RetainerUpdateShape> = {
    matter_id: parsed.data.matter_id,
    signed_at: parsed.data.signed_at,
    terms: parsed.data.terms,
  };

  const { data, error } = await supabase
    .from("retainers")
    .update(update)
    .eq("id", id)
    .select("id")
    .returns<Pick<RetainerRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/retainers");
  revalidatePath(`/retainers/${id}`);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Close — flip status `active` → `closed`
// ---------------------------------------------------------------------------

export async function closeRetainerAction(
  id: string,
): Promise<RetainerActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("retainers")
    .update({ status: "closed" })
    .eq("id", id)
    .eq("status", "active") // defend against double-close
    .select("id")
    .returns<Pick<RetainerRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) {
    return { error: "not_active" };
  }

  revalidatePath("/retainers");
  revalidatePath(`/retainers/${id}`);
  return { ok: true, id };
}
