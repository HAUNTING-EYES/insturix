/**
 * Media Services
 * 
 * Modular, reusable services for media processing:
 * - Transcription (Deepgram + caching)
 * - Audio Analysis (silence/filler detection)
 * - Caption Generation (with style templates)
 * 
 * All services are designed to be consumed by:
 * - AI Agent tools
 * - UI components
 * - Future subagents
 */

// Transcription
export {
  getTranscription,
} from './transcription-service';

// Audio Analysis
export {
  analyzeContent,
  analysisToTimelineFrames,
  analyzeClipAudioService
} from './analysis-service';

// Caption
export {
  createCaptions,
  refreshCaptions,
  getStylePresets,
  getStyleConfig,
} from './caption-service';

// Types
export type {
  TranscriptionData,
  TranscriptionWord,
  TranscriptionOptions,
  ContentAnalysis,
  SilenceGap,
  DetectedFiller,
  ProblematicSegment,
  AudioAnalysisOptions,
  CaptionStylePreset,
  CaptionPosition,
  CreateCaptionOptions,
  TimelineContext,
} from './types';

export {
  msToTimelineFrame,
  timelineFrameToMs,
  FILLER_WORDS,
  DEFAULTS,
} from './types';
