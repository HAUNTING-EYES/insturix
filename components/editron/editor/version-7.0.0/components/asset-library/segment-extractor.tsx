"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Scissors, Save, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Segment Extractor Component
 *
 * Provides in/out point selection on a video or audio asset.
 * Users can:
 * - Play/preview the asset
 * - Set in-point (start) and out-point (end)
 * - Preview the segment
 * - Save as a reusable segment (child asset in MongoDB)
 * - Drag the segment directly to the timeline
 *
 * The saved segment references the parent asset + time range,
 * so no data is duplicated.
 */

interface SegmentExtractorProps {
  asset: {
    assetId: string;
    name: string;
    type: 'video' | 'audio';
    path: string;
    duration: number; // seconds
    thumbnail?: string;
  };
  onSaveSegment?: (segment: {
    parentAssetId: string;
    segmentStart: number;
    segmentEnd: number;
    name: string;
  }) => void;
  onClose?: () => void;
}

export const SegmentExtractor: React.FC<SegmentExtractorProps> = ({
  asset,
  onSaveSegment,
  onClose,
}) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(asset.duration);
  const [segmentName, setSegmentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDraggingHandle, setIsDraggingHandle] = useState<'in' | 'out' | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const duration = asset.duration || 1;
  const segmentDuration = outPoint - inPoint;

  // Update current time from media element
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const handleTimeUpdate = () => setCurrentTime(el.currentTime);
    const handleEnded = () => setIsPlaying(false);
    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('ended', handleEnded);
    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      // Start from in-point if at beginning or past out-point
      if (el.currentTime < inPoint || el.currentTime >= outPoint) {
        el.currentTime = inPoint;
      }
      el.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, inPoint, outPoint]);

  // Loop within segment
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !isPlaying) return;
    const interval = setInterval(() => {
      if (el.currentTime >= outPoint) {
        el.currentTime = inPoint;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, inPoint, outPoint]);

  const setInPointHere = useCallback(() => {
    setInPoint(Math.min(currentTime, outPoint - 0.1));
  }, [currentTime, outPoint]);

  const setOutPointHere = useCallback(() => {
    setOutPoint(Math.max(currentTime, inPoint + 0.1));
  }, [currentTime, inPoint]);

  // Timeline scrub
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const time = pct * duration;
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, [duration]);

  // Handle drag on in/out markers
  const handleMarkerDrag = useCallback((e: React.MouseEvent, which: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingHandle(which);

    const timeline = timelineRef.current;
    if (!timeline) return;

    const handleMove = (moveE: MouseEvent) => {
      const rect = timeline.getBoundingClientRect();
      const x = Math.max(0, Math.min(moveE.clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;
      if (which === 'in') {
        setInPoint(Math.min(time, outPoint - 0.1));
      } else {
        setOutPoint(Math.max(time, inPoint + 0.1));
      }
    };

    const handleUp = () => {
      setIsDraggingHandle(null);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [duration, inPoint, outPoint]);

  // Save segment
  const handleSave = useCallback(async () => {
    if (!segmentName.trim()) return;
    setSaving(true);
    try {
      // Save segment to MongoDB via API
      const res = await fetch('/api/services/editron/media/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentAssetId: asset.assetId,
          segmentStart: inPoint,
          segmentEnd: outPoint,
          name: segmentName.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSaveSegment?.({
          parentAssetId: asset.assetId,
          segmentStart: inPoint,
          segmentEnd: outPoint,
          name: segmentName.trim(),
        });
        onClose?.();
      }
    } catch (err) {
      console.error('[SegmentExtractor] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [asset.assetId, inPoint, outPoint, segmentName, onSaveSegment, onClose]);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Media Player */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        {asset.type === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={asset.path}
            className="w-full max-h-[300px] object-contain"
            playsInline
          />
        ) : (
          <div className="flex items-center justify-center h-[100px] bg-zinc-900">
            <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={asset.path} />
            <div className="text-zinc-500 text-sm">Audio: {asset.name}</div>
          </div>
        )}
      </div>

      {/* Transport Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={setInPointHere} title="Set in-point at current position">
          <SkipBack className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={setOutPointHere} title="Set out-point at current position">
          <SkipForward className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Timeline with In/Out markers */}
      <div className="px-1">
        <div
          ref={timelineRef}
          className="relative h-10 bg-zinc-800 rounded-md cursor-pointer select-none"
          onClick={handleTimelineClick}
        >
          {/* Selected region highlight */}
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/20 border-y border-emerald-500/40"
            style={{
              left: `${(inPoint / duration) * 100}%`,
              width: `${((outPoint - inPoint) / duration) * 100}%`,
            }}
          />

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />

          {/* In-point marker */}
          <div
            className="absolute top-0 bottom-0 w-1.5 bg-emerald-500 cursor-ew-resize z-20 hover:bg-emerald-400 rounded-l"
            style={{ left: `${(inPoint / duration) * 100}%`, transform: 'translateX(-100%)' }}
            onMouseDown={(e) => handleMarkerDrag(e, 'in')}
            title={`In: ${formatTime(inPoint)}`}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-emerald-400 font-mono whitespace-nowrap">
              {formatTime(inPoint)}
            </div>
          </div>

          {/* Out-point marker */}
          <div
            className="absolute top-0 bottom-0 w-1.5 bg-red-500 cursor-ew-resize z-20 hover:bg-red-400 rounded-r"
            style={{ left: `${(outPoint / duration) * 100}%` }}
            onMouseDown={(e) => handleMarkerDrag(e, 'out')}
            title={`Out: ${formatTime(outPoint)}`}
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-red-400 font-mono whitespace-nowrap">
              {formatTime(outPoint)}
            </div>
          </div>
        </div>

        {/* Time info */}
        <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
          <span>In: {formatTime(inPoint)}</span>
          <span className="text-zinc-300 font-medium">Duration: {formatTime(segmentDuration)}</span>
          <span>Out: {formatTime(outPoint)}</span>
        </div>
      </div>

      {/* Drag hint */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60 rounded-md border border-dashed border-zinc-700 cursor-grab text-xs text-zinc-400"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/editron-asset', JSON.stringify({
            assetId: asset.assetId,
            type: asset.type,
            name: segmentName || `${asset.name} [${formatTime(inPoint)}-${formatTime(outPoint)}]`,
            path: asset.path,
            thumbnail: asset.thumbnail,
            duration: segmentDuration,
            dimensions: (asset as any).dimensions,
            segmentStart: inPoint,
            segmentEnd: outPoint,
          }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
      >
        <Scissors className="w-3.5 h-3.5 text-emerald-400" />
        <span>Drag this segment to the timeline</span>
      </div>

      {/* Save as segment */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Segment name (e.g., 'product close-up')"
          value={segmentName}
          onChange={(e) => setSegmentName(e.target.value)}
          className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-600"
        />
        <Button
          variant="default"
          size="sm"
          className="gap-1 text-xs"
          onClick={handleSave}
          disabled={!segmentName.trim() || saving}
        >
          <Save className="w-3 h-3" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default SegmentExtractor;
