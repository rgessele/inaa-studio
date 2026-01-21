-- Add profiles.status (active/inactive) and enforce it across helpers/policies

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

-- Prevent users from modifying access-control fields, including status.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
    AND COALESCE(blocked, FALSE) = COALESCE((SELECT p.blocked FROM public.profiles p WHERE p.id = auth.uid()), FALSE)
    AND access_expires_at IS NOT DISTINCT FROM (
      SELECT p.access_expires_at FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Ensure admin checks also require active status.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.status, 'active') = 'active'
      AND COALESCE(p.blocked, FALSE) = FALSE
      AND (p.access_expires_at IS NULL OR p.access_expires_at > NOW())
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Include status in admin overview view.
DROP VIEW IF EXISTS public.admin_user_overview;

CREATE VIEW public.admin_user_overview AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.created_at,
  p.updated_at,
  p.role,
  p.status,
  p.blocked,
  p.blocked_at,
  p.blocked_reason,
  p.access_expires_at,
  COALESCE(c.projects_count, 0) AS projects_count,
  pr.last_seen_at,
  pr.route
FROM public.profiles p
LEFT JOIN public.user_project_counts c ON c.user_id = p.id
LEFT JOIN public.user_presence pr ON pr.user_id = p.id;
