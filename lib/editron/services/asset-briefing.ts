/**
 * Asset Briefing — Bloomberg Terminal for Video Clips
 *
 * Compresses 5-Track AssetAnalysis (~2000 tokens) into a concise
 * AssetBriefing (~200 tokens) for the Unified Intelligence LLM prompt.
 *
 * The raw analysis data is preserved in MongoDB for the Intent Translator
 * (Layer 2) which needs frame-accurate data for precise EDL decisions.
 * This module only serves the LLM (Layer 1) which needs creative context,
 * not frame numbers.
 *
 * Also includes AI slop detection — deterministic pattern checks that
 * identify common AI video generation artifacts (teleporting objects,
 * face morphing, temporal inconsistency) so the LLM can avoid
 * emphasizing those frame ranges.
 */

import type {
  AssetAnalysis,
  FrameAnalysis,
  MotionSegment,
  SubjectTrackEntry,
  SpeechSegment,
} from './five-track-analysis';

// ─── Types ───────────────────────────────────────────────────────

export interface SlopFlag {
  /** Frame range where the artifact occurs */
  startFrame: number;
  endFrame: number;
  /** Human-readable description for the LLM prompt */
  description: string;
  /** Severity: how likely this is a real artifact vs analysis noise */
  severity: 'high' | 'medium' | 'low';
  /** Which check detected this */
  checkType: 'subject-teleport' | 'bbox-jump' | 'description-contradiction' | 'object-count-change' | 'text-corruption';
}

export interface AssetBriefing {
  /** Asset identifier (same as AssetAnalysis.assetId) */
  assetId: string;
  /** Duration in seconds */
  durationSec: number;
  /** One-line visual summary: "{shotType} of {subjects}, {composition}" */
  visualSummary: string;
  /** Dominant mood from keyframe analysis (-1 to 1 mapped to word) */
  mood: string;
  /** Motion profile: "static", "low motion, subtle head movement", etc. */
  motionProfile: string;
  /** The single most important moment in the clip */
  keyMoment: {
    timestampSec: number;
    description: string;
  };
  /** What audio is present (from speech segments + audio analysis) */
  audioContent: string;
  /** Whether speech was detected in native audio */
  hasSpeech: boolean;
  /** AI artifact warnings */
  slopFlags: SlopFlag[];
  /** Analysis confidence level */
  quality: 'high' | 'medium' | 'low' | 'fallback';
  /** Compressed text for direct inclusion in LLM prompt (~200 tokens) */
  promptText: string;
}

// ─── Compression ─────────────────────────────────────────────────

/**
 * Compress a full AssetAnalysis into a ~200 token briefing for the LLM.
 *
 * The LLM needs to understand WHAT is in the clip and WHERE the key
 * moment is, not raw frame-by-frame data. This function extracts the
 * creative-relevant signal and discards the noise.
 */
export function compressAnalysisToBriefing(
  analysis: AssetAnalysis,
): AssetBriefing {
  const durationSec = Math.round((analysis.durationMs || 5000) / 1000 * 10) / 10;

  // ── Visual summary from keyframes (first, middle, last) ──
  const kfs = analysis.keyframeAnalyses || [];
  const visualSummary = buildVisualSummary(kfs);

  // ── Mood from average moodScore ──
  const mood = deriveMood(kfs);

  // ── Motion profile from segments ──
  const motionProfile = buildMotionProfile(analysis.motionSegments || []);

  // ── Key moment: highest energy keyframe ──
  const keyMoment = findKeyMoment(kfs, analysis.motionPeaks || [], durationSec);

  // ── Audio content ──
  const audioContent = buildAudioContent(analysis);
  const hasSpeech = (analysis.speechSegments || []).some(s => s.text.trim().length > 0)
    || (analysis.audio?.speechSegments || []).some(s => s.text.trim().length > 0);

  // ── Slop detection ──
  const slopFlags = detectSlop(analysis);

  // ── Quality ──
  const quality = analysis.analysisQuality || 'fallback';

  // ── Build prompt text ──
  const slopText = slopFlags.length > 0
    ? ` AI ARTIFACTS: ${slopFlags.map(f => f.description).join('; ')}.`
    : '';

  const promptText = [
    visualSummary,
    `Mood: ${mood}.`,
    `Motion: ${motionProfile}.`,
    `Key moment at ${keyMoment.timestampSec}s: ${keyMoment.description}.`,
    `Audio: ${audioContent}.`,
    hasSpeech ? 'Contains speech.' : 'No speech detected.',
    slopText,
    quality === 'fallback' ? '(Low-confidence analysis — storyboard metadata only, no video vision.)' : '',
  ].filter(Boolean).join(' ');

  return {
    assetId: analysis.assetId,
    durationSec,
    visualSummary,
    mood,
    motionProfile,
    keyMoment,
    audioContent,
    hasSpeech,
    slopFlags,
    quality,
    promptText,
  };
}

