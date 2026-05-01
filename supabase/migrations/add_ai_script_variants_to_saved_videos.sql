-- Хранить 3 сгенерённых RiRi сценария per-video, чтобы юзер мог вернуться
-- к ним при следующем открытии видео без повторной генерации.
ALTER TABLE saved_videos
  ADD COLUMN IF NOT EXISTS ai_script_variants JSONB;
