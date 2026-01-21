-- Add avatar_url to profiles + create avatars storage bucket

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

-- Create a public bucket for profile avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for avatars bucket

-- Allow anyone to read avatars (public bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read avatars'
  ) THEN
    CREATE POLICY "Public read avatars"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'avatars');
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
      AND policyname = 'Users can upload own avatars'
  ) THEN
    CREATE POLICY "Users can upload own avatars"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
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
      AND policyname = 'Users can update own avatars'
  ) THEN
    CREATE POLICY "Users can update own avatars"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'avatars'
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
      AND policyname = 'Users can delete own avatars'
  ) THEN
    CREATE POLICY "Users can delete own avatars"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
