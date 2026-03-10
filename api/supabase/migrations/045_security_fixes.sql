-- ============================================================
-- Security Fixes for ExoDuZe AI Agent Competition
-- Resolves linter warnings: security_definer_view, function_search_path_mutable
-- Migration: 045_security_fixes.sql
-- ============================================================

-- 1. Fix 'latest_market_news' view (Remove SECURITY DEFINER to use invoker permissions)
DROP VIEW IF EXISTS latest_market_news;

CREATE OR REPLACE VIEW latest_market_news AS
SELECT 
    mdi.id,
    mdi.category,
    mdi.title,
    mdi.description,
    mdi.source_name,
    mdi.url,
    mdi.image_url,
    mdi.published_at,
    mdi.impact,
    mdi.sentiment,
    mdi.tags
FROM market_data_items mdi
WHERE mdi.is_active = true
AND mdi.is_duplicate = false
AND mdi.content_type = 'news'
AND mdi.published_at >= NOW() - INTERVAL '48 hours'
ORDER BY mdi.published_at DESC;

COMMENT ON VIEW latest_market_news IS 'Aggregated view of latest news across categories (Security Optimized)';

-- 2. Fix 'function_search_path_mutable'
-- Sets explicit search_path=public for all functions to prevent search path hijacking.

-- Economy Functions
ALTER FUNCTION get_major_economies() SET search_path = public;
ALTER FUNCTION get_economy_indicator(VARCHAR, VARCHAR) SET search_path = public;
ALTER FUNCTION get_upcoming_economic_events(impact_level, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION get_latest_indicators(VARCHAR, TEXT[]) SET search_path = public;

-- Rate Limiting Functions
ALTER FUNCTION check_rate_limit(TEXT) SET search_path = public;
ALTER FUNCTION increment_rate_limit(TEXT) SET search_path = public;

-- General Market Data Functions
ALTER FUNCTION get_market_data_by_category(TEXT, INTEGER, INTEGER, TEXT) SET search_path = public;
ALTER FUNCTION generate_content_hash(TEXT, TEXT) SET search_path = public;

-- Trending & Signals Functions
ALTER FUNCTION get_trending_now(VARCHAR, market_category_type, INTEGER) SET search_path = public;
ALTER FUNCTION get_top_signals(market_category_type, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION generate_signal_from_item(UUID, VARCHAR) SET search_path = public;
ALTER FUNCTION get_signal_summary() SET search_path = public;

-- Category Specific Functions
ALTER FUNCTION get_trending_science_papers(VARCHAR, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION get_science_breakthroughs(VARCHAR, INTEGER) SET search_path = public;
ALTER FUNCTION get_upcoming_elections(VARCHAR, INTEGER) SET search_path = public;
ALTER FUNCTION get_trending_politics(INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION get_trending_tech(INTEGER) SET search_path = public;
ALTER FUNCTION get_top_hn_stories(VARCHAR, INTEGER, INTEGER) SET search_path = public;

-- Crypto Functions
ALTER FUNCTION get_featured_crypto() SET search_path = public;
ALTER FUNCTION get_crypto_news_by_symbol(VARCHAR, INTEGER) SET search_path = public;
ALTER FUNCTION get_crypto_fear_greed_latest() SET search_path = public;
ALTER FUNCTION get_crypto_price_history(VARCHAR, VARCHAR, INTEGER) SET search_path = public;

-- Auth & OTP Functions
ALTER FUNCTION get_pending_otp_signup(TEXT) SET search_path = public;
ALTER FUNCTION save_pending_otp_signup(TEXT, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION clear_pending_otp_signup(TEXT) SET search_path = public;
ALTER FUNCTION check_otp_rate_limit(TEXT, INET, INTEGER, INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION check_otp_lockout(TEXT, INET) SET search_path = public;
ALTER FUNCTION log_otp_request(TEXT, INET, TEXT, TEXT, BOOLEAN, TEXT) SET search_path = public;
ALTER FUNCTION log_otp_attempt(TEXT, INET, BOOLEAN, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION cleanup_expired_otp_data() SET search_path = public;

-- Secure Verification Tokens
ALTER FUNCTION store_verification_token(UUID, TEXT, TEXT, TEXT, INET, TEXT, INTEGER) SET search_path = public;
ALTER FUNCTION verify_and_consume_token(TEXT, TEXT, TEXT, INET) SET search_path = public;
ALTER FUNCTION get_recent_verification_tokens(TEXT, TEXT, INTEGER) SET search_path = public;
ALTER FUNCTION cleanup_expired_verification_tokens() SET search_path = public;
