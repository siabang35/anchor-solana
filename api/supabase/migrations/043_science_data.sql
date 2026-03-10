-- ============================================================
-- Science Data Schema for ExoDuZe AI Agent Competition
-- Tables for scientific research, papers, and breakthroughs
-- Migration: 043_science_data.sql
-- ============================================================

-- ========================
-- Science Topics Table
-- ========================
CREATE TABLE IF NOT EXISTS science_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Topic info
    name VARCHAR(300) NOT NULL,
    slug VARCHAR(200) UNIQUE,
    description TEXT,
    
    -- Classification
    field VARCHAR(200), -- 'Physics', 'Biology', 'Computer Science', 'Medicine'
    subfield VARCHAR(200),
    
    -- Hierarchy
    parent_topic_id UUID REFERENCES science_topics(id) ON DELETE SET NULL,
    
    -- Trending
    popularity_score DECIMAL(5,4) DEFAULT 0.5,
    paper_count INTEGER DEFAULT 0,
    recent_paper_count INTEGER DEFAULT 0, -- Last 30 days
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_trending BOOLEAN DEFAULT false,
    
    -- Metadata
    related_topics UUID[] DEFAULT '{}',
    keywords TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Science Papers Table
-- ========================
CREATE TABLE IF NOT EXISTS science_papers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255) NOT NULL,
    source market_data_source_type NOT NULL, -- 'arxiv', 'pubmed', 'semantic_scholar'
    
    -- Paper info
    title TEXT NOT NULL,
    abstract TEXT,
    
    -- Authors
    authors JSONB DEFAULT '[]', -- Array of author objects
    author_count INTEGER DEFAULT 0,
    first_author VARCHAR(300),
    
    -- Publication
    venue VARCHAR(500), -- Journal or conference
    venue_type VARCHAR(50), -- 'journal', 'conference', 'preprint'
    volume VARCHAR(50),
    issue VARCHAR(50),
    pages VARCHAR(50),
    doi VARCHAR(100),
    
    -- Classification
    categories TEXT[] DEFAULT '{}', -- arXiv categories
    topic_ids UUID[] DEFAULT '{}',
    fields_of_study TEXT[] DEFAULT '{}',
    
    -- Temporal
    published_date DATE,
    submission_date DATE,
    last_updated DATE,
    
    -- Metrics
    citation_count INTEGER DEFAULT 0,
    reference_count INTEGER DEFAULT 0,
    influential_citation_count INTEGER DEFAULT 0,
    
    -- Links
    pdf_url TEXT,
    paper_url TEXT,
    
    -- Analysis
    is_open_access BOOLEAN DEFAULT false,
    tldr TEXT, -- Semantic Scholar TLDR
    
    -- Market potential
    is_breakthrough BOOLEAN DEFAULT false,
    is_market_worthy BOOLEAN DEFAULT false,
    market_id UUID,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(external_id, source)
);

-- ========================
-- Science Breakthroughs Table
-- ========================
CREATE TABLE IF NOT EXISTS science_breakthroughs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Breakthrough info
    title VARCHAR(500) NOT NULL,
    description TEXT,
    summary TEXT,
    
    -- Classification
    field VARCHAR(200) NOT NULL,
    subfield VARCHAR(200),
    breakthrough_type VARCHAR(100), -- 'discovery', 'invention', 'theory', 'treatment'
    
    -- Related entities
    paper_ids UUID[] DEFAULT '{}',
    topic_ids UUID[] DEFAULT '{}',
    
    -- Organizations
    institutions TEXT[] DEFAULT '{}',
    researchers TEXT[] DEFAULT '{}',
    
    -- Temporal
    announcement_date DATE,
    publication_date DATE,
    
    -- Impact
    impact_level impact_level DEFAULT 'medium',
    global_significance BOOLEAN DEFAULT false,
    
    -- Links
    source_url TEXT,
    image_url TEXT,
    
    -- Market
    is_market_worthy BOOLEAN DEFAULT true,
    market_id UUID,
    
    -- Status
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Science Authors Table
-- ========================
CREATE TABLE IF NOT EXISTS science_authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(255),
    source market_data_source_type DEFAULT 'semantic_scholar',
    
    -- Author info
    name VARCHAR(300) NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    
    -- Affiliations
    affiliations JSONB DEFAULT '[]',
    current_affiliation VARCHAR(500),
    
    -- Metrics
    paper_count INTEGER DEFAULT 0,
    citation_count INTEGER DEFAULT 0,
    h_index INTEGER,
    
    -- Profile
    homepage_url TEXT,
    scholar_url TEXT,
    
    -- Fields
    fields_of_study TEXT[] DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(external_id, source)
);

-- ========================
-- Science News Junction
-- ========================
CREATE TABLE IF NOT EXISTS science_news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_item_id UUID NOT NULL REFERENCES market_data_items(id) ON DELETE CASCADE,
    
    -- Related entities
    paper_ids UUID[] DEFAULT '{}',
    topic_ids UUID[] DEFAULT '{}',
    author_ids UUID[] DEFAULT '{}',
    
    -- Science-specific
    scientific_fields TEXT[] DEFAULT '{}',
    peer_reviewed BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================
