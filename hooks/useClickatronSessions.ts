"use client";

import { useEffect, useState } from 'react';

export interface ClickatronSessionSummary {
  sessionId: string;
  title: string;
  updatedAt: string;
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
        const response = await fetch('/api/services/clickatron/history');
        if (!response.ok) {
            throw new Error('Failed to fetch history');
        }
        const sessions = await response.json();
        if (!cancelled) setData(sessions.history);
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
