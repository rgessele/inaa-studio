-- Add color to tags (uses existing theme tokens)

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'accent-gold';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_color_check'
  ) THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT tags_color_check
      CHECK (color IN ('primary', 'accent-gold', 'accent-rose', 'gray'));
  END IF;
END $$;
