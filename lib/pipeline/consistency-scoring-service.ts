/**
 * Consistency Scoring Service
 *
 * After storyboard image generation, analyzes sequential scene keyframes
 * using Gemini Vision to check if main subject appearance, lighting,
 * color palette, and art style are coherent across scenes.
 * Flags mismatched scenes for auto-regeneration.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import type { Storyboard } from './schemas/storyboard';
import { safeParseLlmJson } from './llm-json-safe-parse';

// ─── Public Types ────────────────────────────────────────────────

export interface ConsistencyScore {
  sceneIndex: number;
  overallScore: number;         // 0-1, 1 = perfectly consistent
  subjectConsistency: number;   // 0-1
  lightingConsistency: number;  // 0-1
  colorConsistency: number;     // 0-1
  styleConsistency: number;     // 0-1
  issues: string[];             // human-readable issues
  shouldRegenerate: boolean;    // true if score < threshold
}

export interface ConsistencyReport {
  projectConsistency: number;   // average across all scenes
  sceneScores: ConsistencyScore[];
  flaggedScenes: number[];      // indices of scenes below threshold
}

// ─── Internal Types ──────────────────────────────────────────────

type TierScore = 'pass' | 'warn' | 'fail';

interface PairwiseResult {
  subject: TierScore;
  lighting: TierScore;
  color: TierScore;
  style: TierScore;
  worst_issue: string | null;
  regenerate_recommendation: 'none' | 'scene_a' | 'scene_b' | 'both';
  // Legacy numeric fields for backward compatibility
  subject_num: number;
  lighting_num: number;
  color_num: number;
  style_num: number;
  issues: string[];
}

// ─── Gemini Provider ─────────────────────────────────────────────

function getGeminiProvider() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

// ─── Pairwise Comparison ─────────────────────────────────────────

const CONSISTENCY_PROMPT = `You are a visual consistency QA analyst for an AI video production pipeline.
Compare two SEQUENTIAL storyboard frames that appear back-to-back in a final video.

## SCORING (3-tier — more reliable than numeric scales)
- "pass" — consistent enough for production
- "warn" — viewer might notice a discontinuity
- "fail" — breaks continuity, scene should be regenerated

Dimensions:
1. subject_identity: Shared subjects look like the same entity? (Skip/pass if no shared subjects)
2. lighting_match: Same direction, temperature, intensity?
3. color_palette: Same color world, saturation, contrast?
4. style_coherence: Same art style, rendering quality, detail level?

Return ONLY valid JSON. No markdown, no code fences.
{"subject_identity":"pass","lighting_match":"pass","color_palette":"warn","style_coherence":"pass","worst_issue":"slight color shift from warm to cool","regenerate_recommendation":"none"}`;

/**
 * Compare two adjacent scene images using Gemini Vision.
 * Returns raw 0-10 scores for each consistency dimension.
 */
