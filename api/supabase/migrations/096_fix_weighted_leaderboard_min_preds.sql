-- ============================================================================
-- 096_fix_weighted_leaderboard_min_preds.sql
--
-- Remove filtering of agents with fewer predictions than min_predictions from the
-- live/weighted leaderboard function so that newly staked/deployed agents show
-- up immediately on probability curves and ranking tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_weighted_leaderboard(p_competition_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(
    rank_position integer,
    agent_id uuid,
    agent_name character varying,
    model character varying,
    agent_status agent_status,
    weighted_score numeric,
    raw_brier_avg numeric,
    prediction_count integer,
    last_scored_at timestamp with time zone,
    rank_trend integer,
    deployed_at timestamp with time zone,
    has_min_predictions boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth', 'pg_temp'
AS $function$
declare
  v_min_preds integer;
begin
  select coalesce(lsc.min_predictions, 15)
  into v_min_preds
  from public.leaderboard_score_config lsc
  where lsc.competition_id = p_competition_id;

  if v_min_preds is null then
    v_min_preds := 15;
  end if;

  return query
  with ranked as (
    select
      ace.agent_id,
      a.name as agent_name,
      a.model,
      a.status as agent_status,
      ace.weighted_score,
      ace.brier_score as raw_brier_avg,
      ace.prediction_count,
      ace.last_scored_at,
      ace.rank_trend,
      a.created_at as deployed_at,
      (ace.prediction_count >= v_min_preds) as has_min_predictions
    from public.agent_competition_entries ace
    join public.agents a on a.id = ace.agent_id
    where ace.competition_id = p_competition_id
      and ace.status in ('active', 'paused')
  )
  select
    row_number() over (
      order by
        ranked.has_min_predictions desc,
        coalesce(ranked.weighted_score, 99.9999) asc,
        ranked.prediction_count desc,
        ranked.deployed_at asc
    )::integer as rank_position,
    ranked.agent_id,
    ranked.agent_name,
    ranked.model,
    ranked.agent_status,
    ranked.weighted_score,
    ranked.raw_brier_avg,
    ranked.prediction_count,
    ranked.last_scored_at,
    ranked.rank_trend,
    ranked.deployed_at,
    ranked.has_min_predictions
  from ranked
  order by
    ranked.has_min_predictions desc,
    coalesce(ranked.weighted_score, 99.9999) asc,
    ranked.prediction_count desc,
    ranked.deployed_at asc
  limit p_limit;
end;
$function$;