-- Insert Default Topics
-- ========================
INSERT INTO science_topics (name, slug, field)
VALUES 
    ('Artificial Intelligence', 'artificial-intelligence', 'Computer Science'),
    ('Machine Learning', 'machine-learning', 'Computer Science'),
    ('Climate Science', 'climate-science', 'Earth Science'),
    ('Genomics', 'genomics', 'Biology'),
    ('Quantum Computing', 'quantum-computing', 'Physics'),
    ('Neuroscience', 'neuroscience', 'Biology'),
    ('Space Exploration', 'space-exploration', 'Astronomy'),
    ('Medicine', 'medicine', 'Medicine'),
    ('Renewable Energy', 'renewable-energy', 'Engineering'),
    ('Biotechnology', 'biotechnology', 'Biology')
ON CONFLICT (slug) DO NOTHING;

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_science_topics_field ON science_topics(field);
CREATE INDEX IF NOT EXISTS idx_science_topics_trending ON science_topics(is_trending) WHERE is_trending = true;
CREATE INDEX IF NOT EXISTS idx_science_topics_name ON science_topics USING GIN(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_science_papers_source ON science_papers(source);
CREATE INDEX IF NOT EXISTS idx_science_papers_published ON science_papers(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_science_papers_citations ON science_papers(citation_count DESC);
CREATE INDEX IF NOT EXISTS idx_science_papers_categories ON science_papers USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_science_papers_title ON science_papers USING GIN(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_science_papers_breakthrough ON science_papers(is_breakthrough) WHERE is_breakthrough = true;

CREATE INDEX IF NOT EXISTS idx_science_breakthroughs_field ON science_breakthroughs(field);
CREATE INDEX IF NOT EXISTS idx_science_breakthroughs_date ON science_breakthroughs(announcement_date DESC);
CREATE INDEX IF NOT EXISTS idx_science_breakthroughs_impact ON science_breakthroughs(impact_level);

CREATE INDEX IF NOT EXISTS idx_science_authors_name ON science_authors USING GIN(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_science_authors_citations ON science_authors(citation_count DESC);

CREATE INDEX IF NOT EXISTS idx_science_news_data_item ON science_news_items(data_item_id);

-- ========================
-- Row Level Security
-- ========================

ALTER TABLE science_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE science_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE science_breakthroughs ENABLE ROW LEVEL SECURITY;
ALTER TABLE science_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE science_news_items ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Science topics viewable by all" ON science_topics FOR SELECT USING (is_active = true);
CREATE POLICY "Science papers viewable by all" ON science_papers FOR SELECT USING (is_active = true);
CREATE POLICY "Science breakthroughs viewable by all" ON science_breakthroughs FOR SELECT USING (is_active = true);
CREATE POLICY "Science authors viewable by all" ON science_authors FOR SELECT USING (is_active = true);
CREATE POLICY "Science news viewable by all" ON science_news_items FOR SELECT USING (true);

-- Service role management
CREATE POLICY "Service role manages science topics" ON science_topics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages science papers" ON science_papers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages science breakthroughs" ON science_breakthroughs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages science authors" ON science_authors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages science news" ON science_news_items FOR ALL USING (auth.role() = 'service_role');

-- ========================
-- Triggers
-- ========================

CREATE TRIGGER update_science_topics_updated_at
    BEFORE UPDATE ON science_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_science_papers_updated_at
    BEFORE UPDATE ON science_papers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_science_breakthroughs_updated_at
    BEFORE UPDATE ON science_breakthroughs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_science_authors_updated_at
    BEFORE UPDATE ON science_authors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- Helper Functions
-- ========================

-- Get trending papers
CREATE OR REPLACE FUNCTION get_trending_science_papers(
    p_field VARCHAR DEFAULT NULL,
    p_days INTEGER DEFAULT 7,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    first_author VARCHAR,
    venue VARCHAR,
    published_date DATE,
    citation_count INTEGER,
    categories TEXT[],
    tldr TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id,
        sp.title,
        sp.first_author,
        sp.venue,
        sp.published_date,
        sp.citation_count,
        sp.categories,
        sp.tldr
    FROM science_papers sp
    WHERE sp.is_active = true
    AND sp.published_date >= CURRENT_DATE - p_days
    AND (p_field IS NULL OR p_field = ANY(sp.fields_of_study))
    ORDER BY sp.citation_count DESC, sp.published_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get recent breakthroughs
CREATE OR REPLACE FUNCTION get_science_breakthroughs(
    p_field VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    field VARCHAR,
    impact_level impact_level,
    announcement_date DATE,
    summary TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sb.id,
        sb.title,
        sb.field,
        sb.impact_level,
        sb.announcement_date,
        sb.summary
    FROM science_breakthroughs sb
    WHERE sb.is_active = true
    AND (p_field IS NULL OR sb.field = p_field)
    ORDER BY sb.announcement_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON TABLE science_topics IS 'Scientific research topics and fields';
COMMENT ON TABLE science_papers IS 'Scientific papers from arXiv, PubMed, Semantic Scholar';
COMMENT ON TABLE science_breakthroughs IS 'Major scientific breakthroughs and discoveries';
COMMENT ON TABLE science_authors IS 'Scientific researchers and authors';
COMMENT ON TABLE science_news_items IS 'Science-related news junction table';