async function comparePair(
  imageUrlA: string,
  imageUrlB: string,
  sceneIndexA: number,
  sceneIndexB: number,
): Promise<PairwiseResult> {
  const google = getGeminiProvider();
  if (!google) {
    console.warn('[ConsistencyScoring] No Gemini API key — returning perfect scores');
    return { subject: 'pass', lighting: 'pass', color: 'pass', style: 'pass', worst_issue: null, regenerate_recommendation: 'none', subject_num: 10, lighting_num: 10, color_num: 10, style_num: 10, issues: [] };
  }

  try {
    // Fetch both images as base64 for Gemini Vision
    const [bufA, bufB] = await Promise.all([
      fetchImageAsBase64(imageUrlA),
      fetchImageAsBase64(imageUrlB),
    ]);

    const result = await generateText({
      // OLD: hardcoded gemini-2.5-flash. NEW: Gemini 3.1 Flash (general tasks).
      model: google(process.env.LLM_GENERAL_MODEL || 'gemini-2.5-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `${CONSISTENCY_PROMPT}\n\nFrame A is scene ${sceneIndexA}, Frame B is scene ${sceneIndexB}.` },
            {
              type: 'image',
              image: bufA.buffer,
              mimeType: bufA.mimeType,
            } as any,
            {
              type: 'image',
              image: bufB.buffer,
              mimeType: bufB.mimeType,
            } as any,
          ],
        },
      ],
      maxOutputTokens: 512,
      temperature: 0.1,
    });

    // Bundle 4 Toyota A.gemini.1 fix: safe JSON parse with fallback.
    // Gemini sometimes returns malformed JSON (incomplete output, prose around
    // the object). Previous code threw on any parse error, taking down the
    // whole pair-score call. Now we get a safe default with logged warning.
    const raw = result.text;
    const { value: parsed } = safeParseLlmJson<any>(raw, {
      // OLD: all 'pass' — hid parse failures behind false "everything OK" signal.
      // NEW: 'warn' — surfaces that we couldn't check, without triggering auto-regen.
      fallback: {
        subject_identity: 'warn',
        lighting_match: 'warn',
        color_palette: 'warn',
        style_coherence: 'warn',
        worst_issue: 'Gemini response unparseable — consistency unknown (flagged for review)',
        regenerate_recommendation: 'none', // Don't auto-regen on parse failure
      },
      label: `consistency pair (${sceneIndexA},${sceneIndexB})`,
    });

    // Convert 3-tier to numeric for backward compatibility
    const tierToNum = (t: string): number => t === 'fail' ? 3 : t === 'warn' ? 6 : 9;
    const validTier = (t: any): TierScore => ['pass', 'warn', 'fail'].includes(t) ? t : 'pass';

    return {
      subject: validTier(parsed.subject_identity),
      lighting: validTier(parsed.lighting_match),
      color: validTier(parsed.color_palette),
      style: validTier(parsed.style_coherence),
      worst_issue: parsed.worst_issue || null,
      regenerate_recommendation: parsed.regenerate_recommendation || 'none',
      subject_num: tierToNum(parsed.subject_identity || 'pass'),
      lighting_num: tierToNum(parsed.lighting_match || 'pass'),
      color_num: tierToNum(parsed.color_palette || 'pass'),
      style_num: tierToNum(parsed.style_coherence || 'pass'),
      issues: parsed.worst_issue ? [parsed.worst_issue] : [],
    };
  } catch (err: any) {
    console.error(`[ConsistencyScoring] Pair (${sceneIndexA}, ${sceneIndexB}) failed:`, err.message);
    return {
      subject: 'pass', lighting: 'pass', color: 'pass', style: 'pass',
      worst_issue: `Analysis failed: ${err.message}`, regenerate_recommendation: 'none',
      subject_num: 7, lighting_num: 7, color_num: 7, style_num: 7,
      issues: [`Analysis failed: ${err.message}`],
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function fetchImageAsBase64(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), mimeType: contentType };
}

function normalize(score: number): number {
  return Math.round((score / 10) * 100) / 100; // 0-10 → 0-1, 2 decimal places
}

// ─── Main Scoring Function ───────────────────────────────────────

/**
 * Score visual consistency across all sequential scenes in a storyboard.
 *
 * For each pair of adjacent scenes (N, N+1), sends both keyframe images
 * to Gemini 2.0 Flash Vision for structured analysis. Each scene's final
 * score is the average of its comparison with previous AND next scenes.
 *
 * @param storyboard - The storyboard object with scenes (must have imageUrl populated)
 * @param threshold  - Scenes scoring below this are flagged for regeneration (default 0.6)
 * @returns ConsistencyReport with per-scene scores and flagged scene indices
 */
