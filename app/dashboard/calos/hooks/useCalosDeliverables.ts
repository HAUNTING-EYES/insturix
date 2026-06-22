'use client';

import { useState, useCallback, useEffect } from 'react';
import { ContentCard } from '@/app/dashboard/thinkforge/types';
import { toast } from '@/hooks/use-toast';

const BASE = '/api/services/calos/deliverables';

export interface UseCalosDeliverablesReturn {
  cards: ContentCard[];
  loading: boolean;
  error: string | null;
  createCard: (card: Omit<ContentCard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ContentCard | null>;
  updateCard: (id: string, updates: Partial<ContentCard>) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * CalOS deliverables hook — the calendar's data source, scoped to a client/brand.
 * Talks to the standalone CalOS deliverables service (ownerUserId is derived server-side
 * from the Clerk session; brandId selects the client). Pass brandId=null to stay idle
 * until a client is selected. Optimistic with rollback; failures surface a toast (fail-loud).
 */
export function useCalosDeliverables(brandId: string | null): UseCalosDeliverablesReturn {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!brandId) {
      setCards([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load deliverables (${res.status})`);
      const data = await res.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deliverables');
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  const createCard = useCallback(
    async (cardData: Omit<ContentCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContentCard | null> => {
      if (!brandId) {
        toast({
          title: 'Select a client first',
          description: 'Pick a client brand before adding content.',
          variant: 'destructive',
        });
        return null;
      }
      try {
        const res = await fetch(BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, card: cardData }),
        });
        if (!res.ok) throw new Error(`Failed to create (${res.status})`);
        const data = await res.json();
        const created: ContentCard = data.card;
        setCards((prev) => [...prev, created]);
        return created;
      } catch (err) {
        toast({
          title: 'Failed to create card',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        return null;
      }
    },
    [brandId]
  );

  const updateCard = useCallback(
    async (id: string, updates: Partial<ContentCard>): Promise<boolean> => {
      if (!brandId) return false;
      const prev = cards;
      setCards((cur) => cur.map((c) => (c.id === id ? { ...c, ...updates } : c))); // optimistic
      try {
        const res = await fetch(`${BASE}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, updates }),
        });
        if (!res.ok) throw new Error(`Failed to update (${res.status})`);
        const data = await res.json();
        const server: ContentCard = data.card;
        setCards((cur) => cur.map((c) => (c.id === id ? server : c)));
        return true;
      } catch (err) {
        setCards(prev); // rollback
        toast({
          title: 'Failed to update card',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        return false;
      }
    },
    [brandId, cards]
  );

  const deleteCard = useCallback(
    async (id: string): Promise<boolean> => {
      if (!brandId) return false;
      const prev = cards;
      setCards((cur) => cur.filter((c) => c.id !== id)); // optimistic
      try {
        const res = await fetch(`${BASE}/${id}?brandId=${encodeURIComponent(brandId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
        return true;
      } catch (err) {
        setCards(prev); // rollback
        toast({
          title: 'Failed to delete card',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
        return false;
      }
    },
    [brandId, cards]
  );

  return { cards, loading, error, createCard, updateCard, deleteCard, refresh: load };
}
