"use server";

/**
 * Server Actions for the Quotations CRUD surface.
 *
 * Mirrors `(workspace)/invoices/actions.ts` for shape — Zod-validated input,
 * typed `{ ok } | { error }` returns, `data.length === 0` deny-by-omission
 * check on every mutation, `revalidatePath` on success.
 *
 * --- LINE-ITEM STORAGE (schema audit, Phase 4 Task 1) ---
 *
 * The base migration `20260513000001_schema.sql` ships ONLY the `quotations`
 * row (header + totals). Quotation line items have no home until this phase.
 *
 * Decision (Phase 4 plan §Task 1 — Action step 2): introduce a
 * `quotation_line_items` table in Migration 007
 * (`20260513000007_convert_quotation_to_invoice.sql`) that mirrors
 * `invoice_line_items` column-for-column. The accept-and-convert SP can then
 * do a pure `INSERT … SELECT` copy from `quotation_line_items` into
 * `invoice_line_items`. This keeps the application code symmetric with the
 * invoice path AND keeps the accept-conversion atomic at the DB layer.
 *
 * Why a separate table (not JSONB on the quotations row): the invoice path
 * stores line items in `invoice_line_items` for a reason — line totals can
 * be queried, audited, and joined. A quotation that converted yesterday and
 * an invoice from today should be inspectable the same way; storing one as
 * relational rows and the other as JSONB would diverge the surfaces.
 *
 * --- NUMBERING (Cyprus VAT context) ---
 *
 * Quotation numbers ARE NOT gap-free (unlike invoices). On `markSentAction`
 * we allocate via `COUNT(*)+1` per (workspace, year) formatted `Q-YYYY/NNNN`.
 * Race window: two concurrent `markSentAction` calls compute the same seq;
 * the second insert would fail an application-layer duplicate check.
 * Acceptable for the demo (UI is single-user). Use the regular RLS-scoped
 * client — NOT `allocate_invoice_number()` (that SP enforces gap-free
 * invariants Cyprus VAT requires only for invoices).
 *
 * --- ACCEPT-AND-CONVERT (the load-bearing action) ---
 *
 * `acceptQuotationAction(id)` invokes the `convert_quotation_to_invoice`
 * SECURITY DEFINER SP from Migration 007. The SP runs three writes
 * (INSERT invoice, INSERT all invoice_line_items, UPDATE source quotation)
 * inside a single PL/pgSQL transaction — atomicity is database-enforced,
 * not application-enforced. The user-scoped Supabase client invokes it
 * via `supabase.rpc('convert_quotation_to_invoice', { p_quotation_id: id })`;
 * the SP re-checks workspace ownership against `auth.uid()` regardless of
 * the SECURITY DEFINER RLS bypass.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { computeTotalsFromItems, toMoney } from "@/lib/totals";
import type {
  QuotationLineItemRow,
  QuotationRow,
} from "@/lib/types";

// Permissive UUID-shape regex — seed uses deterministic placeholder UUIDs
// that strict `z.uuid()` would reject. Same regex as invoices/actions.ts.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const LineItemInput = z.object({
  description: z.string().trim().min(1).max(512),
  quantity: z
    .string()
    .trim()
    .regex(DECIMAL_RE, { message: "invalid_quantity" }),
  unit_price: z
    .string()
    .trim()
    .regex(DECIMAL_RE, { message: "invalid_unit_price" }),
  kind: z.enum(["service", "disbursement", "expense"]).default("service"),
});

const QuotationCreateInput = z.object({
  client_id: z.string().regex(UUID_RE),
  matter_id: z.string().regex(UUID_RE),
  language: z.enum(["el", "en"]),
  notes: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  valid_until: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      { message: "invalid_valid_until" },
    ),
  line_items: z.array(LineItemInput).min(1),
});

const QuotationUpdateInput = z.object({
  language: z.enum(["el", "en"]),
  notes: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  valid_until: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      { message: "invalid_valid_until" },
    ),
});

type QuotationCreateShape = z.infer<typeof QuotationCreateInput>;
type QuotationUpdateShape = z.infer<typeof QuotationUpdateInput>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type QuotationActionResult =
  | { ok: true; id?: string }
  | {
      error: "validation";
      issues: z.core.$ZodFlattenedError<QuotationCreateShape>;
    }
  | {
      error:
        | "insert_failed"
        | "update_failed"
        | "delete_failed"
        | "not_found"
        | "no_workspace"
        | "not_draft"
        | "not_sent"
        | "numbering_collision"
        | "sp_failed";
    };

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createQuotationAction(
  formData: FormData,
): Promise<QuotationActionResult> {
  const rawLineItems = formData.get("line_items");
  let parsedLineItems: unknown = [];
  if (typeof rawLineItems === "string" && rawLineItems.length > 0) {
    try {
      parsedLineItems = JSON.parse(rawLineItems);
    } catch {
      parsedLineItems = [];
    }
  }

  const raw = {
    client_id: formData.get("client_id"),
    matter_id: formData.get("matter_id"),
    language: formData.get("language"),
    notes: formData.get("notes"),
    valid_until: formData.get("valid_until"),
    line_items: parsedLineItems,
  };

  const parsed = QuotationCreateInput.safeParse(raw);
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "no_workspace" };
  }
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!ws) {
    return { error: "no_workspace" };
  }

  const { subtotal, vatAmount, total, lineTotals } = computeTotalsFromItems(
    parsed.data.line_items,
  );

  // Insert the quotation row as a draft (quotation_number NULL — allocation
  // happens on markSent, not on create).
  const { data: inserted, error: qErr } = await supabase
    .from("quotations")
    .insert({
      workspace_id: ws.id,
      client_id: parsed.data.client_id,
      matter_id: parsed.data.matter_id,
      status: "draft",
      issued_at: new Date().toISOString().slice(0, 10),
      valid_until: parsed.data.valid_until,
      subtotal: toMoney(subtotal),
      vat_amount: toMoney(vatAmount),
      total: toMoney(total),
      notes: parsed.data.notes,
      language: parsed.data.language,
    })
    .select("id")
    .returns<Pick<QuotationRow, "id">[]>();

  if (qErr) return { error: "insert_failed" };
  if (!inserted || inserted.length === 0) {
    return { error: "insert_failed" };
  }
  const quotationId = inserted[0].id;

  // Insert line items in a single batch with computed line_total.
  const rows = parsed.data.line_items.map((li, i) => ({
    quotation_id: quotationId,
    workspace_id: ws.id,
    description: li.description,
    quantity: li.quantity,
    unit_price: li.unit_price,
    line_total: toMoney(lineTotals[i]),
    vat_rate: "0.1900",
    position: i + 1,
    kind: li.kind,
  }));
  const { data: lineData, error: lineErr } = await supabase
    .from("quotation_line_items")
    .insert(rows)
    .select("id")
    .returns<Pick<QuotationLineItemRow, "id">[]>();
  if (lineErr) return { error: "insert_failed" };
  if (!lineData || lineData.length === 0) {
    return { error: "insert_failed" };
  }

  revalidatePath("/quotations");
  redirect(`/quotations/${quotationId}`);
}

// ---------------------------------------------------------------------------
// Update — header fields only, draft-only
// ---------------------------------------------------------------------------

export async function updateQuotationAction(
  id: string,
  formData: FormData,
): Promise<QuotationActionResult> {
  const parsed = QuotationUpdateInput.safeParse({
    language: formData.get("language"),
    notes: formData.get("notes"),
    valid_until: formData.get("valid_until"),
  });
  if (!parsed.success) {
    return {
      error: "validation",
      issues: z.flattenError(
        parsed.error,
      ) as unknown as z.core.$ZodFlattenedError<QuotationCreateShape>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .update(parsed.data as Partial<QuotationUpdateShape>)
    .eq("id", id)
    .eq("status", "draft") // Header edits only while draft.
    .select("id")
    .returns<Pick<QuotationRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Delete — drafts only
// ---------------------------------------------------------------------------

export async function deleteQuotationAction(
  id: string,
): Promise<QuotationActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .delete()
    .eq("id", id)
    .eq("status", "draft") // Only drafts may be deleted.
    .select("id")
    .returns<Pick<QuotationRow, "id">[]>();

  if (error) return { error: "delete_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/quotations");
  redirect("/quotations");
}

// ---------------------------------------------------------------------------
// Mark Sent — draft → sent, allocates Q-YYYY/NNNN
// ---------------------------------------------------------------------------

export async function markSentAction(
  id: string,
): Promise<QuotationActionResult & { quotationNumber?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no_workspace" };

  // Verify the quotation exists, belongs to caller's workspace (RLS), and is
  // currently a draft. RLS hides other-workspace rows → null → not_found.
  const { data: quotation } = await supabase
    .from("quotations")
    .select("id, workspace_id, status")
    .eq("id", id)
    .maybeSingle<Pick<QuotationRow, "id" | "workspace_id" | "status">>();
  if (!quotation) return { error: "not_found" };
  if (quotation.status !== "draft") return { error: "not_draft" };

  // Allocate Q-YYYY/NNNN via COUNT(*)+1 per (workspace, year). RLS-scoped
  // user client — quotation numbers may have gaps, so we don't need the
  // gap-free invoice SP.
  const year = new Date().getFullYear();
  const { count: existing } = await supabase
    .from("quotations")
    .select("id", { count: "exact", head: true })
    .eq("quotation_year", year);
  const seq = (existing ?? 0) + 1;
  const quotationNumber = `Q-${year}/${String(seq).padStart(4, "0")}`;

  const { data, error } = await supabase
    .from("quotations")
    .update({
      status: "sent",
      quotation_number: quotationNumber,
      quotation_year: year,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
    .returns<Pick<QuotationRow, "id">[]>();

  if (error) {
    // Postgres UNIQUE violation code is 23505. The base migration does not
    // ship a UNIQUE constraint on (workspace_id, quotation_year,
    // quotation_number), so a true race-collision returns generic update
    // failure, not 23505 — surface it as numbering_collision either way so
    // the UI can present a retry path.
    if (error.code === "23505") {
      return { error: "numbering_collision" };
    }
    return { error: "update_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true, id, quotationNumber };
}

// ---------------------------------------------------------------------------
// Accept & Convert — invokes convert_quotation_to_invoice SP
// ---------------------------------------------------------------------------

export async function acceptQuotationAction(
  id: string,
): Promise<QuotationActionResult & { invoiceId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no_workspace" };

  // Verify quotation exists, is workspace-scoped (RLS), and status='sent'.
  // SP re-verifies workspace ownership defensively; this is the first lock.
  const { data: quotation } = await supabase
    .from("quotations")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<Pick<QuotationRow, "id" | "status">>();
  if (!quotation) return { error: "not_found" };
  if (quotation.status !== "sent") return { error: "not_sent" };

  // Invoke the SECURITY DEFINER SP. Atomic across three tables:
  //   INSERT invoices (draft), INSERT invoice_line_items×N, UPDATE quotations.
  // Re-checks auth.uid() workspace ownership inside the function body.
  const { data, error } = await supabase.rpc(
    "convert_quotation_to_invoice",
    { p_quotation_id: id },
  );
  if (error || !data) {
    // Map SP error messages back to typed result. The SP raises 'not_found',
    // 'not_sent', 'not_authenticated', or 'quotation_missing_matter'. Any
    // other error rolls back and surfaces as sp_failed.
    const message = error?.message ?? "";
    if (message.includes("not_sent")) return { error: "not_sent" };
    if (message.includes("not_found")) return { error: "not_found" };
    if (message.includes("not_authenticated")) return { error: "no_workspace" };
    if (message.includes("quotation_missing_matter")) return { error: "sp_failed" };
    return { error: "sp_failed" };
  }
  const newInvoiceId = data as string;

  // The SP is the application contract: it atomically writes invoice + line
  // items + quotation status across three tables inside a single PL/pgSQL
  // transaction. A non-null return UUID means the transaction committed; no
  // follow-up "did the DB really change" probe is appropriate.

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/invoices");
  redirect(`/invoices/${newInvoiceId}`);
}
