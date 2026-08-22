"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { Select } from "@/components/primitives";
import {
  listThinkForgePublishingSurfaces,
  platformForThinkForgePublishingSurface,
  type ThinkForgePublishingSurfaceId,
} from "@/lib/thinkforge/schemas/authoring-request";
import type { ThinkForgeAuthoringRequestDraft } from "@/lib/thinkforge/schemas/authoring-request-draft";
import {
  THINKFORGE_CAROUSEL_MIN_SLIDES,
  resolveThinkForgeCarouselCapabilities,
} from "@/lib/thinkforge/schemas/carousel-capabilities";
import type { ThinkForgeWriterKind } from "@/lib/thinkforge/schemas/document-contract";

interface AuthoringRequestControlsProps {
  value: ThinkForgeAuthoringRequestDraft;
  onChange: (value: ThinkForgeAuthoringRequestDraft) => void;
  disabled?: boolean;
}

const OUTPUT_OPTIONS: Array<{ value: ThinkForgeWriterKind; label: string }> = [
  { value: 'social_post', label: 'Single post' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video_script', label: 'Video script' },
];

const controlClass = "mt-1.5 h-10 w-full rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 text-sm text-[#ECE9E1] outline-none focus:border-[#D4A652]/60 disabled:cursor-not-allowed disabled:opacity-50";
const labelClass = "text-[10px] font-semibold uppercase tracking-wider text-[#7A776E]";
// The caption wrapper's uppercase/semibold/tracking would otherwise inherit into the Select trigger and listbox.
const selectClass = "mt-1.5 normal-case font-normal tracking-normal";

export function AuthoringRequestControls({ value, onChange, disabled = false }: AuthoringRequestControlsProps) {
  const [hashtagInput, setHashtagInput] = React.useState('');
  const patch = (updates: Partial<ThinkForgeAuthoringRequestDraft>) => onChange({ ...value, ...updates });
  const publishingOptions = value.outputKind
    ? listThinkForgePublishingSurfaces(value.outputKind)
    : [];
  const carouselCapabilities = resolveThinkForgeCarouselCapabilities(
    value.publishingSurfaceId || undefined,
  );
  const selectOutputKind = (outputKind: ThinkForgeWriterKind) => {
    const destinationStillApplies = value.publishingSurfaceId
      && listThinkForgePublishingSurfaces(outputKind).some(({ id }) => id === value.publishingSurfaceId);
    patch({
      outputKind,
      ...(!destinationStillApplies
        ? { publishingSurfaceId: '', platformId: '', customPlatformLabel: '' }
        : {}),
    });
  };
  const selectPublishingSurface = (publishingSurfaceId: ThinkForgePublishingSurfaceId | '') => {
    if (!publishingSurfaceId) {
      patch({ publishingSurfaceId: '', platformId: '', customPlatformLabel: '' });
      return;
    }
    const platformId = platformForThinkForgePublishingSurface(publishingSurfaceId);
    patch({
      publishingSurfaceId,
      platformId,
      ...(platformId !== 'custom' ? { customPlatformLabel: '' } : {}),
    });
  };

  const addHashtag = () => {
    const next = hashtagInput.trim();
    if (!next || value.hashtags.includes(next) || value.hashtags.length >= 30) return;
    patch({ hashtags: [...value.hashtags, next] });
    setHashtagInput('');
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Output type">
        {OUTPUT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            className={`idea-tag min-h-9 ${value.outputKind === option.value ? 'border-[#D4A652] text-[#D4A652]' : ''}`}
            aria-pressed={value.outputKind === option.value}
            onClick={() => selectOutputKind(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={labelClass}>
          Publishing destination
          <Select
            aria-label="Publishing destination"
            value={value.publishingSurfaceId}
            disabled={disabled}
            onChange={(next) => selectPublishingSurface(next as ThinkForgePublishingSurfaceId | '')}
            options={[
              { value: '', label: 'Select' },
              ...publishingOptions.map((option) => ({ value: option.id, label: option.label })),
            ]}
            placeholder="Select"
            className={selectClass}
          />
        </div>

        {value.platformId === 'custom' && (
          <label className={labelClass}>
            Destination
            <input
              value={value.customPlatformLabel}
              maxLength={80}
              disabled={disabled}
              onChange={(event) => patch({ customPlatformLabel: event.target.value })}
              className={controlClass}
            />
          </label>
        )}

        {value.outputKind === 'carousel' && (
          <label className={labelClass}>
            Slides
            <input
              type="number"
              min={THINKFORGE_CAROUSEL_MIN_SLIDES}
              max={carouselCapabilities.effectiveAuthoringMaximumSlides}
              step={1}
              value={value.carouselSlideCount}
              disabled={disabled}
              onChange={(event) => patch({ carouselSlideCount: event.target.value })}
              className={controlClass}
            />
          </label>
        )}

        {value.outputKind === 'video_script' && (
          <div className={labelClass}>
            Target duration
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                step={1}
                value={value.durationMinutes}
                disabled={disabled}
                onChange={(event) => patch({ durationMinutes: event.target.value })}
                placeholder="Minutes"
                aria-label="Target duration minutes"
                className={controlClass.replace('mt-1.5 ', '')}
              />
              <input
                type="number"
                min={0}
                max={59}
                step={1}
                value={value.durationSeconds}
                disabled={disabled}
                onChange={(event) => patch({ durationSeconds: event.target.value })}
                placeholder="Seconds"
                aria-label="Target duration seconds"
                className={controlClass.replace('mt-1.5 ', '')}
              />
            </div>
          </div>
        )}
      </div>

      {value.outputKind && value.outputKind !== 'video_script' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <PreferenceControl label="CTA" value={value.ctaPreference} options={['editorial', 'none', 'soft', 'direct']} disabled={disabled} onChange={(ctaPreference) => patch({ ctaPreference, ...(ctaPreference === 'none' ? { ctaAction: '', ctaDestination: '' } : {}) })} />
            <PreferenceControl label="Hashtags" value={value.hashtagPreference} options={['editorial', 'none', 'exact']} disabled={disabled} onChange={(hashtagPreference) => patch({ hashtagPreference, ...(hashtagPreference !== 'exact' ? { hashtags: [] } : {}) })} />
            <PreferenceControl label="Emoji" value={value.emojiPreference} options={['editorial', 'none', 'restrained']} disabled={disabled} onChange={(emojiPreference) => patch({ emojiPreference })} />
          </div>

          {value.ctaPreference !== 'none' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>CTA action<input value={value.ctaAction} maxLength={240} disabled={disabled} onChange={(event) => patch({ ctaAction: event.target.value })} className={controlClass} /></label>
              <label className={labelClass}>CTA destination<input value={value.ctaDestination} maxLength={2048} disabled={disabled} onChange={(event) => patch({ ctaDestination: event.target.value })} className={controlClass} /></label>
            </div>
          )}

          {value.hashtagPreference === 'exact' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {value.hashtags.map((hashtag) => (
                  <span key={hashtag} className="inline-flex items-center gap-1 rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-2 py-1 text-xs text-[#ECE9E1]">
                    {hashtag}
                    <button type="button" disabled={disabled} aria-label={`Remove ${hashtag}`} title={`Remove ${hashtag}`} onClick={() => patch({ hashtags: value.hashtags.filter((item) => item !== hashtag) })} className="text-[#7A776E] hover:text-[#ECE9E1]"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <label className={labelClass}>
                Exact hashtags
                <div className="mt-1.5 flex gap-2">
                  <input value={hashtagInput} maxLength={100} disabled={disabled || value.hashtags.length >= 30} onChange={(event) => setHashtagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addHashtag(); } }} className={controlClass.replace('mt-1.5 ', '')} />
                  <button type="button" disabled={disabled || !hashtagInput.trim() || value.hashtags.length >= 30} aria-label="Add hashtag" title="Add hashtag" onClick={addHashtag} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] border border-[#282724] text-[#D4A652] disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Target length<input type="number" min={1} step={1} value={value.targetLengthValue} disabled={disabled} onChange={(event) => patch({ targetLengthValue: event.target.value })} className={controlClass} /></label>
            <PreferenceControl label="Length unit" value={value.targetLengthUnit} options={['words', 'characters']} disabled={disabled} onChange={(targetLengthUnit) => patch({ targetLengthUnit })} />
          </div>
        </div>
      )}
    </div>
  );
}

function PreferenceControl<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void; disabled: boolean }) {
  return (
    <div className={labelClass}>
      {label}
      <Select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(next as T)}
        // The native select relied on CSS `capitalize`; the listbox trigger is a <button> (UA text-transform: none), so capitalize the label itself.
        options={options.map((option) => ({ value: option, label: option.charAt(0).toUpperCase() + option.slice(1) }))}
        className={selectClass}
      />
    </div>
  );
}
