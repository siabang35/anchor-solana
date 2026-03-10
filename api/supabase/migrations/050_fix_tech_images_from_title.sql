-- ============================================================
-- Fix Tech Category Images with Topic Detection
-- Updates Tech items with varied images based on title keywords
-- Migration: 050_fix_tech_images_from_title.sql
-- ============================================================

-- Update Tech items with topic-based images from title analysis
UPDATE market_data_items
SET image_url = CASE 
    -- Security / Hacking / Privacy
    WHEN title ~* '\m(hack|security|privacy|breach|attack|vulnerability|fbi|cyber|password|encryption|malware|ransomware|exploit)\M'
        THEN 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&q=80&w=600'
    
    -- Database / SQL
    WHEN title ~* '\m(sql|database|mysql|postgres|mongodb|redis|sqlite|db|data center)\M'
        THEN 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&q=80&w=600'
    
    -- Programming Languages / Development Tools
    WHEN title ~* '\m(python|javascript|typescript|rust|go|java|kotlin|swift|xcode|compiler|framework|npm|package|deno|notepad)\M'
        THEN 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=600'
    
    -- AI / ML / LLM
    WHEN title ~* '\m(ai|llm|gpt|chatgpt|openai|anthropic|claude|gemini|machine learning|neural|model|thinking)\M'
        THEN 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=600'
    
    -- Cloud / Infrastructure
    WHEN title ~* '\m(cloud|aws|azure|gcp|kubernetes|docker|serverless|lambda|infrastructure|devops)\M'
        THEN 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600'
    
    -- Open Source / GitHub
    WHEN title ~* '\m(open source|github|gitlab|repository|fork|oss|linux|apache|alibaba|alibaba)\M'
        THEN 'https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?auto=format&fit=crop&q=80&w=600'
    
    -- Apple / iOS
    WHEN title ~* '\m(apple|iphone|ios|macos|swift|wwdc|macbook|ipad)\M'
        THEN 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&q=80&w=600'
    
    -- Google / Android
    WHEN title ~* '\m(google|android|chrome|pixel|flutter)\M'
        THEN 'https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?auto=format&fit=crop&q=80&w=600'
    
    -- Startup / Business / Tech CEOs
    WHEN title ~* '\m(startup|funding|ipo|ceo|acquisition|layoff|billion|million|valuation|vc|investor|executive|zoom|teams|x office|france)\M'
        THEN 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&q=80&w=600'
    
    -- Web / Browser
    WHEN title ~* '\m(web|browser|firefox|safari|http|html|css|react|vue|angular|frontend)\M'
        THEN 'https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&q=80&w=600'
    
    -- Hardware / Chips
    WHEN title ~* '\m(chip|cpu|gpu|nvidia|amd|intel|hardware|semiconductor|processor|cannon)\M'
        THEN 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600'

    -- Default based on modular hash of title for variety
    ELSE CASE MOD(LENGTH(title), 5)
        WHEN 0 THEN 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600'
        WHEN 1 THEN 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=600'
        WHEN 2 THEN 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600'
        WHEN 3 THEN 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600'
        ELSE 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&q=80&w=600'
    END
END
WHERE category = 'tech';

-- Verify update
DO $$
DECLARE
    unique_images INTEGER;
BEGIN
    SELECT COUNT(DISTINCT image_url) INTO unique_images 
    FROM market_data_items 
    WHERE category = 'tech' AND image_url IS NOT NULL;
    
    RAISE NOTICE 'Tech items now have % different images', unique_images;
END $$;