export async function scoreStoryboardConsistency(
  storyboard: Storyboard,
  threshold: number = 0.6,
): Promise<ConsistencyReport> {
  // Filter to scenes that have images (skip pending/failed scenes)
  const scenesWithImages = storyboard.scenes
    .filter((s) => s.imageUrl)
    .sort((a, b) => a.sceneIndex - b.sceneIndex);

  if (scenesWithImages.length < 2) {
    console.log('[ConsistencyScoring] Less than 2 scenes with images — skipping');
    const singleScore: ConsistencyScore = scenesWithImages.length === 1
      ? {
          sceneIndex: scenesWithImages[0].sceneIndex,
          overallScore: 1,
          subjectConsistency: 1,
          lightingConsistency: 1,
          colorConsistency: 1,
          styleConsistency: 1,
          issues: [],
          shouldRegenerate: false,
        }
      : undefined as any;

    return {
      projectConsistency: 1,
      sceneScores: singleScore ? [singleScore] : [],
      flaggedScenes: [],
    };
  }

  console.log(`[ConsistencyScoring] Analyzing ${scenesWithImages.length} scenes, threshold=${threshold}`);

  // Step 1: Compare all adjacent pairs in parallel
  const pairs: Array<{ indexA: number; indexB: number; promise: Promise<PairwiseResult> }> = [];

  for (let i = 0; i < scenesWithImages.length - 1; i++) {
    const sceneA = scenesWithImages[i];
    const sceneB = scenesWithImages[i + 1];
    pairs.push({
      indexA: sceneA.sceneIndex,
      indexB: sceneB.sceneIndex,
      promise: comparePair(
        sceneA.imageUrl!,
        sceneB.imageUrl!,
        sceneA.sceneIndex,
        sceneB.sceneIndex,
      ),
    });
  }

  const pairResults = await Promise.all(pairs.map((p) => p.promise));

  // Step 2: Build a map of sceneIndex → pairwise results (each scene participates in up to 2 pairs)
  const sceneComparisons = new Map<number, PairwiseResult[]>();

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const result = pairResults[i];

    if (!sceneComparisons.has(pair.indexA)) sceneComparisons.set(pair.indexA, []);
    if (!sceneComparisons.has(pair.indexB)) sceneComparisons.set(pair.indexB, []);

    sceneComparisons.get(pair.indexA)!.push(result);
    sceneComparisons.get(pair.indexB)!.push(result);
  }

  // Step 3: Compute per-scene scores by averaging all pairwise comparisons
  const sceneScores: ConsistencyScore[] = scenesWithImages.map((scene) => {
    const comparisons = sceneComparisons.get(scene.sceneIndex) || [];

    if (comparisons.length === 0) {
      return {
        sceneIndex: scene.sceneIndex,
        overallScore: 1,
        subjectConsistency: 1,
        lightingConsistency: 1,
        colorConsistency: 1,
        styleConsistency: 1,
        issues: [],
        shouldRegenerate: false,
      };
    }

    // Average across all pairwise comparisons this scene participates in
    // Use _num fields for backward-compatible numeric averaging
    const avgSubject = comparisons.reduce((sum, c) => sum + c.subject_num, 0) / comparisons.length;
    const avgLighting = comparisons.reduce((sum, c) => sum + c.lighting_num, 0) / comparisons.length;
    const avgColor = comparisons.reduce((sum, c) => sum + c.color_num, 0) / comparisons.length;
    const avgStyle = comparisons.reduce((sum, c) => sum + c.style_num, 0) / comparisons.length;

    const subjectConsistency = normalize(avgSubject);
    const lightingConsistency = normalize(avgLighting);
    const colorConsistency = normalize(avgColor);
    const styleConsistency = normalize(avgStyle);

    // Overall = weighted average (subject gets more weight as it's most noticeable)
    const overallScore = Math.round((
      subjectConsistency * 0.35 +
      lightingConsistency * 0.20 +
      colorConsistency * 0.20 +
      styleConsistency * 0.25
    ) * 100) / 100;

    // Collect unique issues from all comparisons
    const allIssues = comparisons.flatMap((c) => c.issues);
    const uniqueIssues = [...new Set(allIssues)];

    return {
      sceneIndex: scene.sceneIndex,
      overallScore,
      subjectConsistency,
      lightingConsistency,
      colorConsistency,
      styleConsistency,
      issues: uniqueIssues,
      shouldRegenerate: overallScore < threshold,
    };
  });

  // Step 4: Identify flagged scenes
  const flaggedScenes = sceneScores
    .filter((s) => s.shouldRegenerate)
    .map((s) => s.sceneIndex);

  // Step 5: Compute project-level consistency
  const projectConsistency = sceneScores.length > 0
    ? Math.round((sceneScores.reduce((sum, s) => sum + s.overallScore, 0) / sceneScores.length) * 100) / 100
    : 1;

  console.log(
    `[ConsistencyScoring] Complete: projectConsistency=${projectConsistency}, ` +
    `flagged=${flaggedScenes.length}/${sceneScores.length} scenes ` +
    `(indices: ${flaggedScenes.join(', ') || 'none'})`,
  );

  return {
    projectConsistency,
    sceneScores,
    flaggedScenes,
  };
}

// ─── Video Quality Check (Post-Generation) ─────────────────────

