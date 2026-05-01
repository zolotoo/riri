-- match_full_videos v2 — теперь ищет по embedding'ам ХУКОВ (тематический сигнал),
-- а не по скелетам (структурное описание). Это даёт качество как в
-- handleGenerateAiHook ("ИИ-хуки в ленте"): тема vs тема в одном семантическом
-- пространстве, vector работает корректно.
--
-- JOIN с video_skeletons даёт структурную инфу (формат, секции, типы),
-- subqueries — body/cta тексты того же видео.

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
    h.video_id,
    s.total_seconds,
    s.format_type,
    s.structure_summary,
    s.sections,
    s.hook_type,
    s.cta_type,
    s.pacing,
    s.key_transitions,
    h.niche,
    h.view_count,
    h.tier,
    h.url,
    h.owner_username,
    h.content AS hook_text,
    (SELECT ve.content FROM video_embeddings ve
       WHERE ve.video_id = h.video_id AND ve.part_type = 'body' LIMIT 1) AS body_text,
    (SELECT ve.content FROM video_embeddings ve
       WHERE ve.video_id = h.video_id AND ve.part_type = 'cta' LIMIT 1) AS cta_text,
    1 - (h.embedding <=> query_embedding) AS similarity
  FROM video_embeddings h
  LEFT JOIN video_skeletons s ON s.video_id = h.video_id
  WHERE h.part_type = 'hook'
    AND h.embedding IS NOT NULL
    AND COALESCE(h.view_count, 0) >= COALESCE(min_view_count, 0)
    AND (filter_niche IS NULL OR h.niche = filter_niche)
    AND (min_total_seconds IS NULL OR s.total_seconds >= min_total_seconds)
    AND (max_total_seconds IS NULL OR s.total_seconds <= max_total_seconds)
  ORDER BY h.embedding <=> query_embedding
  LIMIT match_count;
$$;
