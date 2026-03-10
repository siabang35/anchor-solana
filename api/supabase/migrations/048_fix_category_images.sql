-- ============================================================
-- Fix Image URLs for Market Data Items
-- Adds missing images to Crypto, Economy, and Science items
-- Migration: 048_fix_category_images.sql
-- ============================================================

-- 1. Update Economy items with country flag images
UPDATE market_data_items
SET image_url = CASE 
    WHEN title ILIKE '%Brazil%' THEN 'https://flagcdn.com/w320/br.png'
    WHEN title ILIKE '%Canada%' THEN 'https://flagcdn.com/w320/ca.png'
    WHEN title ILIKE '%Australia%' THEN 'https://flagcdn.com/w320/au.png'
    WHEN title ILIKE '%USA%' OR title ILIKE '%United States%' THEN 'https://flagcdn.com/w320/us.png'
    WHEN title ILIKE '%China%' THEN 'https://flagcdn.com/w320/cn.png'
    WHEN title ILIKE '%Japan%' THEN 'https://flagcdn.com/w320/jp.png'
    WHEN title ILIKE '%Germany%' THEN 'https://flagcdn.com/w320/de.png'
    WHEN title ILIKE '%United Kingdom%' OR title ILIKE '%UK%' THEN 'https://flagcdn.com/w320/gb.png'
    WHEN title ILIKE '%France%' THEN 'https://flagcdn.com/w320/fr.png'
    WHEN title ILIKE '%India%' THEN 'https://flagcdn.com/w320/in.png'
    WHEN title ILIKE '%Italy%' THEN 'https://flagcdn.com/w320/it.png'
    WHEN title ILIKE '%South Korea%' OR title ILIKE '%Korea%' THEN 'https://flagcdn.com/w320/kr.png'
    WHEN title ILIKE '%Russia%' THEN 'https://flagcdn.com/w320/ru.png'
    WHEN title ILIKE '%Spain%' THEN 'https://flagcdn.com/w320/es.png'
    WHEN title ILIKE '%Mexico%' THEN 'https://flagcdn.com/w320/mx.png'
    WHEN title ILIKE '%Indonesia%' THEN 'https://flagcdn.com/w320/id.png'
    WHEN title ILIKE '%Netherlands%' THEN 'https://flagcdn.com/w320/nl.png'
    WHEN title ILIKE '%Switzerland%' THEN 'https://flagcdn.com/w320/ch.png'
    WHEN title ILIKE '%Saudi Arabia%' THEN 'https://flagcdn.com/w320/sa.png'
    ELSE 'https://images.unsplash.com/photo-1611974765270-ca12586343bb?auto=format&fit=crop&q=80&w=600'
END
WHERE category = 'economy' 
AND image_url IS NULL;

-- 2. Update Crypto items with coin logos
UPDATE market_data_items
SET image_url = CASE 
    WHEN title ILIKE '%Bitcoin%' THEN 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png'
    WHEN title ILIKE '%Ethereum%' THEN 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
    WHEN title ILIKE '%Solana%' THEN 'https://assets.coingecko.com/coins/images/4128/large/solana.png'
    WHEN title ILIKE '%XRP%' OR title ILIKE '%Ripple%' THEN 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png'
    WHEN title ILIKE '%BNB%' OR title ILIKE '%Binance%' THEN 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png'
    WHEN title ILIKE '%Cardano%' OR title ILIKE '%ADA%' THEN 'https://assets.coingecko.com/coins/images/975/large/cardano.png'
    WHEN title ILIKE '%Dogecoin%' OR title ILIKE '%DOGE%' THEN 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png'
    WHEN title ILIKE '%Avalanche%' OR title ILIKE '%AVAX%' THEN 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png'
    WHEN title ILIKE '%Polkadot%' OR title ILIKE '%DOT%' THEN 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png'
    WHEN title ILIKE '%Polygon%' OR title ILIKE '%MATIC%' THEN 'https://assets.coingecko.com/coins/images/4713/large/polygon.png'
    WHEN title ILIKE '%Chainlink%' OR title ILIKE '%LINK%' THEN 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png'
    WHEN title ILIKE '%Uniswap%' OR title ILIKE '%UNI%' THEN 'https://assets.coingecko.com/coins/images/12504/large/uniswap-logo.png'
    WHEN title ILIKE '%Cosmos%' OR title ILIKE '%ATOM%' THEN 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png'
    WHEN title ILIKE '%Litecoin%' OR title ILIKE '%LTC%' THEN 'https://assets.coingecko.com/coins/images/2/large/litecoin.png'
    WHEN title ILIKE '%Hyperliquid%' OR title ILIKE '%HYPE%' THEN 'https://assets.coingecko.com/coins/images/37396/large/hyperliquid.png'
    WHEN title ILIKE '%Tether%' OR title ILIKE '%USDT%' THEN 'https://assets.coingecko.com/coins/images/325/large/Tether.png'
    WHEN title ILIKE '%USDC%' THEN 'https://assets.coingecko.com/coins/images/6319/large/usdc.png'
    ELSE 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&q=80&w=600'
END
WHERE category = 'crypto' 
AND image_url IS NULL;

-- 3. Update Science items with research-themed images
UPDATE market_data_items
SET image_url = 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600'
WHERE category = 'science' 
AND image_url IS NULL;

-- Log results
DO $$
DECLARE
    economy_count INTEGER;
    crypto_count INTEGER;
    science_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO economy_count FROM market_data_items WHERE category = 'economy' AND image_url IS NOT NULL;
    SELECT COUNT(*) INTO crypto_count FROM market_data_items WHERE category = 'crypto' AND image_url IS NOT NULL;
    SELECT COUNT(*) INTO science_count FROM market_data_items WHERE category = 'science' AND image_url IS NOT NULL;
    
    RAISE NOTICE 'Updated images - Economy: %, Crypto: %, Science: %', economy_count, crypto_count, science_count;
END $$;
