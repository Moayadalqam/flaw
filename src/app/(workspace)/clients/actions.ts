"use server";

/**
 * Server Actions for the Clients CRUD surface.
 *
 * Locked decision #6: RLS deny-by-omission silently returns 0 rows on a
 * read/update/delete that crosses the workspace boundary. Each mutation here
 * `.select('id')` after the write so we can observe `data.length === 0` and
 * return `{ error: 'not_found' }` instead of pretending success.
 *
 * Auth is enforced by `(workspace)/layout.tsx` (calls `auth.getUser()` and
 * redirects to `/login` if unauthenticated). The Supabase server client
 * carries the session cookie, so RLS is the second layer.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow } from "@/lib/types";

const ClientInput = z.object({
  name_el: z.string().trim().min(2),
  name_en: z.string().trim().min(2),
  vat_number: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  tax_id: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null))
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: "invalid_email" },
    ),
  phone: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  address: z
    .string()
    .trim()
    .max(512)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  preferred_language: z.enum(["el", "en"]),
});

type ClientInputShape = z.infer<typeof ClientInput>;

export type ClientActionResult =
  | { ok: true; id?: string }
  | { error: "validation"; issues: z.core.$ZodFlattenedError<ClientInputShape> }
  | { error: "insert_failed" | "update_failed" | "delete_failed" | "not_found" | "no_workspace" };

function parseFormData(formData: FormData): ReturnType<typeof ClientInput.safeParse> {
  const raw = Object.fromEntries(formData) as Record<string, FormDataEntryValue>;
  return ClientInput.safeParse(raw);
}

export async function createClientAction(
  formData: FormData,
): Promise<ClientActionResult> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();

  // Resolve workspace_id from the authenticated user — RLS will refuse the
  // insert if we send the wrong one anyway, but resolving it explicitly
  // makes the error path observable (no_workspace) instead of a silent
  // RLS-deny that looks like insert_failed.
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
    .from("clients")
    .insert({ ...parsed.data, workspace_id: ws.id })
    .select("id")
    .returns<Pick<ClientRow, "id">[]>();

  if (error) {
    return { error: "insert_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "insert_failed" };
  }

  revalidatePath("/clients");
  redirect(`/clients/${data[0].id}`);
}

export async function updateClientAction(
  id: string,
  formData: FormData,
): Promise<ClientActionResult> {
  const parsed = parseFormData(formData);
  if (!parsed.success) {
    return { error: "validation", issues: z.flattenError(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .returns<Pick<ClientRow, "id">[]>();

  if (error) {
    return { error: "update_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true, id };
}

export async function deleteClientAction(
  id: string,
): Promise<ClientActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id)
    .select("id")
    .returns<Pick<ClientRow, "id">[]>();

  if (error) {
    return { error: "delete_failed" };
  }
  if (!data || data.length === 0) {
    return { error: "not_found" };
  }

  revalidatePath("/clients");
  redirect("/clients");
}