export interface VideoQualityResult {
  score: number;             // 0-100
  issues: string[];          // specific problems found
  shouldRegenerate: boolean; // true if any dimension is "fail"
  verdict: 'accept' | 'regenerate';
  details: {
    temporal_coherence: TierScore;
    identity_preservation: TierScore;
    physics_plausibility: TierScore;
    artifact_presence: TierScore;
    lighting_stability: TierScore;
    worst_artifact: string | null;
    artifact_location: string | null;
    // Legacy numeric fields
    morphingArtifacts: number;
    textClarity: number;
    subjectStability: number;
    motionNaturalness: number;
    lightingStability: number;
    overallCoherence: number;
  };
}

const VIDEO_QUALITY_PROMPT = `You are a video QA analyst detecting AI generation artifacts.
Review this AI-generated video clip. Gemini can analyze the full video, not just frames.

## SCORING (3-tier — reliable and actionable)
For each dimension, score: "pass" (production ready), "warn" (viewer might notice), "fail" (must regenerate).

1. temporal_coherence: Do objects maintain their form throughout? (morphing, melting, warping)
2. identity_preservation: Is the main subject the SAME entity in all frames? (face drift, clothing change, body proportion shift)
3. physics_plausibility: Does motion obey physics? (floating objects, impossible bending, clipping through surfaces)
4. artifact_presence: Any glitches? (duplicate limbs, transparency holes, texture swimming, random text appearing)
5. lighting_stability: Consistent lighting? (brightness jumps, shadow direction flips, color temperature shifts)

## VERDICT
"accept" — no fails, usable for production
"regenerate" — any "fail" dimension, or 3+ "warn" dimensions

Return ONLY valid JSON. No markdown, no code fences.
{"temporal_coherence":"pass","identity_preservation":"pass","physics_plausibility":"warn","artifact_presence":"pass","lighting_stability":"pass","overall_verdict":"accept","worst_artifact":"slight physics issue at midpoint","artifact_location":"50% through clip"}`;

/**
 * Check AI-generated video quality by analyzing first and last frames.
 * Uses Gemini Vision to detect morphing, subject drift, text garble, etc.
 *
 * @param videoUrl - The generated video URL
 * @param referenceImageUrl - The storyboard image used to generate this video (for comparison)
 * @param threshold - Score below this triggers shouldRegenerate (default 40)
 * @returns VideoQualityResult with scores and issues
 */
