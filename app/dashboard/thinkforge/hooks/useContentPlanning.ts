'use client';

import { useState, useCallback, useEffect } from 'react';
import { ContentCard } from '@/app/dashboard/thinkforge/types';
import { toast } from '@/hooks/use-toast';

export interface UseContentPlanningReturn {
  cards: ContentCard[];
  loading: boolean;
  error: string | null;
  createCard: (card: Omit<ContentCard, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ContentCard | null>;
  updateCard: (id: string, updates: Partial<ContentCard>) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  fetchCards: () => Promise<void>;
  refreshCards: () => Promise<void>;
  refreshScriptPreview: (cardId: string) => Promise<void>;
}

const LS_CONTENT_CARDS = 'thinkforge_content_cards';

function saveLocal(cards: ContentCard[]) {
  try {
    localStorage.setItem(LS_CONTENT_CARDS, JSON.stringify(cards));
  } catch (e) {
    console.warn('[useContentPlanning] saveLocal failed:', e);
  }
}

function getLocal(): ContentCard[] {
  try {
    const raw = localStorage.getItem(LS_CONTENT_CARDS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[useContentPlanning] getLocal failed:', e);
    return [];
  }
}

function normalizeCard(card: ContentCard): ContentCard {
  return {
    ...card,
    customTags: card.customTags || [],
    plannedDates: card.plannedDates || (card.date ? [card.date] : [new Date().toISOString()]),
    tags: card.tags || [],
  };
}

async function fetchScriptPreview(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/services/thinkforge/script/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, scriptId: 'default' }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const script = data?.script || data;
    
    if (script.content) return script.content;
    if (script.blocks && Array.isArray(script.blocks)) {
      return script.blocks
        .map((block: any) => {
          if (!block.content) return '';
          return Array.isArray(block.content)
            ? block.content.map((c: any) => c.text || '').join(' ')
            : block.content;
        })
        .filter(Boolean)
        .join(' ');
    }
    return null;
  } catch {
    return null;
  }
}

export function useContentPlanning(): UseContentPlanningReturn {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await fetch('/api/services/thinkforge/content-planning', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        const local = getLocal();
        setCards(local);
        if (showLoading && local.length > 0) {
          toast({
            title: 'Using offline data',
            description: 'Could not fetch from server, showing cached content.',
            variant: 'default',
          });
        }
        return;
      }

      const data = await res.json();
      const fetchedCards: ContentCard[] = Array.isArray(data.cards) ? data.cards : [];
      const normalizedCards = fetchedCards.map(normalizeCard);

      // Fetch script previews for cards that need them
      const cardsWithPreviews = await Promise.all(
        normalizedCards.map(async (card) => {
          if (card.sessionId && !card.scriptPreview) {
            const preview = await fetchScriptPreview(card.sessionId);
            if (preview) {
              return { ...card, scriptPreview: preview.substring(0, 300) };
            }
          }
          return card;
        })
      );

      setCards(cardsWithPreviews);
      saveLocal(cardsWithPreviews);
    } catch (err) {
      const local = getLocal();
      setCards(local);
      if (showLoading) {
        setError(err instanceof Error ? err.message : 'Failed to fetch content cards');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadCards(true);
  }, [loadCards]);

  const fetchCards = useCallback(() => loadCards(true), [loadCards]);
  const refreshCards = useCallback(() => loadCards(false), [loadCards]);

  const createCard = useCallback(async (
    cardData: Omit<ContentCard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentCard | null> => {
    const now = new Date().toISOString();
    const newCard: ContentCard = normalizeCard({
      ...cardData,
      id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    });

    // Optimistic update
    setCards(prev => {
      const updated = [...prev, newCard];
      saveLocal(updated);
      return updated;
    });

    try {
      const res = await fetch('/api/services/thinkforge/content-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: newCard }),
      });

      if (!res.ok) throw new Error(`Failed to create card: ${res.status}`);

      const data = await res.json();
      const createdCard: ContentCard = normalizeCard(data.card || newCard);

      setCards(prev => {
        const updated = prev.map(c => c.id === newCard.id ? createdCard : c);
        saveLocal(updated);
        return updated;
      });

      return createdCard;
    } catch (err) {
      setCards(prev => prev.filter(c => c.id !== newCard.id));
      toast({
        title: 'Failed to create card',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, []);

  const updateCard = useCallback(async (
    id: string,
    updates: Partial<ContentCard>
  ): Promise<boolean> => {
    const card = cards.find(c => c.id === id);
    if (!card) return false;

    const updatedCard: ContentCard = normalizeCard({
      ...card,
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    // Optimistic update
    setCards(prev => {
      const updated = prev.map(c => c.id === id ? updatedCard : c);
      saveLocal(updated);
      return updated;
    });

    try {
      const res = await fetch(`/api/services/thinkforge/content-planning/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) throw new Error(`Failed to update card: ${res.status}`);

      const data = await res.json();
      const serverCard: ContentCard = normalizeCard(data.card || updatedCard);

      setCards(prev => {
        const updated = prev.map(c => c.id === id ? serverCard : c);
        saveLocal(updated);
        return updated;
      });

      return true;
    } catch (err) {
      setCards(prev => prev.map(c => c.id === id ? card : c));
      toast({
        title: 'Failed to update card',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [cards]);

  const deleteCard = useCallback(async (id: string): Promise<boolean> => {
    const card = cards.find(c => c.id === id);
    if (!card) return false;

    // Optimistic update
    setCards(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveLocal(updated);
      return updated;
    });

    try {
      const res = await fetch(`/api/services/thinkforge/content-planning/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error(`Failed to delete card: ${res.status}`);
      return true;
    } catch (err) {
      setCards(prev => [...prev, card]);
      toast({
        title: 'Failed to delete card',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [cards]);

  const refreshScriptPreview = useCallback(async (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card?.sessionId) return;

    const preview = await fetchScriptPreview(card.sessionId);
    if (preview) {
      await updateCard(cardId, { scriptPreview: preview.substring(0, 300) });
    }
  }, [cards, updateCard]);

  return {
    cards,
    loading,
    error,
    createCard,
    updateCard,
    deleteCard,
    fetchCards,
    refreshCards,
    refreshScriptPreview,
  };
}

