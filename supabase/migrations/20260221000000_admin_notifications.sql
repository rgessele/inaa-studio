-- Admin notifications (in-app) with optional image attachments

-- 1) Main notifications table (managed by admins)
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  action_url TEXT NULL,
  image_url TEXT NULL,
  image_mime_type TEXT NULL,
  image_size_bytes INT NULL,
  image_width INT NULL,
  image_height INT NULL,
  image_alt TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMP WITH TIME ZONE NULL,
  sent_at TIMESTAMP WITH TIME ZONE NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_notifications_type_check CHECK (type IN ('info', 'warning', 'urgent')),
  CONSTRAINT admin_notifications_status_check CHECK (status IN ('draft', 'scheduled', 'sent', 'canceled'))
);

CREATE INDEX IF NOT EXISTS admin_notifications_status_scheduled_at_idx
  ON public.admin_notifications (status, scheduled_at);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);

DROP TRIGGER IF EXISTS update_admin_notifications_updated_at ON public.admin_notifications;
CREATE TRIGGER update_admin_notifications_updated_at
  BEFORE UPDATE ON public.admin_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins can view admin notifications"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins can insert admin notifications"
  ON public.admin_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins can update admin notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can read content for sent notifications only.
DROP POLICY IF EXISTS "Users can view sent admin notifications" ON public.admin_notifications;
CREATE POLICY "Users can view sent admin notifications"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (status = 'sent');

-- 2) Per-user delivery/read table
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT user_notifications_unique UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON public.user_notifications (user_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS user_notifications_user_delivered_idx
  ON public.user_notifications (user_id, delivered_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view user notifications" ON public.user_notifications;
CREATE POLICY "Admins can view user notifications"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert user notifications" ON public.user_notifications;
CREATE POLICY "Admins can insert user notifications"
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update user notifications" ON public.user_notifications;
CREATE POLICY "Admins can update user notifications"
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can view own user notifications" ON public.user_notifications;
CREATE POLICY "Users can view own user notifications"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own user notifications" ON public.user_notifications;
CREATE POLICY "Users can update own user notifications"
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Internal publish helper (idempotent)
CREATE OR REPLACE FUNCTION public._publish_admin_notification_internal(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_status TEXT;
BEGIN
  SELECT n.status
    INTO v_status
  FROM public.admin_notifications n
  WHERE n.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notificação não encontrada';
  END IF;

  IF v_status = 'canceled' THEN
    RETURN FALSE;
  END IF;

  IF v_status = 'sent' THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.user_notifications (
    notification_id,
    user_id,
    delivered_at
  )
  SELECT
    p_notification_id,
    p.id,
    v_now
  FROM public.profiles p
  WHERE COALESCE(p.status, 'active') = 'active'
    AND COALESCE(p.blocked, FALSE) = FALSE
    AND (p.access_expires_at IS NULL OR p.access_expires_at > v_now)
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  UPDATE public.admin_notifications
  SET
    status = 'sent',
    sent_at = COALESCE(sent_at, v_now),
    updated_at = v_now
  WHERE id = p_notification_id;

  RETURN TRUE;
END;
$$;

-- 4) Admin-triggered publish now
CREATE OR REPLACE FUNCTION public.publish_admin_notification(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;
  RETURN public._publish_admin_notification_internal(p_notification_id);
END;
$$;

-- 5) Schedule notification
CREATE OR REPLACE FUNCTION public.schedule_admin_notification(
  p_notification_id UUID,
  p_scheduled_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Data/hora de agendamento deve estar no futuro';
  END IF;

  UPDATE public.admin_notifications
  SET
    status = 'scheduled',
    scheduled_at = p_scheduled_at,
    sent_at = NULL,
    updated_at = NOW()
  WHERE id = p_notification_id
    AND status IN ('draft', 'scheduled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível agendar esta notificação';
  END IF;

  RETURN TRUE;
END;
$$;

-- 6) Cancel scheduled/draft notification
CREATE OR REPLACE FUNCTION public.cancel_admin_notification(p_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  UPDATE public.admin_notifications
  SET
    status = 'canceled',
    updated_at = NOW()
  WHERE id = p_notification_id
    AND status IN ('draft', 'scheduled');

  RETURN FOUND;
END;
$$;

-- 7) Dispatch due notifications (for cron/server task)
CREATE OR REPLACE FUNCTION public.dispatch_due_admin_notifications(p_limit INT DEFAULT 100)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_row RECORD;
  v_count INT := 0;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  IF NOT public.is_admin() AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  FOR v_row IN
    SELECT n.id
    FROM public.admin_notifications n
    WHERE n.status = 'scheduled'
      AND n.scheduled_at IS NOT NULL
      AND n.scheduled_at <= v_now
    ORDER BY n.scheduled_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  LOOP
    PERFORM public._publish_admin_notification_internal(v_row.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 8) User helpers for read state
CREATE OR REPLACE FUNCTION public.mark_user_notification_read(p_user_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
BEGIN
  UPDATE public.user_notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE id = p_user_notification_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_user_notifications_read()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.user_notifications
  SET read_at = NOW()
  WHERE user_id = auth.uid()
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_unread_notifications_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
  SELECT COUNT(*)::INT
  FROM public.user_notifications un
  WHERE un.user_id = auth.uid()
    AND un.read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public._publish_admin_notification_internal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_admin_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_admin_notification(UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_admin_notification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_admin_notifications(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_user_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_user_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_unread_notifications_count() TO authenticated;

-- 9) Bucket for optional notification images
INSERT INTO storage.buckets (id, name, public)
VALUES ('admin-notifications', 'admin-notifications', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read admin notifications images'
  ) THEN
    CREATE POLICY "Public read admin notifications images"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'admin-notifications');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins upload admin notifications images'
  ) THEN
    CREATE POLICY "Admins upload admin notifications images"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'admin-notifications'
        AND public.is_admin()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins update admin notifications images'
  ) THEN
    CREATE POLICY "Admins update admin notifications images"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'admin-notifications'
        AND public.is_admin()
      )
      WITH CHECK (
        bucket_id = 'admin-notifications'
        AND public.is_admin()
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Admins delete admin notifications images'
  ) THEN
    CREATE POLICY "Admins delete admin notifications images"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'admin-notifications'
        AND public.is_admin()
      );
  END IF;
END $$;
