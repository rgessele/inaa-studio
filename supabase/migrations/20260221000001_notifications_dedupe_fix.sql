-- Fix possible duplicate user deliveries inflating notification feed/counts.

-- 1) Deduplicate existing rows by (notification_id, user_id), keeping newest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY notification_id, user_id
      ORDER BY delivered_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.user_notifications
)
DELETE FROM public.user_notifications un
USING ranked r
WHERE un.id = r.id
  AND r.rn > 1;

-- 2) Ensure uniqueness constraint exists even on pre-existing tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_notifications_unique'
  ) THEN
    ALTER TABLE public.user_notifications
      ADD CONSTRAINT user_notifications_unique UNIQUE (notification_id, user_id);
  END IF;
END $$;

-- 3) Mark-as-read should mark all duplicates of the same notification (defensive).
CREATE OR REPLACE FUNCTION public.mark_user_notification_read(p_user_notification_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  SELECT notification_id
    INTO v_notification_id
  FROM public.user_notifications
  WHERE id = p_user_notification_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF v_notification_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE user_id = auth.uid()
    AND notification_id = v_notification_id;

  RETURN FOUND;
END;
$$;

-- 4) Unread count should be per unique notification for the user.
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
    WHERE un.user_id = auth.uid()
      AND un.read_at IS NULL
    GROUP BY un.notification_id
  ) t;
$$;
