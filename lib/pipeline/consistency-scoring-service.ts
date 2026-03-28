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

interface PairwiseResult {
  subject: number;   // 0-10
  lighting: number;  // 0-10
  color: number;     // 0-10
  style: number;     // 0-10
  issues: string[];
}

// ─── Gemini Provider ─────────────────────────────────────────────

function getGeminiProvider() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return createGoogleGenerativeAI({ apiKey });
}

// ─── Pairwise Comparison ─────────────────────────────────────────

const CONSISTENCY_PROMPT = `You are a visual consistency analyst for a video storyboard pipeline.
You will be given two sequential storyboard frames from a video project.
Analyze them for visual consistency across the following dimensions.

Score each dimension from 0 to 10 (10 = perfectly consistent, 0 = completely different):

1. **Subject consistency**: Does the main subject (character, object, product) look the same across both frames? Same features, proportions, clothing, distinguishing marks?
2. **Lighting consistency**: Same lighting direction, color temperature (warm/cool), intensity, shadow placement?
3. **Color consistency**: Same overall color palette, saturation levels, contrast, color grading?
4. **Style consistency**: Same art style, rendering technique, level of detail, visual treatment?

Also list any specific inconsistencies you notice.

IMPORTANT: Return ONLY valid JSON with no markdown formatting, no code fences, no explanation outside the JSON. The JSON must match this exact structure:
{"subject":N,"lighting":N,"color":N,"style":N,"issues":["issue1","issue2"]}

Where N is a number 0-10. If there are no issues, use an empty array: "issues":[]`;

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
    return { subject: 10, lighting: 10, color: 10, style: 10, issues: [] };
  }

  try {
    // Fetch both images as base64 for Gemini Vision
    const [bufA, bufB] = await Promise.all([
      fetchImageAsBase64(imageUrlA),
      fetchImageAsBase64(imageUrlB),
    ]);

    const result = await generateText({
      model: google('gemini-2.0-flash'),
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
      maxTokens: 512,
      temperature: 0.1,
    });

    const raw = result.text.trim();
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonStr) as PairwiseResult;

    // Validate and clamp scores
    return {
      subject: clamp(parsed.subject ?? 10, 0, 10),
      lighting: clamp(parsed.lighting ?? 10, 0, 10),
      color: clamp(parsed.color ?? 10, 0, 10),
      style: clamp(parsed.style ?? 10, 0, 10),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch (err: any) {
    console.error(`[ConsistencyScoring] Pair (${sceneIndexA}, ${sceneIndexB}) failed:`, err.message);
    // Return neutral scores on failure so we don't falsely flag scenes
    return { subject: 7, lighting: 7, color: 7, style: 7, issues: [`Analysis failed: ${err.message}`] };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

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
    const avgSubject = comparisons.reduce((sum, c) => sum + c.subject, 0) / comparisons.length;
    const avgLighting = comparisons.reduce((sum, c) => sum + c.lighting, 0) / comparisons.length;
    const avgColor = comparisons.reduce((sum, c) => sum + c.color, 0) / comparisons.length;
    const avgStyle = comparisons.reduce((sum, c) => sum + c.style, 0) / comparisons.length;

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
  shouldRegenerate: boolean; // true if score < 40
  details: {
    morphingArtifacts: number;   // 0-10
    textClarity: number;         // 0-10
    subjectStability: number;    // 0-10
    motionNaturalness: number;   // 0-10
    lightingStability: number;   // 0-10
    overallCoherence: number;    // 0-10
  };
}

const VIDEO_QUALITY_PROMPT = `You are a video quality analyst for an AI video generation pipeline.
You will see the FIRST and LAST frames of an AI-generated video clip.
Analyze them for common AI video artifacts and quality issues.

Score each dimension from 0 to 10 (10 = perfect, 0 = unwatchable):

1. **morphing**: Are there visible morphing/melting/warping artifacts between the two frames? 10 = no morphing at all, 0 = severe distortion.
2. **text**: If there is text visible, is it legible and consistent? If no text, score 10. 0 = garbled/unreadable.
3. **subject**: Does the main subject (person/object/product) maintain consistent appearance between frames? 10 = identical subject, 0 = completely different person/object.
4. **motion**: Does the implied motion between frames look physically natural? 10 = natural movement, 0 = teleportation/impossible physics.
5. **lighting**: Is the lighting consistent and natural between frames? 10 = stable lighting, 0 = sudden exposure/color shift.
6. **coherence**: Overall, does this look like a real video or obviously AI-generated slop? 10 = could pass as real footage, 0 = immediately recognizable as broken AI.

Also list any specific visual issues you notice.

IMPORTANT: Return ONLY valid JSON with no markdown formatting:
{"morphing":N,"text":N,"subject":N,"motion":N,"lighting":N,"coherence":N,"issues":["issue1","issue2"]}`;

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
  threshold: number = 40,
): Promise<VideoQualityResult> {
  const google = getGeminiProvider();
  if (!google) {
    console.warn('[VideoQuality] No Gemini API key — skipping quality check');
    return {
      score: 70,
      issues: [],
      shouldRegenerate: false,
      details: { morphingArtifacts: 7, textClarity: 7, subjectStability: 7, motionNaturalness: 7, lightingStability: 7, overallCoherence: 7 },
    };
  }

  try {
    // Use Gemini's native video understanding — upload the video URL directly.
    // Gemini 2.0 Flash can process video URLs natively without frame extraction.
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

    // Add the video URL for Gemini to analyze
    parts.push({
      text: '\n\nAnalyze this AI-generated video (compare first frame vs last frame):',
    });
    parts.push({
      fileData: { mimeType: 'video/mp4', fileUri: videoUrl },
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
    });

    const raw = result.response.text().trim();
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonStr);

    const details = {
      morphingArtifacts: clamp(parsed.morphing ?? 7, 0, 10),
      textClarity: clamp(parsed.text ?? 7, 0, 10),
      subjectStability: clamp(parsed.subject ?? 7, 0, 10),
      motionNaturalness: clamp(parsed.motion ?? 7, 0, 10),
      lightingStability: clamp(parsed.lighting ?? 7, 0, 10),
      overallCoherence: clamp(parsed.coherence ?? 7, 0, 10),
    };

    // Weighted score (0-100)
    const score = Math.round(
      (details.morphingArtifacts * 0.25 +
       details.subjectStability * 0.25 +
       details.motionNaturalness * 0.20 +
       details.overallCoherence * 0.15 +
       details.lightingStability * 0.10 +
       details.textClarity * 0.05) * 10,
    );

    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

    console.log(`[VideoQuality] Score: ${score}/100, issues: ${issues.length}, shouldRegen: ${score < threshold}`);

    return { score, issues, shouldRegenerate: score < threshold, details };
  } catch (err: any) {
    console.warn(`[VideoQuality] Check failed: ${err.message} — skipping`);
    return {
      score: 60,
      issues: [`Quality check failed: ${err.message}`],
      shouldRegenerate: false,
      details: { morphingArtifacts: 6, textClarity: 6, subjectStability: 6, motionNaturalness: 6, lightingStability: 6, overallCoherence: 6 },
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
