-- ============================================================
-- Fix Science Category Images with Improved Variety
-- Uses multiple images per topic with hash-based selection
-- Migration: 051_fix_science_images_variety.sql
-- ============================================================

-- Update Science items with varied topic-based images
UPDATE market_data_items
SET image_url = CASE 
    -- AI/ML - use hash to pick from multiple AI images
    WHEN title ~* '\m(llm|language model|transformer|gpt|bert|diffusion|generative|neural|deep learning|machine learning|reinforcement|nlp|chatbot|agent|multimodal|attention)\M'
        THEN CASE MOD(LENGTH(title), 8)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=600'
            WHEN 2 THEN 'https://images.unsplash.com/photo-1555255707-c07966088b7b?auto=format&fit=crop&q=80&w=600'
            WHEN 3 THEN 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=600'
            WHEN 4 THEN 'https://images.unsplash.com/photo-1593349480506-8433634cdcbe?auto=format&fit=crop&q=80&w=600'
            WHEN 5 THEN 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&q=80&w=600'
            WHEN 6 THEN 'https://images.unsplash.com/photo-1507146153580-69a1fe6d8aa1?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=600'
        END
    
    -- Computer Vision / 3D
    WHEN title ~* '\m(image|vision|visual|video|3d|render|scene|detection|segmentation|pixel|figure|autofigure|previsualization)\M'
        THEN CASE MOD(LENGTH(title), 5)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1561736778-92e52a7769ef?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1617791160505-6f00504e3519?auto=format&fit=crop&q=80&w=600'
            WHEN 2 THEN 'https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&q=80&w=600'
            WHEN 3 THEN 'https://images.unsplash.com/photo-1633412802994-5c058f151b66?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600'
        END
    
    -- Robotics / Control
    WHEN title ~* '\m(robot|manipulation|navigation|autonomous|drone|embodied|motion|control|offline)\M'
        THEN CASE MOD(LENGTH(title), 4)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600'
            WHEN 2 THEN 'https://images.unsplash.com/photo-1561557944-6e7860d1a7eb?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600'
        END
    
    -- Math / Optimization / Algorithm
    WHEN title ~* '\m(math|optimization|algorithm|convergence|stochastic|gradient|convex|theorem|conformal|adaptive|plasticity|tunable|scaling|asynchronous|sgd)\M'
        THEN CASE MOD(LENGTH(title), 4)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&q=80&w=600'
            WHEN 2 THEN 'https://images.unsplash.com/photo-1596495577886-d920f1fb7238?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1453733190371-0a9bedd82893?auto=format&fit=crop&q=80&w=600'
        END
    
    -- Data / Graph / Network
    WHEN title ~* '\m(graph|network|data|dataset|benchmark|knowledge|reasoning|bridging|node|imbalanced)\M'
        THEN CASE MOD(LENGTH(title), 3)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=600'
        END
    
    -- Security / Safety
    WHEN title ~* '\m(security|privacy|adversarial|attack|defense|robust|safety|fingerprint|antidistillation)\M'
        THEN CASE MOD(LENGTH(title), 3)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=600'
        END
    
    -- Research / Scientific
    WHEN title ~* '\m(research|scientific|accelerating|discovery|study)\M'
        THEN CASE MOD(LENGTH(title), 3)
            WHEN 0 THEN 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600'
            WHEN 1 THEN 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=600'
            ELSE 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=600'
        END

    -- Default with variety
    ELSE CASE MOD(LENGTH(title), 8)
        WHEN 0 THEN 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600'
        WHEN 1 THEN 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=600'
        WHEN 2 THEN 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600'
        WHEN 3 THEN 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=600'
        WHEN 4 THEN 'https://images.unsplash.com/photo-1635070041409-e63e783ce3c1?auto=format&fit=crop&q=80&w=600'
        WHEN 5 THEN 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600'
        WHEN 6 THEN 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600'
        ELSE 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&q=80&w=600'
    END
END
WHERE category = 'science';

-- Verify variety
DO $$
DECLARE
    unique_images INTEGER;
BEGIN
    SELECT COUNT(DISTINCT image_url) INTO unique_images 
    FROM market_data_items 
    WHERE category = 'science' AND image_url IS NOT NULL;
    
    RAISE NOTICE 'Science items now have % different images', unique_images;
END $$;
