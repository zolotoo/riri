import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import type { Slide } from '../components/carousel-editor/types';

export interface ProjectCarousel {
  id: string;
  project_id: string;
  name: string;
  slides: Slide[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useProjectCarousels(projectId: string | null, userId: string | null) {
  const [carousels, setCarousels] = useState<ProjectCarousel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setCarousels([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('project_carousels')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (!error && data) setCarousels(data as ProjectCarousel[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (id: string, name: string, slides: Slide[]) => {
    if (!projectId) return;
    const now = new Date().toISOString();
    const row = { id, project_id: projectId, name, slides, updated_by: userId, updated_at: now };
    const existing = carousels.find((c) => c.id === id);
    if (existing) {
      const { data } = await supabase.from('project_carousels').update(row).eq('id', id).select().single();
      if (data) setCarousels((prev) => prev.map((c) => c.id === id ? data as ProjectCarousel : c));
    } else {
      const { data } = await supabase.from('project_carousels').insert({ ...row, created_by: userId, created_at: now }).select().single();
      if (data) setCarousels((prev) => [data as ProjectCarousel, ...prev].slice(0, 20));
    }
  }, [projectId, userId, carousels]);

  const remove = useCallback(async (id: string) => {
    await supabase.from('project_carousels').delete().eq('id', id);
    setCarousels((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { carousels, loading, save, remove };
}
