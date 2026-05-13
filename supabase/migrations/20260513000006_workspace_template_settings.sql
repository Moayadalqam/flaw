-- =============================================================================
-- Lex — Migration 006: workspace template_settings + workspace-logos bucket
-- =============================================================================
-- Adds the per-workspace customisation surface required by REQ-014 (editable
-- PDF templates with logo + footer customization) and unblocks the settings
-- UI at /(workspace)/settings/templates.
--
-- Three changes:
--
--   1. `public.workspaces.template_settings JSONB NOT NULL DEFAULT '{}'::jsonb`
--      — free-form bag for `logo_data_url`, `accent_hex`, `footer_text`.
--      JSONB (not JSON) so PostgREST can index / filter sub-keys without
--      reparsing the column on every request. Default `{}` keeps existing rows
--      valid (Migration 001 seeded one workspace row).
--
--      Why JSONB rather than typed columns: the customisation set is expected
--      to grow during Phase 4+ (additional accent presets, alternate templates,
--      header layouts). A JSONB bag absorbs schema churn without a migration
--      per knob. The PDF route already reads it defensively (`?? null` chains
--      on each nested key — see src/app/api/pdf/[invoiceId]/route.ts:217-226).
--
--   2. Storage bucket `workspace-logos` (private, not public). Logo uploads go
--      to `<workspace_id>/logo.png`. The PDF route reads the file via a
--      30-day signed URL stored in `template_settings.logo_data_url`.
--
--      Private bucket + signed URL was chosen over a public bucket because:
--        * Logos may contain firm branding the workspace hasn't published.
--        * Public buckets put every uploaded file behind a guessable URL
--          (bucket/object-name); private + signed URL gates access on a token.
--        * Signed URL TTL of 30 days is well over the demo's lifespan; for
--          Phase 4 we'll switch to server-side base64 inlining so the URL
--          never expires mid-render.
--
--   3. RLS policies on `storage.objects` scoped to the bucket. Authenticated
--      users may INSERT / SELECT / UPDATE / DELETE only objects under their
--      OWN workspace path. The path convention is `<workspace_id>/logo.png`,
--      and `(storage.foldername(name))[1]::uuid` extracts the first path
--      segment as the workspace UUID. `public.current_workspace_id()` (from
--      Migration 002) returns the workspace owned by the calling user, so the
--      USING / WITH CHECK predicate is:
--
--          (storage.foldername(name))[1]::uuid = public.current_workspace_id()
--
--      `storage.foldername()` is a Supabase-supplied function that splits the
--      object name on `/` and returns the path segments as a `text[]`. It is
--      present in every Supabase release since 2022 and is verified to exist
--      in this local stack (see the task validation step).
--
--      Separate policies per command (SELECT / INSERT / UPDATE / DELETE) —
--      matches the Migration 002 pattern (NEVER FOR ALL — it collapses the
--      four privilege paths and makes future removal of any one harder).
--
-- References:
--   * .planning/phase-3-plan.md §Task 6
--   * src/app/api/pdf/[invoiceId]/route.ts:74-81 (defensive read shape)
--   * supabase/migrations/20260513000002_rls.sql (current_workspace_id helper)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Column — workspaces.template_settings
-- -----------------------------------------------------------------------------

ALTER TABLE public.workspaces
  ADD COLUMN template_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Storage bucket — workspace-logos (private)
-- -----------------------------------------------------------------------------
-- `ON CONFLICT DO NOTHING` keeps the migration idempotent across local resets
-- and re-application against a cloud project that already provisioned the
-- bucket via the dashboard.

INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-logos', 'workspace-logos', false)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. RLS policies on storage.objects — workspace-scoped to bucket
-- -----------------------------------------------------------------------------
-- storage.objects already has RLS enabled by the Supabase storage extension —
-- we just add policies that gate access to objects in the `workspace-logos`
-- bucket by the first path segment matching the caller's workspace.
--
-- Path convention: `<workspace_id>/logo.png`. `storage.foldername(name)` is a
-- Supabase helper returning the path segments as `text[]`; `[1]` is the first
-- segment (1-indexed in PostgreSQL).

CREATE POLICY "workspace_logos_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1]::uuid = (SELECT public.current_workspace_id())
  );

CREATE POLICY "workspace_logos_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1]::uuid = (SELECT public.current_workspace_id())
  );

CREATE POLICY "workspace_logos_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1]::uuid = (SELECT public.current_workspace_id())
  )
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1]::uuid = (SELECT public.current_workspace_id())
  );

CREATE POLICY "workspace_logos_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND (storage.foldername(name))[1]::uuid = (SELECT public.current_workspace_id())
  );
