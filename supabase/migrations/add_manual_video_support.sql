-- Поддержка «ручных» видео без ссылки (сценарий пишется вручную)
-- video_url и shortcode могут быть null для таких записей
ALTER TABLE saved_videos ALTER COLUMN video_url DROP NOT NULL;
ALTER TABLE saved_videos ALTER COLUMN shortcode DROP NOT NULL;
-- Добавляем флаг для отличия ручных видео
ALTER TABLE saved_videos ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN saved_videos.is_manual IS 'true = видео создано вручную (сценарий без ссылки на Instagram)';
