import React from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, ShieldAlert } from "lucide-react";
import { LocalSound, OverlayType, SoundOverlay } from "../../../types";
import { useState, useEffect, useRef } from "react";

import { localSounds } from "../../../templates/sound-templates";
import { useEditorContext } from "../../../contexts/editor-context";
import { SoundDetails } from "./sound-details";

/**
 * SoundsPanel Component
 *
 * A panel component that manages sound overlays in the editor. It provides functionality for:
 * - Auditioning non-renderable stock reference tracks
 * - Playing/pausing sound previews
 * - Managing selected sound overlays and their properties
 *
 * The component switches between two views:
 * 1. Sound library view: Shows available sounds that can be added
 * 2. Sound details view: Shows controls for the currently selected sound overlay
 *
 * @component
 */
const SoundsPanel: React.FC = () => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const {
    overlays,
    selectedOverlayId,
    changeOverlay,
  } = useEditorContext();
  const [localOverlay, setLocalOverlay] = useState<SoundOverlay | null>(null);

  useEffect(() => {
    if (selectedOverlayId === null) {
      setLocalOverlay(null);
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.SOUND) {
      setLocalOverlay(selectedOverlay);
    }
  }, [selectedOverlayId, overlays]);

  /**
   * Updates the local overlay state and propagates changes to the editor context
   * @param {SoundOverlay} updatedOverlay - The modified sound overlay
   */
  const handleUpdateOverlay = (updatedOverlay: SoundOverlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, updatedOverlay);
  };

  /**
   * Initialize audio elements for each sound and handle cleanup
   */
  useEffect(() => {
    localSounds.forEach((sound) => {
      audioRefs.current[sound.id] = new Audio(sound.file);
    });

    return () => {
      Object.values(audioRefs.current).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, [localSounds]);

  /**
   * Toggles play/pause state for a sound track
   * Ensures only one track plays at a time
   *
   * @param soundId - Unique identifier of the sound to toggle
   */
  const togglePlay = (soundId: string) => {
    const audio = audioRefs.current[soundId];
    if (playingTrack === soundId) {
      audio.pause();
      setPlayingTrack(null);
    } else {
      if (playingTrack) {
        audioRefs.current[playingTrack].pause();
      }
      audio
        .play()
        .catch((error) => console.error("Error playing audio:", error));
      setPlayingTrack(soundId);
    }
  };

  /**
   * Renders an individual sound card with play controls and metadata
   * Stock tracks are audition-only until a cleared library is ingested.
   *
   * @param {LocalSound} sound - The sound track data to render
   * @returns {JSX.Element} A sound card component
   */
  const renderSoundCard = (sound: LocalSound) => (
    <div
      key={sound.id}
      title="Preview only - this track cannot be added to an export"
      className="group flex items-center gap-3 p-2.5 bg-background dark:bg-background rounded-md 
        border border-border dark:border-border transition-all duration-150"
    >
      <Button
        variant="ghost"
        size="sm"
        aria-label={playingTrack === sound.id ? `Pause ${sound.title}` : `Preview ${sound.title}`}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay(sound.id);
        }}
        className="h-8 w-8 rounded-full bg-transparent hover:bg-muted/50 dark:hover:bg-muted/50 
          text-foreground dark:text-foreground"
      >
        {playingTrack === sound.id ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground dark:text-foreground truncate">
          {sound.title}
        </p>
        <p className="text-[11px] text-muted-foreground dark:text-muted-foreground truncate">
          {sound.artist}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-[9px] font-medium text-amber-600 dark:text-amber-300">
        <ShieldAlert className="h-3 w-3" />
        Preview only
      </span>
    </div>
  );

  return (
    <div className="space-y-4 p-4 bg-background h-full">
      {!localOverlay ? (
        localSounds.map(renderSoundCard)
      ) : (
        <SoundDetails
          localOverlay={localOverlay}
          setLocalOverlay={handleUpdateOverlay}
        />
      )}
    </div>
  );
};

export default SoundsPanel;
