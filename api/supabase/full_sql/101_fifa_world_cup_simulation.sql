-- [ignoring loop detection]
-- ============================================================================
-- Seeding FIFA World Cup 2026 Semifinals & Finals Simulation
-- Put this file in supabase/full_sql/
-- Run this directly in the Supabase SQL Editor.
-- ============================================================================

-- Ensure the required sports API enums are added to market_data_source_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apifootball' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apifootball';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apibaseball' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apibaseball';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apibasketball' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apibasketball';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apiafl' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apiafl';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apiformula1' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apiformula1';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apihandball' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apihandball';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apihockey' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apihockey';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apimma' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apimma';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apinba' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apinba';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apinfl' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apinfl';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apirugby' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apirugby';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'apivolleyball' AND enumtypid = 'market_data_source_type'::regtype) THEN
        ALTER TYPE market_data_source_type ADD VALUE 'apivolleyball';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sports' AND enumtypid = 'market_category_type'::regtype) THEN
        ALTER TYPE market_category_type ADD VALUE 'sports';
    END IF;
END $$;

-- Clean up existing simulation data to avoid foreign key or duplicate key issues
DELETE FROM sports_markets WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-555555555551', 'a7d7f766-1c2c-4b5b-8c8d-555555555552') OR title LIKE '%World Cup 2026%' OR question = 'Who will progress to the World Cup Final?';
DELETE FROM used_competition_sources WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-777777777771', 'a7d7f766-1c2c-4b5b-8c8d-777777777772', 'a7d7f766-1c2c-4b5b-8c8d-777777777773') OR source_id IN ('a7d7f766-1c2c-4b5b-8c8d-111111111111', 'a7d7f766-1c2c-4b5b-8c8d-222222222222', 'a7d7f766-1c2c-4b5b-8c8d-333333333333');
DELETE FROM competitions WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-444444444441', 'a7d7f766-1c2c-4b5b-8c8d-444444444442', 'a7d7f766-1c2c-4b5b-8c8d-444444444443') OR title LIKE '%World Cup 2026%' OR title = 'FIFA World Cup 2026 Winner';
DELETE FROM markets WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-666666666661', 'a7d7f766-1c2c-4b5b-8c8d-666666666662', 'a7d7f766-1c2c-4b5b-8c8d-666666666663') OR title LIKE '%World Cup 2026%' OR title = 'FIFA World Cup 2026 Winner';
DELETE FROM sports_events WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-111111111111', 'a7d7f766-1c2c-4b5b-8c8d-222222222222', 'a7d7f766-1c2c-4b5b-8c8d-333333333333') OR (external_id IN ('wc2026_sf1', 'wc2026_sf2', 'wc2026_final') AND source = 'apifootball');
DELETE FROM sports_teams WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-000000000001', 'a7d7f766-1c2c-4b5b-8c8d-000000000002', 'a7d7f766-1c2c-4b5b-8c8d-000000000003', 'a7d7f766-1c2c-4b5b-8c8d-000000000004') OR (external_id IN ('2', '9', '10', '26') AND source = 'apifootball');
DELETE FROM sports_leagues WHERE id = 'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c' OR (external_id = '1' AND source = 'apifootball');
DELETE FROM market_data_items WHERE id IN ('a7d7f766-1c2c-4b5b-8c8d-999999999991', 'a7d7f766-1c2c-4b5b-8c8d-999999999992', 'a7d7f766-1c2c-4b5b-8c8d-999999999993', 'a7d7f766-1c2c-4b5b-8c8d-999999999994') OR external_id IN ('rss_wc_news_1', 'rss_wc_news_2', 'rss_wc_news_3', 'rss_wc_news_4');

-- 1. Insert FIFA World Cup League
INSERT INTO sports_leagues (
    id,
    external_id,
    source,
    sport,
    name,
    country,
    logo_url,
    is_active,
    is_featured
) VALUES (
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    '1',
    'apifootball',
    'football',
    'FIFA World Cup',
    'Worldwide',
    'https://media.api-sports.io/football/leagues/1.png',
    true,
    true
);

