'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, ShieldAlert } from 'lucide-react';
import { localSounds } from '../../templates/sound-templates';

/* Stock sounds are audition-only until a render-cleared library is ingested. */

export function V2SoundBrowse() {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

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

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2.5">
      {localSounds.map((sound) => (
        <div
          key={sound.id}
          title="Preview only - this track cannot be added to an export"
          className="group flex items-center gap-3 rounded-md border border-ds-subtle bg-surface-deeper p-2.5"
        >
          <button
            type="button"
            aria-label={playingTrack === sound.id ? `Pause ${sound.title}` : `Preview ${sound.title}`}
            onClick={(e) => { e.stopPropagation(); togglePlay(sound.id); }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ds-subtle bg-surface-canvas text-ds-secondary hover:text-gold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            {playingTrack === sound.id ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ds-primary">{sound.title}</p>
            <p className="truncate text-[11px] text-ds-muted">{sound.artist}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-status-warning/40 bg-status-warning/10 px-1.5 py-1 font-mono text-[8px] font-semibold uppercase text-status-warning">
            <ShieldAlert size={11} />
            Preview only
          </span>
        </div>
      ))}
    </div>
  );
}
