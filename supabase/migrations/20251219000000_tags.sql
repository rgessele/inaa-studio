-- Add tags + project_tags (many-to-many) for dashboard organization

-- Tags: per-user list
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Case-insensitive uniqueness per user
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_unique
  ON public.tags (user_id, lower(name));

CREATE INDEX IF NOT EXISTS tags_user_id_idx ON public.tags (user_id);

CREATE POLICY "Users can view their own tags"
  ON public.tags
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags"
  ON public.tags
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON public.tags
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON public.tags
  FOR DELETE
  USING (auth.uid() = user_id);

-- Project <-> Tags join
CREATE TABLE IF NOT EXISTS public.project_tags (
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (project_id, tag_id)
);

ALTER TABLE public.project_tags ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS project_tags_project_id_idx
  ON public.project_tags (project_id);

CREATE INDEX IF NOT EXISTS project_tags_tag_id_idx
  ON public.project_tags (tag_id);

-- Users can only manage tag links for their own projects/tags
CREATE POLICY "Users can view their own project tags"
  ON public.project_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.tags t
      WHERE t.id = tag_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own project tags"
  ON public.project_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.tags t
      WHERE t.id = tag_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own project tags"
  ON public.project_tags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.tags t
      WHERE t.id = tag_id
        AND t.user_id = auth.uid()
    )
  );