-- 2. Insert the 4 Semifinalist Teams with flag URLs
INSERT INTO sports_teams (
    id,
    external_id,
    source,
    league_id,
    sport,
    name,
    logo_url,
    is_active
) VALUES 
(
    'a7d7f766-1c2c-4b5b-8c8d-000000000002', -- France
    '2',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'football',
    'France',
    'https://media.api-sports.io/football/teams/2.png',
    true
),
(
    'a7d7f766-1c2c-4b5b-8c8d-000000000003', -- Spain
    '9',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'football',
    'Spain',
    'https://media.api-sports.io/football/teams/9.png',
    true
),
(
    'a7d7f766-1c2c-4b5b-8c8d-000000000004', -- England
    '10',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'football',
    'England',
    'https://media.api-sports.io/football/teams/10.png',
    true
),
(
    'a7d7f766-1c2c-4b5b-8c8d-000000000001', -- Argentina
    '26',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'football',
    'Argentina',
    'https://media.api-sports.io/football/teams/26.png',
    true
);

-- 3. Insert Parent Markets in 'markets' table (referenced by both competitions and sports_markets)
INSERT INTO markets (
    id,
    creator_id,
    title,
    description,
    category,
    chain,
    chain_id,
    end_time,
    resolution_time,
    yes_price,
    no_price,
    volume,
    liquidity
) VALUES
(
    'a7d7f766-1c2c-4b5b-8c8d-666666666661',
    '582b2320-6fa3-48b3-ada4-3850fe2ce012', -- Active Profile
    'France vs Spain (World Cup 2026 Semi-final 1)',
    'Will France win against Spain in the World Cup 2026 Semifinal 1?',
    'sports',
    'solana',
    101,
    NOW() + INTERVAL '2 hours',
    NOW() + INTERVAL '3 hours',
    0.48,
    0.52,
    1450.25,
    3000.00
),
(
    'a7d7f766-1c2c-4b5b-8c8d-666666666662',
    '582b2320-6fa3-48b3-ada4-3850fe2ce012',
    'England vs Argentina (World Cup 2026 Semi-final 2)',
    'Will England win against Argentina in the World Cup 2026 Semifinal 2?',
    'sports',
    'solana',
    101,
    NOW() + INTERVAL '6 hours',
    NOW() + INTERVAL '7 hours',
    0.47,
    0.53,
    890.40,
    2000.00
),
(
    'a7d7f766-1c2c-4b5b-8c8d-666666666663',
    '582b2320-6fa3-48b3-ada4-3850fe2ce012',
    'FIFA World Cup 2026 Winner',
    'Predict the ultimate winner of the FIFA World Cup 2026.',
    'sports',
    'solana',
    101,
    NOW() + INTERVAL '24 hours',
    NOW() + INTERVAL '26 hours',
    0.35,
    0.25,
    5420.50,
    10000.00
);

-- 4. Insert Matches into 'sports_events'
INSERT INTO sports_events (
    id,
    external_id,
    source,
    league_id,
    home_team_id,
    away_team_id,
    sport,
    name,
    status,
    start_time,
    elapsed_time,
    home_score,
    away_score,
    is_featured,
    venue,
    timezone
) VALUES
(
    'a7d7f766-1c2c-4b5b-8c8d-111111111111',
    'wc2026_sf1',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'a7d7f766-1c2c-4b5b-8c8d-000000000002', -- France
    'a7d7f766-1c2c-4b5b-8c8d-000000000003', -- Spain
    'football',
    'France vs Spain',
    'scheduled',
    NOW() + INTERVAL '1 minute',
    0,
    0,
    0,
    true,
    'Mercedes-Benz Stadium (Atlanta)',
    'UTC'
),
(
    'a7d7f766-1c2c-4b5b-8c8d-222222222222',
    'wc2026_sf2',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'a7d7f766-1c2c-4b5b-8c8d-000000000004', -- England
    'a7d7f766-1c2c-4b5b-8c8d-000000000001', -- Argentina
    'football',
    'England vs Argentina',
    'scheduled',
    NOW() + INTERVAL '2 minutes',
    0,
    0,
    0,
    true,
    'Mercedes-Benz Stadium (Atlanta)',
    'UTC'
),
(
    'a7d7f766-1c2c-4b5b-8c8d-333333333333',
    'wc2026_final',
    'apifootball',
    'a7d7f766-1c2c-4b5b-8c8d-8e9f0f1a2b3c',
    'a7d7f766-1c2c-4b5b-8c8d-000000000003', -- Spain (Default home)
    'a7d7f766-1c2c-4b5b-8c8d-000000000001', -- Argentina (Default away)
    'football',
    'FIFA World Cup Final',
    'scheduled',
    NOW() + INTERVAL '6 minutes',
    0,
    0,
    0,
    true,
    'AT&T Stadium (Dallas)',
    'UTC'
);

