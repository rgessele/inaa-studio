-- Create a public bucket for project cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-covers', 'project-covers', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for project-covers bucket
-- Note: storage.objects already has RLS enabled in Supabase.

-- Allow anyone to read cover images (public bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read project covers'
  ) THEN
    CREATE POLICY "Public read project covers"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'project-covers');
  END IF;
END $$;

-- Allow authenticated users to upload only into a folder named by their uid: <uid>/...
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload own project covers'
  ) THEN
    CREATE POLICY "Users can upload own project covers"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'project-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

-- Allow authenticated users to update only their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can update own project covers'
  ) THEN
    CREATE POLICY "Users can update own project covers"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'project-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'project-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

-- Allow authenticated users to delete only their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete own project covers'
  ) THEN
    CREATE POLICY "Users can delete own project covers"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'project-covers'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
