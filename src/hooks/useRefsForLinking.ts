import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { ProjectReel } from './useProjectAnalytics';

export type ResponsibleRow = { templateId?: string; label?: string; value: string };

export interface RefForLinking {
  id: string;
  shortcode: string | null;
  folder_id: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  responsibles?: ResponsibleRow[];
}

/**
 * Исходники проекта для привязки к роликам: без shortcode и множество уже привязанных shortcode.
 * Загружает видео по project_id или по folder_id (папки проекта) — т.к. часть видео может иметь folder_id без project_id.
 */
export function useRefsForLinking(projectId: string | null, folderIds: string[] = []) {
  const [refs, setRefs] = useState<RefForLinking[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId && folderIds.length === 0) {
      setRefs([]);
      return;
    }
    setLoading(true);
    const orParts: string[] = [];
    if (projectId) orParts.push(`project_id.eq.${projectId}`);
    if (folderIds.length > 0) orParts.push(`folder_id.in.(${folderIds.join(',')})`);
    const orFilter = orParts.join(',');

    const { data, error } = orFilter
      ? await supabase
          .from('saved_videos')
          .select('id, shortcode, folder_id, caption, thumbnail_url, responsibles, script_responsible, editing_responsible')
          .or(orFilter)
      : await supabase
          .from('saved_videos')
          .select('id, shortcode, folder_id, caption, thumbnail_url, responsibles, script_responsible, editing_responsible')
          .eq('project_id', projectId!);
    if (error) {
      setRefs([]);
      setLoading(false);
      return;
    }
    const templateLabels: Record<string, string> = { 'resp-0': 'За сценарий', 'resp-1': 'За монтаж' };
    setRefs((data || []).map((row: any) => {
      const rows: ResponsibleRow[] = [];
      const arr = row.responsibles as ResponsibleRow[] | null;
      if (Array.isArray(arr)) {
        for (const r of arr) {
          if (r?.value) rows.push({ templateId: r.templateId, label: r.label || templateLabels[r.templateId || ''] || 'Ответственный', value: r.value });
        }
      }
      if (!rows.length && (row.script_responsible || row.editing_responsible)) {
        if (row.script_responsible) rows.push({ templateId: 'resp-0', label: 'За сценарий', value: row.script_responsible });
        if (row.editing_responsible) rows.push({ templateId: 'resp-1', label: 'За монтаж', value: row.editing_responsible });
      }
      return {
        id: row.id,
        shortcode: row.shortcode ?? null,
        folder_id: row.folder_id ?? null,
        caption: row.caption ?? null,
        thumbnail_url: row.thumbnail_url ?? null,
        responsibles: rows,
      };
    }));
    setLoading(false);
  }, [projectId, folderIds.join(',')]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const refsWithoutShortcode = useMemo(() =>
    refs.filter(r => !r.shortcode || r.shortcode.trim() === ''),
    [refs]
  );

  const linkedShortcodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of refs) {
      if (r.shortcode?.trim()) set.add(r.shortcode.trim());
    }
    return set;
  }, [refs]);

  return { refs, refsWithoutShortcode, linkedShortcodes, loading, refetch };
}

/** Ролики, у которых нет привязанного исходника в этом проекте */
export function reelsWithoutLinkedRef(reels: ProjectReel[], linkedShortcodes: Set<string>): ProjectReel[] {
  return reels.filter(r => !linkedShortcodes.has(r.shortcode));
}
