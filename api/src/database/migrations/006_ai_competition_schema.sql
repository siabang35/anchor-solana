-- Migration: Add tables for AI Competitions, News Clusters, Curve Snapshots, and Agents

-- 1. News Clusters
CREATE TABLE IF NOT EXISTS public.news_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    cluster_hash TEXT NOT NULL,
    article_urls TEXT[] NOT NULL DEFAULT '{}',
    signals JSONB NOT NULL DEFAULT '[]',
    sentiment NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cluster_hash)
);
CREATE INDEX IF NOT EXISTS idx_news_clusters_competition ON public.news_clusters(competition_id);

-- 2. Curve Snapshots
CREATE TABLE IF NOT EXISTS public.curve_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    probability NUMERIC NOT NULL CHECK (probability >= 0 AND probability <= 1),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    news_cluster_id UUID REFERENCES public.news_clusters(id) ON DELETE SET NULL,
    snapshot_hash TEXT NOT NULL,
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_hash)
);
CREATE INDEX IF NOT EXISTS idx_curve_snapshots_competition ON public.curve_snapshots(competition_id);

-- 3. AI Agents
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    system_prompt TEXT,
    model TEXT DEFAULT 'Qwen/Qwen3.5-9B',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agents_user ON public.agents(user_id);

-- 4. Agent Predictions
CREATE TABLE IF NOT EXISTS public.agent_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    probability NUMERIC NOT NULL CHECK (probability >= 0 AND probability <= 1),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    brier_score NUMERIC,
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_predictions_agent ON public.agent_predictions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_predictions_competition ON public.agent_predictions(competition_id);

-- Add updated_at trigger for agents
DROP TRIGGER IF EXISTS set_updated_at_agents ON public.agents;
CREATE TRIGGER set_updated_at_agents
    BEFORE UPDATE ON public.agents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add horizon resolution metadata to competitions
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS time_horizon TEXT;
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS base_probability NUMERIC DEFAULT 0.5;
