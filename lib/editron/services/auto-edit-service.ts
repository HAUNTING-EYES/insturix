/**
 * Auto-Edit Service: Script + Raw Footage → Rough Cut
 *
 * Pipeline:
 * 1. Transcribe raw footage (Deepgram, word-level timestamps)
 * 2. Segment transcript by pauses and sentence boundaries
 * 3. Segment the target script into sections
 * 4. Semantic matching (Jaccard similarity on word sets)
 * 5. Best-take selection (filler count, silence, completeness)
 * 6. Assembly plan (ordered cuts with scores)
 * 7. Execute plan on timeline (split, delete, reorder, close gaps)
 */

import { projectService } from './project-service';
import { readProjectRevisionV1 } from './project-revision-v1';
import { getTranscription } from './media';
import { FILLER_WORDS } from './media/types';
import type { TranscriptionWord, TranscriptionData } from './media/types';

// ============================================================================
// TYPES
// ============================================================================

export interface AutoEditPlan {
  cuts: AutoEditCut[];
  totalDuration: number;
  coveragePercent: number;
  warnings: string[];
}

export interface AutoEditCut {
  scriptSection: string;
  sourceStartFrame: number;
  sourceEndFrame: number;
  score: number;
  fillerCount: number;
  silenceCount: number;
}

interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  wordCount: number;
  words: TranscriptionWord[];
  fillerCount: number;
  silenceGapCount: number;
  avgWordGapMs: number;
}

interface ScriptSection {
  text: string;
  index: number;
}

interface SegmentMatch {
  segment: TranscriptSegment;
  score: number;
  fillerCount: number;
  silenceCount: number;
  coverageRatio: number;
}

// ============================================================================
// STEP 1: Transcription (delegates to existing Deepgram service)
// ============================================================================

async function getTranscriptionForAsset(
  assetId: string,
  userId: string,
): Promise<TranscriptionData> {
  return getTranscription(assetId, userId, { forceRefresh: false });
}

// ============================================================================
// STEP 2: Segment Transcript
// ============================================================================

const PAUSE_THRESHOLD_MS = 1000; // 1 second pause = segment boundary
const SENTENCE_END_REGEX = /[.!?]$/;

function segmentTranscript(words: TranscriptionWord[]): TranscriptSegment[] {
  if (words.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  let currentWords: TranscriptionWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const curr = words[i];
    const gap = curr.startMs - prev.endMs;

    const prevEndsSentence = SENTENCE_END_REGEX.test(prev.word.trim());
    const isPauseBoundary = gap >= PAUSE_THRESHOLD_MS;

    if (isPauseBoundary || prevEndsSentence) {
      segments.push(buildSegment(currentWords));
      currentWords = [curr];
    } else {
      currentWords.push(curr);
    }
  }

  // Push final segment
  if (currentWords.length > 0) {
    segments.push(buildSegment(currentWords));
  }

  return segments;
}

function buildSegment(words: TranscriptionWord[]): TranscriptSegment {
  const text = words.map(w => w.word).join(' ');
  const fillerCount = countFillers(words);
  const silenceGapCount = countSilenceGaps(words);
  const avgWordGapMs = computeAvgWordGap(words);

  return {
    text,
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    wordCount: words.length,
    words,
    fillerCount,
    silenceGapCount,
    avgWordGapMs,
  };
}

function countFillers(words: TranscriptionWord[]): number {
  const fillerSet = new Set(FILLER_WORDS.map(f => f.toLowerCase()));
  return words.filter(w => fillerSet.has(w.word.toLowerCase().replace(/[.,!?]/g, ''))).length;
}

function countSilenceGaps(words: TranscriptionWord[]): number {
  let count = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i].startMs - words[i - 1].endMs > 500) {
      count++;
    }
  }
  return count;
}

function computeAvgWordGap(words: TranscriptionWord[]): number {
  if (words.length < 2) return 0;
  let totalGap = 0;
  for (let i = 1; i < words.length; i++) {
    totalGap += words[i].startMs - words[i - 1].endMs;
  }
  return totalGap / (words.length - 1);
}

// ============================================================================
// STEP 3: Segment the Script
// ============================================================================

