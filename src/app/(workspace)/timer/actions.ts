"use server";

/**
 * Server Actions for the billable-hours timer (REQ-009 / TIME-01).
 *
 * Locked decisions converging here:
 *   #3   DB-row timer state. The active timer lives as a `time_entries` row
 *        with `status='active'` and `ended_at=NULL`. A partial UNIQUE index
 *        `idx_time_entries_one_active_per_user (workspace_id, user_id)
 *        WHERE status='active'` (Migration 001 lines 360–362) makes
 *        at-most-one active timer per (workspace, user) a database
 *        invariant. The action layer surfaces the resulting `23505`
 *        violation as a graceful `timer_already_active` error instead of
 *        a 500. This is what makes the timer survive page refresh —
 *        localStorage would lose state on tab switch.
 *
 *   #6   RLS deny-by-omission. Every mutation here ends with
 *        `.select('id')` + `data.length === 0` check, so a workspace
 *        boundary cross returns `not_found` instead of leaking that a
 *        row exists in another tenant.
 *
 * Duration math (no migration needed):
 *   `stopTimerAction` computes `duration_seconds` in application code:
 *     Math.floor((Date.now() - new Date(started_at).getTime()) / 1000)
 *   Doing the math in SQL with EXTRACT(EPOCH FROM (NOW() - started_at))
 *   would require a SECURITY DEFINER RPC (Supabase REST can't express the
 *   subtraction inline). For a lawyer-edited billable timer the ±1s drift
 *   is irrelevant — the lawyer reviews and edits durations before billing.
 *   Phase 4 decision: app-code path, no extra migration.
 *
 * Cross-cutting hook:
 *   `billHoursAction` redirects to `/invoices/new?from_time_entry={id}`.
 *   The corresponding post-save status flip (time entry → status='billed')
 *   lives inside `createInvoiceAction` (invoices/actions.ts) — documented
 *   there in the action header.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { MatterRow, TimeEntryRow } from "@/lib/types";

// Permissive UUID-shape regex — same flavour as invoices/actions.ts. The
// seed uses deterministic non-v4 placeholder UUIDs that strict `z.uuid()`
// would reject.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const StartTimerInput = z.object({
  matter_id: z.string().regex(UUID_RE, { message: "invalid_matter_id" }),
  description: z
    .string()
    .trim()
    .max(512)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  hourly_rate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || DECIMAL_RE.test(v),
      { message: "invalid_hourly_rate" },
    ),
});

const IdInput = z.object({
  id: z.string().regex(UUID_RE, { message: "invalid_id" }),
});

type StartTimerShape = z.infer<typeof StartTimerInput>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TimerActionResult =
  | { ok: true; id?: string }
  | {
      error: "validation";
      issues: z.core.$ZodFlattenedError<StartTimerShape>;
    }
  | {
      error:
        | "insert_failed"
        | "update_failed"
        | "delete_failed"
        | "not_found"
        | "no_workspace"
        | "timer_already_active"
        | "missing_hourly_rate"
        | "not_completed"
        | "already_billed"
        | "invalid_id";
    };

// ---------------------------------------------------------------------------
// Start timer
// ---------------------------------------------------------------------------

export async function startTimerAction(
  formData: FormData,
): Promise<TimerActionResult> {
  const parsed = StartTimerInput.safeParse({
    matter_id: formData.get("matter_id"),
    description: formData.get("description"),
    hourly_rate: formData.get("hourly_rate"),
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
    .maybeSingle();
  if (!ws) return { error: "no_workspace" };

  // Resolve the hourly rate: explicit value wins; otherwise fall back to the
  // matter's `default_hourly_rate`. If both are absent we surface a typed
  // error rather than inserting a NULL (the DB column is NOT NULL).
  let hourlyRate = parsed.data.hourly_rate;
  if (!hourlyRate) {
    const { data: matter } = await supabase
      .from("matters")
      .select("default_hourly_rate")
      .eq("id", parsed.data.matter_id)
      .maybeSingle<Pick<MatterRow, "default_hourly_rate">>();
    if (matter?.default_hourly_rate) {
      hourlyRate = matter.default_hourly_rate;
    }
  }
  if (!hourlyRate) return { error: "missing_hourly_rate" };

  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      workspace_id: ws.id,
      matter_id: parsed.data.matter_id,
      user_id: user.id,
      description: parsed.data.description,
      started_at: new Date().toISOString(),
      hourly_rate: hourlyRate,
      status: "active",
    })
    .select("id")
    .returns<Pick<TimeEntryRow, "id">[]>();

  if (error) {
    // Partial unique index violation — at most one active per (workspace,
    // user). Surfaced as a typed error, not a 500.
    if ((error as { code?: string }).code === "23505") {
      return { error: "timer_already_active" };
    }
    return { error: "insert_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "insert_failed" };
  }

  revalidatePath("/timer");
  revalidatePath("/"); // ActiveTimerWidget in TopBar refreshes on every page.
  return { ok: true, id: data[0].id };
}

// ---------------------------------------------------------------------------
// Stop timer
// ---------------------------------------------------------------------------

export async function stopTimerAction(
  id: string,
): Promise<TimerActionResult> {
  const parsed = IdInput.safeParse({ id });
  if (!parsed.success) {
    return { error: "invalid_id" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "no_workspace" };

  // Fetch the active timer first so we can compute duration in app code
  // (avoids a new SECURITY DEFINER migration; Supabase REST can't express
  // EXTRACT(EPOCH FROM (NOW() - started_at)) inline). ±1s drift is fine
  // for a lawyer-reviewed billable timer.
  const { data: active } = await supabase
    .from("time_entries")
    .select("id, started_at, status, user_id")
    .eq("id", parsed.data.id)
    .maybeSingle<
      Pick<TimeEntryRow, "id" | "started_at" | "status" | "user_id">
    >();
  if (!active) return { error: "not_found" };
  if (active.status !== "active") return { error: "not_found" };

  const durationSeconds = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(active.started_at).getTime()) / 1000,
    ),
  );
  const endedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("time_entries")
    .update({
      status: "completed",
      ended_at: endedAt,
      duration_seconds: durationSeconds,
    })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .select("id")
    .returns<Pick<TimeEntryRow, "id">[]>();

  if (error) return { error: "update_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/timer");
  revalidatePath("/");
  return { ok: true, id: parsed.data.id };
}

// ---------------------------------------------------------------------------
// Delete timer entry (completed, not-yet-billed only)
// ---------------------------------------------------------------------------

export async function deleteTimerAction(
  id: string,
): Promise<TimerActionResult> {
  const parsed = IdInput.safeParse({ id });
  if (!parsed.success) {
    return { error: "invalid_id" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .delete()
    .eq("id", parsed.data.id)
    .eq("status", "completed")
    .is("invoice_id", null)
    .select("id")
    .returns<Pick<TimeEntryRow, "id">[]>();

  if (error) return { error: "delete_failed" };
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/timer");
  revalidatePath("/");
  return { ok: true, id: parsed.data.id };
}

// ---------------------------------------------------------------------------
// Form-action thin wrappers
// ---------------------------------------------------------------------------
// `<form action={…}>` in React 19 / Next 16 requires the action to be
// `(formData: FormData) => void | Promise<void>`. Our typed `stopTimerAction`
// returns a `TimerActionResult` for callers that care about the outcome
// (transitions, error UI). The wrapper below discards that result so it
// fits the form-action signature. Errors are swallowed silently for the
// timer surfaces — the next render cycle re-fetches the active timer
// from the DB, so any inconsistency is self-healing.
// ---------------------------------------------------------------------------

export async function stopTimerFormAction(
  id: string,
  _formData: FormData,
): Promise<void> {
  await stopTimerAction(id);
}

// ---------------------------------------------------------------------------
// Bill these hours → redirect to /invoices/new with prefill
// ---------------------------------------------------------------------------
// `<form action>`-compatible signature: `(id, FormData) => Promise<void>`.
// The page calls this via `billHoursAction.bind(null, row.id)`. `redirect()`
// throws a Next.js navigation signal — its return type is `never`, which
// satisfies the form-action `void | Promise<void>` contract.

export async function billHoursAction(
  id: string,
  _formData: FormData,
): Promise<void> {
  const parsed = IdInput.safeParse({ id });
  if (!parsed.success) {
    redirect("/timer");
  }

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("time_entries")
    .select("id, status, invoice_id")
    .eq("id", parsed.data.id)
    .maybeSingle<Pick<TimeEntryRow, "id" | "status" | "invoice_id">>();

  if (!entry) redirect("/timer");
  if (entry.status !== "completed" || entry.invoice_id !== null) {
    redirect("/timer");
  }

  redirect(`/invoices/new?from_time_entry=${parsed.data.id}`);
}
