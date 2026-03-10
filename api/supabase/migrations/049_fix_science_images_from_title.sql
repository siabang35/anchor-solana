-- ============================================================
-- Fix Science Category Images with Topic Detection
-- Updates Science items with varied images based on title keywords
-- Migration: 049_fix_science_images_from_title.sql
-- ============================================================

-- Update Science items with topic-based images from title analysis
UPDATE market_data_items
SET image_url = CASE 
    -- AI/ML/Deep Learning
    WHEN title ~* '\m(llm|language model|transformer|gpt|bert|diffusion|generative|neural|deep learning|machine learning|reinforcement|nlp|chatbot|agent|multimodal)\M'
        THEN 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=600'
    
    -- Computer Vision / 3D / Video
    WHEN title ~* '\m(image|vision|visual|video|3d|render|scene|detection|segmentation|pixel|previsualization|figure|autoFigure)\M'
        THEN 'https://images.unsplash.com/photo-1561736778-92e52a7769ef?auto=format&fit=crop&q=80&w=600'
    
    -- Robotics
    WHEN title ~* '\m(robot|manipulation|navigation|autonomous|drone|embodied|motion|control)\M'
        THEN 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=600'
    
    -- Math/Optimization/Algorithm
    WHEN title ~* '\m(conformal|optimization|algorithm|convergence|stochastic|gradient|convex|theorem|adaptive|continual|geometry|plasticity)\M'
        THEN 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&q=80&w=600'
    
    -- Data/Graphs/Networks
    WHEN title ~* '\m(graph|network|data|dataset|benchmark|knowledge|reasoning|scaling|bridging)\M'
        THEN 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600'
    
    -- Security/Safety
    WHEN title ~* '\m(security|privacy|adversarial|attack|defense|robust|safety|fingerprint|antidistillation)\M'
        THEN 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&q=80&w=600'
    
    -- Audio/Speech
    WHEN title ~* '\m(audio|speech|voice|sound|acoustic|music|weighting)\M'
        THEN 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=600'

    -- Default based on modular hash of title for variety
    ELSE CASE MOD(LENGTH(title), 5)
        WHEN 0 THEN 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600'
        WHEN 1 THEN 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=600'
        WHEN 2 THEN 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600'
        WHEN 3 THEN 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=600'
        ELSE 'https://images.unsplash.com/photo-1635070041409-e63e783ce3c1?auto=format&fit=crop&q=80&w=600'
    END
END
WHERE category = 'science';

-- Verify update
DO $$
DECLARE
    unique_images INTEGER;
BEGIN
    SELECT COUNT(DISTINCT image_url) INTO unique_images 
    FROM market_data_items 
    WHERE category = 'science' AND image_url IS NOT NULL;
    
    RAISE NOTICE 'Science items now have % different images', unique_images;
END $$;