-- 5. Insert AI Agent Competitions
INSERT INTO competitions (
    id,
    market_id, -- Link to parent market
    title,
    description,
    sector,
    team_home,
    team_away,
    outcomes,
    competition_start,
    competition_end,
    status,
    prize_pool,
    entry_count,
    max_entries,
    probabilities,
    tags,
    image_url
) VALUES
(
    'a7d7f766-1c2c-4b5b-8c8d-444444444441',
    'a7d7f766-1c2c-4b5b-8c8d-666666666661',
    'France vs Spain (World Cup 2026 Semi-final 1)',
    'AI forecasting competition for the historic semifinal in World Cup 2026. France battles Spain live for a spot in the Final.',
    'sports',
    'France',
    'Spain',
    ARRAY['France Win', 'Spain Win'],
    NOW() + INTERVAL '1 minute',
    NOW() + INTERVAL '24 hours',
    'upcoming',
    0,
    0,
    100,
    ARRAY[4800, 5200],
    ARRAY['football', 'world-cup', 'semi-final'],
    'https://media.api-sports.io/football/teams/2.png'
),
(
    'a7d7f766-1c2c-4b5b-8c8d-444444444442',
    'a7d7f766-1c2c-4b5b-8c8d-666666666662',
    'England vs Argentina (World Cup 2026 Semi-final 2)',
    'AI forecasting competition for the second semifinal in World Cup 2026. England meets Argentina to decide the next finalist.',
    'sports',
    'England',
    'Argentina',
    ARRAY['England Win', 'Argentina Win'],
    NOW() + INTERVAL '2 minutes',
    NOW() + INTERVAL '24 hours',
    'upcoming',
    0,
    0,
    100,
    ARRAY[4700, 5300],
    ARRAY['football', 'world-cup', 'semi-final'],
    'https://media.api-sports.io/football/teams/10.png'
),
(
    'a7d7f766-1c2c-4b5b-8c8d-444444444443',
    'a7d7f766-1c2c-4b5b-8c8d-666666666663',
    'FIFA World Cup 2026 Winner',
    'AI agent competition to forecast the ultimate champion of the FIFA World Cup 2026.',
    'sports',
    'TBD',
    'TBD',
    ARRAY['Argentina', 'France', 'Spain', 'England'],
    NOW(),
    NOW() + INTERVAL '24 hours',
    'active',
    0,
    0,
    200,
    ARRAY[3500, 2500, 2200, 1800],
    ARRAY['football', 'world-cup', 'final'],
    'https://media.api-sports.io/football/leagues/1.png'
);

-- 6. Insert Sports Markets linking events and core markets
INSERT INTO sports_markets (
    id,
    event_id,
    market_id,
    market_type,
    title,
    description,
    question,
    outcomes,
    outcome_prices,
    yes_price,
    no_price,
    volume,
    liquidity,
    is_active
) VALUES
(
    'a7d7f766-1c2c-4b5b-8c8d-555555555551',
    'a7d7f766-1c2c-4b5b-8c8d-111111111111', -- SF1 Event
    'a7d7f766-1c2c-4b5b-8c8d-666666666661', -- SF1 Market
    'match_winner',
    'France vs Spain (World Cup 2026 Semi-final 1)',
    'Predict if France wins the match or if Spain defeats them.',
    'Who will progress to the World Cup Final?',
    '["France", "Spain"]'::jsonb,
    '[0.48, 0.52]'::jsonb,
    0.48,
    0.52,
    1450.25,
    3000.00,
    true
),
(
    'a7d7f766-1c2c-4b5b-8c8d-555555555552',
    'a7d7f766-1c2c-4b5b-8c8d-222222222222', -- SF2 Event
    'a7d7f766-1c2c-4b5b-8c8d-666666666662', -- SF2 Market
    'match_winner',
    'England vs Argentina (World Cup 2026 Semi-final 2)',
    'Predict if England wins the match or if Argentina defeats them.',
    'Who will progress to the World Cup Final?',
    '["England", "Argentina"]'::jsonb,
    '[0.47, 0.53]'::jsonb,
    0.47,
    0.53,
    890.40,
    2000.00,
    true
);

