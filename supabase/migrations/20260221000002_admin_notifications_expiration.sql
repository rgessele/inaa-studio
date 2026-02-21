-- Add optional expiration for admin notifications and enforce visibility rules.

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS admin_notifications_expires_at_idx
  ON public.admin_notifications (expires_at);

DROP POLICY IF EXISTS "Users can view sent admin notifications" ON public.admin_notifications;
CREATE POLICY "Users can view sent admin notifications"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    status = 'sent'
    AND (expires_at IS NULL OR expires_at > NOW())
  );

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
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT n.status, n.expires_at
    INTO v_status, v_expires_at
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

  IF v_expires_at IS NOT NULL AND v_expires_at <= v_now THEN
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
DECLARE
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Data/hora de agendamento deve estar no futuro';
  END IF;

  SELECT n.expires_at
    INTO v_expires_at
  FROM public.admin_notifications n
  WHERE n.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notificação não encontrada';
  END IF;

  IF v_expires_at IS NOT NULL AND p_scheduled_at >= v_expires_at THEN
    RAISE EXCEPTION 'Agendamento deve ser anterior à expiração';
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
      AND (n.expires_at IS NULL OR n.expires_at > v_now)
    ORDER BY n.scheduled_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  LOOP
    IF public._publish_admin_notification_internal(v_row.id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
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
  UPDATE public.user_notifications un
  SET read_at = NOW()
  FROM public.admin_notifications n
  WHERE un.user_id = auth.uid()
    AND un.read_at IS NULL
    AND n.id = un.notification_id
    AND n.status = 'sent'
    AND (n.expires_at IS NULL OR n.expires_at > NOW());

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
  FROM (
    SELECT un.notification_id
    FROM public.user_notifications un
    JOIN public.admin_notifications n ON n.id = un.notification_id
    WHERE un.user_id = auth.uid()
      AND un.read_at IS NULL
      AND n.status = 'sent'
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
    GROUP BY un.notification_id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_admin_notification(UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_admin_notifications(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_user_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_unread_notifications_count() TO authenticated;
