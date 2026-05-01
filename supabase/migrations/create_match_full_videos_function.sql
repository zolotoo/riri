-- match_full_videos — поиск top-N виральных видео ПОЛНОСТЬЮ:
-- скелет (структурная сигнатура) + hook + body + cta тексты одного видео.
-- Используется в handleGenerateFullScript: каждый retrieved результат
-- → отдельный variant сценария (rewrite оригинала под тему юзера).

CREATE OR REPLACE FUNCTION match_full_videos(
  query_embedding vector(1024),
  match_count int DEFAULT 3,
  filter_niche text DEFAULT NULL,
  min_view_count int DEFAULT 50000,
  min_total_seconds int DEFAULT NULL,
  max_total_seconds int DEFAULT NULL
)
RETURNS TABLE (
  video_id uuid,
  total_seconds integer,
  format_type text,
  structure_summary text,
  sections jsonb,
  hook_type text,
  cta_type text,
  pacing text,
  key_transitions jsonb,
  niche text,
  view_count integer,
  tier text,
  url text,
  owner_username text,
  hook_text text,
  body_text text,
  cta_text text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    s.video_id,
    s.total_seconds,
    s.format_type,
    s.structure_summary,
    s.sections,
    s.hook_type,
    s.cta_type,
    s.pacing,
    s.key_transitions,
    s.niche,
    s.view_count,
    s.tier,
    s.url,
    s.owner_username,
    (SELECT ve.content FROM video_embeddings ve
       WHERE ve.video_id = s.video_id AND ve.part_type = 'hook' LIMIT 1) AS hook_text,
    (SELECT ve.content FROM video_embeddings ve
       WHERE ve.video_id = s.video_id AND ve.part_type = 'body' LIMIT 1) AS body_text,
    (SELECT ve.content FROM video_embeddings ve
       WHERE ve.video_id = s.video_id AND ve.part_type = 'cta' LIMIT 1) AS cta_text,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM video_skeletons s
  WHERE s.embedding IS NOT NULL
    AND COALESCE(s.view_count, 0) >= COALESCE(min_view_count, 0)
    AND (filter_niche IS NULL OR s.niche = filter_niche)
    AND (min_total_seconds IS NULL OR s.total_seconds >= min_total_seconds)
    AND (max_total_seconds IS NULL OR s.total_seconds <= max_total_seconds)
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;
