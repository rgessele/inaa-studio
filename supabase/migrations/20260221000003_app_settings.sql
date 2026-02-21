-- App settings managed by admin (with optional public visibility per key).

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view app settings" ON public.app_settings;
CREATE POLICY "Admins can view app settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert app settings" ON public.app_settings;
CREATE POLICY "Admins can insert app settings"
  ON public.app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update app settings" ON public.app_settings;
CREATE POLICY "Admins can update app settings"
  ON public.app_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete app settings" ON public.app_settings;
CREATE POLICY "Admins can delete app settings"
  ON public.app_settings
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view public app settings" ON public.app_settings;
CREATE POLICY "Users can view public app settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (is_public = TRUE);

INSERT INTO public.app_settings (key, value, is_public)
VALUES ('support_whatsapp_url', 'https://wa.me/5541999489679', TRUE)
ON CONFLICT (key) DO NOTHING;
