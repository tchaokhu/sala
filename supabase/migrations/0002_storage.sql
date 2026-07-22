-- Storage buckets and their policies.
--
-- Wrapped in a guard because the `storage` schema only exists on Supabase; a
-- plain Postgres used for running the schema tests locally does not have it.
-- The guard keeps this file in the migration sequence rather than off in some
-- side directory that nobody applies — see CLAUDE.md on schema living entirely
-- in migrations.
--
-- Files are addressed as {org_id}/{owner_row_id}/{filename}, and the policies
-- compare the first path segment against Membership. See
-- docs/adr/0001-shared-database-with-rls.md.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema absent — skipping bucket setup (local Postgres)';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES
    ('sala-images', 'sala-images', false, 5242880,
     ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    ('sala-docs', 'sala-docs', false, 20971520,
     ARRAY['application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'image/jpeg', 'image/png'])
  ON CONFLICT (id) DO NOTHING;

  -- Neither bucket is public. Property photos are not secret, but they sit in
  -- the same path space as signed contracts and identity scans, and one policy
  -- that can be reasoned about beats two that cannot.

  EXECUTE $pol$
    CREATE POLICY sala_storage_member_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id IN ('sala-images', 'sala-docs')
        AND (SELECT is_member(((storage.foldername(name))[1])::uuid))
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY sala_storage_member_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id IN ('sala-images', 'sala-docs')
        AND (SELECT is_member(((storage.foldername(name))[1])::uuid))
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY sala_storage_member_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id IN ('sala-images', 'sala-docs')
        AND (SELECT is_member(((storage.foldername(name))[1])::uuid))
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY sala_storage_member_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id IN ('sala-images', 'sala-docs')
        AND (SELECT is_member(((storage.foldername(name))[1])::uuid))
      )
  $pol$;
END $$;
