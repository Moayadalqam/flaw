import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service-role key.
 *
 * Use ONLY for operations that legitimately bypass RLS:
 *   - allocate_invoice_number() (gap-free numbering SP)
 *   - audit_log inserts via SECURITY DEFINER triggers
 *   - admin maintenance scripts run from server-side code
 *
 * NEVER import this from a client component, route handler that returns
 * unvalidated data to the user, or any code that runs in the browser.
 *
 * The `trust_ledger` table is protected by a row-level trigger backstop that
 * blocks UPDATE/DELETE even via service_role — corrections happen via
 * reversing entries with `corrects_entry_id`.
 */
export function createServiceClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createServiceClient() called from the browser. Service-role key must never leave the server.',
    )
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
