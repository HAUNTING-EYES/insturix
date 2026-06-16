/**
 * Holistic Editor — ONE Gemini call for ALL cut decisions.
 *
 * Replaces the fragment-based pipeline (editorial intent + best-take +
 * discriminator + intra-segment splitter + argument protector) with a
 * single LLM call that sees the FULL transcript and makes holistic
 * KEEP/CUT decisions for every segment.
 *
 * Why: A human editor watches the whole thing, understands the argument,
 * and cuts. They don't classify 248 segments individually. This call
 * gives the LLM the same full context a human editor would have.
 *
 * Handles in ONE pass: meta-commentary, stutters/disfluencies, retakes,
 * false starts, argument structure protection, duplicate detection.
 */

import type { TranscriptSegment, SilenceRemovalAction } from './raw-footage-processor';
import type { PipelineWarningCollector } from './pipeline-warnings';

export interface HolisticEditResult {
  /** Segment indices to KEEP */
  keepIndices: number[];
  /** Segment indices to CUT */
  cutIndices: number[];
  /** Removal actions for the silence removal plan */
  removals: SilenceRemovalAction[];
  /** Processing time */
  processingTimeMs: number;
}

export async function makeHolisticEditDecisions(
  segments: TranscriptSegment[],
  pipelineWarnings?: PipelineWarningCollector,
): Promise<HolisticEditResult | null> {
  if (segments.length < 5) return null;

  const start = Date.now();

  try {
    const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getGeneralModel();

    const segmentList = segments.map(s =>
      `[${s.index}] (${Math.round(s.startMs / 1000)}s) "${s.text}"`
    ).join('\n');

    // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
    const prompt = `<role>
You are a professional video editor making a rough cut of raw footage.
</role>

<task>
For each segment below, decide KEEP or CUT. The goal is a clean, watchable video where only the final, polished delivery of each idea remains. The speaker recorded this in one session with retakes, stutters, meta-commentary, and false starts mixed in.
</task>

<rules>
RULE 1 — CUT these:
- Stutters and false starts: "I th- I think" — the completed version is elsewhere
- Retakes: same thing said multiple times — keep ONLY the best/most complete, cut the rest
- Meta-commentary: "that was me editing a video", "I'll put this at the beginning", "is my mic on"
- Incomplete trailing thoughts that never finish ("but then they...")
- Filler segments: standalone "okay", "um" that aren't content
- Warm-up/preamble: speaker warming up before actual content delivery

RULE 2 — KEEP these:
- The thesis/main argument (the point of the video)
- Supporting arguments and examples
- Punchlines and emotional moments
- The conclusion
- Natural speech — don't over-cut. Keep the speaker's voice and personality.

RULE 3 — RETAKE DEDUP (CRITICAL):
When the speaker attempts the same line multiple times, keep ONLY ONE — the most complete, cleanest version. Not two, not three. One.
</rules>

<output_format>
JSON object: {"keep": [segment indices to KEEP], "cut": [segment indices to CUT]}
Every segment index must appear in exactly one array. Do not skip any. ${segments.length} segments total.
</output_format>

<segments>
${segmentList}
</segments>`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0,
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (!parsed.keep || !parsed.cut || !Array.isArray(parsed.keep) || !Array.isArray(parsed.cut)) {
      console.warn('[HolisticEditor] Invalid response format, returning null');
      return null;
    }

    const keepSet = new Set<number>(parsed.keep);
    const cutSet = new Set<number>(parsed.cut);

    // Build removal actions for CUT segments
    const removals: SilenceRemovalAction[] = [];
    for (const idx of cutSet) {
      const seg = segments.find(s => s.index === idx);
      if (seg) {
        removals.push({
          startMs: seg.startMs,
          endMs: seg.endMs,
          action: 'remove',
          reason: 'meta-discard' as any,
        });
      }
    }

    const elapsed = Date.now() - start;
    console.log(`[HolisticEditor] ${segments.length} segments → ${keepSet.size} KEEP, ${cutSet.size} CUT (${elapsed}ms)`);

    return {
      keepIndices: [...keepSet],
      cutIndices: [...cutSet],
      removals,
      processingTimeMs: elapsed,
    };
  } catch (err: any) {
    console.warn(`[HolisticEditor] Failed: ${err.message}. Falling back to fragment-based pipeline.`);
    pipelineWarnings?.errorSwallowed('director', err instanceof Error ? err : new Error(String(err)), 'holistic editor decisions');
    return null;
  }
}
