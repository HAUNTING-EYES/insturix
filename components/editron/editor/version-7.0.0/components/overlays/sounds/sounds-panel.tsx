import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MusicCatalogTrack } from "@/lib/editron/music-catalog/types";
import {
  AlertCircle,
  Check,
  Loader2,
  Pause,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import React, { FormEvent, useEffect, useRef, useState } from "react";

import { LocalSound, OverlayType, SoundOverlay } from "../../../types";
import { localSounds } from "../../../templates/sound-templates";
import { useEditorContext } from "../../../contexts/editor-context";
import { useSidebar } from "../../../contexts/sidebar-context";
import {
  BackgroundMusicAssignmentClientError,
  createBackgroundMusicIdempotencyKey,
  ingestAndAssignMusicCatalogTrack,
  searchMusicCatalog,
  fetchReferenceSong,
  type ReferenceSongPickerPayload,
} from "../../../utils/background-music-assignment";
import { MusicDiscoveryPanel } from "./music-discovery-panel";
import { SoundDetails } from "./sound-details";

type AudioLibraryView = "catalog" | "discover" | "references";

const SoundsPanel: React.FC = () => {
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AudioLibraryView>("catalog");
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogTracks, setCatalogTracks] = useState<MusicCatalogTrack[]>([]);
  const [recommendedTrackId, setRecommendedTrackId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [assigningTrackId, setAssigningTrackId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const requestControllerRef = useRef<AbortController | null>(null);
  const {
    overlays,
    selectedOverlayId,
    changeOverlay,
    projectId,
    setOverlays,
  } = useEditorContext();
  const { setActivePanel, setIsOpen } = useSidebar();
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

  const handleUpdateOverlay = (updatedOverlay: SoundOverlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, updatedOverlay);
  };

  useEffect(() => {
    localSounds.forEach((sound) => {
      audioRefs.current[sound.id] = new Audio(sound.file);
    });

    return () => {
      Object.values(audioRefs.current).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      requestControllerRef.current?.abort();
    };
  }, []);

  const togglePlay = (soundId: string) => {
    const audio = audioRefs.current[soundId];
    if (!audio) return;
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

  const beginRequest = () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return controller;
  };

  const finishRequest = (controller: AbortController) => {
    if (requestControllerRef.current === controller) {
      requestControllerRef.current = null;
    }
  };

  // Reference-song bridge (R3 identity -> licensed catalog). Loads when the
  // References view is opened, if the project has a stored reference identity.
  const [referenceSong, setReferenceSong] = useState<ReferenceSongPickerPayload | null>(null);
  const [referenceSongLoading, setReferenceSongLoading] = useState(false);

  const loadReferenceSong = async () => {
    if (!projectId) return;
    const controller = beginRequest();
    setReferenceSongLoading(true);
    setReferenceSong(null);
    try {
      const payload = await fetchReferenceSong({ projectId, signal: controller.signal });
      setReferenceSong(payload);
    } catch {
      setReferenceSong({ success: false, code: 'REFERENCE_SONG_LOAD_FAILED' });
    } finally {
      finishRequest(controller);
      setReferenceSongLoading(false);
    }
  };

  const selectView = (view: AudioLibraryView) => {
    if (view !== "references" && playingTrack) {
      audioRefs.current[playingTrack]?.pause();
      setPlayingTrack(null);
    }
    setActiveView(view);
    if (view === "references") {
      void loadReferenceSong();
    }
  };

  const runCatalogSearch = async (mode: "search" | "recommend") => {
    if (mode === "search" && !searchTerm.trim()) {
      setFeedback({ tone: "error", message: "Enter a music direction to search." });
      return;
    }
    if (mode === "recommend" && !projectId) {
      setFeedback({ tone: "error", message: "Save this project before requesting a recommendation." });
      return;
    }

    const controller = beginRequest();
    setSearching(true);
    setFeedback(null);
    try {
      const result = await searchMusicCatalog({
        mode,
        projectId,
        term: mode === "search" ? searchTerm : undefined,
        signal: controller.signal,
      });
      setCatalogTracks(result.tracks);
      setRecommendedTrackId(result.recommendation?.providerTrackId ?? null);
      if (result.tracks.length === 0) {
        setFeedback({ tone: "error", message: "No catalog tracks matched this direction." });
      }
    } catch (error) {
      setCatalogTracks([]);
      setRecommendedTrackId(null);
      setFeedback({
        tone: "error",
        message: clientErrorMessage(error, "Music catalog search failed."),
      });
    } finally {
      finishRequest(controller);
      setSearching(false);
    }
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCatalogSearch("search");
  };

  const handleUseTrack = async (track: MusicCatalogTrack) => {
    if (!projectId) {
      setFeedback({ tone: "error", message: "Save this project before assigning music." });
      return;
    }

    const controller = beginRequest();
    setAssigningTrackId(track.providerTrackId);
    setFeedback(null);
    try {
      const result = await ingestAndAssignMusicCatalogTrack({
        projectId,
        track,
        idempotencyKey: createBackgroundMusicIdempotencyKey(),
        signal: controller.signal,
      });
      setOverlays(result.assignment.overlays);
      setFeedback({
        tone: "success",
        message: `${track.title} was licensed, conditioned, and added to the timeline.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: clientErrorMessage(error, "The track could not be assigned."),
      });
    } finally {
      finishRequest(controller);
      setAssigningTrackId(null);
    }
  };

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

  const renderCatalogTrack = (track: MusicCatalogTrack) => {
    const isRecommended = track.providerTrackId === recommendedTrackId;
    const isAssigning = assigningTrackId === track.providerTrackId;
    const metadata = [
      track.bpm ? `${track.bpm} BPM` : null,
      track.moods[0]?.name,
      formatDuration(track.durationMs),
    ].filter(Boolean).join(" / ");

    return (
      <div
        key={`${track.provider}:${track.providerTrackId}`}
        className={`space-y-2 rounded-md border p-3 ${
          isRecommended ? "border-emerald-500/60 bg-emerald-500/5" : "border-border"
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
              {isRecommended ? (
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  Suggested
                </span>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {track.artists.join(", ") || "Epidemic Sound"}
            </p>
          </div>
          <span
            className="flex shrink-0 items-center gap-1 text-[9px] font-medium text-muted-foreground"
            title="Provider entitlement is verified during controlled ingest"
          >
            <ShieldCheck className="h-3 w-3" />
            Checked on use
          </span>
        </div>
        <div className="flex min-h-8 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[10px] text-muted-foreground">
            {metadata}
          </span>
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1.5 rounded-md"
            disabled={Boolean(assigningTrackId) || searching || !projectId}
            onClick={() => void handleUseTrack(track)}
          >
            {isAssigning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Use track
          </Button>
        </div>
      </div>
    );
  };

  if (localOverlay) {
    return (
      <div className="h-full bg-background p-4">
        <SoundDetails
          localOverlay={localOverlay}
          setLocalOverlay={handleUpdateOverlay}
        />
      </div>
    );
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto bg-background p-4">
      <div className="flex items-center gap-1 rounded-md border border-border p-1">
        <Button
          type="button"
          size="sm"
          variant={activeView === "catalog" ? "secondary" : "ghost"}
          className="h-8 flex-1 rounded-md"
          onClick={() => selectView("catalog")}
        >
          Licensed
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeView === "discover" ? "secondary" : "ghost"}
          className="h-8 flex-1 rounded-md"
          onClick={() => selectView("discover")}
        >
          Discover
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeView === "references" ? "secondary" : "ghost"}
          className="h-8 flex-1 rounded-md"
          onClick={() => selectView("references")}
        >
          Refs
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 rounded-md"
          title="Upload audio"
          aria-label="Upload audio"
          onClick={() => {
            setActivePanel(OverlayType.LOCAL_DIR);
            setIsOpen(true);
          }}
        >
          <Upload className="h-4 w-4" />
        </Button>
      </div>

      {activeView === "catalog" ? (
        <>
          <form className="flex items-center gap-1.5" onSubmit={handleSearchSubmit}>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Mood, genre, energy"
              className="h-9 min-w-0 rounded-md"
              disabled={searching || Boolean(assigningTrackId)}
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0 rounded-md"
              disabled={searching || Boolean(assigningTrackId)}
              title="Search catalog"
              aria-label="Search catalog"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full gap-2 rounded-md"
            disabled={searching || Boolean(assigningTrackId) || !projectId}
            onClick={() => void runCatalogSearch("recommend")}
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Pick for me
          </Button>
          {feedback ? (
            <div
              role={feedback.tone === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                feedback.tone === "error"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {feedback.tone === "error" ? (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          ) : null}
          <div className="space-y-2">
            {catalogTracks.map(renderCatalogTrack)}
          </div>
        </>
      ) : activeView === "discover" ? (
        <MusicDiscoveryPanel />
      ) : (
        <div className="space-y-3">
          {referenceSongLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Detecting the reference song…
            </div>
          ) : referenceSong?.referenceAudio?.hasIdentity && referenceSong.referenceAudio.identity ? (
            <ReferenceSongSection
              identity={referenceSong.referenceAudio.identity}
              rhythm={referenceSong.referenceAudio.rhythm}
              candidates={referenceSong.match?.candidates ?? []}
              sameSong={referenceSong.match?.sameSong}
              assigningTrackId={assigningTrackId}
              onAssign={handleUseTrack}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                No reference song detected. Add a reference video and re-run to match its music.
              </p>
              {localSounds.map(renderSoundCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface ReferenceSongSectionProps {
  identity: NonNullable<ReferenceSongPickerPayload["referenceAudio"]>["identity"];
  rhythm: NonNullable<ReferenceSongPickerPayload["referenceAudio"]>["rhythm"];
  candidates: MusicCatalogTrack[];
  sameSong?: { isrc: string; candidate: MusicCatalogTrack };
  assigningTrackId: string | null;
  onAssign: (track: MusicCatalogTrack) => void;
}

function ReferenceSongSection({
  identity,
  rhythm,
  candidates,
  sameSong,
  assigningTrackId,
  onAssign,
}: ReferenceSongSectionProps) {
  if (!identity) return null;
  const primary = sameSong?.candidate ?? candidates[0];
  return (
    <div className="space-y-3">
      {/* Detected reference song */}
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
          Reference song
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground truncate">
          {identity.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {identity.artists.join(", ") || "Unknown artist"}
          {identity.cueOffsetMs !== null ? ` · starts ${(identity.cueOffsetMs / 1000).toFixed(1)}s in` : ""}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {identity.isrcs.length ? `ISRC ${identity.isrcs.join(", ")} · ` : ""}
          via {identity.provider}
          {rhythm?.bpm ? ` · ${rhythm.bpm} BPM` : ""}
          {rhythm?.cutsPerMinute ? ` · ${rhythm.cutsPerMinute} cuts/min` : ""}
        </p>
      </div>

      {primary ? (
        <div className="rounded-md border border-border bg-background p-3">
          <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
            {sameSong ? "Same song — licensed match" : "Best licensed match"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{primary.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {primary.artists.join(", ")} · {formatDuration(primary.durationMs)}
              </p>
            </div>
            <Button
              size="sm"
              disabled={assigningTrackId === primary.providerTrackId}
              onClick={() => onAssign(primary)}
              className="shrink-0"
            >
              {assigningTrackId === primary.providerTrackId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {assigningTrackId === primary.providerTrackId ? "Adding…" : "Use this song"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Licensed from the catalog. Cleared for preview; export requires your attestation (music-rights).
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No licensed match found in the catalog yet — search above for alternate tracks.
        </p>
      )}

      {candidates.length > 1 && (
        <div>
          <p className="mb-1 font-mono text-[10px] tracking-[0.08em] uppercase text-muted-foreground">
            More matches
          </p>
          <div className="space-y-1.5">
            {candidates.slice(1).map((track) => (
              <div
                key={track.providerTrackId}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{track.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {track.artists.join(", ")} · {formatDuration(track.durationMs)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={assigningTrackId === track.providerTrackId}
                  onClick={() => onAssign(track)}
                  className="shrink-0"
                >
                  Use
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function clientErrorMessage(error: unknown, fallback: string): string {
  return error instanceof BackgroundMusicAssignmentClientError
    ? error.message
    : fallback;
}

export default SoundsPanel;
