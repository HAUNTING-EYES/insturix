'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { LocalSound, OverlayType, SoundOverlay } from '../../types';
import { localSounds } from '../../templates/sound-templates';
import { useTimelinePositioning } from '../../hooks/use-timeline-positioning';
import { useEditorContext } from '../../contexts/editor-context';
import { useTimeline } from '../../contexts/timeline-context';

/* ═══ Editron editor v2 · Sound (browse-only) ════════════════════════
   v2-native re-skin of the real SoundsPanel's BROWSE half — the stock
   sound library with previews. Reuses localSounds and the exact
   handleAddToTimeline add-path (create-public POST → addOverlay). Editing
   (volume) happens in the right props panel. */

export function V2SoundBrowse() {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const { addOverlay, overlays, durationInFrames } = useEditorContext();
  const { findNextAvailablePosition } = useTimelinePositioning();
  const { visibleRows } = useTimeline();

  useEffect(() => {
    localSounds.forEach((sound) => {
      audioRefs.current[sound.id] = new Audio(sound.file);
    });
    const refs = audioRefs.current;
    return () => {
      Object.values(refs).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, []);

  const togglePlay = (soundId: string) => {
    const audio = audioRefs.current[soundId];
    if (playingTrack === soundId) {
      audio.pause();
      setPlayingTrack(null);
    } else {
      if (playingTrack) audioRefs.current[playingTrack].pause();
      audio.play().catch((error) => console.error('Error playing audio:', error));
      setPlayingTrack(soundId);
    }
  };

  // Add-path copied verbatim from sounds-panel.tsx handleAddToTimeline.
  const add = async (sound: LocalSound) => {
    try {
      const response = await fetch('/api/services/editron/assets/create-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicUrl: sound.file, type: 'audio', filename: `${sound.title}.mp3`, duration: sound.duration }),
      });
      if (!response.ok) throw new Error('Failed to create asset record');
      const { assetId } = await response.json();
      const { from, row } = findNextAvailablePosition(overlays, visibleRows, durationInFrames);
      const newSoundOverlay: SoundOverlay = {
        id: Date.now(), type: OverlayType.SOUND, content: sound.title, assetId, from, row,
        left: 0, top: 0, width: 1920, height: 100, rotation: 0, isDragging: false,
        durationInFrames: sound.duration * 30, styles: { opacity: 1 },
      };
      addOverlay(newSoundOverlay);
    } catch (error) {
      console.error('Error adding sound to timeline:', error);
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2.5">
      {localSounds.map((sound) => (
        <div
          key={sound.id}
          onClick={() => add(sound)}
          title="Add to timeline"
          className="group flex cursor-pointer items-center gap-3 rounded-md border border-ds-subtle bg-surface-deeper p-2.5 transition-colors hover:bg-surface-well"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); togglePlay(sound.id); }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ds-subtle bg-surface-canvas text-ds-secondary hover:text-gold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            {playingTrack === sound.id ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ds-primary">{sound.title}</p>
            <p className="truncate text-[11px] text-ds-muted">{sound.artist}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
