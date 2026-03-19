import { Node, Edge } from 'reactflow';

export type NodeType = 'reference' | 'script' | 'status';

export interface ReferenceNodeData {
  title: string;
  previewUrl: string;
  url: string;
  viralScore?: number; // Для совместимости со старой версией
  // Новые поля из API
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  taken_at?: string;
  description?: string;
  // Вычисляемые поля
  engagementScore?: number; // ((likes + comments) / views) * 100
  // AI анализ
  aiAnalysis?: {
    goal: string;
    trigger: string;
    structure: string;
  };
  // ID для Supabase (если применимо)
  videoId?: string;
}

export interface ScriptNodeData {
  content: string;
  generated?: boolean;
}

export interface StatusNodeData {
  status: 'in-progress' | 'filmed' | 'published';
}

export type CustomNodeData = ReferenceNodeData | ScriptNodeData | StatusNodeData;

export interface IncomingVideo {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
  receivedAt: Date;
  /** Ручное видео без ссылки (сценарий) */
  is_manual?: boolean;
}

export interface FlowState {
  nodes: Node[];
  edges: Edge[];
  incomingVideos: IncomingVideo[];
}

export interface User {
  id: string;
  name: string;
  color: string;
}
