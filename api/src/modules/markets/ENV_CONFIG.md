# Multi-Category Market ETL Pipeline - Environment Variables

## Required Variables (Add to your .env file)

```bash
# ============================================================
# Existing Supabase Configuration (already in your .env)
# ============================================================
# SUPABASE_URL=your_supabase_url
# SUPABASE_SERVICE_ROLE_KEY=your_service_key

# ============================================================
# New API Keys for Market Data ETL
# ============================================================

# NewsAPI.org (Politics, Finance, Tech, Latest)
# Free tier: 100 requests/day
# Get key: https://newsapi.org/register
NEWSAPI_KEY=your_newsapi_key

# Alpha Vantage (Finance - Stocks, Economic Indicators)
# Free tier: 5 requests/min, 500 requests/day
# Get key: https://www.alphavantage.co/support/#api-key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key

# CoinMarketCap (Crypto - Enhanced market data)
# Free tier: 10,000 credits/month
# Get key: https://pro.coinmarketcap.com/signup
COINMARKETCAP_API_KEY=your_coinmarketcap_key

# CryptoPanic (Crypto - News and sentiment)
# Free tier: Limited requests
# Get key: https://cryptopanic.com/developers/api/
CRYPTOPANIC_API_KEY=your_cryptopanic_key

# ============================================================
# Free APIs (No API Key Required)
# ============================================================
# The following APIs don't require API keys:
# - CoinGecko (Crypto prices) - Rate limited
# - HackerNews (Tech news) - No specific limits
# - GDELT (Politics/Economy news) - No strict limits
# - World Bank (Economy data) - No strict limits
# - arXiv (Science papers) - Rate limited
# - Semantic Scholar (Science papers) - Rate limited

# ============================================================
# WebSocket Configuration (Optional)
# ============================================================
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# ============================================================
# ETL Scheduling (These are defaults, customizable)
# ============================================================
# Crypto: Every 5 minutes
# Tech: Every 30 minutes
# Politics: Every hour
# Finance: Every hour
# Economy: Daily
# Science: Every 6 hours
# Signals: Every 5 minutes
```

## API Documentation Links

| API | Category | Documentation |
|-----|----------|---------------|
| NewsAPI | Politics, Finance, Tech, Latest | https://newsapi.org/docs |
| GDELT | Politics, Economy | https://api.gdeltproject.org/docs |
| Alpha Vantage | Finance | https://www.alphavantage.co/documentation/ |
| CoinGecko | Crypto | https://www.coingecko.com/en/api/documentation |
| CoinMarketCap | Crypto | https://coinmarketcap.com/api/documentation/ |
| CryptoPanic | Crypto | https://cryptopanic.com/about/api/ |
| HackerNews | Tech | https://github.com/HackerNews/API |
| World Bank | Economy | https://datahelpdesk.worldbank.org/knowledgebase/articles/889392 |
| arXiv | Science | https://arxiv.org/help/api |
| Semantic Scholar | Science | https://api.semanticscholar.org/ |
