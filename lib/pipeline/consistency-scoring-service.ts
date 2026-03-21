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
              mimeType: bufA.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
            },
            {
              type: 'image',
              image: bufB.buffer,
              mimeType: bufB.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
            },
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
