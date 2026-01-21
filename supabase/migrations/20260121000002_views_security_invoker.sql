-- Enforce safer view execution context + tighten grants
--
-- Some environments can end up with views executing with definer/owner semantics,
-- which may bypass RLS depending on ownership. Force security_invoker where supported
-- and keep grants minimal (no anon access; authenticated select-only).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'admin_user_overview'
      AND c.relkind IN ('v', 'm')
  ) THEN
    EXECUTE 'ALTER VIEW public.admin_user_overview SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON public.admin_user_overview FROM anon';
    EXECUTE 'REVOKE ALL ON public.admin_user_overview FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.admin_user_overview TO authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'user_project_counts'
      AND c.relkind IN ('v', 'm')
  ) THEN
    EXECUTE 'ALTER VIEW public.user_project_counts SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON public.user_project_counts FROM anon';
    EXECUTE 'REVOKE ALL ON public.user_project_counts FROM authenticated';
    EXECUTE 'GRANT SELECT ON public.user_project_counts TO authenticated';
  END IF;
END $$;
