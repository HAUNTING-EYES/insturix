'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
}

const LS_CONTENT_CARDS = 'thinkforge_content_cards';

// Local storage fallback
function saveLocal(cards: ContentCard[]) {
  try {
    localStorage.setItem(LS_CONTENT_CARDS, JSON.stringify(cards));
  } catch {}
}

function getLocal(): ContentCard[] {
  try {
    const raw = localStorage.getItem(LS_CONTENT_CARDS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useContentPlanning(): UseContentPlanningReturn {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef<string>('');

  // Load cards on mount
  useEffect(() => {
    fetchCards();
  }, []);

  // Fetch script preview for a card
  const fetchScriptPreview = useCallback(async (sessionId: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/services/thinkforge/script/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const script = data?.script || data;
      
      // Extract text content from script
      let text = '';
      if (script.content) {
        text = script.content;
      } else if (script.blocks && Array.isArray(script.blocks)) {
        // Extract text from blocks
        text = script.blocks
          .map((block: any) => {
            if (block.content) {
              if (Array.isArray(block.content)) {
                return block.content.map((c: any) => c.text || '').join(' ');
              }
              return block.content;
            }
            return '';
          })
          .filter(Boolean)
          .join(' ');
      }

      return text || null;
    } catch {
      return null;
    }
  }, []);

  // Fetch cards from API
  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/services/thinkforge/content-planning', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        // Fallback to local storage if API fails
        const local = getLocal();
        setCards(local);
        if (local.length > 0) {
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
      
      // Ensure all cards have required fields
      const normalizedCards = fetchedCards.map(card => ({
        ...card,
        customTags: card.customTags || [],
        plannedDates: card.plannedDates || (card.date ? [card.date] : [new Date().toISOString()]),
        tags: card.tags || [],
      }));

      // Fetch script previews for cards with sessionId
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
      lastSavedRef.current = JSON.stringify(cardsWithPreviews);
    } catch (err) {
      // Fallback to local storage
      const local = getLocal();
      setCards(local);
      setError(err instanceof Error ? err.message : 'Failed to fetch content cards');
    } finally {
      setLoading(false);
    }
  }, [fetchScriptPreview]);

  // Refresh cards (same as fetch but doesn't show loading state initially)
  const refreshCards = useCallback(async () => {
    try {
      const res = await fetch('/api/services/thinkforge/content-planning', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) return;

      const data = await res.json();
      const fetchedCards: ContentCard[] = Array.isArray(data.cards) ? data.cards : [];
      
      const normalizedCards = fetchedCards.map(card => ({
        ...card,
        customTags: card.customTags || [],
        plannedDates: card.plannedDates || (card.date ? [card.date] : [new Date().toISOString()]),
        tags: card.tags || [],
      }));

      setCards(normalizedCards);
      saveLocal(normalizedCards);
      lastSavedRef.current = JSON.stringify(normalizedCards);
    } catch (err) {
      // Silent fail on refresh
    }
  }, []);

  // Create new card
  const createCard = useCallback(async (
    cardData: Omit<ContentCard, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ContentCard | null> => {
    const now = new Date().toISOString();
    const newCard: ContentCard = {
      ...cardData,
      id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      customTags: cardData.customTags || [],
      plannedDates: cardData.plannedDates || (cardData.date ? [cardData.date] : [now]),
      tags: cardData.tags || [],
    };

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

      if (!res.ok) {
        throw new Error(`Failed to create card: ${res.status}`);
      }

      const data = await res.json();
      const createdCard: ContentCard = data.card || newCard;

      // Update with server response
      setCards(prev => {
        const updated = prev.map(c => c.id === newCard.id ? createdCard : c);
        saveLocal(updated);
        return updated;
      });

      return createdCard;
    } catch (err) {
      // Revert optimistic update on error
      setCards(prev => prev.filter(c => c.id !== newCard.id));
      toast({
        title: 'Failed to create card',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, []);

  // Update card
  const updateCard = useCallback(async (
    id: string,
    updates: Partial<ContentCard>
  ): Promise<boolean> => {
    const card = cards.find(c => c.id === id);
    if (!card) return false;

    const updatedCard: ContentCard = {
      ...card,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

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

      if (!res.ok) {
        throw new Error(`Failed to update card: ${res.status}`);
      }

      const data = await res.json();
      const serverCard: ContentCard = data.card || updatedCard;

      // Update with server response
      setCards(prev => {
        const updated = prev.map(c => c.id === id ? serverCard : c);
        saveLocal(updated);
        return updated;
      });

      return true;
    } catch (err) {
      // Revert optimistic update on error
      setCards(prev => {
        const updated = prev.map(c => c.id === id ? card : c);
        saveLocal(updated);
        return updated;
      });
      toast({
        title: 'Failed to update card',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [cards]);

  // Delete card
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

      if (!res.ok) {
        throw new Error(`Failed to delete card: ${res.status}`);
      }

      return true;
    } catch (err) {
      // Revert optimistic update on error
      setCards(prev => {
        const updated = [...prev, card];
        saveLocal(updated);
        return updated;
      });
      toast({
        title: 'Failed to delete card',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      return false;
    }
  }, [cards]);

  // Refresh script preview for a card
  const refreshScriptPreview = useCallback(async (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card?.sessionId) return;

    const preview = await fetchScriptPreview(card.sessionId);
    if (preview) {
      await updateCard(cardId, { scriptPreview: preview.substring(0, 300) });
    }
  }, [cards, fetchScriptPreview, updateCard]);

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