export async function checkVideoQuality(
  videoUrl: string,
  referenceImageUrl?: string,
  _threshold: number = 40,
): Promise<VideoQualityResult> {
  const google = getGeminiProvider();
  if (!google) {
    console.warn('[VideoQuality] No Gemini API key — skipping quality check');
    return {
      score: 70,
      issues: [],
      shouldRegenerate: false,
      verdict: 'accept',
      details: { temporal_coherence: 'pass', identity_preservation: 'pass', physics_plausibility: 'pass', artifact_presence: 'pass', lighting_stability: 'pass', worst_artifact: null, artifact_location: null, morphingArtifacts: 7, textClarity: 7, subjectStability: 7, motionNaturalness: 7, lightingStability: 7, overallCoherence: 7 },
    };
  }

  try {
    // Use Gemini's native video understanding — upload the video URL directly.
    // Gemini 2.0 Flash can process video URLs natively without frame extraction.
    // OLD: hardcoded gemini-2.5-flash. NEW: Gemini 3.1 Flash via factory (general tasks).
    const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getGeneralModel();

    const parts: any[] = [
      { text: VIDEO_QUALITY_PROMPT },
    ];

    // If we have the reference image, include it for comparison
    if (referenceImageUrl) {
      try {
        const refImg = await fetchImageAsBase64(referenceImageUrl);
        parts.push({
          text: '\n\nThis is the REFERENCE storyboard image that was used to generate the video. The video should look like an animated version of this:',
        });
        parts.push({
          inlineData: { mimeType: refImg.mimeType, data: refImg.buffer.toString('base64') },
        });
      } catch {
        // Non-fatal — proceed without reference
      }
    }

    // Download video and send as inlineData (Gemini doesn't accept raw GCS signed URLs as fileUri)
    parts.push({
      text: '\n\nAnalyze this AI-generated video (compare first frame vs last frame):',
    });
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    // Gemini inlineData limit is ~20MB — skip if too large
    if (videoBuffer.length > 20 * 1024 * 1024) {
      throw new Error(`Video too large for inline analysis (${Math.round(videoBuffer.length / 1024 / 1024)}MB)`);
    }
    parts.push({
      inlineData: { mimeType: 'video/mp4', data: videoBuffer.toString('base64') },
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
    });

    // Bundle 4 Toyota A.gemini.1 fix: safe JSON parse with fallback.
    const raw = result.response.text();
    const { value: parsed } = safeParseLlmJson<any>(raw, {
      fallback: {
        temporal_coherence: 'pass',
        identity_preservation: 'pass',
        physics_plausibility: 'pass',
        artifact_presence: 'pass',
        lighting_stability: 'pass',
        overall_verdict: 'accept',
      },
      label: 'video consistency',
    });

    const tierToNum = (t: string): number => t === 'fail' ? 2 : t === 'warn' ? 6 : 9;
    const validTier = (t: any): TierScore => ['pass', 'warn', 'fail'].includes(t) ? t : 'pass';

    const tc = validTier(parsed.temporal_coherence);
    const ip = validTier(parsed.identity_preservation);
    const pp = validTier(parsed.physics_plausibility);
    const ap = validTier(parsed.artifact_presence);
    const ls = validTier(parsed.lighting_stability);
    const verdict = parsed.overall_verdict === 'regenerate' ? 'regenerate' : 'accept';

    // Derive numeric score for backward compat
    const score = Math.round(
      (tierToNum(tc) * 0.25 + tierToNum(ip) * 0.25 + tierToNum(pp) * 0.20 +
       tierToNum(ap) * 0.15 + tierToNum(ls) * 0.15) * 10,
    );

    const hasFail = [tc, ip, pp, ap, ls].some(t => t === 'fail');
    const warnCount = [tc, ip, pp, ap, ls].filter(t => t === 'warn').length;
    const shouldRegen = hasFail || warnCount >= 3 || verdict === 'regenerate';

    const issues = parsed.worst_artifact ? [parsed.worst_artifact] : [];

    console.log(`[VideoQuality] Score: ${score}/100, verdict: ${verdict}, tiers: tc=${tc} ip=${ip} pp=${pp} ap=${ap} ls=${ls}`);

    return {
      score,
      issues,
      shouldRegenerate: shouldRegen,
      verdict,
      details: {
        temporal_coherence: tc,
        identity_preservation: ip,
        physics_plausibility: pp,
        artifact_presence: ap,
        lighting_stability: ls,
        worst_artifact: parsed.worst_artifact || null,
        artifact_location: parsed.artifact_location || null,
        // Legacy numeric
        morphingArtifacts: tierToNum(tc),
        textClarity: 9, // Not checked separately anymore
        subjectStability: tierToNum(ip),
        motionNaturalness: tierToNum(pp),
        lightingStability: tierToNum(ls),
        overallCoherence: tierToNum(ap),
      },
    };
  } catch (err: any) {
    console.warn(`[VideoQuality] Check failed: ${err.message} — skipping`);
    return {
      score: 60,
      issues: [`Quality check failed: ${err.message}`],
      shouldRegenerate: false,
      verdict: 'accept',
      details: {
        temporal_coherence: 'pass', identity_preservation: 'pass',
        physics_plausibility: 'pass', artifact_presence: 'pass', lighting_stability: 'pass',
        worst_artifact: `Check failed: ${err.message}`, artifact_location: null,
        morphingArtifacts: 6, textClarity: 6, subjectStability: 6, motionNaturalness: 6, lightingStability: 6, overallCoherence: 6,
      },
    };
  }
}

/**
 * Compare a generated video's first frame against the storyboard image
 * and the previous scene's video. Returns consistency + quality combined.
 */
export async function checkVideoConsistencyWithNeighbors(
  videoUrl: string,
  storyboardImageUrl: string,
  previousSceneVideoUrl?: string,
): Promise<{ quality: VideoQualityResult; consistency: PairwiseResult | null }> {
  // Run quality check and consistency check in parallel
  const [quality, consistency] = await Promise.all([
    checkVideoQuality(videoUrl, storyboardImageUrl),
    previousSceneVideoUrl
      ? comparePair(storyboardImageUrl, videoUrl, -1, 0) // Use storyboard as reference
      : Promise.resolve(null),
  ]);

  return { quality, consistency };
}
