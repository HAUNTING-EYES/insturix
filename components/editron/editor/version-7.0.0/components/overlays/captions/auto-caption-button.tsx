/**
 * AutoCaptionButton Component
 * 
 * Provides AI-powered automatic caption generation for video tracks.
 * Uses Deepgram for speech-to-text with word-level timestamps.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wand2, Loader2, AlertCircle, ChevronDown, Languages } from 'lucide-react';
import { useEditorContext } from '../../../contexts/editor-context';
import { useTimelinePositioning } from '../../../hooks/use-timeline-positioning';
import { useTimeline } from '../../../contexts/timeline-context';
import { ClipOverlay, CaptionOverlay, OverlayType, CaptionWord } from '../../../types';
import { groupWordsIntoCaptions } from '@/lib/editron/utils/caption-utils';
import { defaultCaptionStyles, defaultDisplayConfig } from './default-caption-styles';

type AutoCaptionState = 'idle' | 'transcribing' | 'success' | 'error';

interface TranscribeResponse {
  success: boolean;
  words?: CaptionWord[];
  durationMs?: number;
  detectedLanguage?: string;
  confidence?: number;
  transcript?: string;
  message?: string;
  error?: string;
}

interface SupportedLanguage {
  code: string;
  label: string;
}

const FUN_MESSAGES = [
  'Listening to your video...',
  'Transcribing speech...',
  'Finding the perfect words...',
  'Almost there...',
];

export const AutoCaptionButton: React.FC = () => {
  const [state, setState] = useState<AutoCaptionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto');
  const [funMessageIndex, setFunMessageIndex] = useState(0);
  const [languages, setLanguages] = useState<SupportedLanguage[]>([
    { code: 'auto', label: 'Auto-detect' },
  ]);

  const getVideoLabel = (video: ClipOverlay) => {
    const MAX_LABEL_LEN = 30;
    const truncateLabel = (label: string) =>
      label.length > MAX_LABEL_LEN ? `${label.slice(0, MAX_LABEL_LEN - 3)}...` : label;

    const raw = (video.content ?? '').trim();
    if (!raw) return `Video ${video.id}`;
    // Avoid rendering huge/base64/data URLs in the UI.
    if (/^(data:|blob:)/i.test(raw)) {
      const src = (video.src ?? '').trim();
      if (src) {
        try {
          const url = new URL(src);
          const filename = url.pathname.split('/').filter(Boolean).pop();
          if (filename) return truncateLabel(decodeURIComponent(filename));
        } catch {
          const cleaned = src.split('?')[0];
          const filename = cleaned.split('/').filter(Boolean).pop();
          if (filename) return truncateLabel(filename);
        }
      }

      return `Video ${video.id}`;
    }
    return truncateLabel(raw);
  };

  const {
    overlays,
    addOverlay,
    getAspectRatioDimensions,
    durationInFrames,
    setOverlays,
  } = useEditorContext();

  // Use composition dimensions for overlay positioning (not preview container dimensions)
  const compositionDimensions = getAspectRatioDimensions();

  const { findNextAvailablePosition, createNewTopLayer } = useTimelinePositioning();
  const { visibleRows } = useTimeline();

  // Get all video overlays
  const videoOverlays = useMemo(() => {
    return overlays.filter(
      (overlay): overlay is ClipOverlay => overlay.type === OverlayType.VIDEO
    );
  }, [overlays]);

  // Get selected video
  const selectedVideo = useMemo(() => {
    if (!selectedVideoId) return videoOverlays[0] || null;
    return videoOverlays.find(v => v.id === selectedVideoId) || null;
  }, [videoOverlays, selectedVideoId]);

  // Fetch supported languages on mount
  React.useEffect(() => {
    fetch('/api/services/editron/transcribe')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.languages) {
          setLanguages(data.languages);
        }
      })
      .catch(console.error);
  }, []);

  // Rotate fun messages during transcription
  React.useEffect(() => {
    if (state !== 'transcribing') return;
    
    const interval = setInterval(() => {
      setFunMessageIndex(i => (i + 1) % FUN_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [state]);

  const handleTranscribe = async () => {
    if (!selectedVideo?.assetId) {
      setError('Please select a video with an uploaded asset');
      setState('error');
      return;
    }

    setState('transcribing');
    setError(null);
    setFunMessageIndex(0);

    try {
      const response = await fetch('/api/services/editron/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedVideo.assetId,
          language: selectedLanguage === 'auto' ? undefined : selectedLanguage,
        }),
      });

      const data: TranscribeResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Transcription failed');
      }

      if (!data.words || data.words.length === 0) {
        setError(data.message || 'No speech detected in this video');
        setState('error');
        return;
      }

      // Group words into captions using utility
      const captions = groupWordsIntoCaptions(data.words, {
        wordsPerGroup: defaultDisplayConfig.wordsPerGroup,
        groupByPunctuation: true,
      });

      // Calculate duration from caption data
      const captionDurationMs = data.durationMs || data.words[data.words.length - 1].endMs;
      const captionDurationFrames = Math.ceil((captionDurationMs / 1000) * 30);

      // Create new top layer and shift existing layers down
      const position = createNewTopLayer(
        overlays,
        setOverlays
      );

      // Create caption overlay synced to video
      const newCaptionOverlay: CaptionOverlay = {
        id: Date.now(),
        type: OverlayType.CAPTION,
        from: position.from, // Start at beginning of timeline
        durationInFrames: Math.min(captionDurationFrames, selectedVideo.durationInFrames),
        captions,
        // Position based on composition dimensions for proper render compatibility
        left: compositionDimensions.width * 0.1,
        top: compositionDimensions.height * 0.75,
        width: compositionDimensions.width * 0.8,
        height: compositionDimensions.height * 0.2,
        rotation: 0,
        isDragging: false,
        row: position.row,
        styles: defaultCaptionStyles,
        displayConfig: defaultDisplayConfig,
        position: 'bottom',
      };

      addOverlay(newCaptionOverlay);
      setState('success');

      // Reset to idle after showing success
      setTimeout(() => setState('idle'), 2000);

    } catch (err: any) {
      console.error('Transcription error:', err);
      setError(err.message || 'Failed to generate captions');
      setState('error');
    }
  };

  // No videos available
  if (videoOverlays.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Add a video to your timeline to generate captions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium text-foreground">AI Auto-Caption</h3>
      </div>

      {/* Video Selector (if multiple videos) */}
      {videoOverlays.length > 1 && (
        <Select
          value={selectedVideoId?.toString() || videoOverlays[0]?.id.toString()}
          onValueChange={(value) => setSelectedVideoId(parseInt(value, 10))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select video" />
          </SelectTrigger>
          <SelectContent>
            {videoOverlays.map((video) => (
              <SelectItem key={video.id} value={video.id.toString()}>
                {getVideoLabel(video)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Language Selector */}
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-muted-foreground" />
        <Select
          value={selectedLanguage}
          onValueChange={setSelectedLanguage}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleTranscribe}
        disabled={state === 'transcribing' || !selectedVideo}
        className="w-full"
      >
        {state === 'transcribing' ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {FUN_MESSAGES[funMessageIndex]}
          </>
        ) : state === 'success' ? (
          <>✓ Captions Added!</>
        ) : (
          <>
            <Wand2 className="mr-2 h-4 w-4" />
            Generate Captions
          </>
        )}
      </Button>

      {/* Error State */}
      {state === 'error' && error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-destructive">{error}</p>
            <button
              onClick={() => { setState('idle'); setError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground mt-1 underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Info Text */}
      <p className="text-xs text-muted-foreground text-center">
        Powered by Deepgram AI • Supports 20+ languages
      </p>
    </div>
  );
};
