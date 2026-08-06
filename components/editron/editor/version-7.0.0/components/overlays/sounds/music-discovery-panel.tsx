'use client';

import {
  ArrowUpRight,
  Disc3,
  Loader2,
  Pause,
  Play,
  Search,
  Upload,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MusicDiscoveryIdentity } from '@/lib/editron/music-discovery/types';

import { useEditorContext } from '../../../contexts/editor-context';
import { useLocalMedia } from '../../../contexts/local-media-context';
import {
  assignBackgroundMusicAsset,
  BackgroundMusicAssignmentClientError,
  createBackgroundMusicIdempotencyKey,
} from '../../../utils/background-music-assignment';
import {
  MusicDiscoveryClientError,
  officialPreviewSource,
  searchMusicDiscovery,
} from '../../../utils/music-discovery';

interface Feedback {
  tone: 'error' | 'success';
  message: string;
}

export function MusicDiscoveryPanel() {
  const locale = browserMusicLocale();
  const { projectId, setOverlays } = useEditorContext();
  const { addMediaFile } = useLocalMedia();
  const [term, setTerm] = useState('');
  const [territory, setTerritory] = useState(locale.territory);
  const [language, setLanguage] = useState(locale.language);
  const [results, setResults] = useState<MusicDiscoveryIdentity[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingIdentityRef = useRef<MusicDiscoveryIdentity | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    previewRef.current?.pause();
  }, []);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) {
      setFeedback({ tone: 'error', message: 'Enter a song, artist, language, or vibe.' });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSearching(true);
    setFeedback(null);
    try {
      const result = await searchMusicDiscovery({
        term: query,
        territory: normalizedTerritory(territory),
        languages: normalizedLanguage(language),
        limit: 15,
        signal: controller.signal,
      });
      setResults(result.identities);
      if (result.identities.length === 0) {
        setFeedback({ tone: 'error', message: 'No matching music was found.' });
      }
    } catch (error) {
      if (error instanceof MusicDiscoveryClientError && error.code === 'REQUEST_ABORTED') return;
      setResults([]);
      setFeedback({ tone: 'error', message: errorMessage(error, 'Music search failed.') });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setSearching(false);
    }
  };

  const preview = async (identity: MusicDiscoveryIdentity) => {
    const source = officialPreviewSource(identity);
    if (!source) return;
    if (!source.previewUrl) {
      window.open(source.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (previewingId === identity.identityId) {
      previewRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    previewRef.current?.pause();
    const audio = new Audio(source.previewUrl);
    previewRef.current = audio;
    audio.onended = () => setPreviewingId(null);
    try {
      await audio.play();
      setPreviewingId(identity.identityId);
    } catch {
      setFeedback({ tone: 'error', message: 'The provider preview could not be played.' });
    }
  };

  const requestReferenceUpload = (identity: MusicDiscoveryIdentity) => {
    if (!projectId) {
      setFeedback({ tone: 'error', message: 'Save this project before adding reference music.' });
      return;
    }
    pendingIdentityRef.current = identity;
    fileRef.current?.click();
  };

  const attachReferenceAudio = async (file: File | undefined) => {
    const identity = pendingIdentityRef.current;
    pendingIdentityRef.current = null;
    if (!file || !identity || !projectId) return;
    if (!file.type.startsWith('audio/')) {
      setFeedback({ tone: 'error', message: 'Choose an audio file for the reference track.' });
      return;
    }

    previewRef.current?.pause();
    setPreviewingId(null);
    setAssigningId(identity.identityId);
    setFeedback(null);
    try {
      const uploaded = await addMediaFile(file);
      if (!uploaded?.assetId) throw new Error('Upload completed without a durable audio asset.');
      const assignment = await assignBackgroundMusicAsset({
        projectId,
        assetId: uploaded.assetId,
        idempotencyKey: createBackgroundMusicIdempotencyKey(),
        usageMode: 'reference-only',
        sourceMetadata: {
          identityId: identity.identityId,
          title: identity.title,
          artists: identity.artists,
          provider: identity.sources[0]?.provider,
          providerTrackId: identity.sources[0]?.providerId,
          isrcs: identity.isrcs,
        },
      });
      setOverlays(assignment.overlays);
      setFeedback({
        tone: 'success',
        message: `${identity.title} is on the timeline as REFERENCE and will stay out of export.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error, 'Reference music could not be added.') });
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="space-y-3">
      <form className="space-y-2" onSubmit={search}>
        <div className="flex items-center gap-1.5">
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Song, artist, language, vibe"
            className="h-9 min-w-0 rounded-md"
            disabled={searching || Boolean(assigningId)}
          />
          <Button
            type="submit"
            size="icon"
            variant="outline"
            className="h-9 w-9 shrink-0 rounded-md"
            disabled={searching || Boolean(assigningId)}
            title="Search music"
            aria-label="Search music"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={territory}
            onChange={(event) => setTerritory(event.target.value.toUpperCase().slice(0, 2))}
            className="h-8 w-16 rounded-md text-center font-mono uppercase"
            title="Territory code"
            aria-label="Territory code"
            maxLength={2}
          />
          <Input
            value={language}
            onChange={(event) => setLanguage(event.target.value.slice(0, 5))}
            className="h-8 min-w-0 flex-1 rounded-md font-mono"
            title="Language code"
            aria-label="Language code"
            maxLength={5}
          />
        </div>
      </form>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          void attachReferenceAudio(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {feedback ? (
        <div
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-md border px-2.5 py-2 text-xs leading-5 ${
            feedback.tone === 'error'
              ? 'border-destructive/40 bg-destructive/5 text-destructive'
              : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="space-y-2">
        {results.map((identity) => {
          const source = officialPreviewSource(identity);
          const trend = identity.trendEvidence[0];
          const isAssigning = assigningId === identity.identityId;
          return (
            <div key={identity.identityId} className="space-y-2 rounded-md border border-border p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {identity.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={identity.artworkUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Disc3 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{identity.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {identity.artists.join(', ') || source?.attribution || 'Unknown artist'}
                  </p>
                </div>
                {trend?.rank ? (
                  <span
                    className="shrink-0 font-mono text-[9px] font-semibold text-emerald-600 dark:text-emerald-300"
                    title={`${trend.territory} chart rank`}
                  >
                    #{trend.rank}
                    {typeof trend.rankDelta === 'number' && trend.rankDelta !== 0
                      ? ` ${trend.rankDelta > 0 ? '+' : ''}${trend.rankDelta}`
                      : ''}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-1.5">
                {source ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-md"
                    onClick={() => void preview(identity)}
                    title={source.previewUrl ? 'Preview track' : 'Open official preview'}
                    aria-label={source.previewUrl ? 'Preview track' : 'Open official preview'}
                  >
                    {previewingId === identity.identityId
                      ? <Pause className="h-3.5 w-3.5" />
                      : source.previewCapability === 'link-out'
                        ? <ArrowUpRight className="h-3.5 w-3.5" />
                        : <Play className="h-3.5 w-3.5" />}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 rounded-md"
                  disabled={Boolean(assigningId) || searching || !projectId}
                  onClick={() => requestReferenceUpload(identity)}
                  title={projectId ? 'Choose your reference audio file' : 'Save project first'}
                >
                  {isAssigning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Use as reference
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function browserMusicLocale(): { territory: string; language: string } {
  const locale = typeof navigator === 'undefined' ? 'en-IN' : navigator.language;
  const [language = 'en', territory = 'IN'] = locale.split('-');
  return {
    territory: /^[A-Za-z]{2}$/.test(territory) ? territory.toUpperCase() : 'IN',
    language: /^[A-Za-z]{2,3}$/.test(language) ? language.toLowerCase() : 'en',
  };
}

function normalizedTerritory(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : 'GLOBAL';
}

function normalizedLanguage(value: string): string[] {
  const normalized = value.trim();
  return /^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/.test(normalized) ? [normalized] : [];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof MusicDiscoveryClientError
    || error instanceof BackgroundMusicAssignmentClientError
    || error instanceof Error
    ? error.message
    : fallback;
}
