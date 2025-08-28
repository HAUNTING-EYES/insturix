// Hook to fetch Clickatron2 sessions from IndexedDB (client-side only)
"use client";

import { useEffect, useState } from 'react';
import { idbManager } from '@/lib/idb';

export interface ClickatronSessionSummary {
  id: string;            // full key e.g. clickatron2_task_...
  taskId: string;        // extracted task id
  videoIdea: string;
  stage: string;
  selectedDirection?: string;
  presetName?: string;
  timestamp: number;
}

export function useClickatronSessions() {
  const [data, setData] = useState<ClickatronSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const sessions = await idbManager.getAllSessions();
        const filtered = sessions
          .filter(s => s.id.startsWith('clickatron2_'))
          .map(s => {
            const d = s.data || {};
            return {
              id: s.id,
              taskId: s.id.replace('clickatron2_', ''),
              videoIdea: d.videoIdea || '(untitled)',
              stage: d.stage || 'ideation',
              selectedDirection: d.selectedDirection,
              presetName: d.selectedPreset?.name,
              timestamp: d.timestamp || s.timestamp,
            } as ClickatronSessionSummary;
          })
          .sort((a, b) => b.timestamp - a.timestamp);
        if (!cancelled) setData(filtered);
      } catch (e:any) {
        if (!cancelled) setError(e?.message || 'failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
