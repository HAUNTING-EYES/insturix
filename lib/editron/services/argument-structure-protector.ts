/**
 * Argument Structure Protector — Essential Segment Identification
 *
 * ONE Gemini call with the FULL transcript identifies the 10-15 segments
 * that form the argument backbone (thesis, key points, punchlines, conclusion).
 * These segments are ABSOLUTELY PROTECTED — no rule can cut them.
 *
 * Why this exists: The editorial intent classifier makes 248 individual
 * "CONTENT or META?" decisions, each independent. It can't see argument
 * structure across the full video. This call gives the LLM the FULL context
 * (all ~3500 tokens) and asks ONE question: "what must stay?"
 *
 * Design principle: LLM for PROTECTION (what must stay), rules for CUTTING
 * (what should go). Protection decisions are low-risk: over-protecting keeps
 * extra content (harmless), under-protecting matches existing behavior.
 */

import type { TranscriptSegment } from './raw-footage-processor';

/**
 * Identify essential segments that form the argument backbone.
 * Returns segment indices that must NEVER be cut by any downstream rule.
 *
 * @param segments - All transcript segments with text and indices
 * @returns Set of protected segment indices, or empty Set on failure
 */
export async function identifyEssentialSegments(
  segments: TranscriptSegment[],
): Promise<Set<number>> {
  if (segments.length < 10) {
    return new Set();
  }

  try {
    const { getGeneralModel } = await import('@/lib/editron/utils/gemini-model-factory');
    const model = await getGeneralModel();

    const segmentList = segments.map(s =>
      `[${s.index}] (${Math.round(s.startMs / 1000)}s) "${s.text}"`
    ).join('\n');

    const prompt = `You are a professional video editor identifying the ESSENTIAL segments of a raw footage transcript.

The speaker recorded this in one take with retakes, stutters, meta-commentary, and false starts mixed in. Your job: identify the 10-20 segments that form the ARGUMENT BACKBONE — the segments without which the video makes no sense.

ESSENTIAL segments include:
- The thesis/main claim (what the video is ABOUT)
- Key supporting arguments (the points that build the case)
- Punchlines and payoff moments (the "aha" or emotional peak)
- The conclusion/call-to-action (how it ends)
- Critical transitions ("But here's the thing..." that pivot the argument)

NOT essential (even if they're good content):
- Setup/context that could be shortened
- Examples that repeat a point already made
- Tangents (interesting but not load-bearing)
- Meta-commentary about the recording process

There are ${segments.length} segments. Here they are:

${segmentList}

Respond with ONLY a JSON array of the essential segment indices (the [N] numbers). Pick 10-20 segments that form the spine of the argument. If you're unsure whether a segment is essential, INCLUDE it (err toward protection).

Example response: [4, 7, 12, 23, 34, 45, 56, 67, 78, 89, 95, 102]`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0,
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      console.warn('[ArgumentProtector] Gemini returned non-array, no protection applied');
      return new Set();
    }

    const validIndices = parsed
      .filter((n: any) => typeof n === 'number' && n >= 0 && n < segments.length)
      .map((n: number) => segments[n]?.index ?? n);

    console.log(`[ArgumentProtector] Protected ${validIndices.length} essential segments (of ${segments.length} total)`);
    return new Set(validIndices);
  } catch (err: any) {
    console.warn(`[ArgumentProtector] Failed (non-fatal): ${err.message}. No protection applied.`);
    return new Set();
  }
}
