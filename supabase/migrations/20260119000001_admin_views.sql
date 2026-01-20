-- Admin helper views for user/project stats

CREATE OR REPLACE VIEW public.user_project_counts AS
SELECT
  user_id,
  COUNT(*)::INT AS projects_count
FROM public.projects
GROUP BY user_id;

CREATE OR REPLACE VIEW public.admin_user_overview AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.created_at,
  p.updated_at,
  p.role,
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
