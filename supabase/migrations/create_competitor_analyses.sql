-- Таблицы для фичи «Анализ конкурента»
-- analyses — заголовок разбора, competitor_hooks — залётные хуки конкурента,
-- user_reel_snapshots — транскрипты пользователя для анализа tone of voice.
-- Намеренно без векторных эмбеддингов — поиск идёт по project_id/analysis_id.

CREATE TABLE IF NOT EXISTS competitor_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  competitor_username TEXT NOT NULL,
  user_username TEXT,
  reel_count INTEGER NOT NULL DEFAULT 24,
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | fetching_competitor | transcribing_competitor | extracting_hooks
  -- | fetching_user | transcribing_user | analyzing_user | generating_ideas
  -- | ready | error | no_virals
  status_message TEXT,
  error_message TEXT,
  competitor_avg_views NUMERIC,
  competitor_median_views NUMERIC,
  competitor_avg_bottom3_views NUMERIC,
  viral_threshold_multiplier NUMERIC DEFAULT 5,
  user_tone_profile JSONB,
  generated_ideas JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_analyses_project_user
  ON competitor_analyses(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analyses_created_at
  ON competitor_analyses(created_at DESC);

CREATE TABLE IF NOT EXISTS competitor_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES competitor_analyses(id) ON DELETE CASCADE,
  shortcode TEXT NOT NULL,
  url TEXT,
  thumbnail_url TEXT,
  hook_text TEXT,
  transcript_text TEXT,
  caption TEXT,
  view_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  taken_at TIMESTAMPTZ,
  viral_multiplier NUMERIC,
  niche TEXT,
  is_fallback BOOLEAN DEFAULT FALSE,
  rank INTEGER,
  transcript_id TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(analysis_id, shortcode)
);

CREATE INDEX IF NOT EXISTS idx_competitor_hooks_analysis
  ON competitor_hooks(analysis_id);

CREATE TABLE IF NOT EXISTS user_reel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES competitor_analyses(id) ON DELETE CASCADE,
  shortcode TEXT NOT NULL,
  url TEXT,
  thumbnail_url TEXT,
  transcript_text TEXT,
  caption TEXT,
  view_count INTEGER,
  like_count INTEGER,
  taken_at TIMESTAMPTZ,
  transcript_id TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(analysis_id, shortcode)
);

CREATE INDEX IF NOT EXISTS idx_user_reel_snapshots_analysis
  ON user_reel_snapshots(analysis_id);

ALTER TABLE competitor_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reel_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_analyses read"   ON competitor_analyses FOR SELECT USING (true);
CREATE POLICY "competitor_analyses insert" ON competitor_analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "competitor_analyses update" ON competitor_analyses FOR UPDATE USING (true);
CREATE POLICY "competitor_analyses delete" ON competitor_analyses FOR DELETE USING (true);

CREATE POLICY "competitor_hooks read"   ON competitor_hooks FOR SELECT USING (true);
CREATE POLICY "competitor_hooks insert" ON competitor_hooks FOR INSERT WITH CHECK (true);
CREATE POLICY "competitor_hooks update" ON competitor_hooks FOR UPDATE USING (true);
CREATE POLICY "competitor_hooks delete" ON competitor_hooks FOR DELETE USING (true);

CREATE POLICY "user_reel_snapshots read"   ON user_reel_snapshots FOR SELECT USING (true);
CREATE POLICY "user_reel_snapshots insert" ON user_reel_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "user_reel_snapshots update" ON user_reel_snapshots FOR UPDATE USING (true);
CREATE POLICY "user_reel_snapshots delete" ON user_reel_snapshots FOR DELETE USING (true);
