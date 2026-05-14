"use server";

/**
 * Server Actions for the Invoices CRUD surface.
 *
 * Mirrors `clients/actions.ts` for shape — Zod-validated input, typed
 * `{ ok } | { error }` return, `data.length === 0` deny-by-omission check on
 * every mutation, `revalidatePath` on success.
 *
 * Locked decisions converging here:
 *   #6  RLS deny-by-omission — every mutation `.select('id')` + checks
 *       `data.length === 0` to surface a workspace boundary cross.
 *   INV  Invoice numbers are ALLOCATED via the SECURITY DEFINER stored
 *       procedure `allocate_invoice_number()` (Migration 003). That SP is
 *       REVOKE'd from anon + authenticated, so finalize MUST switch to
 *       `service_role`. This file is the SOLE place in Phase 3 that
 *       legitimately touches `createServiceClient()`.
 *   VAT The Cyprus rate is 19% (= 0.1900 NUMERIC(5,4) in DB). Subtotal +
 *       VAT + total are computed server-side in this module from line
 *       items — clients see a preview, but server is the source of truth.
 *
 * Receipt numbering (markPaidAction):
 *   Cyprus VAT requires invoice numbering to be gap-free. Receipts are NOT
 *   subject to the same strictness. For Phase 3 we use a simple
 *   COUNT(*)+1 sequence per (workspace, year) formatted as `R-2026/0001`.
 *   Race window: two concurrent payments could collide on the same number
 *   (the UNIQUE constraint will reject the second). Acceptable for the
 *   demo — promote to an `allocate_receipt_number()` SP in a later phase
 *   if/when concurrent receipt creation becomes load-bearing.
 *
 * Cross-cutting hook (Phase 4 Task 4 — billable hours timer):
 *   `createInvoiceAction` reads an optional `from_time_entry` FormData
 *   field (carried in by `NewInvoiceForm` when the user landed via
 *   `/invoices/new?from_time_entry={uuid}` from `/timer`). When present
 *   AND the invoice + line items inserts succeeded, we UPDATE the source
 *   `time_entries` row to `status='billed'` and `invoice_id=<new id>` so
 *   the same hours can never be billed twice. RLS auto-scopes the update;
 *   deny-by-omission via `.select('id')` + `data.length === 0`. If the
 *   update fails we `console.warn` and continue — we do NOT roll back
 *   the invoice (Cyprus VAT bookkeeping doesn't allow a draft-then-delete
 *   ping-pong, and the lawyer can manually unlink the time entry later).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  computeTotalsFromItems,
  roundCents,
  toMoney,
} from "@/lib/totals";
import { callOpenRouter } from "@/lib/openrouter/client";
import { validateAIDraftCandidate } from "@/lib/openrouter/validate";
import type {
  ClientCtx,
  MatterCtx,
} from "@/lib/openrouter/types";
import type { InvoiceRow, LineItemRow, ReceiptRow } from "@/lib/types";

// Permissive UUID-shape regex (any version). Seed uses deterministic
// non-v4 placeholder UUIDs like `00000000-0000-0000-0000-0000000b0001`,
// which strict `z.uuid()` would reject.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const InvoiceCreateInput = z.object({
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
  due_at: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      { message: "invalid_due_at" },
    ),
  line_items: z.array(LineItemInput).min(1),
});

const InvoiceUpdateInput = z.object({
  language: z.enum(["el", "en"]),
  notes: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  due_at: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      { message: "invalid_due_at" },
    ),
});

const SingleLineItemInput = LineItemInput;

const FinalizeInput = z.object({
  invoiceId: z.string().regex(UUID_RE),
});

const MarkPaidInput = z.object({
  paid_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalid_paid_at" }),
  payment_method: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

type InvoiceCreateShape = z.infer<typeof InvoiceCreateInput>;
type InvoiceUpdateShape = z.infer<typeof InvoiceUpdateInput>;
type LineItemShape = z.infer<typeof LineItemInput>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type InvoiceActionResult =
  | { ok: true; id?: string }
  | {
      error: "validation";
      issues: z.core.$ZodFlattenedError<InvoiceCreateShape>;
    }
  | {
      error:
        | "insert_failed"
        | "update_failed"
        | "delete_failed"
        | "not_found"
        | "no_workspace"
        | "not_draft"
        | "not_finalized"
        | "already_finalized"
        | "no_line_items"
        | "receipt_failed"
        | "time_entry_not_found"
        | "time_entry_already_billed";
    };

export type LineItemActionResult =
  | { ok: true; id?: string }
  | {
      error: "validation";
      issues: z.core.$ZodFlattenedError<LineItemShape>;
    }
  | {
      error:
        | "insert_failed"
        | "update_failed"
        | "delete_failed"
        | "not_found"
        | "not_draft";
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function recomputeInvoiceTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<{ ok: true } | { error: "update_failed" | "not_found" }> {
  const { data: items } = await supabase
    .from("invoice_line_items")
    .select("quantity, unit_price")
    .eq("invoice_id", invoiceId)
    .returns<Pick<LineItemRow, "quantity" | "unit_price">[]>();
  const safeItems = items ?? [];
  const { subtotal, vatAmount, total } = computeTotalsFromItems(safeItems);

  const { data, error } = await supabase
    .from("invoices")
    .update({
      subtotal: toMoney(subtotal),
      vat_amount: toMoney(vatAmount),
      total: toMoney(total),
    })
    .eq("id", invoiceId)
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) return { error: "not_found" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invoice — Create
// ---------------------------------------------------------------------------

export async function createInvoiceAction(
  formData: FormData,
): Promise<InvoiceActionResult> {
  // The new-invoice form serialises line items as JSON in a hidden `line_items`
  // field (the LineItemEditor manages a local array client-side until submit).
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
    due_at: formData.get("due_at"),
    line_items: parsedLineItems,
  };

  const parsed = InvoiceCreateInput.safeParse(raw);
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

  // ─────────────────────────────────────────────────────────────────────
  // Atomic prefill path: timer → "Bill these hours" carries a
  // `from_time_entry` UUID. When present, route the whole transaction
  // (workspace ownership re-check, time-entry FOR UPDATE row-lock + state
  // invariants, INSERT invoice, INSERT line item, UPDATE time entry)
  // through the SECURITY DEFINER stored procedure
  // `create_invoice_from_time_entry` (Migration 009). The SP holds all
  // four writes in one PL/pgSQL transaction; the SELECT … FOR UPDATE
  // serialises concurrent callers so a second submission with the same
  // time-entry UUID deterministically sees `status='billed'` and raises
  // `time_entry_already_billed`.
  //
  // The non-prefill path (regular new-invoice flow) keeps the plain
  // RLS-scoped INSERT/INSERT below — multi-line invoices aren't carried
  // by the SP signature, and the regular path has no concurrency hazard.
  // ─────────────────────────────────────────────────────────────────────
  const rawFromTimeEntry = formData.get("from_time_entry");
  if (
    typeof rawFromTimeEntry === "string" &&
    UUID_RE.test(rawFromTimeEntry)
  ) {
    // The prefill flow carries exactly one line item (hours × rate).
    // Reject any submission that diverges — the SP only models one line.
    // The form seeds a single line; this is a defence-in-depth check
    // against tampered FormData or a user adding extra lines on the
    // prefill page (those extra lines wouldn't represent billed hours).
    if (parsed.data.line_items.length !== 1) {
      return { error: "insert_failed" };
    }
    const line = parsed.data.line_items[0];
    const { data: spData, error: spErr } = await supabase.rpc(
      "create_invoice_from_time_entry",
      {
        p_workspace: ws.id,
        p_client: parsed.data.client_id,
        p_matter: parsed.data.matter_id,
        p_time_entry: rawFromTimeEntry,
        p_language: parsed.data.language,
        p_notes: parsed.data.notes,
        p_due_at: parsed.data.due_at,
        p_description: line.description,
        p_quantity: line.quantity,
        p_unit_price: line.unit_price,
        p_line_total: toMoney(lineTotals[0]),
        p_subtotal: toMoney(subtotal),
        p_vat_amount: toMoney(vatAmount),
        p_total: toMoney(total),
        p_actor: user.id,
      },
    );

    if (spErr) {
      const msg = spErr.message ?? "";
      if (msg.includes("time_entry_not_found")) {
        return { error: "time_entry_not_found" };
      }
      if (msg.includes("time_entry_already_billed")) {
        return { error: "time_entry_already_billed" };
      }
      if (msg.includes("workspace ownership mismatch")) {
        return { error: "no_workspace" };
      }
      return { error: "insert_failed" };
    }
    if (typeof spData !== "string" || spData.length === 0) {
      return { error: "insert_failed" };
    }

    revalidatePath("/invoices");
    revalidatePath("/timer");
    redirect(`/invoices/${spData}`);
  }

  // Insert the invoice as a draft (invoice_number NULL — Cyprus VAT requires
  // numbers be allocated only on finalize, never on draft creation).
  const { data: inserted, error: invErr } = await supabase
    .from("invoices")
    .insert({
      workspace_id: ws.id,
      client_id: parsed.data.client_id,
      matter_id: parsed.data.matter_id,
      status: "draft",
      issued_at: new Date().toISOString().slice(0, 10),
      due_at: parsed.data.due_at,
      subtotal: toMoney(subtotal),
      vat_rate: "0.1900",
      vat_amount: toMoney(vatAmount),
      total: toMoney(total),
      currency: "EUR",
      notes: parsed.data.notes,
      language: parsed.data.language,
    })
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (invErr) return { error: "insert_failed" };
  if (!inserted || inserted.length === 0) {
    return { error: "insert_failed" };
  }
  const invoiceId = inserted[0].id;

  // Insert line items in a single batch with computed line_total.
  const rows = parsed.data.line_items.map((li, i) => ({
    invoice_id: invoiceId,
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
    .from("invoice_line_items")
    .insert(rows)
    .select("id")
    .returns<Pick<LineItemRow, "id">[]>();
  if (lineErr) return { error: "insert_failed" };
  if (!lineData || lineData.length === 0) {
    return { error: "insert_failed" };
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

// ---------------------------------------------------------------------------
// Invoice — Update (header fields only; line items have their own actions)
// ---------------------------------------------------------------------------

export async function updateInvoiceAction(
  id: string,
  formData: FormData,
): Promise<InvoiceActionResult> {
  const parsed = InvoiceUpdateInput.safeParse({
    language: formData.get("language"),
    notes: formData.get("notes"),
    due_at: formData.get("due_at"),
  });
  if (!parsed.success) {
    return {
      error: "validation",
      issues: z.flattenError(
        parsed.error,
      ) as unknown as z.core.$ZodFlattenedError<InvoiceCreateShape>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update(parsed.data as Partial<InvoiceUpdateShape>)
    .eq("id", id)
    .eq("status", "draft") // Header edits only while draft.
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Line items — Add / Update / Delete
// ---------------------------------------------------------------------------

async function assertInvoiceDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
): Promise<
  | { ok: true; workspace_id: string }
  | { error: "not_found" | "not_draft" }
> {
  const { data } = await supabase
    .from("invoices")
    .select("id, workspace_id, status")
    .eq("id", invoiceId)
    .maybeSingle<Pick<InvoiceRow, "id" | "workspace_id" | "status">>();
  if (!data) return { error: "not_found" };
  if (data.status !== "draft") return { error: "not_draft" };
  return { ok: true, workspace_id: data.workspace_id };
}

export async function addLineItemAction(
  invoiceId: string,
  formData: FormData,
): Promise<LineItemActionResult> {
  const parsed = SingleLineItemInput.safeParse({
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    unit_price: formData.get("unit_price"),
    kind: formData.get("kind") ?? "service",
  });
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const guard = await assertInvoiceDraft(supabase, invoiceId);
  if ("error" in guard) return { error: guard.error };

  const lineTotal = roundCents(
    parseFloat(parsed.data.quantity) * parseFloat(parsed.data.unit_price),
  );

  // Compute next position (existing count + 1). Two concurrent adds may
  // collide on the same position; not load-bearing, the UI re-renders in
  // order regardless.
  const { count: existingCount } = await supabase
    .from("invoice_line_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);

  const { data, error } = await supabase
    .from("invoice_line_items")
    .insert({
      invoice_id: invoiceId,
      workspace_id: guard.workspace_id,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      line_total: toMoney(lineTotal),
      vat_rate: "0.1900",
      position: (existingCount ?? 0) + 1,
      kind: parsed.data.kind,
    })
    .select("id")
    .returns<Pick<LineItemRow, "id">[]>();

  if (error) return { error: "insert_failed" };
  if (!data || data.length === 0) {
    return { error: "insert_failed" };
  }

  await recomputeInvoiceTotals(supabase, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, id: data[0].id };
}

export async function updateLineItemAction(
  invoiceId: string,
  lineItemId: string,
  formData: FormData,
): Promise<LineItemActionResult> {
  const parsed = SingleLineItemInput.safeParse({
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    unit_price: formData.get("unit_price"),
    kind: formData.get("kind") ?? "service",
  });
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const guard = await assertInvoiceDraft(supabase, invoiceId);
  if ("error" in guard) return { error: guard.error };

  const lineTotal = roundCents(
    parseFloat(parsed.data.quantity) * parseFloat(parsed.data.unit_price),
  );

  const { data, error } = await supabase
    .from("invoice_line_items")
    .update({
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      line_total: toMoney(lineTotal),
      kind: parsed.data.kind,
    })
    .eq("id", lineItemId)
    .eq("invoice_id", invoiceId)
    .select("id")
    .returns<Pick<LineItemRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  await recomputeInvoiceTotals(supabase, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, id: lineItemId };
}

export async function deleteLineItemAction(
  invoiceId: string,
  lineItemId: string,
): Promise<LineItemActionResult> {
  const supabase = await createClient();
  const guard = await assertInvoiceDraft(supabase, invoiceId);
  if ("error" in guard) return { error: guard.error };

  const { data, error } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("id", lineItemId)
    .eq("invoice_id", invoiceId)
    .select("id")
    .returns<Pick<LineItemRow, "id">[]>();

  if (error) return { error: "delete_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  await recomputeInvoiceTotals(supabase, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: true, id: lineItemId };
}

// ---------------------------------------------------------------------------
// Finalize — THE service-role bridge
// ---------------------------------------------------------------------------

export async function finalizeInvoiceAction(
  id: string,
): Promise<InvoiceActionResult & { invoiceNumber?: string }> {
  const parsed = FinalizeInput.safeParse({ invoiceId: id });
  if (!parsed.success) {
    return {
      error: "validation",
      issues: z.flattenError(
        parsed.error,
      ) as unknown as z.core.$ZodFlattenedError<InvoiceCreateShape>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no_workspace" };

  // (1) Verify workspace ownership via the REGULAR (user-scoped) client.
  // RLS will deny-by-omission if this invoice doesn't belong to the user's
  // workspace, returning 0 rows.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, workspace_id, status")
    .eq("id", id)
    .maybeSingle<Pick<InvoiceRow, "id" | "workspace_id" | "status">>();
  if (!invoice) return { error: "not_found" };
  if (invoice.status !== "draft") return { error: "already_finalized" };

  // Require at least one line item.
  const { count: lineCount } = await supabase
    .from("invoice_line_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", id);
  if (!lineCount || lineCount === 0) {
    return { error: "no_line_items" };
  }

  // SERVICE-ROLE BRIDGE — the ONLY one in Phase 3.
  // allocate_invoice_number() is REVOKE'd from anon+authenticated (Migration 003).
  // We verify workspace ownership via the regular client FIRST, then switch to service_role
  // ONLY to call the SP. No other code path touches createServiceClient() in Phase 3.
  const svc = createServiceClient();
  const year = new Date().getFullYear();
  const { data: numData, error: numErr } = await svc.rpc(
    "allocate_invoice_number",
    { p_workspace: invoice.workspace_id, p_year: year },
  );
  if (numErr || typeof numData !== "string") {
    return { error: "update_failed" };
  }
  const invoiceNumber = numData;

  // (2) Update the row with the allocated number. The extra `.eq('status','draft')`
  // is a defence-in-depth against a concurrent finalize (the row should already
  // be a draft from step (1), but races happen).
  const { data: updated, error: updErr } = await svc
    .from("invoices")
    .update({
      status: "finalized",
      invoice_number: invoiceNumber,
      invoice_year: year,
      finalized_at: new Date().toISOString(),
      finalized_by_user_id: user.id,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (updErr) return { error: "update_failed" };
  if (!updated || updated.length === 0) {
    return { error: "already_finalized" };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, id, invoiceNumber };
}

// ---------------------------------------------------------------------------
// Mark Paid — invoice → paid + receipt row
// ---------------------------------------------------------------------------

export async function markPaidAction(
  id: string,
  formData: FormData,
): Promise<InvoiceActionResult & { receiptId?: string }> {
  const parsed = MarkPaidInput.safeParse({
    paid_at: formData.get("paid_at"),
    payment_method: formData.get("payment_method"),
  });
  if (!parsed.success) {
    return {
      error: "validation",
      issues: z.flattenError(
        parsed.error,
      ) as unknown as z.core.$ZodFlattenedError<InvoiceCreateShape>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no_workspace" };

  // Verify invoice exists, belongs to this workspace (via RLS), is finalized
  // or sent, and grab its total + workspace_id for the receipt.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, workspace_id, status, total")
    .eq("id", id)
    .maybeSingle<
      Pick<InvoiceRow, "id" | "workspace_id" | "status" | "total">
    >();
  if (!invoice) return { error: "not_found" };
  if (invoice.status !== "finalized" && invoice.status !== "sent") {
    return { error: "not_finalized" };
  }

  // Receipt numbering: simple per-year COUNT()+1 sequence formatted as
  // `R-YYYY/NNNN`. Cyprus VAT requires invoice numbering be gap-free;
  // receipts are not subject to the same strictness, so a tiny race window
  // (two concurrent payments → both compute the same `seq` → second insert
  // fails the UNIQUE constraint and gets handled by `receipt_failed`) is
  // acceptable. Promote to `allocate_receipt_number()` SP in a later phase
  // if concurrent receipt creation ever becomes load-bearing.
  const year = new Date().getFullYear();
  const { count: existingReceipts } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("receipt_year", year);
  const seq = (existingReceipts ?? 0) + 1;
  const receiptNumber = `R-${year}/${String(seq).padStart(4, "0")}`;

  // Insert the receipt first — if the UNIQUE constraint fires (race), bail
  // before mutating the invoice. RLS-scoped insert via the user client.
  const { data: receiptData, error: receiptErr } = await supabase
    .from("receipts")
    .insert({
      workspace_id: invoice.workspace_id,
      invoice_id: invoice.id,
      receipt_number: receiptNumber,
      receipt_year: year,
      paid_at: parsed.data.paid_at,
      amount: invoice.total,
      payment_method: parsed.data.payment_method,
    })
    .select("id")
    .returns<Pick<ReceiptRow, "id">[]>();
  if (receiptErr) return { error: "receipt_failed" };
  if (!receiptData || receiptData.length === 0) {
    return { error: "receipt_failed" };
  }
  const receiptId = receiptData[0].id;

  // Mark the invoice paid. Guarded by `.eq('status','finalized'|'sent')` via
  // a chained `.in()` to defend against a concurrent state change.
  const { data: updated, error: updErr } = await supabase
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", id)
    .in("status", ["finalized", "sent"])
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();
  if (updErr) return { error: "update_failed" };
  if (!updated || updated.length === 0) {
    return { error: "not_finalized" };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/receipts");
  redirect(`/receipts/${receiptId}`);
}

// ---------------------------------------------------------------------------
// Delete — drafts only
// ---------------------------------------------------------------------------

export async function deleteInvoiceAction(
  id: string,
): Promise<InvoiceActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("status", "draft") // Only drafts may be deleted (no number consumed).
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (error) return { error: "delete_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/invoices");
  redirect("/invoices");
}

// ---------------------------------------------------------------------------
// AI Draft — natural language prompt → DRAFT invoice (Phase 5 Task 2)
// ---------------------------------------------------------------------------
//
// Schema audit (re-verified 2026-05-13):
//   supabase/migrations/20260513000001_schema.sql:128 already declares
//   `created_by_ai BOOLEAN NOT NULL DEFAULT false` on `public.invoices`,
//   so no migration is added in this task. The column is filterable in the
//   /drafts list query with a plain `.eq('created_by_ai', true)`.
//
// Write-guard contract (mirrors the locked Phase 5 hard rule):
//   1. The AI never proposes vat_rate / vat_amount / total / invoice_number
//      — InvoiceDraftSchema in @/lib/openrouter/client.ts is `.strict()` so
//      any payload containing those keys fails parsing. Defense in depth:
//      this action also asserts on the parsed object before INSERT.
//   2. VAT (0.1900) and totals are recomputed SERVER-SIDE via
//      computeTotalsFromItems — even if .strict() were ever relaxed in a
//      future refactor, the values we INSERT here would still be the
//      server-computed ones.
//   3. invoice_number stays NULL. Numbers are only allocated by
//      finalizeInvoiceAction's service-role bridge — the AI never crosses
//      that seam. The Cyprus gap-free invariant is preserved.
//   4. RLS deny-by-omission: every INSERT uses `.select('id')` + checks
//      `data.length === 0` to surface a workspace boundary cross.
//
// No service-role import in this code path. No trust ledger reference.

const DraftPromptInput = z
  .string()
  .trim()
  .min(3)
  .max(500);

interface ClientForDraft {
  id: string;
  name_el: string;
  name_en: string;
  vat_number: string | null;
  preferred_language: "el" | "en";
}

interface MatterForDraft {
  id: string;
  matter_number: string;
  title: string;
  client_id: string;
}

export type DraftFromAIResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error:
        | "refusal"
        | "no_api_key"
        | "parse_failed"
        | "unknown_client"
        | "unknown_matter"
        | "insert_failed"
        | "no_workspace"
        | "invalid_input";
    };

export async function draftFromAIAction(
  nlText: string,
): Promise<DraftFromAIResult> {
  // 1. Input validation — reject empty / absurdly long prompts before we
  // burn a model call or touch the database.
  const promptParse = DraftPromptInput.safeParse(nlText);
  if (!promptParse.success) {
    return { ok: false, error: "invalid_input" };
  }
  const prompt = promptParse.data;

  // 2. Auth + workspace lookup — mirrors createInvoiceAction.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "no_workspace" };
  }
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!ws) {
    return { ok: false, error: "no_workspace" };
  }

  // 3. Fetch context for the AI. RLS scopes both queries to this workspace.
  // Top 50 most-recent of each — keeps the prompt token budget bounded
  // even on larger workspaces.
  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name_el, name_en, vat_number, preferred_language")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<ClientForDraft[]>();
  const clients: ClientForDraft[] = clientsData ?? [];

  const { data: mattersData } = await supabase
    .from("matters")
    .select("id, matter_number, title, client_id")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<MatterForDraft[]>();
  const matters: MatterForDraft[] = mattersData ?? [];

  // 4. Call the OpenRouter adapter. The adapter handles DEMO_CACHE,
  // refusal, parse_failed, and the .strict() Zod validation already.
  const clientCtx: ClientCtx[] = clients.map((c) => ({
    id: c.id,
    name_el: c.name_el,
    name_en: c.name_en,
    preferred_language: c.preferred_language,
  }));
  const matterCtx: MatterCtx[] = matters.map((m) => ({
    id: m.id,
    client_id: m.client_id,
    matter_number: m.matter_number,
    title: m.title,
  }));

  const aiResult = await callOpenRouter({
    kind: "draft",
    text: prompt,
    contextData: { clients: clientCtx, matters: matterCtx },
  });

  // 5. Error mapping — be conservative on the unknown bucket.
  if (!aiResult.ok) {
    if (aiResult.error === "refusal") {
      return { ok: false, error: "refusal" };
    }
    if (aiResult.error === "no_api_key") {
      return { ok: false, error: "no_api_key" };
    }
    return { ok: false, error: "parse_failed" };
  }

  // 6. Validation pipeline — extracted into a pure function so the
  // adversarial test suite (`tests/ai-injection.mjs`) can exercise the
  // exact same six guards (FORBIDDEN_DRAFT_KEYS outer + per-item,
  // schema reparse, client lookup, matter lookup, cross-client pairing)
  // without standing up the full Server Action HTTP boundary. The
  // validator's `clients`/`matters` parameters intentionally accept the
  // narrow `{ id }` / `{ id, client_id }` shapes via structural typing —
  // we pass the richer `ClientForDraft` / `MatterForDraft` rows here.
  const validation = validateAIDraftCandidate(aiResult.draft, clients, matters);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const draft = validation.draft;

  // Re-resolve the matched client AFTER validation so we can read its
  // `preferred_language` for the INSERT. The validator only checks
  // existence (the narrow `{ id }` shape); we still need the full row.
  const matchedClient = clients.find((c) => c.id === draft.client_id)!;

  // 8. SERVER-SIDE totals. The AI proposes line items as
  // { description, quantity: number, unit_price: number }. We convert
  // each to the NUMERIC-string format the totals helper + DB driver
  // expect, then recompute subtotal / vat_amount / total / per-line
  // totals from scratch — the AI's numbers are never written.
  const stringItems = draft.line_items.map((li) => ({
    quantity: li.quantity.toFixed(2),
    unit_price: li.unit_price.toFixed(2),
  }));
  const { subtotal, vatAmount, total, lineTotals } =
    computeTotalsFromItems(stringItems);

  // 9. Due date — `due_days` is 0-365 per the Zod schema. ISO `YYYY-MM-DD`
  // matches the createInvoiceAction shape so the DB DATE column accepts.
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + draft.due_days);
  const dueAt = dueDate.toISOString().slice(0, 10);

  // 11. INSERT the invoice as a draft. `created_by_ai=true` is the bit
  // the /drafts list query filters on. invoice_number stays NULL —
  // the gap-free invariant is preserved (only finalizeInvoiceAction
  // allocates).
  const issuedAt = new Date().toISOString().slice(0, 10);
  const language = matchedClient.preferred_language ?? "el";

  const { data: inserted, error: invErr } = await supabase
    .from("invoices")
    .insert({
      workspace_id: ws.id,
      client_id: draft.client_id,
      matter_id: draft.matter_id,
      status: "draft",
      created_by_ai: true,
      issued_at: issuedAt,
      due_at: dueAt,
      subtotal: toMoney(subtotal),
      vat_rate: "0.1900",
      vat_amount: toMoney(vatAmount),
      total: toMoney(total),
      currency: "EUR",
      notes: null,
      language,
    })
    .select("id")
    .returns<Pick<InvoiceRow, "id">[]>();

  if (invErr) return { ok: false, error: "insert_failed" };
  if (!inserted || inserted.length === 0) {
    return { ok: false, error: "insert_failed" };
  }
  const invoiceId = inserted[0].id;

  // 12. INSERT line items in one batch — same pattern as
  // createInvoiceAction lines 374-394 above.
  const rows = draft.line_items.map((li, i) => ({
    invoice_id: invoiceId,
    workspace_id: ws.id,
    description: li.description,
    quantity: li.quantity.toFixed(2),
    unit_price: li.unit_price.toFixed(2),
    line_total: toMoney(lineTotals[i]),
    vat_rate: "0.1900",
    position: i + 1,
    kind: "service",
  }));
  const { data: lineData, error: lineErr } = await supabase
    .from("invoice_line_items")
    .insert(rows)
    .select("id")
    .returns<Pick<LineItemRow, "id">[]>();
  if (lineErr) return { ok: false, error: "insert_failed" };
  if (!lineData || lineData.length === 0) {
    return { ok: false, error: "insert_failed" };
  }

  revalidatePath("/drafts");
  revalidatePath("/invoices");
  return { ok: true, id: invoiceId };
}
