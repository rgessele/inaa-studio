INSERT INTO public.app_settings (key, value, is_public)
VALUES ('members_area_url', 'https://hotmart.com/pt-br/club/comunidadeinaa', TRUE)
ON CONFLICT (key) DO NOTHING;