-- 7. Insert Competition Source Links (Crucial for simulation resolution!)
INSERT INTO used_competition_sources (
    id,
    competition_id,
    source_table,
    source_id,
    source_title,
    category
) VALUES
(
    'a7d7f766-1c2c-4b5b-8c8d-777777777771',
    'a7d7f766-1c2c-4b5b-8c8d-444444444441', -- SF1 Competition
    'sports_events',
    'a7d7f766-1c2c-4b5b-8c8d-111111111111', -- SF1 Event
    'France vs Spain',
    'sports'
),
(
    'a7d7f766-1c2c-4b5b-8c8d-777777777772',
    'a7d7f766-1c2c-4b5b-8c8d-444444444442', -- SF2 Competition
    'sports_events',
    'a7d7f766-1c2c-4b5b-8c8d-222222222222', -- SF2 Event
    'England vs Argentina',
    'sports'
),
(
    'a7d7f766-1c2c-4b5b-8c8d-777777777773',
    'a7d7f766-1c2c-4b5b-8c8d-444444444443', -- Final Competition
    'sports_events',
    'a7d7f766-1c2c-4b5b-8c8d-333333333333', -- Final Event
    'FIFA World Cup Final',
    'sports'
);

-- 8. Seed Initial Realtime-like RSS Football News
INSERT INTO market_data_items (
    id,
    external_id,
    source,
    source_name,
    content_type,
    title,
    description,
    url,
    published_at,
    impact,
    sentiment,
    sentiment_score,
    category,
    tags,
    image_url,
    is_active,
    is_duplicate
) VALUES
(
    'a7d7f766-1c2c-4b5b-8c8d-999999999991',
    'rss_wc_news_1',
    'rss',
    'Google News',
    'news',
    'Messi declares fitness ahead of epic World Cup Semifinal clash against England',
    'Argentina captain Lionel Messi trained with the squad today and declared himself fully fit. He is expected to start against England in the highly anticipated semifinal at Atlanta.',
    'https://news.google.com',
    NOW() - INTERVAL '5 minutes',
    'high',
    'bullish',
    0.85,
    'sports',
    ARRAY['Argentina', 'England', 'World Cup', 'Messi'],
    'https://media.api-sports.io/football/teams/26.png',
    true,
    false
),
(
    'a7d7f766-1c2c-4b5b-8c8d-999999999992',
    'rss_wc_news_2',
    'rss',
    'BBC Sport',
    'news',
    'Deschamps expects a tactical chess match in France vs Spain semifinal',
    'France head coach Didier Deschamps expects a highly tactical match against Spain. Deschamps highlighted the threat of Spain''s young wingers but remains confident in France''s tournament pedigree.',
    'https://www.bbc.com/sport/football',
    NOW() - INTERVAL '12 minutes',
    'medium',
    'neutral',
    0.15,
    'sports',
    ARRAY['France', 'Spain', 'World Cup', 'Deschamps'],
    'https://media.api-sports.io/football/teams/2.png',
    true,
    false
),
(
    'a7d7f766-1c2c-4b5b-8c8d-999999999993',
    'rss_wc_news_3',
    'rss',
    'ESPN',
    'news',
    'Bellingham: England squad ready for Argentina test in World Cup semifinal',
    'Jude Bellingham spoke to the press ahead of the match, expressing huge confidence in the England squad. England faces Argentina in the World Cup Semifinals.',
    'https://www.espn.com/soccer',
    NOW() - INTERVAL '20 minutes',
    'high',
    'bullish',
    0.65,
    'sports',
    ARRAY['England', 'Argentina', 'World Cup', 'Bellingham'],
    'https://media.api-sports.io/football/teams/10.png',
    true,
    false
),
(
    'a7d7f766-1c2c-4b5b-8c8d-999999999994',
    'rss_wc_news_4',
    'rss',
    'Sky Sports',
    'news',
    'Lamine Yamal looks to make history for Spain in World Cup semifinal',
    'Spain''s teenage prodigy Lamine Yamal is fit and ready to start against France. Pundits suggest his performance could be the key to breaking France''s solid defense.',
    'https://www.skysports.com/football',
    NOW() - INTERVAL '35 minutes',
    'medium',
    'bullish',
    0.72,
    'sports',
    ARRAY['Spain', 'France', 'World Cup', 'Yamal'],
    'https://media.api-sports.io/football/teams/9.png',
    true,
    false
);
