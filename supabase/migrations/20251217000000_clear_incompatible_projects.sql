-- Clear incompatible legacy projects
--
-- We are doing a breaking data-model migration in the editor (no backward compatibility),
-- so all existing rows in public.projects become unusable.
--
-- This migration intentionally deletes ALL projects.
-- If you want to keep any legacy data, export it before applying this migration.

BEGIN;

-- Remove all projects (design_data is incompatible with the new editor model)
TRUNCATE TABLE IF EXISTS public.projects;

-- Optional cleanup: remove any stored cover images (otherwise they become orphaned)
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.tables
		WHERE table_schema = 'storage'
			AND table_name = 'objects'
	) THEN
		DELETE FROM storage.objects
		WHERE bucket_id = 'project-covers';
	END IF;
END $$;

COMMIT;

