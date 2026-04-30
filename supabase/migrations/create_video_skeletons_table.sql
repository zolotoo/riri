-- Таблица video_skeletons — структурные скелеты вирусных видео для RAG.
-- В отличие от video_embeddings (хуки — текстовые фрагменты), здесь хранится
-- структурная сигнатура видео: длина, тип формата, секции с тайм-кодами,
-- тип хука, тип CTA, темп. Embedding строится по сериализованному скелету
-- и используется для поиска похожих структур при генерации полного сценария
-- (хук + тело + концовка одним проходом, JARVIS-style выбор из 5 вариантов).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS video_skeletons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,

  -- Структурное описание (заполняется extractSkeleton через Gemini)
  total_seconds INTEGER,
  format_type TEXT,
  -- talking_head | tutorial | story | listicle | skit | opinion | reaction | showcase
  structure_summary TEXT,
  -- однострочное описание скелета: "setup → reveal → loop back to hook"
  sections JSONB,
  -- [{"start_sec":0,"end_sec":3,"type":"hook","purpose":"..."}, ...]
  -- types: hook | context | development | climax | resolution | cta | transition
  hook_type TEXT,
  -- curiosity | shock | question | pattern_interrupt | jenga | story_setup | none
  cta_type TEXT,
  -- soft_loop | save_bait | comment_bait | profile_visit | none
  pacing TEXT,
  -- fast | medium | slow
  key_transitions JSONB,
  -- ["на 8 секунде смена плана", ...]

  -- Метрики виральности (для фильтрации/ранжирования при retrieval)
  niche TEXT,
  view_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  share_to_view_ratio NUMERIC,
  tier TEXT,
  -- '1m+' | '500k+' | '100k+' | '50k+'
  taken_at BIGINT,
  -- из videos.taken_at (Unix ms) — для фильтра свежести

  -- Источник
  url TEXT,
  owner_username TEXT,

  -- Embedding (того же формата что и в video_embeddings: Jina v3, 1024-dim)
  embedding VECTOR(1024),
  embedding_text TEXT,
  -- сериализованный скелет, который был embed-нут (для дебага и переиндексации)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для фильтров retrieval
CREATE INDEX IF NOT EXISTS idx_video_skeletons_video_id
  ON video_skeletons(video_id);
CREATE INDEX IF NOT EXISTS idx_video_skeletons_niche
  ON video_skeletons(niche);
CREATE INDEX IF NOT EXISTS idx_video_skeletons_view_count
  ON video_skeletons(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_video_skeletons_taken_at
  ON video_skeletons(taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_skeletons_format_type
  ON video_skeletons(format_type);
CREATE INDEX IF NOT EXISTS idx_video_skeletons_total_seconds
  ON video_skeletons(total_seconds);

-- HNSW для cosine similarity по embedding
CREATE INDEX IF NOT EXISTS idx_video_skeletons_embedding_hnsw
  ON video_skeletons
  USING hnsw (embedding vector_cosine_ops);

-- Один скелет на одно видео (idempotency для backfill).
-- Используем CONSTRAINT, а не partial unique index, чтобы работал ON CONFLICT в UPSERT.
ALTER TABLE video_skeletons
  ADD CONSTRAINT video_skeletons_video_id_key UNIQUE (video_id);

-- Триггер обновления updated_at
CREATE OR REPLACE FUNCTION update_video_skeletons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_video_skeletons_updated_at ON video_skeletons;
CREATE TRIGGER trg_video_skeletons_updated_at
  BEFORE UPDATE ON video_skeletons
  FOR EACH ROW EXECUTE FUNCTION update_video_skeletons_updated_at();

-- RLS: чтение через SELECT/RPC всем, запись только service_role
ALTER TABLE video_skeletons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_skeletons_read_all" ON video_skeletons;
CREATE POLICY "video_skeletons_read_all" ON video_skeletons
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "video_skeletons_service_role_write" ON video_skeletons;
CREATE POLICY "video_skeletons_service_role_write" ON video_skeletons
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
