"use client";

import React from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { ThinkForgeAuthoringRequest } from "@/lib/thinkforge/schemas/authoring-request";
import {
  createThinkForgeAuthoringRequestDraft,
  resolveThinkForgeAuthoringRequestDraft,
} from "@/lib/thinkforge/schemas/authoring-request-draft";
import { createThinkForgePromptEnhancementRequest } from "@/lib/thinkforge/schemas/prompt-enhancement";
import { AuthoringRequestControls } from "./AuthoringRequestControls";

const URL_EXTRACT_REGEX = /https?:\/\/(?!localhost\b)[^\s<>"')\]]+/gi;
const BARE_DOMAIN_REGEX = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|io|co|org|net|dev|app|ai|xyz|me|info|biz|us|uk|in|ca|au|de|fr|tech|agency|studio|design|tv|gg|so|to)\b(?:\/[^\s<>"')\]]*)?)/gi;

export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of text.match(URL_EXTRACT_REGEX) || []) {
    const clean = match.replace(/[.,;:!?)]+$/, '');
    try {
      const url = new URL(clean);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    } catch {
      // Ignore malformed candidates; server-side ingestion validates accepted URLs again.
    }
  }
  for (const match of text.match(BARE_DOMAIN_REGEX) || []) {
    const clean = match.replace(/[.,;:!?)]+$/, '');
    const full = `https://${clean}`;
    if (seen.has(full)) continue;
    try {
      new URL(full);
      seen.add(full);
      urls.push(full);
    } catch {
      // Ignore malformed candidates; server-side ingestion validates accepted URLs again.
    }
  }
  return urls;
}

interface PromptPanelProps {
  prompt: string;
  setPrompt: (value: string) => void;
  loading: boolean;
  hasSubmitted: boolean;
  authoringRequest: ThinkForgeAuthoringRequest | null;
  onSubmit: (event: React.FormEvent, authoringRequest: ThinkForgeAuthoringRequest) => void;
  onUrlSubmit?: (
    urls: string[],
    originalPrompt: string,
    authoringRequest: ThinkForgeAuthoringRequest,
  ) => void;
  briefLoading?: boolean;
}

export const PromptPanel: React.FC<PromptPanelProps> = ({
  prompt,
  setPrompt,
  loading,
  hasSubmitted,
  authoringRequest,
  onSubmit,
  onUrlSubmit,
  briefLoading = false,
}) => {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const enhancementSequenceRef = React.useRef(0);
  const enhancementOperationRef = React.useRef<{ id: number; controller: AbortController } | null>(null);
  const [requestDraft, setRequestDraft] = React.useState(() => createThinkForgeAuthoringRequestDraft(authoringRequest));
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [enhancing, setEnhancing] = React.useState(false);

  React.useEffect(() => {
    enhancementOperationRef.current?.controller.abort();
    enhancementOperationRef.current = null;
    setEnhancing(false);
    setRequestDraft(createThinkForgeAuthoringRequestDraft(authoringRequest));
    setValidationError(null);
  }, [authoringRequest]);

  React.useEffect(() => () => {
    enhancementOperationRef.current?.controller.abort();
    enhancementOperationRef.current = null;
  }, []);

  const isProcessing = loading || briefLoading || enhancing;

  const buildAuthoringRequest = (): ThinkForgeAuthoringRequest | null => {
    const result = resolveThinkForgeAuthoringRequestDraft(requestDraft);
    if (!result.success) {
      setValidationError(result.error);
      return null;
    }
    setValidationError(null);
    return result.request;
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isProcessing) return;
    if (!prompt.trim()) return;
    const request = buildAuthoringRequest();
    if (!request) return;
    const urls = extractUrls(prompt);
    if (urls.length > 0 && onUrlSubmit) {
      onUrlSubmit(urls, prompt, request);
      return;
    }
    onSubmit(event, request);
  };

  const handleEnhance = async () => {
    if (loading || briefLoading || enhancementOperationRef.current) return;
    const original = prompt.trim();
    if (!original) return;
    const request = buildAuthoringRequest();
    if (!request) return;

    const operationId = ++enhancementSequenceRef.current;
    const controller = new AbortController();
    enhancementOperationRef.current = { id: operationId, controller };
    setEnhancing(true);
    setValidationError(null);

    try {
      const response = await fetch('/api/services/thinkforge/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createThinkForgePromptEnhancementRequest({
          prompt: original,
          authoringRequest: request,
        })),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Enhancement request failed with status ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Enhance response did not include a stream');
      const decoder = new TextDecoder();
      let enhancedPrompt = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (enhancementOperationRef.current?.id !== operationId) {
          await reader.cancel();
          return;
        }
        enhancedPrompt += decoder.decode(value, { stream: true });
        setPrompt(enhancedPrompt);
      }
      enhancedPrompt += decoder.decode();
      if (!enhancedPrompt.trim()) throw new Error('Enhance response was empty');
      if (enhancementOperationRef.current?.id === operationId) {
        setPrompt(enhancedPrompt);
      }
    } catch (error) {
      const ownsOperation = enhancementOperationRef.current?.id === operationId;
      if (ownsOperation && !controller.signal.aborted) {
        setPrompt(original);
        setValidationError('Prompt enhancement failed. Your original prompt was restored.');
      }
    } finally {
      if (enhancementOperationRef.current?.id === operationId) {
        enhancementOperationRef.current = null;
        setEnhancing(false);
      }
    }
  };

  return (
    <div className="prompt-view" id="s1" style={{ display: hasSubmitted ? 'none' : 'flex' }}>
      <div className="prompt-hero">
        <h1>ThinkForge</h1>
      </div>

      <div className="w-full max-w-[760px] space-y-3">
        <AuthoringRequestControls
          value={requestDraft}
          disabled={isProcessing}
          onChange={(nextDraft) => {
            setRequestDraft(nextDraft);
            setValidationError(null);
          }}
        />
      </div>

      <form ref={formRef} onSubmit={handleFormSubmit} className="prompt-box" style={{ width: '100%', display: 'block' }}>
        <textarea
          id="promptInput"
          rows={3}
          placeholder="A behind-the-scenes look at how F1 pit crews train under pressure..."
          value={prompt}
          disabled={isProcessing}
          aria-busy={isProcessing}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!isProcessing) formRef.current?.requestSubmit();
            }
          }}
        />
        <div className="prompt-actions">
          <button
            type="submit"
            className="prompt-cta"
            disabled={isProcessing || !prompt.trim()}
            aria-label="Generate ideas"
            title="Generate ideas"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </form>

      {validationError && (
        <p role="alert" className="w-full max-w-[760px] text-sm text-red-400">{validationError}</p>
      )}

      <button
        type="button"
        className="enhance-btn"
        disabled={isProcessing || !prompt.trim()}
        onClick={handleEnhance}
      >
        {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {enhancing ? 'Enhancing...' : 'Enhance'}
      </button>

      <div className="prompt-footer">
        <span className="mono" style={{ color: 'var(--text-faint)' }}>1 credit per generation</span>
      </div>
    </div>
  );
};
