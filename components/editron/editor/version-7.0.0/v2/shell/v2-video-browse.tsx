'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Mono, inputClass } from '@/components/primitives';
import { cn } from '@/lib/utils';
import { useEditorContext } from '../../contexts/editor-context';
import { useTimelinePositioning } from '../../hooks/use-timeline-positioning';
import { useAspectRatio } from '../../hooks/use-aspect-ratio';
import { useTimeline } from '../../contexts/timeline-context';
import { Overlay, OverlayType } from '../../types';
import { usePexelsVideos } from '../../hooks/use-pexels-video';

/* ═══ Editron editor v2 · Video (browse-only) ════════════════════════
   v2-native re-skin of the real VideoOverlayPanel's BROWSE half. Reuses
   usePexelsVideos and the exact handleAddClip add-path (create-public
   POST → addOverlay). Editing happens in the right props panel. */

interface PexelsVideoFile { quality: string; link: string }
interface PexelsVideo { id: number | string; image: string; video_files: PexelsVideoFile[] }

export function V2VideoBrowse() {
  const [q, setQ] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const { videos, isLoading, fetchVideos } = usePexelsVideos();
  const { addOverlay, overlays, durationInFrames } = useEditorContext();
  const { findNextAvailablePosition } = useTimelinePositioning();
  const { getAspectRatioDimensions, calculateFitToFrameDimensions } = useAspectRatio();
  const { visibleRows } = useTimeline();

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) fetchVideos(q);
  };

  // Add-path copied verbatim from video-overlay-panel.tsx handleAddClip.
  const add = async (video: PexelsVideo) => {
    try {
      const frame = getAspectRatioDimensions();
      const vw = (video as { width?: number }).width || 1920;
      const vh = (video as { height?: number }).height || 1080;
      const fitted = calculateFitToFrameDimensions(vw, vh);
      const left = (frame.width - fitted.width) / 2;
      const top = (frame.height - fitted.height) / 2;
      const { from, row } = findNextAvailablePosition(overlays, visibleRows, durationInFrames);
      const videoFile =
        video.video_files.find((f) => f.quality === 'uhd') ||
        video.video_files.find((f) => f.quality === 'hd') ||
        video.video_files.find((f) => f.quality === 'sd') ||
        video.video_files[0];
      if (!videoFile?.link) return;
      const response = await fetch('/api/services/editron/assets/create-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicUrl: videoFile.link,
          type: 'video',
          filename: `pexels-video-${video.id}.mp4`,
          thumbnail: video.image,
          dimensions: { width: fitted.width, height: fitted.height },
        }),
      });
      if (!response.ok) throw new Error('Failed to create asset record');
      const { assetId } = await response.json();
      const newOverlay: Overlay = {
        left, top, width: fitted.width, height: fitted.height, durationInFrames: 200, from,
        id: Date.now(), rotation: 0, row, isDragging: false, type: OverlayType.VIDEO,
        content: video.image, src: videoFile.link, assetId, videoStartTime: 0,
        styles: { opacity: 1, zIndex: 100, transform: 'none', objectFit: 'cover' },
      };
      addOverlay(newOverlay);
      setAddError(null);
    } catch (error) {
      console.error('Error adding video to timeline:', error);
      // Clicking a tile and having nothing happen is indistinguishable from a
      // broken app — surface the failure inline.
      setAddError('Could not add that video — try again.');
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-2.5">
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos…" style={{ fontSize: 16 }} className={cn(inputClass, 'flex-1')} />
        <button type="submit" disabled={isLoading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button border border-ds-subtle bg-surface-deeper text-ds-secondary hover:bg-surface-well focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">
          <Search size={15} />
        </button>
      </form>
      <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-center text-[10px] text-ds-faint hover:text-ds-muted">Powered by Pexels</a>
      {addError && (
        <p role="alert" className="rounded-md border border-status-danger/40 bg-status-danger/10 px-2.5 py-1.5 text-[11px] text-status-danger">{addError}</p>
      )}

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-video animate-pulse rounded-md bg-surface-well" />)
        ) : videos.length > 0 ? (
          videos.map((video) => (
            <button key={video.id} type="button" onClick={() => add(video)} title="Add to timeline" className="group relative aspect-video overflow-hidden rounded-md border border-ds-subtle hover:border-gold/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={video.image} alt="" className="h-full w-full object-cover transition-opacity group-hover:opacity-70" />
            </button>
          ))
        ) : (
          <div className="col-span-2 flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Search size={28} className="text-ds-faint opacity-40" />
            <Mono size="9" className="text-ds-dim">No videos yet</Mono>
            <p className="text-[11px] text-ds-faint">Search above to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
