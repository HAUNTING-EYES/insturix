"use client";

import React from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import {
  THINKFORGE_PLATFORM_SURFACE_IDS,
  createDefaultThinkForgePostControls,
  createThinkForgeAuthoringRequest,
  describeThinkForgePlatformSurface,
  type ThinkForgeAuthoringRequest,
  type ThinkForgePlatformSurfaceId,
} from "@/lib/thinkforge/schemas/authoring-request";
import {
  createThinkForgeWriterContract,
  type ThinkForgeWriterKind,
} from "@/lib/thinkforge/schemas/document-contract";

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

const OUTPUT_OPTIONS: Array<{ value: ThinkForgeWriterKind; label: string }> = [
  { value: 'social_post', label: 'Single post' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video_script', label: 'Video script' },
];

const PLATFORM_OPTIONS = THINKFORGE_PLATFORM_SURFACE_IDS.map((id) => ({
  id,
  label: id === 'custom' ? 'Other' : describeThinkForgePlatformSurface({ id }),
}));

type PostControlDraft = {
  cta: 'editorial' | 'none' | 'soft' | 'direct';
  hashtags: 'editorial' | 'none';
  emoji: 'editorial' | 'none' | 'restrained';
};

const DEFAULT_POST_CONTROLS: PostControlDraft = {
  cta: 'editorial',
  hashtags: 'editorial',
  emoji: 'editorial',
};

function initialKind(request: ThinkForgeAuthoringRequest | null): ThinkForgeWriterKind | '' {
  const kind = request?.contentContract.outputKind;
  return kind === 'social_post' || kind === 'carousel' || kind === 'video_script' ? kind : '';
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
  const [outputKind, setOutputKind] = React.useState<ThinkForgeWriterKind | ''>(() => initialKind(authoringRequest));
  const [platformId, setPlatformId] = React.useState<ThinkForgePlatformSurfaceId | ''>(authoringRequest?.platformSurface.id || '');
  const [customPlatformLabel, setCustomPlatformLabel] = React.useState(authoringRequest?.platformSurface.customLabel || '');
  const [carouselSlideCount, setCarouselSlideCount] = React.useState<number | undefined>(authoringRequest?.contentContract.carouselSlideCount);
  const [durationMinutes, setDurationMinutes] = React.useState(() => authoringRequest?.targetDurationSec
    ? String(Math.floor(authoringRequest.targetDurationSec / 60))
    : '');
  const [durationSeconds, setDurationSeconds] = React.useState(() => authoringRequest?.targetDurationSec
    ? String(authoringRequest.targetDurationSec % 60)
    : '');
  const [postControls, setPostControls] = React.useState<PostControlDraft>(() => ({
    cta: authoringRequest?.postControls?.cta.preference || DEFAULT_POST_CONTROLS.cta,
    hashtags: authoringRequest?.postControls?.hashtags.preference === 'none' ? 'none' : 'editorial',
    emoji: authoringRequest?.postControls?.emoji.preference || DEFAULT_POST_CONTROLS.emoji,
  }));
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOutputKind(initialKind(authoringRequest));
    setPlatformId(authoringRequest?.platformSurface.id || '');
    setCustomPlatformLabel(authoringRequest?.platformSurface.customLabel || '');
    setCarouselSlideCount(authoringRequest?.contentContract.carouselSlideCount);
    setDurationMinutes(authoringRequest?.targetDurationSec
      ? String(Math.floor(authoringRequest.targetDurationSec / 60))
      : '');
    setDurationSeconds(authoringRequest?.targetDurationSec
      ? String(authoringRequest.targetDurationSec % 60)
      : '');
    setPostControls({
      cta: authoringRequest?.postControls?.cta.preference || DEFAULT_POST_CONTROLS.cta,
      hashtags: authoringRequest?.postControls?.hashtags.preference === 'none' ? 'none' : 'editorial',
      emoji: authoringRequest?.postControls?.emoji.preference || DEFAULT_POST_CONTROLS.emoji,
    });
    setValidationError(null);
  }, [authoringRequest]);

  const isProcessing = loading || briefLoading;

  const buildAuthoringRequest = (): ThinkForgeAuthoringRequest | null => {
    if (!outputKind) {
      setValidationError('Choose an output type.');
      return null;
    }
    if (!platformId) {
      setValidationError('Choose a platform.');
      return null;
    }
    if (platformId === 'custom' && !customPlatformLabel.trim()) {
      setValidationError('Name the destination platform.');
      return null;
    }
    if (outputKind === 'carousel' && carouselSlideCount === undefined) {
      setValidationError('Choose the carousel slide count.');
      return null;
    }

    const mins = durationMinutes.trim() ? Number(durationMinutes) : 0;
    const secs = durationSeconds.trim() ? Number(durationSeconds) : 0;
    if (outputKind === 'video_script' && (
      !Number.isInteger(mins)
      || !Number.isInteger(secs)
      || mins < 0
      || secs < 0
      || secs > 59
    )) {
      setValidationError('Use whole minutes and 0-59 seconds.');
      return null;
    }
    const targetDurationSec = mins * 60 + secs;

    try {
      const request = createThinkForgeAuthoringRequest({
        contentContract: createThinkForgeWriterContract(
          outputKind,
          outputKind === 'carousel' ? { carouselSlideCount } : undefined,
        ),
        platformSurface: platformId === 'custom'
          ? { id: 'custom', customLabel: customPlatformLabel.trim() }
          : { id: platformId },
        ...(outputKind === 'video_script' && targetDurationSec > 0 ? { targetDurationSec } : {}),
        ...(outputKind !== 'video_script'
          ? {
              postControls: {
                ...createDefaultThinkForgePostControls(),
                cta: { preference: postControls.cta },
                hashtags: { preference: postControls.hashtags },
                emoji: { preference: postControls.emoji },
              },
            }
          : {}),
      });
      setValidationError(null);
      return request;
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid authoring settings.');
      return null;
    }
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
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

  return (
    <div className="prompt-view" id="s1" style={{ display: hasSubmitted ? 'none' : 'flex' }}>
      <div className="prompt-hero">
        <h1>ThinkForge</h1>
      </div>

      <div className="w-full max-w-[760px] space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Output type">
          {OUTPUT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`idea-tag min-h-9 ${outputKind === option.value ? 'border-[#D4A652] text-[#D4A652]' : ''}`}
              aria-pressed={outputKind === option.value}
              onClick={() => {
                setOutputKind(option.value);
                setValidationError(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[#7A776E]">
            Platform
            <select
              value={platformId}
              onChange={(event) => {
                setPlatformId(event.target.value as ThinkForgePlatformSurfaceId | '');
                setValidationError(null);
              }}
              className="mt-1.5 h-10 w-full rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"
            >
              <option value="">Select</option>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          {platformId === 'custom' && (
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#7A776E]">
              Destination
              <input
                value={customPlatformLabel}
                maxLength={80}
                onChange={(event) => setCustomPlatformLabel(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"
              />
            </label>
          )}
          {outputKind === 'carousel' && (
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#7A776E]">
              Slides
              <input
                type="number"
                min={2}
                max={7}
                value={carouselSlideCount ?? ''}
                onChange={(event) => setCarouselSlideCount(event.target.value ? Number(event.target.value) : undefined)}
                className="mt-1.5 h-10 w-full rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"
              />
            </label>
          )}
          {outputKind === 'video_script' && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#7A776E]">
              Target duration
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  placeholder="Minutes"
                  aria-label="Target duration minutes"
                  className="h-10 rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"
                />
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(event.target.value)}
                  placeholder="Seconds"
                  aria-label="Target duration seconds"
                  className="h-10 rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"
                />
              </div>
            </div>
          )}
        </div>

        {outputKind && outputKind !== 'video_script' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <PreferenceControl
              label="CTA"
              value={postControls.cta}
              options={['editorial', 'none', 'soft', 'direct']}
              onChange={(cta) => setPostControls((current) => ({ ...current, cta }))}
            />
            <PreferenceControl
              label="Hashtags"
              value={postControls.hashtags}
              options={['editorial', 'none']}
              onChange={(hashtags) => setPostControls((current) => ({ ...current, hashtags }))}
            />
            <PreferenceControl
              label="Emoji"
              value={postControls.emoji}
              options={['editorial', 'none', 'restrained']}
              onChange={(emoji) => setPostControls((current) => ({ ...current, emoji }))}
            />
          </div>
        )}
      </div>

      <form ref={formRef} onSubmit={handleFormSubmit} className="prompt-box" style={{ width: '100%', display: 'block' }}>
        <textarea
          id="promptInput"
          rows={3}
          placeholder="A behind-the-scenes look at how F1 pit crews train under pressure..."
          value={prompt}
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
        onClick={async () => {
          const original = prompt.trim();
          if (!original) return;
          try {
            const response = await fetch('/api/services/thinkforge/enhance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: original }),
            });
            if (!response.ok) throw new Error('Failed to enhance prompt');
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Enhance response did not include a stream');
            const decoder = new TextDecoder();
            let enhancedPrompt = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              enhancedPrompt += decoder.decode(value, { stream: true });
              setPrompt(enhancedPrompt);
            }
          } catch {
            setPrompt(original);
          }
        }}
      >
        <Sparkles className="h-4 w-4" />
        Enhance
      </button>

      <div className="prompt-footer">
        <span className="mono" style={{ color: 'var(--text-faint)' }}>1 credit per generation</span>
      </div>
    </div>
  );
};

function PreferenceControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="text-[10px] font-semibold uppercase tracking-wider text-[#7A776E]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-1.5 h-10 w-full rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm capitalize text-[#ECE9E1] outline-none focus:border-[#D4A652]/60"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
