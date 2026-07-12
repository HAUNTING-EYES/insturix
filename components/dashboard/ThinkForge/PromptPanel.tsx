"use client";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";

/**
 * Extract all HTTP(S) URLs from text.
 * Handles full URLs (https://example.com) AND bare domains (example.com).
 * Rejects localhost, file://, ftp://, and other non-http protocols.
 */
const URL_EXTRACT_REGEX = /https?:\/\/(?!localhost\b)[^\s<>"')\]]+/gi;
const BARE_DOMAIN_REGEX = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|io|co|org|net|dev|app|ai|xyz|me|info|biz|us|uk|in|ca|au|de|fr|tech|agency|studio|design|tv|gg|so|to)\b(?:\/[^\s<>"')\]]*)?)/gi;

export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  // Match full URLs first
  const fullMatches = text.match(URL_EXTRACT_REGEX) || [];
  for (const match of fullMatches) {
    const clean = match.replace(/[.,;:!?)]+$/, '');
    try {
      const url = new URL(clean);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    } catch {}
  }

  // Match bare domains (insturix.com → https://insturix.com)
  const bareMatches = text.match(BARE_DOMAIN_REGEX) || [];
  for (const match of bareMatches) {
    const clean = match.replace(/[.,;:!?)]+$/, '');
    const full = `https://${clean}`;
    if (!seen.has(full)) {
      try {
        new URL(full); // validate it parses
        seen.add(full);
        urls.push(full);
      } catch {}
    }
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

const POST_KEYWORDS = /\b(post|article|blog|essay|thread|newsletter|write|carousel|caption)\b/i;
const PLATFORM_KEYWORDS = /\b(linkedin|twitter|tweet|instagram|tiktok|youtube|facebook|reddit|medium|pinterest|x\s+post)\b/i;
const PLATFORM_PICKS = [
  { label: 'LinkedIn', value: 'LinkedIn' },
  { label: 'Twitter/X', value: 'Twitter/X' },
  { label: 'Instagram', value: 'Instagram' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Blog', value: 'Blog' },
  { label: 'Newsletter', value: 'Newsletter' },
  { label: 'Reddit', value: 'Reddit' },
];

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
  const [showPlatformPicker, setShowPlatformPicker] = React.useState(false);

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

  const handlePlatformPick = (platform: string) => {
    setShowPlatformPicker(false);
    setPrompt(`${prompt.trim()} - ${platform} post`);
    setTimeout(() => formRef.current?.requestSubmit(), 50);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Platform check FIRST — before URL extraction or submission
    if (POST_KEYWORDS.test(prompt) && !PLATFORM_KEYWORDS.test(prompt)) {
      setShowPlatformPicker(true);
      return;
    }

    const urls = extractUrls(prompt);
    if (urls.length > 0 && onUrlSubmit) {
      onUrlSubmit(urls, prompt);
      return;
    }

    onSubmit(e);
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
      {showPlatformPicker && (
        <div className="platform-picker" style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px 0',
          animation: 'fadeIn 0.15s ease-out',
        }}>
          <span style={{ width: '100%', fontSize: '11px', color: '#7A776E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Which platform?
          </span>
          {PLATFORM_PICKS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePlatformPick(p.value)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#B5B2A8', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,166,82,0.12)'; e.currentTarget.style.color = '#D4A652'; e.currentTarget.style.borderColor = 'rgba(212,166,82,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#B5B2A8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setShowPlatformPicker(false); onSubmit(new Event('submit') as any); }}
            style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)',
              color: '#5F5E5A', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            Skip — surprise me
          </button>
        </div>
      )}

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

