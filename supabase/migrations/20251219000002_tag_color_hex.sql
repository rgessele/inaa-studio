-- Allow arbitrary tag colors via hex (#RRGGBB)

-- Remove previous palette constraint if present
ALTER TABLE public.tags
  DROP CONSTRAINT IF EXISTS tags_color_check;

-- Default color (used when older rows had token values)
ALTER TABLE public.tags
  ALTER COLUMN color SET DEFAULT '#F2C94C';

-- Normalize any existing non-hex colors to the default
UPDATE public.tags
SET color = '#F2C94C'
WHERE color IS NULL
   OR color !~* '^#[0-9A-F]{6}$';

-- Enforce strict hex format going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_color_hex_check'
  ) THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT tags_color_hex_check
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;
END $$;