// ─── Helper: Visual Summary ──────────────────────────────────────

function buildVisualSummary(keyframes: FrameAnalysis[]): string {
  if (keyframes.length === 0) return 'Unknown visual content';

  // Use the first keyframe as the primary descriptor
  const primary = keyframes[0];
  const mainSubjects = primary.subjects
    .filter(s => s.isMainSubject || s.confidence > 0.7)
    .map(s => s.label)
    .slice(0, 3);

  const subjectText = mainSubjects.length > 0
    ? mainSubjects.join(', ')
    : 'unidentified subject';

  const shotType = primary.shotType !== 'unknown' ? primary.shotType : 'medium shot';
  const colors = primary.dominantColors?.slice(0, 2).join('/') || '';
  const colorText = colors ? `, ${colors} palette` : '';

  return `${shotType} of ${subjectText}${colorText}, ${primary.cameraAngle || 'eye-level'}`;
}

// ─── Helper: Mood ────────────────────────────────────────────────

function deriveMood(keyframes: FrameAnalysis[]): string {
  if (keyframes.length === 0) return 'neutral';

  const avgMood = keyframes.reduce((sum, kf) => sum + (kf.moodScore || 0), 0) / keyframes.length;
  const avgEnergy = keyframes.reduce((sum, kf) => sum + (kf.energyLevel || 0.5), 0) / keyframes.length;

  // Map -1..1 mood + 0..1 energy to descriptive word
  if (avgMood > 0.5 && avgEnergy > 0.6) return 'joyful, high-energy';
  if (avgMood > 0.5 && avgEnergy <= 0.6) return 'warm, peaceful';
  if (avgMood > 0.1 && avgEnergy > 0.6) return 'upbeat, lively';
  if (avgMood > 0.1) return 'positive, calm';
  if (avgMood > -0.2) return 'neutral';
  if (avgMood > -0.5 && avgEnergy > 0.6) return 'tense, intense';
  if (avgMood > -0.5) return 'somber, reflective';
  return 'dark, heavy';
}

// ─── Helper: Motion Profile ──────────────────────────────────────

function buildMotionProfile(segments: MotionSegment[]): string {
  if (segments.length === 0) return 'no motion data';

  const avgIntensity = segments.reduce((s, m) => s + m.motionIntensity, 0) / segments.length;
  const dominantMotion = segments
    .sort((a, b) => (b.endFrame - b.startFrame) - (a.endFrame - a.startFrame))[0];

  const intensityWord = avgIntensity < 0.2 ? 'static'
    : avgIntensity < 0.4 ? 'low motion'
    : avgIntensity < 0.6 ? 'moderate motion'
    : avgIntensity < 0.8 ? 'high motion'
    : 'very high motion';

  const cameraWord = dominantMotion.cameraMotion !== 'static'
    ? `, camera ${dominantMotion.cameraMotion.replace('-', ' ')}`
    : '';

  return `${intensityWord}${cameraWord}`;
}

// ─── Helper: Key Moment ──────────────────────────────────────────

