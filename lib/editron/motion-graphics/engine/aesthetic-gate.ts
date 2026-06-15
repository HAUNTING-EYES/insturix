/**
 * D7: Aesthetic Quality Gate — Gemini Flash vision model rates rendered MG frames.
 *
 * Standalone service called by the Director agent AFTER composition but BEFORE
 * committing to the EDL. NOT inside the renderer (no async in Remotion render loop).
 *
 * Scoring rubric (4 dimensions):
 *   1. readability  — text legible at render size (font size, contrast)
 *   2. contrast     — MG distinguishable against underlying video frame
 *   3. hierarchy    — visual priority is clear, no competing elements
 *   4. overlap      — no collisions between elements or with on-screen text
 *
 * Pass threshold: 70/100 (CEO spec).
 * Model: Gemini Flash ($0.001/frame) — cheapest vision model in stack.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AestheticIssue {
  dimension: 'readability' | 'contrast' | 'hierarchy' | 'overlap';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface AestheticGateResult {
  pass: boolean;
  score: number;
  issues: AestheticIssue[];
  reasoning: string;
  processingTimeMs: number;
}

const PASS_THRESHOLD = 70;

const RUBRIC_PROMPT = `<role>You are a motion graphics quality reviewer. Score this rendered frame on 4 dimensions.</role>

<rubric>
Rate each dimension 0-25 (total 0-100):

1. READABILITY (0-25): Is all text legible? Check font size, weight, and color contrast against background. Score 0 if any text is unreadable at normal viewing distance.

2. CONTRAST (0-25): Does the graphic stand out from the video frame behind it? Check if text/shapes have sufficient contrast against the frame content. Score 0 if the graphic blends into the background.

3. HIERARCHY (0-25): Is the visual priority clear? Primary text should be largest/boldest, secondary should be noticeably subordinate. Score 0 if all elements compete at the same visual weight.

4. OVERLAP (0-25): Are elements cleanly separated? No text overlapping other text, no elements clipped by frame edges, no collision with caption zones. Score 0 if any element is partially hidden or overlapping.
</rubric>

<output_format>
JSON only:
{
  "readability": { "score": 0-25, "issues": ["description if score < 20"] },
  "contrast": { "score": 0-25, "issues": ["description if score < 20"] },
  "hierarchy": { "score": 0-25, "issues": ["description if score < 20"] },
  "overlap": { "score": 0-25, "issues": ["description if score < 20"] },
  "total": 0-100,
  "reasoning": "one sentence overall assessment"
}
</output_format>`;

export async function runAestheticGate(
  frameBase64: string,
  mimeType: string = 'image/png',
  recipeContext?: string,
): Promise<AestheticGateResult> {
  const startTime = Date.now();

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[MG-AestheticGate] No API key — gate disabled, auto-pass');
    return { pass: true, score: 100, issues: [], reasoning: 'Gate disabled (no API key)', processingTimeMs: 0 };
  }

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = recipeContext
      ? `${RUBRIC_PROMPT}\n\n<context>${recipeContext}</context>`
      : RUBRIC_PROMPT;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: frameBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const responseText = result.response?.text?.();
    if (!responseText) {
      console.error('[MG-AestheticGate] Empty response from Gemini');
      return { pass: false, score: 0, issues: [{ dimension: 'readability', severity: 'high', description: 'Gate failed: empty model response' }], reasoning: 'Model returned empty', processingTimeMs: Date.now() - startTime };
    }

    const parsed = JSON.parse(responseText);
    const total = typeof parsed.total === 'number' ? parsed.total : 0;

    const issues: AestheticIssue[] = [];
    for (const dim of ['readability', 'contrast', 'hierarchy', 'overlap'] as const) {
      const section = parsed[dim];
      if (section?.issues?.length > 0) {
        for (const desc of section.issues) {
          issues.push({
            dimension: dim,
            severity: (section.score ?? 0) < 10 ? 'high' : (section.score ?? 0) < 18 ? 'medium' : 'low',
            description: String(desc),
          });
        }
      }
    }

    const pass = total >= PASS_THRESHOLD;
    console.log(`[MG-AestheticGate] Score: ${total}/100 — ${pass ? 'PASS' : 'FAIL'} (${issues.length} issues, ${Date.now() - startTime}ms)`);

    return {
      pass,
      score: total,
      issues,
      reasoning: parsed.reasoning || '',
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error(`[MG-AestheticGate] Error: ${err.message}`);
    return {
      pass: false,
      score: 0,
      issues: [{ dimension: 'readability', severity: 'high', description: `Gate error: ${err.message}` }],
      reasoning: `Error: ${err.message}`,
      processingTimeMs: Date.now() - startTime,
    };
  }
}
