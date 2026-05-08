"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

/**
 * Extract all HTTP(S) URLs from text.
 * Handles query params, fragments, ports, and encoded characters.
 * Rejects localhost, file://, ftp://, and other non-http protocols.
 */
const URL_EXTRACT_REGEX = /https?:\/\/(?!localhost\b)[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_EXTRACT_REGEX) || [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of matches) {
    let clean = match.replace(/[.,;:!?)]+$/, '');
    try {
      const url = new URL(clean);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    } catch {}
  }
  return urls;
}

export interface UrlBriefResult {
  title: string;
  summary: string;
  keyTopics?: string[];
  targetAudience?: string;
  suggestedAngles?: string[];
  platform?: string;
  contentType?: string;
}

interface PromptPanelProps {
  prompt: string;
  setPrompt: (v: string) => void;
  loading: boolean;
  hasSubmitted: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onRegenerate: () => void;
  onManualSetup?: () => void;
  onUrlSubmit?: (urls: string[], originalPrompt: string) => void;
  briefLoading?: boolean;
  briefResults?: UrlBriefResult[] | null;
}

export const PromptPanel: React.FC<PromptPanelProps> = ({
  prompt,
  setPrompt,
  loading,
  hasSubmitted,
  onSubmit,
  onRegenerate,
  onManualSetup,
  onUrlSubmit,
  briefLoading = false,
  briefResults = null,
}) => {
  const formRef = React.useRef<HTMLFormElement | null>(null);

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && !briefLoading) {
        formRef.current?.requestSubmit();
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = extractUrls(prompt);
    if (urls.length > 0 && onUrlSubmit) {
      onUrlSubmit(urls, prompt);
    } else {
      onSubmit(e);
    }
  };

  const isProcessing = loading || briefLoading;

  return (
    <div className="prompt-view" id="s1" style={{ display: hasSubmitted ? 'none' : 'flex' }}>
      <div className="prompt-hero">
        <h1>Script</h1>
        <p>Describe your idea, drop a link, or name your niche</p>
      </div>
      
      <form ref={formRef} onSubmit={handleFormSubmit} className="prompt-box" style={{ width: '100%', display: 'block' }}>
        <textarea 
          id="promptInput" 
          rows={3} 
          placeholder="A behind-the-scenes look at how F1 pit crews train under extreme pressure..."
          value={prompt}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <div className="prompt-actions">
          <span className="mono" style={{ color: 'var(--text-faint)' }}>enter ↵</span>
          <button 
            type="submit" 
            className="prompt-cta" 
            disabled={isProcessing || !prompt.trim()}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : '→'}
          </button>
        </div>
      </form>
      
      <button 
        type="button" 
        className="enhance-btn"
        disabled={isProcessing}
        onClick={async () => {
          const niche = prompt.trim();
          if (!niche) return;
          try {
            const res = await fetch('/api/services/thinkforge/enhance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: niche }),
            });
            if (!res.ok) throw new Error('Failed to enhance prompt');
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return;
            setPrompt('');
            let enhancedPrompt = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              enhancedPrompt += decoder.decode(value, { stream: true });
              setPrompt(enhancedPrompt);
            }
          } catch (error) {
            console.error('Enhance error:', error);
            setPrompt(niche);
          }
        }}
      >
        <span className="enhance-icon">✦</span>
        Enhance with AI
      </button>
      
      <div className="prompt-footer">
        <span className="mono" style={{ color: 'var(--text-faint)' }}>1 credit per generation</span>
        {onManualSetup && (
          <button type="button" className="configure" onClick={onManualSetup}>
            Configure manually →
          </button>
        )}
      </div>
    </div>
  );
};

