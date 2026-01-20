-- Admin Console schema (roles, access control, presence, audit, imports)

-- 1) Extend profiles with role/access control
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'assinante',
ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'assinante'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique
ON public.profiles (lower(email))
WHERE email IS NOT NULL;

-- 2) Reserved admin emails + helpers
CREATE OR REPLACE FUNCTION public.is_reserved_admin_email(candidate_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT lower(candidate_email) IN (
    'admin@inaastudio.com.br',
    'admin@comunidadeinaa.com.br'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.blocked, FALSE) = FALSE
      AND (p.access_expires_at IS NULL OR p.access_expires_at > NOW())
  );
$$;

-- Promote current user to admin if their auth email matches a reserved email.
-- Idempotent. Useful for bootstrapping without pre-creating users.
CREATE OR REPLACE FUNCTION public.ensure_bootstrap_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_reserved_admin_email(v_email) THEN
    UPDATE public.profiles
    SET role = 'admin'
    WHERE id = auth.uid();

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 3) Tighten profile update policy: users can update only safe fields
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND COALESCE(blocked, FALSE) = COALESCE((SELECT p.blocked FROM public.profiles p WHERE p.id = auth.uid()), FALSE)
    AND access_expires_at IS NOT DISTINCT FROM (
      SELECT p.access_expires_at FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Admin policies (view/update any profile)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4) Admin policies for projects (view/update any project)
CREATE POLICY "Admins can view all projects"
  ON public.projects
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all projects"
  ON public.projects
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5) Presence table (online now)
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  route TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS user_presence_last_seen_at_idx
ON public.user_presence (last_seen_at DESC);

DROP POLICY IF EXISTS "Users can view their own presence" ON public.user_presence;
CREATE POLICY "Users can view their own presence"
  ON public.user_presence
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert their own presence (insert)" ON public.user_presence;
CREATE POLICY "Users can upsert their own presence (insert)"
  ON public.user_presence
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert their own presence (update)" ON public.user_presence;
CREATE POLICY "Users can upsert their own presence (update)"
  ON public.user_presence
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all presence"
  ON public.user_presence
  FOR SELECT
  USING (public.is_admin());

-- updated_at trigger reuse
DROP TRIGGER IF EXISTS update_user_presence_updated_at ON public.user_presence;
CREATE TRIGGER update_user_presence_updated_at
  BEFORE UPDATE ON public.user_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (public.is_admin());

-- 7) Import jobs history
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.import_job_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  email TEXT NULL,
  status TEXT NOT NULL,
  message TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_job_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view import jobs"
  ON public.import_jobs
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert import jobs"
  ON public.import_jobs
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can view import job rows"
  ON public.import_job_rows
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert import job rows"
  ON public.import_job_rows
  FOR INSERT
  WITH CHECK (public.is_admin());

-- 8) Update signup profile creation: set admin role for reserved emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := CASE
    WHEN public.is_reserved_admin_email(NEW.email) THEN 'admin'
    ELSE 'assinante'
  END;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      v_role
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
