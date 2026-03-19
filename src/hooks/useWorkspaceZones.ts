import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from './useAuth';

export interface WorkspaceZone {
  id: string;
  name: string;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  sort_order: number;
}

export interface ZoneVideo {
  id: string;
  title: string;
  preview_url: string;
  url: string;
  shortcode?: string;
  zone_id: string | null;
  folder_id?: string; // Для отображения в какой папке находится видео
  position_x: number;
  position_y: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  owner_username?: string;
  status: string;
  taken_at?: string;
  created_at?: string;
  transcript_id?: string;
  transcript_status?: string;
  transcript_text?: string;
  translation_text?: string;
  script_text?: string;
  download_url?: string;
  storage_video_url?: string;
  script_responsible?: string;
  editing_responsible?: string;
  draft_link?: string;
  final_link?: string;
  links?: { label: string; value: string }[];
  responsibles?: { label: string; value: string }[];
  is_manual?: boolean;
}

// Дефолтные зоны
const DEFAULT_ZONES: WorkspaceZone[] = [
  { id: 'incoming', name: 'Входящие', color: '#f97316', position_x: 0, position_y: 0, width: 300, height: 500, sort_order: 0 },
  { id: 'favorites', name: 'Избранное', color: '#475569', position_x: 350, position_y: 0, width: 300, height: 500, sort_order: 1 },
  { id: 'in-progress', name: 'В работе', color: '#f59e0b', position_x: 700, position_y: 0, width: 300, height: 500, sort_order: 2 },
  { id: 'scripts', name: 'Сценарии', color: '#10b981', position_x: 1050, position_y: 0, width: 300, height: 500, sort_order: 3 },
  { id: 'done', name: 'Готово', color: '#334155', position_x: 1400, position_y: 0, width: 300, height: 500, sort_order: 4 },
];

export function useWorkspaceZones() {
  const [zones] = useState<WorkspaceZone[]>(DEFAULT_ZONES);
  const [videos, setVideos] = useState<ZoneVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  // Получаем user_id из контекста авторизации
  const getUserId = useCallback((): string => {
    return user?.id || 'anonymous';
  }, [user]);

  // Загрузка видео из workspace_videos
  const fetchVideos = useCallback(async () => {
    const userId = getUserId();
    
    try {
      const { data, error } = await supabase
        .from('workspace_videos')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: true });

      if (error) {
        console.error('Error fetching workspace videos:', error);
        setVideos([]);
      } else if (data) {
        const transformed: ZoneVideo[] = data.map(v => ({
          id: v.id,
          title: v.caption || 'Без названия',
          preview_url: v.thumbnail_url || '',
          url: `https://instagram.com/reel/${v.shortcode}`,
          zone_id: v.zone_id,
          position_x: 0,
          position_y: 0,
          view_count: v.view_count,
          like_count: v.like_count,
          owner_username: v.owner_username,
          status: 'active',
        }));
        setVideos(transformed);
      }
    } catch (err) {
      console.error('Error loading workspace videos:', err);
    } finally {
      setLoading(false);
    }
  }, [getUserId]);

  // Перемещение видео в зону
  const moveVideoToZone = useCallback(async (videoId: string, zoneId: string | null) => {
    const userId = getUserId();
    
    // Оптимистичное обновление
    setVideos(prev => prev.map(v => 
      v.id === videoId ? { ...v, zone_id: zoneId } : v
    ));

    try {
      await supabase
        .from('workspace_videos')
        .update({ zone_id: zoneId })
        .eq('user_id', userId)
        .eq('id', videoId);
    } catch (err) {
      console.error('Error moving video:', err);
      fetchVideos();
    }
  }, [fetchVideos, getUserId]);

  // Добавление видео в workspace
  const addVideoToWorkspace = useCallback(async (video: {
    videoId: string;
    shortcode?: string;
    thumbnailUrl?: string;
    caption?: string;
    ownerUsername?: string;
    viewCount?: number;
    likeCount?: number;
    zoneId?: string;
  }) => {
    const userId = getUserId();
    
    // Оптимистичное добавление
    const newVideo: ZoneVideo = {
      id: `local-${Date.now()}`,
      title: video.caption || 'Без названия',
      preview_url: video.thumbnailUrl || '',
      url: `https://instagram.com/reel/${video.shortcode}`,
      zone_id: video.zoneId || null,
      position_x: 0,
      position_y: 0,
      view_count: video.viewCount,
      like_count: video.likeCount,
      owner_username: video.ownerUsername,
      status: 'active',
    };
    
    setVideos(prev => [newVideo, ...prev]);

    try {
      const { data } = await supabase
        .from('workspace_videos')
        .upsert({
          user_id: userId,
          video_id: video.videoId,
          shortcode: video.shortcode,
          thumbnail_url: video.thumbnailUrl,
          caption: video.caption,
          owner_username: video.ownerUsername,
          view_count: video.viewCount,
          like_count: video.likeCount,
          zone_id: video.zoneId,
        }, {
          onConflict: 'user_id,video_id'
        })
        .select()
        .single();

      if (data) {
        setVideos(prev => prev.map(v => 
          v.id === newVideo.id ? { ...v, id: data.id } : v
        ));
      }
    } catch (err) {
      console.error('Error adding video to workspace:', err);
    }
  }, [getUserId]);

  // Удаление видео
  const deleteVideo = useCallback(async (videoId: string) => {
    const userId = getUserId();
    
    setVideos(prev => prev.filter(v => v.id !== videoId));

    try {
      await supabase
        .from('workspace_videos')
        .delete()
        .eq('user_id', userId)
        .eq('id', videoId);
    } catch (err) {
      console.error('Error deleting video:', err);
    }
  }, [getUserId]);

  // Получение видео по зоне
  const getVideosByZone = useCallback((zoneId: string | null) => {
    return videos.filter(v => v.zone_id === zoneId);
  }, [videos]);

  // Перезагружаем при смене пользователя
  useEffect(() => {
    if (user) {
      fetchVideos();
    }
  }, [user, fetchVideos]);

  return {
    zones,
    videos,
    loading,
    moveVideoToZone,
    addVideoToWorkspace,
    deleteVideo,
    getVideosByZone,
    refetch: fetchVideos,
  };
}
