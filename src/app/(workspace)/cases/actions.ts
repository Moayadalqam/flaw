"use server";

/**
 * Server Actions for the Cases (matters) CRUD surface.
 *
 * Mirrors `clients/actions.ts`. Locked decision #6: RLS deny-by-omission
 * returns 0 rows — every mutation checks `data.length === 0` and returns
 * `{ error: 'not_found' }` instead of pretending success.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { MatterRow } from "@/lib/types";

// Permissive UUID-shape regex (any version). The seed uses deterministic
// non-v4 placeholder UUIDs like `00000000-0000-0000-0000-000000000c01` so
// strict `z.uuid()` would reject them; we still constrain the shape so the
// FK target is unambiguous.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MatterInput = z.object({
  client_id: z.string().regex(UUID_RE),
  matter_number: z.string().trim().min(1).max(64),
  title: z.string().trim().min(2).max(255),
  matter_type: z.string().trim().min(1).max(64),
  status: z.enum(["open", "on_hold", "closed"]),
  default_hourly_rate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^\d+(\.\d{1,2})?$/.test(v),
      { message: "invalid_rate" },
    ),
});

type MatterInputShape = z.infer<typeof MatterInput>;

export type MatterActionResult =
  | { ok: true; id?: string }
  | { error: "validation"; issues: z.core.$ZodFlattenedError<MatterInputShape> }
  | { error: "insert_failed" | "update_failed" | "delete_failed" | "not_found" | "no_workspace" };

function parseFormData(
  formData: FormData,
): ReturnType<typeof MatterInput.safeParse> {
  const raw = Object.fromEntries(formData) as Record<string, FormDataEntryValue>;
  return MatterInput.safeParse(raw);
}

export async function createMatterAction(
  formData: FormData,
): Promise<MatterActionResult> {
  const parsed = parseFormData(formData);
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

  const { data, error } = await supabase
    .from("matters")
    .insert({ ...parsed.data, workspace_id: ws.id })
    .select("id")
    .returns<Pick<MatterRow, "id">[]>();

  if (error) {
    return { error: "insert_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "insert_failed" };
  }

  revalidatePath("/cases");
  redirect(`/cases/${data[0].id}`);
}

export async function updateMatterAction(
  id: string,
  formData: FormData,
): Promise<MatterActionResult> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matters")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .returns<Pick<MatterRow, "id">[]>();

  if (error) {
    return { error: "update_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/cases");
  revalidatePath(`/cases/${id}`);
  return { ok: true, id };
}

export async function deleteMatterAction(
  id: string,
): Promise<MatterActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matters")
    .delete()
    .eq("id", id)
    .select("id")
    .returns<Pick<MatterRow, "id">[]>();

  if (error) {
    return { error: "delete_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/cases");
  redirect("/cases");
}
