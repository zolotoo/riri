-- ─── Analytics: per-project Instagram tracking ──────────────────────────────

-- 1. Add instagram_username to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS analytics_instagram_username TEXT;

-- 2. Table: stores all reels belonging to a project's Instagram account
CREATE TABLE IF NOT EXISTS project_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  shortcode TEXT NOT NULL,
  instagram_id TEXT,
  thumbnail_url TEXT,
  video_url TEXT,
  caption TEXT,
  taken_at BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, shortcode)
);

-- 3. Table: daily metric snapshots per reel (one row per update)
CREATE TABLE IF NOT EXISTS reel_metrics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES project_reels(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  snapshotted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_reels_project_id ON project_reels(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reels_taken_at ON project_reels(taken_at);
CREATE INDEX IF NOT EXISTS idx_reel_metrics_reel_id ON reel_metrics_snapshots(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_metrics_project_id ON reel_metrics_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_reel_metrics_snapshotted_at ON reel_metrics_snapshots(snapshotted_at);

-- RLS (open policies, same pattern as the rest of the app)
ALTER TABLE project_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_metrics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_reels_all" ON project_reels;
CREATE POLICY "project_reels_all" ON project_reels FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "reel_metrics_all" ON reel_metrics_snapshots;
CREATE POLICY "reel_metrics_all" ON reel_metrics_snapshots FOR ALL USING (true) WITH CHECK (true);
