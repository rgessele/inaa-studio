-- Fix database linter: function_search_path_mutable
--
-- Setting an explicit search_path prevents unexpected name resolution when functions
-- are executed (especially SECURITY DEFINER functions).

-- Trigger helpers
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'
			AND p.proname = 'update_updated_at_column'
			AND pg_get_function_identity_arguments(p.oid) = ''
	) THEN
		EXECUTE 'ALTER FUNCTION public.update_updated_at_column() SET search_path = public';
	END IF;
END $$;

-- Simple helper
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'
			AND p.proname = 'is_reserved_admin_email'
			AND pg_get_function_identity_arguments(p.oid) = 'candidate_email text'
	) THEN
		EXECUTE 'ALTER FUNCTION public.is_reserved_admin_email(TEXT) SET search_path = public';
	END IF;
END $$;

-- Trigger run on auth.users insert (SECURITY DEFINER)
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'
			AND p.proname = 'handle_new_user'
			AND pg_get_function_identity_arguments(p.oid) = ''
	) THEN
		EXECUTE 'ALTER FUNCTION public.handle_new_user() SET search_path = public, auth';
	END IF;
END $$;
