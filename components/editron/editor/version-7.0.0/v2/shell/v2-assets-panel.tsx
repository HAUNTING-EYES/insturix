'use client';

import { useRef, useState } from 'react';
import { Upload, Film, ImageIcon, Music, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Mono } from '@/components/primitives';
import { useLocalMedia } from '../../contexts/local-media-context';
import { LottiePanel } from '../../components/lottie/lottie-panel';
import type { LocalMediaFile } from '../../types';

/* ═══ Editron editor v2 · Assets panel ═══════════════════════════════
   The v6 ASSETS panel: MEDIA / LOTTIE / EXTRACT tabs + Upload + asset
   cards, over the REAL useLocalMedia hook (upload + list). Cards are
   draggable with the same `application/editron-asset` payload the real
   timeline grid consumes — so dropping a card onto the timeline adds it
   through the real drop logic (nothing forked). Replaces the raw v1
   LocalMediaPanel in the tool panel's Assets slot. */

type Tab = 'media' | 'lottie' | 'extract';

const TABS: { id: Tab; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'lottie', label: 'Lottie' },
  { id: 'extract', label: 'Extract' },
];

function badge(type: LocalMediaFile['type']) {
  return type === 'video' ? 'VID' : type === 'audio' ? 'AUD' : 'IMG';
}

function MediaCard({ f }: { f: LocalMediaFile }) {
  const Icon = f.type === 'video' ? Film : f.type === 'audio' ? Music : ImageIcon;
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/editron-asset',
      JSON.stringify({ type: f.type, path: f.path, assetId: f.assetId, name: f.name, duration: f.duration, dimensions: f.dimensions, thumbnail: f.thumbnail }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={`${f.name} — drag onto the timeline`}
      className="group relative flex aspect-video cursor-grab flex-col justify-end overflow-hidden rounded-md border border-ds-subtle bg-surface-deeper p-2 transition-colors hover:border-ds-emphasis"
    >
      {f.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.thumbnail} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover opacity-70" />
      ) : (
        <Icon size={20} className="absolute inset-0 m-auto text-ds-dim" />
      )}
      <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1 py-0.5 font-mono text-[8px] font-bold text-gold">{badge(f.type)}</span>
      <span className="relative truncate text-[11px] font-semibold text-ds-primary drop-shadow">{f.name}</span>
    </div>
  );
}

export function V2AssetsPanel() {
  const { localMediaFiles, addMediaFiles, isLoading } = useLocalMedia();
  const [tab, setTab] = useState<Tab>('media');
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 gap-0.5 border-b border-ds-subtle px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-2.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-hidden',
              tab === t.id ? 'border-gold text-gold' : 'border-transparent text-ds-muted hover:text-ds-secondary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'media' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-button border border-dashed border-ds-emphasis bg-surface-deeper py-2.5 text-[11.5px] font-bold text-ds-secondary transition-colors hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload media
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="video/*,image/*,audio/*"
            className="hidden"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length) addMediaFiles(files).catch(() => {});
              e.target.value = '';
            }}
          />

          {localMediaFiles.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
              <Mono size="9" className="text-ds-dim">No media yet</Mono>
              <p className="text-[12px] text-ds-faint">Upload clips, images, or audio, then drag them onto the timeline.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {localMediaFiles.map((f) => (
                <MediaCard key={f.id} f={f} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'lottie' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LottiePanel />
        </div>
      )}

      {tab === 'extract' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Mono size="9" className="text-ds-dim">Extract a segment</Mono>
          <p className="text-[12px] text-ds-faint">Select a video clip on the timeline to extract a segment from it.</p>
        </div>
      )}
    </div>
  );
}
