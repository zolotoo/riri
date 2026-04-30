-- Fix для backfill UPSERT: partial unique index не работает с ON CONFLICT,
-- заменяем на полный UNIQUE constraint.
-- Применено через Supabase MCP, файл создан для соответствия миграций реальности БД.

DROP INDEX IF EXISTS idx_video_skeletons_video_id_unique;

ALTER TABLE video_skeletons
  ADD CONSTRAINT video_skeletons_video_id_key UNIQUE (video_id);
