/**
 * useMyContent — the unified "My Content" feed. Aggregates every service's
 * per-user list endpoint in parallel (Promise.allSettled, so one service being
 * down never breaks the page) and normalizes each into a common ContentItem.
 *
 * CalOS is intentionally NOT a source: its "posts" are ThinkForge scripts +
 * Clickatron images, which already appear under their own types.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

export type ContentType = 'image' | 'video' | 'audio' | 'music' | 'script' | 'analysis';

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  createdAt: number; // epoch ms
  tool: string;
  href: string;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const ms = (v: any): number => {
  if (typeof v === 'number') return v;
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

// Each source: fetch + normalize. Defensive — unknown fields degrade gracefully.
const SOURCES: Array<() => Promise<ContentItem[]>> = [
  // Uploaded media (images / videos / audio)
  async () => {
    const d = await getJson('/api/services/editron/media/list');
    return (d.assets || []).map((a: any): ContentItem => ({
      id: `media_${a.assetId || a.id}`,
      type: (a.type === 'audio' ? 'audio' : a.type === 'image' ? 'image' : 'video'),
      title: a.name || 'Untitled',
      subtitle: a.pinned ? 'Pinned' : undefined,
      thumbnail: a.thumbnail || (a.type === 'image' ? a.path : undefined),
      createdAt: ms(a.lastModified),
      tool: 'Upload',
      href: '/dashboard/editron',
    }));
  },
  // Clickatron image sessions
  async () => {
    const d = await getJson('/api/services/clickatron/history?limit=50');
    return (d.history || []).map((h: any): ContentItem => ({
      id: `click_${h.sessionId}`,
      type: 'image',
      title: h.title || 'Untitled Session',
      subtitle: h.variationsCount ? `${h.variationsCount} image${h.variationsCount === 1 ? '' : 's'}` : undefined,
      createdAt: ms(h.updatedAt),
      tool: 'Clickatron',
      href: `/dashboard/clickatron?session=${h.sessionId}`,
    }));
  },
  // Editron video projects
  async () => {
    const d = await getJson('/api/services/editron/projects/list?limit=50');
    return (d.projects || []).map((p: any): ContentItem => ({
      id: `proj_${p.projectId || p.id || p._id}`,
      type: 'video',
      title: p.name || p.title || 'Untitled Project',
      thumbnail: p.thumbnail,
      createdAt: ms(p.updatedAt || p.createdAt),
      tool: 'Editron',
      href: `/dashboard/editron/${p.projectId || p.id || p._id}`,
    }));
  },
  // Musitron tracks
  async () => {
    const d = await getJson('/api/services/musitron/history?limit=50');
    return (d.data || d.history || []).map((m: any): ContentItem => ({
      id: `music_${m._id || m.id}`,
      type: 'music',
      title: m.title || m.prompt || 'Untitled Track',
      thumbnail: m.thumbnail,
      createdAt: ms(m.createdAt),
      tool: 'Musitron',
      href: '/dashboard/musitron',
    }));
  },
  // Alyzitron analyses
  async () => {
    const d = await getJson('/api/services/alyzitron/analyses?page=1&limit=50');
    return (d.data || d.analyses || []).map((a: any): ContentItem => ({
      id: `alyz_${a._id || a.id || a.taskId}`,
      type: 'analysis',
      title: a.title || a.originalFilename || a.metadata?.originalFilename || 'Video Analysis',
      subtitle: a.status && a.status !== 'completed' ? a.status : undefined,
      thumbnail: a.thumbnail,
      createdAt: ms(a.createdAt),
      tool: 'Alyzitron',
      href: `/dashboard/alyzitron`,
    }));
  },
  // ThinkForge scripts
  async () => {
    const d = await getJson('/api/services/thinkforge/script/list-all?limit=100');
    return (d.scripts || []).map((s: any): ContentItem => ({
      id: `script_${s.sessionId}_${s.scriptId}`,
      type: 'script',
      title: s.title || 'Untitled Script',
      subtitle: s.documentType,
      createdAt: ms(s.updatedAt || s.createdAt),
      tool: 'ThinkForge',
      href: `/dashboard/thinkforge?session=${s.sessionId}`,
    }));
  },
];

async function fetchAllContent(): Promise<ContentItem[]> {
  const results = await Promise.allSettled(SOURCES.map((fn) => fn()));
  const items: ContentItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
    else console.warn('[MyContent] source failed:', r.reason);
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export function useMyContent() {
  const { userId } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user', 'my-content'],
    queryFn: fetchAllContent,
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
  return {
    items: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