function segmentScript(scriptText: string): ScriptSection[] {
  // Split on double newlines first (explicit section breaks)
  const rawSections = scriptText
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // If only one section, try splitting on single newlines
  let sections = rawSections;
  if (sections.length === 1) {
    sections = scriptText
      .split(/\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // If still one section (no newlines), split on sentence boundaries for long text
  if (sections.length === 1 && sections[0].length > 200) {
    sections = sections[0]
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Group very short sentences together (aim for ~2-3 sentences per section)
    const grouped: string[] = [];
    let current = '';
    for (const s of sections) {
      if (current.length + s.length < 150) {
        current += (current ? ' ' : '') + s;
      } else {
        if (current) grouped.push(current);
        current = s;
      }
    }
    if (current) grouped.push(current);
    sections = grouped;
  }

  return sections.map((text, index) => ({ text, index }));
}

// ============================================================================
// STEP 4: Semantic Matching (Jaccard Similarity)
// ============================================================================

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute word overlap ratio: how many words from the script section
 * appear in the transcript segment, divided by script section word count.
 */
function wordOverlapRatio(scriptTokens: Set<string>, segmentTokens: Set<string>): number {
  if (scriptTokens.size === 0) return 0;
  let covered = 0;
  for (const word of scriptTokens) {
    if (segmentTokens.has(word)) covered++;
  }
  return covered / scriptTokens.size;
}

function findBestMatches(
  scriptSection: ScriptSection,
  transcriptSegments: TranscriptSegment[],
): SegmentMatch[] {
  const scriptTokens = tokenize(scriptSection.text);
  const matches: SegmentMatch[] = [];

  for (const segment of transcriptSegments) {
    const segmentTokens = tokenize(segment.text);
    const jaccard = jaccardSimilarity(scriptTokens, segmentTokens);
    const overlap = wordOverlapRatio(scriptTokens, segmentTokens);

    // Combined score: weighted sum of jaccard and overlap
    const score = jaccard * 0.4 + overlap * 0.6;

    // Only consider segments with non-trivial similarity
    if (score > 0.1) {
      matches.push({
        segment,
        score,
        fillerCount: segment.fillerCount,
        silenceCount: segment.silenceGapCount,
        coverageRatio: overlap,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

// ============================================================================
// STEP 5: Best-Take Selection
// ============================================================================

function selectBestTake(matches: SegmentMatch[]): SegmentMatch | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Re-rank by composite quality score
  const ranked = matches.map(m => {
    // Higher text similarity is better
    const similarityScore = m.score;
    // Fewer fillers is better (normalize: 0 fillers = 1.0, many = 0)
    const fillerPenalty = Math.max(0, 1 - m.fillerCount * 0.15);
    // Fewer silence gaps is better
    const silencePenalty = Math.max(0, 1 - m.silenceCount * 0.1);
    // Higher coverage is better
    const coverageBonus = m.coverageRatio;
    // Lower avg word gap = better energy/clarity
    const energyScore = Math.max(0, 1 - (m.segment.avgWordGapMs / 500));

    const composite =
      similarityScore * 0.35 +
      fillerPenalty * 0.15 +
      silencePenalty * 0.10 +
      coverageBonus * 0.25 +
      energyScore * 0.15;

    return { match: m, composite };
  });

  ranked.sort((a, b) => b.composite - a.composite);
  return ranked[0].match;
}

// ============================================================================
// STEP 6: Assembly Plan
// ============================================================================

function buildAssemblyPlan(
  scriptSections: ScriptSection[],
  transcriptSegments: TranscriptSegment[],
  fps: number,
  videoStartTimeFrames: number,
): AutoEditPlan {
  const cuts: AutoEditCut[] = [];
  const warnings: string[] = [];
  let coveredSections = 0;

  for (const section of scriptSections) {
    const matches = findBestMatches(section, transcriptSegments);
    const bestTake = selectBestTake(matches);

    if (bestTake) {
      coveredSections++;

      // Convert ms timestamps to frames (relative to source video)
      const sourceStartFrame = Math.round((bestTake.segment.startMs / 1000) * fps) + videoStartTimeFrames;
      const sourceEndFrame = Math.round((bestTake.segment.endMs / 1000) * fps) + videoStartTimeFrames;

      cuts.push({
        scriptSection: section.text,
        sourceStartFrame,
        sourceEndFrame,
        score: Math.round(bestTake.score * 100) / 100,
        fillerCount: bestTake.fillerCount,
        silenceCount: bestTake.silenceCount,
      });
    } else {
      warnings.push(`No matching footage found for script section ${section.index + 1}: "${section.text.substring(0, 60)}..."`);
    }
  }

  // Calculate total duration
  const totalDurationFrames = cuts.reduce(
    (sum, cut) => sum + (cut.sourceEndFrame - cut.sourceStartFrame),
    0,
  );

  const coveragePercent = scriptSections.length > 0
    ? Math.round((coveredSections / scriptSections.length) * 100)
    : 0;

  if (coveragePercent < 50) {
    warnings.push(`Low coverage (${coveragePercent}%): The footage may not match the script well.`);
  }

  return {
    cuts,
    totalDuration: totalDurationFrames,
    coveragePercent,
    warnings,
  };
}

// ============================================================================
// MAIN: autoEditFromScript
// ============================================================================

export async function autoEditFromScript(
  projectId: string,
  userId: string,
  scriptText: string,
  videoOverlayId?: string,
): Promise<AutoEditPlan> {
  // Load project
  const project = await projectService.loadProject(userId, projectId);
  if (!project) throw new Error('Project not found or unauthorized.');

  const fps = project.fps || 30;

  // Find the target video overlay
  let videoOverlay: any;
  if (videoOverlayId) {
    videoOverlay = project.overlays.find(
      (o: any) => o.id === Number(videoOverlayId) && o.type === 'video',
    );
    if (!videoOverlay) throw new Error(`Video overlay ${videoOverlayId} not found.`);
  } else {
    // Pick the first/longest video overlay
    const videoOverlays = project.overlays
      .filter((o: any) => o.type === 'video' && o.assetId)
      .sort((a: any, b: any) => b.durationInFrames - a.durationInFrames);
    if (videoOverlays.length === 0) {
      throw new Error('No video overlays found in project.');
    }
    videoOverlay = videoOverlays[0];
  }

  if (!videoOverlay.assetId) {
    throw new Error('Video overlay has no asset ID (not uploaded).');
  }

  // Step 1: Transcribe
  const transcription = await getTranscriptionForAsset(videoOverlay.assetId, userId);

  if (!transcription.words || transcription.words.length === 0) {
    throw new Error('Transcription returned no words. The video may have no speech.');
  }

  // Step 2: Segment transcript
  const transcriptSegments = segmentTranscript(transcription.words);

  if (transcriptSegments.length === 0) {
    throw new Error('Could not segment transcript. The video may have very little speech.');
  }

  // Step 3: Segment script
  const scriptSections = segmentScript(scriptText);

  if (scriptSections.length === 0) {
    throw new Error('Could not parse script text. Please provide non-empty script text.');
  }

  // Steps 4-6: Match, select best takes, build plan
  const videoStartTimeFrames = videoOverlay.videoStartTime || 0;
  const plan = buildAssemblyPlan(scriptSections, transcriptSegments, fps, videoStartTimeFrames);

  return plan;
}

// ============================================================================
// EXECUTE: Apply AutoEditPlan to Timeline
// ============================================================================

export async function executeAutoEdit(
  projectId: string,
  userId: string,
  videoOverlayId: string,
  plan: AutoEditPlan,
): Promise<{ message: string; clipsCreated: number; totalDurationFrames: number }> {
  const project = await projectService.loadProject(userId, projectId);
  if (!project) throw new Error('Project not found or unauthorized.');

  const fps = project.fps || 30;

  // Find the source video overlay
  const sourceOverlay = project.overlays.find(
    (o: any) => o.id === Number(videoOverlayId) && o.type === 'video',
  );
  if (!sourceOverlay) throw new Error(`Video overlay ${videoOverlayId} not found.`);

  // Strategy: delete the original video overlay, then create new clip overlays
  // for each cut in the plan, placed sequentially on the timeline.

  // Delete the original overlay
  await projectService.deleteOverlay(userId, projectId, sourceOverlay.id);

  const projectAfterDelete = await projectService.loadProject(userId, projectId);
  if (!projectAfterDelete) throw new Error('Project disappeared after removing the source overlay.');
  let expectedRevision = readProjectRevisionV1(projectAfterDelete);
  if (!expectedRevision) {
    throw new Error('The project revision is unavailable after removing the source overlay.');
  }

  // Create new clips in script order, placed sequentially
  let currentFrame = sourceOverlay.from || 0; // Start where the original video was

  for (const cut of plan.cuts) {
    const clipDurationFrames = cut.sourceEndFrame - cut.sourceStartFrame;
    if (clipDurationFrames <= 0) continue;

    const newId = Date.now() + Math.floor(Math.random() * 10000);
    const newOverlay = {
      ...sourceOverlay,
      id: newId,
      from: currentFrame,
      durationInFrames: clipDurationFrames,
      videoStartTime: cut.sourceStartFrame,
    };

    const addResult = await projectService.addOverlayAtRevisionV1(
      userId,
      projectId,
      {
        expectedRevision,
        actorKind: 'SYSTEM',
        overlay: newOverlay as any,
      },
    );
    expectedRevision = addResult.mutationReceipt.revision;
    currentFrame += clipDurationFrames;
  }

  // Recalculate project duration
  const updatedProject = await projectService.loadProject(userId, projectId);
  if (updatedProject && updatedProject.overlays?.length) {
    const maxFrame = Math.max(
      ...updatedProject.overlays.map((o: any) => (o.from || 0) + (o.durationInFrames || 0)),
    );
    if (maxFrame > 0) {
      await projectService.updateProject(userId, projectId, { durationInFrames: maxFrame });
    }
  }

  const totalDurationFrames = plan.cuts.reduce(
    (sum, cut) => sum + (cut.sourceEndFrame - cut.sourceStartFrame),
    0,
  );

  return {
    message: `Auto-edit complete: created ${plan.cuts.length} clips from script, total ${Math.round((totalDurationFrames / fps) * 10) / 10}s`,
    clipsCreated: plan.cuts.length,
    totalDurationFrames,
  };
}
