CREATE TABLE IF NOT EXISTS public.market_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  content text,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS

ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published news only"
ON public.market_news
FOR SELECT
USING (is_published = true);