function findKeyMoment(
  keyframes: FrameAnalysis[],
  motionPeaks: number[],
  durationSec: number,
): { timestampSec: number; description: string } {
  if (keyframes.length === 0) {
    return { timestampSec: durationSec / 2, description: 'midpoint (no keyframe data)' };
  }

  // Prefer: highest energy keyframe that's also near a motion peak
  const fps = 30;
  const scored = keyframes.map(kf => {
    const nearPeak = motionPeaks.some(p => Math.abs(p - kf.frame) <= 10);
    const score = kf.energyLevel + (kf.naturalCutPoint ? 0.2 : 0) + (nearPeak ? 0.3 : 0);
    return { kf, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0].kf;
  const ts = Math.round(best.timestampMs / 100) / 10;

  // Build concise description from subjects + what's happening
  const subjects = best.subjects.filter(s => s.isMainSubject).map(s => s.label).join(', ');
  const desc = subjects
    ? `${subjects} — ${best.description.substring(0, 80)}`
    : best.description.substring(0, 100);

  return { timestampSec: ts, description: desc };
}

// ─── Helper: Audio Content ───────────────────────────────────────

function buildAudioContent(analysis: AssetAnalysis): string {
  const parts: string[] = [];

  // Speech segments
  const speech = analysis.speechSegments || [];
  if (speech.length > 0) {
    const languages = new Set(speech.map(s => s.text.trim()).filter(Boolean));
    parts.push(`speech detected (${languages.size} segment${languages.size > 1 ? 's' : ''})`);
  }

  // Audio analysis
  const audio = analysis.audio;
  if (audio) {
    if (audio.beats.length > 0) parts.push(`${audio.beats.length} beats detected`);
    if (audio.silences.length > 0 && audio.silences.some(s => s.durationMs > 500)) {
      parts.push('significant silence');
    }
    const avgEnergy = audio.energyCurve.length > 0
      ? audio.energyCurve.reduce((s, e) => s + e.energy, 0) / audio.energyCurve.length
      : 0;
    if (avgEnergy > 0.6) parts.push('high audio energy');
    else if (avgEnergy > 0.3) parts.push('moderate audio energy');
    else if (avgEnergy > 0.05) parts.push('low ambient audio');
  }

  // Music structure
  if (analysis.musicStructure) {
    parts.push(`music: ${analysis.musicStructure.bpm} BPM`);
    if (analysis.musicStructure.drops.length > 0) {
      parts.push(`${analysis.musicStructure.drops.length} energy drops`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'no audio analysis available';
}

// ─── Slop Detection ──────────────────────────────────────────────

/**
 * Detect common AI video generation artifacts from 5-Track analysis data.
 *
 * These are DETERMINISTIC pattern checks — no LLM call. They look for
 * impossible physics, teleporting objects, and other AI slop that a
 * human editor would immediately notice and avoid emphasizing.
 *
 * Results are included in the AssetBriefing so the creative intelligence
 * can say "avoid zooming near 3.2s" instead of placing a punch-zoom
 * on an artifact frame.
 */
export function detectSlop(analysis: AssetAnalysis): SlopFlag[] {
  const flags: SlopFlag[] = [];
  const kfs = analysis.keyframeAnalyses || [];
  const tracks = analysis.subjectTracks || [];

  // ── Check 1: Subject Teleport ──
  // Subject present in keyframe N, absent in N+1, present in N+2
  for (const track of tracks) {
    if (track.frames.length < 3) continue;
    for (let i = 1; i < track.frames.length - 1; i++) {
      const prev = track.frames[i - 1];
      const curr = track.frames[i];
      const next = track.frames[i + 1];
      // Gap detection: confidence drops below 0.2 then recovers
      if (prev.confidence > 0.5 && curr.confidence < 0.2 && next.confidence > 0.5) {
        flags.push({
          startFrame: prev.frame,
          endFrame: next.frame,
          description: `${track.label} disappears at frame ${curr.frame} then reappears`,
          severity: 'high',
          checkType: 'subject-teleport',
        });
      }
    }
  }

  // ── Check 2: Bounding Box Jump ──
  // Subject box size changes >50% between adjacent keyframes
  for (const track of tracks) {
    for (let i = 1; i < track.frames.length; i++) {
      const prev = track.frames[i - 1];
      const curr = track.frames[i];
      if (!prev.box || !curr.box) continue;
      const prevArea = prev.box.w * prev.box.h;
      const currArea = curr.box.w * curr.box.h;
      if (prevArea === 0 || currArea === 0) continue;
      const ratio = Math.max(prevArea / currArea, currArea / prevArea);
      if (ratio > 2.0) { // >100% size change
        flags.push({
          startFrame: prev.frame,
          endFrame: curr.frame,
          description: `${track.label} size changes ${Math.round(ratio * 100 - 100)}% between frames ${prev.frame}-${curr.frame} (possible morphing)`,
          severity: ratio > 3.0 ? 'high' : 'medium',
          checkType: 'bbox-jump',
        });
      }
    }
  }

  // ── Check 3: Description Contradiction ──
  // Adjacent keyframes contradict each other (indoor→outdoor, day→night)
  const contradictionPairs = [
    ['indoor', 'outdoor'], ['inside', 'outside'],
    ['daytime', 'nighttime'], ['day', 'night'],
    ['sunny', 'dark'], ['bright', 'dim'],
  ];
  for (let i = 1; i < kfs.length; i++) {
    const prevDesc = (kfs[i - 1].description || '').toLowerCase();
    const currDesc = (kfs[i].description || '').toLowerCase();
    for (const [a, b] of contradictionPairs) {
      if ((prevDesc.includes(a) && currDesc.includes(b)) ||
          (prevDesc.includes(b) && currDesc.includes(a))) {
        // Only flag if within same shot (no shot boundary between them)
        const shotBoundaryBetween = (analysis.shots || []).some(s =>
          s.endFrame > kfs[i - 1].frame && s.endFrame < kfs[i].frame
        );
        if (!shotBoundaryBetween) {
          flags.push({
            startFrame: kfs[i - 1].frame,
            endFrame: kfs[i].frame,
            description: `contradictory: "${a}" at frame ${kfs[i - 1].frame} → "${b}" at frame ${kfs[i].frame} within same shot`,
            severity: 'medium',
            checkType: 'description-contradiction',
          });
        }
      }
    }
  }

  // ── Check 4: Object Count Change ──
  // Number of subjects changes between adjacent keyframes without shot boundary
  for (let i = 1; i < kfs.length; i++) {
    const prevCount = kfs[i - 1].subjects?.length || 0;
    const currCount = kfs[i].subjects?.length || 0;
    if (prevCount > 0 && currCount > 0 && Math.abs(prevCount - currCount) >= 2) {
      const shotBoundaryBetween = (analysis.shots || []).some(s =>
        s.endFrame > kfs[i - 1].frame && s.endFrame < kfs[i].frame
      );
      if (!shotBoundaryBetween) {
        flags.push({
          startFrame: kfs[i - 1].frame,
          endFrame: kfs[i].frame,
          description: `subject count jumps from ${prevCount} to ${currCount} without scene cut (possible AI hallucination)`,
          severity: 'medium',
          checkType: 'object-count-change',
        });
      }
    }
  }

  // ── Check 5: Text Corruption ──
  // Keyframe descriptions mentioning garbled/unreadable text
  const textCorruptionPatterns = [
    /garbled|illegible|unreadable|corrupted|distorted text/i,
    /random (?:letters|characters|symbols)/i,
    /text (?:appears|shows) (?:but|as) (?:gibberish|nonsense)/i,
  ];
  for (const kf of kfs) {
    const desc = kf.description || '';
    if (textCorruptionPatterns.some(p => p.test(desc))) {
      flags.push({
        startFrame: Math.max(0, kf.frame - 5),
        endFrame: kf.frame + 5,
        description: `corrupted/garbled text visible at frame ${kf.frame}`,
        severity: 'low',
        checkType: 'text-corruption',
      });
    }
  }

  return flags;
}

// ─── Batch Compression ───────────────────────────────────────────

/**
 * Compress all analyses in a map to briefings.
 * Used by the director agent to prepare context for Unified Intelligence.
 */
export function compressAllAnalyses(
  analysesMap: Map<string, AssetAnalysis>,
): Map<string, AssetBriefing> {
  const briefings = new Map<string, AssetBriefing>();
  for (const [assetId, analysis] of analysesMap) {
    try {
      briefings.set(assetId, compressAnalysisToBriefing(analysis));
    } catch (err: any) {
      console.warn(`[AssetBriefing] Failed to compress ${assetId}: ${err.message}`);
      // Create minimal fallback briefing
      briefings.set(assetId, {
        assetId,
        durationSec: (analysis.durationMs || 5000) / 1000,
        visualSummary: 'Unknown (compression failed)',
        mood: 'neutral',
        motionProfile: 'unknown',
        keyMoment: { timestampSec: (analysis.durationMs || 5000) / 2000, description: 'midpoint (fallback)' },
        audioContent: 'unknown',
        hasSpeech: false,
        slopFlags: [],
        quality: 'fallback',
        promptText: 'Clip analysis unavailable — use conservative editing decisions.',
      });
    }
  }
  return briefings;
}
